import { ref, computed } from "vue";
import { defineStore } from "pinia";
import axios from "axios";
import { useGetNotify } from "@/composables/getNotify";
import { useGetConfiguracion } from "@/composables/getConfiguracion";

const { showNotification } = useGetNotify();
const { usuario, atcs_gantt_editar, atcs_gantt_excluir } = useGetConfiguracion();

const BASE = "/comercial/proyectos-gantt";

export const useGanttContratosStore = defineStore("ganttContratos", () => {
  // ==================== ESTADO ====================
  const filas = ref([]);
  const aniosDisponibles = ref([]);
  const loading = ref(false);
  const error = ref(null);

  // Filtros
  const filtroAnio = ref(null);
  const filtroTipo = ref(null); // SERVICIOS | BIENES | GARANTIA
  const filtroCategoria = ref(null); // CONTRATADO | PROYECCION | GARANTIA
  const filtroAtc = ref(null); // atc_id

  const numeroUsuario = () => usuario.value?.numero ?? null;

  // ¿El usuario puede editar filas de este ATC? Soporta '*' (todos) + exclusiones.
  const puedeEditarAtc = (atcId) => {
    const editar = atcs_gantt_editar.value || [];
    const excluir = atcs_gantt_excluir.value || [];
    const permitido = editar.includes("*") || editar.includes(atcId);
    return permitido && !excluir.includes(atcId);
  };
  // Marca cada fila con _editable según su ATC y el permiso del usuario.
  const anotarEditable = (r) => {
    r._editable = puedeEditarAtc(r.atc_id);
    return r;
  };

  // ==================== CONSULTA ====================

  /** Años con datos (para el filtro). Si no hay, usa el año actual. */
  const consultarAnios = async () => {
    try {
      const { data } = await axios.get(`${BASE}/anios`);
      aniosDisponibles.value = Array.isArray(data) && data.length ? data : [new Date().getFullYear()];
    } catch (e) {
      aniosDisponibles.value = [new Date().getFullYear()];
    }
    if (filtroAnio.value === null) {
      filtroAnio.value = aniosDisponibles.value[0];
    }
  };

  /** Filas del año (con cliente derivado y tramos anidados). */
  const consultarGantt = async (anio = null) => {
    loading.value = true;
    error.value = null;
    try {
      const year = anio ?? filtroAnio.value;
      if (year === null || year === undefined) {
        filas.value = [];
        return { success: true, data: [] };
      }
      const { data } = await axios.get(`${BASE}/anio/${year}`);
      filas.value = (Array.isArray(data) ? data : []).map(anotarEditable);
      return { success: true, data: filas.value };
    } catch (e) {
      console.error("Error al consultar Gantt:", e);
      error.value = "Error al consultar el Gantt de contratos";
      showNotification(error.value, "negative", "top-right", "error", 3000);
      return { success: false, message: error.value };
    } finally {
      loading.value = false;
    }
  };

  // ==================== EDICIÓN DE FILAS ====================

  /** PATCH de una fila (edición inline o drag de barra). */
  const actualizarFila = async (id, cambios) => {
    const fila = filas.value.find((f) => f.id === id);
    const previo = fila ? { ...fila } : null;
    if (fila) Object.assign(fila, cambios); // optimista
    try {
      const { data } = await axios.patch(`${BASE}/${id}`, {
        ...cambios,
        modificado_por: numeroUsuario(),
      });
      // El backend devuelve la fila completa (cliente derivado + tramos)
      if (data && fila) anotarEditable(Object.assign(fila, data));
    } catch (e) {
      if (fila && previo) Object.assign(fila, previo); // revertir
      showNotification("No se pudo guardar el cambio", "negative", "top-right", "error", 3000);
    }
  };

  /** Quitar/ocultar una fila (baja lógica). Se reactiva si se reimporta. */
  const eliminarFila = async (id) => {
    try {
      await axios.delete(`${BASE}/${id}`, { params: { modificado_por: numeroUsuario() } });
      filas.value = filas.value.filter((f) => f.id !== id);
      showNotification("Fila quitada del Gantt", "positive", "top-right", "check", 2000);
    } catch (e) {
      showNotification("No se pudo quitar la fila", "negative", "top-right", "error", 3000);
    }
  };

  // ==================== TRAMOS ====================

  const agregarTramo = async (ganttId, draft) => {
    const fila = filas.value.find((f) => f.id === ganttId);
    try {
      const { data } = await axios.post(`${BASE}/${ganttId}/tramos`, {
        ...draft,
        creado_por: numeroUsuario(),
      });
      if (fila) {
        if (!Array.isArray(fila.tramos)) fila.tramos = [];
        fila.tramos.push(data);
      }
    } catch (e) {
      showNotification("No se pudo agregar el tramo", "negative", "top-right", "error", 3000);
    }
  };

  const actualizarTramo = async (ganttId, tramoId, cambios) => {
    const fila = filas.value.find((f) => f.id === ganttId);
    const tramo = fila?.tramos?.find((t) => t.id === tramoId);
    const previo = tramo ? { ...tramo } : null;
    if (tramo) Object.assign(tramo, cambios); // optimista
    try {
      const { data } = await axios.patch(`${BASE}/tramos/${tramoId}`, {
        ...cambios,
        modificado_por: numeroUsuario(),
      });
      if (data && tramo) Object.assign(tramo, data);
    } catch (e) {
      if (tramo && previo) Object.assign(tramo, previo);
      showNotification("No se pudo guardar el tramo", "negative", "top-right", "error", 3000);
    }
  };

  const eliminarTramo = async (ganttId, tramoId) => {
    const fila = filas.value.find((f) => f.id === ganttId);
    try {
      await axios.delete(`${BASE}/tramos/${tramoId}`, {
        params: { modificado_por: numeroUsuario() },
      });
      if (fila?.tramos) fila.tramos = fila.tramos.filter((t) => t.id !== tramoId);
    } catch (e) {
      showNotification("No se pudo quitar el tramo", "negative", "top-right", "error", 3000);
    }
  };

  // ==================== IMPORTAR / MATCH DESDE PROYECCIONES ====================

  const importables = ref([]);
  const loadingImport = ref(false);

  const GRUPO_TIPO = {
    "Taller y servicio campo": "SERVICIOS",
    Bienes: "BIENES",
  };

  /** Candidatos de proyección para el año (con sus OTs ligadas). */
  const consultarImportables = async (cliente = "") => {
    loadingImport.value = true;
    try {
      const { data } = await axios.get(`${BASE}/importables/anio/${filtroAnio.value}`, {
        params: cliente ? { cliente } : {},
      });
      importables.value = Array.isArray(data) ? data : [];
    } catch (e) {
      showNotification("No se pudieron cargar las proyecciones", "negative", "top-right", "error", 3000);
      importables.value = [];
    } finally {
      loadingImport.value = false;
    }
  };

  /**
   * Importa las proyecciones seleccionadas como filas del Gantt.
   * @param {Array} seleccion candidatos elegidos
   * @param {String} grupo 'Taller y servicio campo' | 'Bienes'
   * @param {String} modo 'proyecto' (una fila por proyección) | 'pedido' (una fila por cada pedido)
   */
  const importarProyecciones = async (seleccion, grupo, modo = "proyecto") => {
    let ok = 0;
    const base = (cand) => ({
      anio: filtroAnio.value,
      grupo,
      clientes_unidad_id: cand.clientes_unidad_id,
      proyecciones_proyectos_id: cand.proyecciones_proyectos_id,
      tipo: GRUPO_TIPO[grupo] || "SERVICIOS",
      categoria: cand.ganado_tmq === 1 ? "CONTRATADO" : "PROYECCION",
      orden_visual: 0,
      creado_por: numeroUsuario(),
    });
    const post = async (fila, etiqueta) => {
      try {
        await axios.post(BASE, fila);
        ok++;
      } catch (e) {
        console.error("Import falló:", etiqueta, e);
      }
    };

    for (const cand of seleccion) {
      const pedidos = cand.pedidos || [];
      if (modo === "pedido" && pedidos.length) {
        // Una fila por cada pedido (contrato), con su OT.
        for (const p of pedidos) {
          await post(
            { ...base(cand), pedidos_id: p.id, ordenes_id: p.ordenes_id || null, ot_numero: p.orden_numero || null },
            `${cand.cliente} / pedido ${p.numero}`
          );
        }
      } else {
        // Por proyección: una sola fila con las OTs del proyecto.
        const unaOrden = (cand.ordenes || []).length === 1 ? cand.ordenes[0].id : null;
        const otTexto = (cand.ordenes || []).map((o) => o.numero_orden).join(", ") || null;
        await post({ ...base(cand), ordenes_id: unaOrden, ot_numero: otTexto }, cand.cliente);
      }
    }
    if (ok > 0) {
      showNotification(`${ok} fila(s) importada(s)`, "positive", "top-right", "check", 2500);
      await consultarGantt(filtroAnio.value);
    }
    return ok;
  };

  // ==================== BUSCAR OTs (catálogo completo, OTs adicionales) ====================

  const ordenesEncontradas = ref([]);
  const loadingOrdenes = ref(false);

  // Carga el catálogo de OTs. Sin q trae TODAS (el filtro por año/texto es cliente-side).
  const buscarOrdenes = async (q = "") => {
    loadingOrdenes.value = true;
    try {
      const params = {};
      if (q && q.trim()) params.q = q.trim();
      const { data } = await axios.get(`${BASE}/ordenes`, { params });
      ordenesEncontradas.value = Array.isArray(data) ? data : [];
    } catch (e) {
      showNotification("No se pudieron cargar las OTs", "negative", "top-right", "error", 3000);
      ordenesEncontradas.value = [];
    } finally {
      loadingOrdenes.value = false;
    }
  };

  /** Agrega OTs adicionales (del catálogo) como filas del Gantt. */
  const agregarOrdenes = async (seleccion, grupo) => {
    let ok = 0;
    for (const o of seleccion) {
      const fila = {
        anio: filtroAnio.value,
        grupo,
        clientes_unidad_id: null,
        etiqueta_manual: o.cliente,
        ordenes_id: o.ordenes_id,
        ot_numero: o.numero_orden,
        tipo: GRUPO_TIPO[grupo] || "SERVICIOS",
        categoria: "CONTRATADO",
        orden_visual: 0,
        creado_por: numeroUsuario(),
      };
      try {
        await axios.post(BASE, fila);
        ok++;
      } catch (e) {
        console.error("Agregar OT falló:", o.numero_orden, e);
      }
    }
    if (ok > 0) {
      showNotification(`${ok} OT(s) agregada(s)`, "positive", "top-right", "check", 2500);
      await consultarGantt(filtroAnio.value);
    }
    return ok;
  };

  // ==================== COMPUTADOS ====================

  const filasFiltradas = computed(() =>
    filas.value.filter((f) => {
      if (filtroTipo.value && f.tipo !== filtroTipo.value) return false;
      if (filtroCategoria.value && f.categoria !== filtroCategoria.value) return false;
      if (filtroAtc.value && f.atc_id !== filtroAtc.value) return false;
      return true;
    })
  );

  // ATCs presentes en los datos (para el filtro): [{ value: atc_id, label: atc_nombre }].
  const atcsDisponibles = computed(() => {
    const mapa = new Map();
    for (const f of filas.value) {
      if (f.atc_id != null && !mapa.has(f.atc_id)) {
        mapa.set(f.atc_id, { value: f.atc_id, label: f.atc_nombre || `ATC ${f.atc_id}` });
      }
    }
    return [...mapa.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  const total = computed(() => filasFiltradas.value.length);

  const conteoPorCategoria = computed(() => {
    const c = { CONTRATADO: 0, PROYECCION: 0, GARANTIA: 0 };
    for (const f of filasFiltradas.value) if (c[f.categoria] !== undefined) c[f.categoria]++;
    return c;
  });

  const limpiarFiltros = () => {
    filtroTipo.value = null;
    filtroCategoria.value = null;
    filtroAtc.value = null;
  };

  return {
    // estado
    filas,
    aniosDisponibles,
    loading,
    error,
    filtroAnio,
    filtroTipo,
    filtroCategoria,
    filtroAtc,
    // computados
    filasFiltradas,
    atcsDisponibles,
    total,
    conteoPorCategoria,
    // importar
    importables,
    loadingImport,
    consultarImportables,
    importarProyecciones,
    // buscar OTs
    ordenesEncontradas,
    loadingOrdenes,
    buscarOrdenes,
    agregarOrdenes,
    // acciones
    consultarAnios,
    consultarGantt,
    actualizarFila,
    eliminarFila,
    agregarTramo,
    actualizarTramo,
    eliminarTramo,
    limpiarFiltros,
  };
});
