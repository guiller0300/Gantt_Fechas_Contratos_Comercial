import { ref, computed } from "vue";
import { defineStore } from "pinia";
import axios from "axios";
import { useGetNotify } from "@/composables/getNotify";
import { useGetConfiguracion } from "@/composables/getConfiguracion";

const { showNotification } = useGetNotify();
const { usuario, permiso_editar_gantt_cfe, permiso_editar_gantt_pemex, permiso_editar_gantt_varios } =
  useGetConfiguracion();

const BASE = "/comercial/proyectos-gantt";

export const useGanttContratosStore = defineStore("ganttContratos", () => {
  // ==================== ESTADO ====================
  const filas = ref([]);
  const aniosDisponibles = ref([]);
  const loading = ref(false);
  const error = ref(null);

  // Filtros
  const filtroAnio = ref(null);
  const filtroGrupo = ref(null); // Bienes | Servicios | Bienes y servicios (la calle)
  const filtroCategoria = ref(null); // CONTRATADO | PROYECCION | GARANTIA
  const filtroAtc = ref(null); // atc_id
  const filtroGiro = ref(null); // giro_id (giro del cliente)

  // Reporte por fecha (snapshot). null = Gantt vivo; con fecha = solo lectura.
  const fechaReporte = ref(null);
  const esSnapshot = computed(() => !!fechaReporte.value);

  const numeroUsuario = () => usuario.value?.numero ?? null;

  // ¿El usuario puede editar filas de este grupo comercial? Cada grupo tiene su permiso
  // (booleano, de un rol de Keycloak). Sin grupo => se trata como Varios/OTROS.
  const puedeEditarGrupo = (grupo) => {
    const g = grupo || "OTROS";
    if (g === "CFE") return permiso_editar_gantt_cfe.value;
    if (g === "PEMEX") return permiso_editar_gantt_pemex.value;
    return permiso_editar_gantt_varios.value; // OTROS = Varios
  };
  const fmtMoneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

  // Marca cada fila con _editable (según su grupo comercial) y formatea el monto del pedido.
  const anotarEditable = (r) => {
    r._editable = puedeEditarGrupo(r.grupo_comercial);
    // Las filas "Bienes y servicios" nacen expandidas (desglose bienes/servicios).
    r._expandDefault = r.grupo === "Bienes y servicios";
    r.pedido_monto_fmt =
      r.pedido_monto != null && r.pedido_monto !== "" ? fmtMoneda.format(Number(r.pedido_monto)) : null;
    anotarHitos(r);
    return r;
  };

  // ==================== HITOS DE FACTURACIÓN (estimaciones) ====================

  // Monto corto para la etiqueta del rombo: $60 M, $850 K, $1,200.
  const montoCorto = (m) => {
    const n = Number(m);
    if (!m && m !== 0) return "";
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M`;
    if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3).toLocaleString("es-MX")} K`;
    return fmtMoneda.format(n);
  };
  const TIPOS_HITO = { ANTICIPO: "Anticipo", ESTIMACION: "Estimación", FINIQUITO: "Finiquito", OTRO: "Otro" };

  /**
   * Convierte row.hitos (del backend) en lo que dibuja la librería: por cada hito un rombo de
   * facturación (arrastrable, con su monto), un rombo de cobro y su banda de crédito, todos en el
   * mismo `grupo` para que se muevan juntos al arrastrar. Sin hitos => [] y el Gantt usa el hito
   * único de siempre (fecha_facturacion_estim).
   */
  function anotarHitos(r) {
    const hitos = Array.isArray(r.hitos) ? r.hitos : [];
    r._hitos = [];
    r._bandas = [];
    for (const h of hitos) {
      const grupo = "h" + h.id;
      const nombre = h.concepto || TIPOS_HITO[h.tipo] || "Hito";
      const monto = h.monto != null ? fmtMoneda.format(Number(h.monto)) : "sin monto";
      r._hitos.push({
        key: "f" + h.id, grupo, hito: h, draggable: true,
        fecha: h.fecha_programada, color: "#f9a825", icon: "🧾",
        label: `${nombre} · ${monto}`, texto: montoCorto(h.monto),
      });
      if (h.fecha_cobro_estim) {
        r._hitos.push({
          key: "c" + h.id, grupo, hito: h,
          fecha: h.fecha_cobro_estim, color: "#2e7d32", icon: "💰", label: `Cobro · ${nombre}`,
        });
      }
      if (h.fecha_cobro_ini && h.fecha_cobro_estim) {
        r._bandas.push({
          key: "b" + h.id, grupo, inicio: h.fecha_cobro_ini, fin: h.fecha_cobro_estim,
          color: "#e8f5e9", label: `Ventana de cobro · ${nombre}`,
        });
      }
    }
    return r;
  }

  // Reemplaza los hitos de la fila con la lista que regresa el backend (ya con su cobro).
  const ponerHitos = (ganttId, lista) => {
    const fila = filas.value.find((f) => f.id === ganttId);
    if (fila) anotarHitos(Object.assign(fila, { hitos: Array.isArray(lista) ? lista : [] }));
  };

  const agregarHito = async (ganttId, hito) => {
    try {
      const { data } = await axios.post(`${BASE}/${ganttId}/hitos`, { ...hito, creado_por: numeroUsuario() });
      ponerHitos(ganttId, data);
      return true;
    } catch (e) {
      showNotification("No se pudo agregar el hito", "negative", "top-right", "error", 3000);
      return false;
    }
  };

  const actualizarHito = async (ganttId, hitoId, cambios) => {
    // Optimista: mueve el hito al instante; el backend regresa la lista con el cobro recalculado.
    const fila = filas.value.find((f) => f.id === ganttId);
    const h = fila?.hitos?.find((x) => x.id === hitoId);
    const previo = h ? { ...h } : null;
    if (h) { Object.assign(h, cambios); anotarHitos(fila); }
    try {
      const { data } = await axios.patch(`${BASE}/hitos/${hitoId}`, { ...cambios, modificado_por: numeroUsuario() });
      ponerHitos(ganttId, data);
    } catch (e) {
      if (h && previo) { Object.assign(h, previo); anotarHitos(fila); }
      showNotification("No se pudo guardar el hito", "negative", "top-right", "error", 3000);
    }
  };

  const eliminarHito = async (ganttId, hitoId) => {
    try {
      const { data } = await axios.delete(`${BASE}/hitos/${hitoId}`, { params: { modificado_por: numeroUsuario() } });
      ponerHitos(ganttId, data);
    } catch (e) {
      showNotification("No se pudo quitar el hito", "negative", "top-right", "error", 3000);
    }
  };

  /** Reemplaza TODOS los hitos de la fila (ej. "Parcializar"). */
  const reemplazarHitos = async (ganttId, lista) => {
    try {
      const { data } = await axios.put(`${BASE}/${ganttId}/hitos`, lista, { params: { modificado_por: numeroUsuario() } });
      ponerHitos(ganttId, data);
      showNotification(`${(data || []).length} hito(s) de facturación guardado(s)`, "positive", "top-right", "check", 2500);
      return true;
    } catch (e) {
      showNotification("No se pudieron guardar los hitos", "negative", "top-right", "error", 3000);
      return false;
    }
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

  /** Snapshot del año a una fecha (solo lectura): el tablero como estaba ese día. */
  const consultarAsOf = async (fecha) => {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await axios.get(`${BASE}/anio/${filtroAnio.value}/asof/${fecha}`);
      filas.value = (Array.isArray(data) ? data : []).map(anotarEditable);
      return { success: true, data: filas.value };
    } catch (e) {
      console.error("Error al consultar snapshot:", e);
      error.value = "No se pudo cargar el snapshot de esa fecha";
      showNotification(error.value, "negative", "top-right", "error", 3000);
      return { success: false, message: error.value };
    } finally {
      loading.value = false;
    }
  };

  /** Carga el tablero según el modo: snapshot si hay fechaReporte, si no el vivo. */
  const refrescarTablero = async () => {
    return fechaReporte.value ? consultarAsOf(fechaReporte.value) : consultarGantt(filtroAnio.value);
  };

  /**
   * Trae del ERP los últimos cambios (contratos, OTs, proyecciones) a las filas activas del año
   * y recarga. Devuelve el resumen del backend { actualizadas, nuevas, ocultas, detalle[], errores[] }
   * o null si falló.
   */
  const sincronizarConErp = async () => {
    try {
      const { data } = await axios.post(`${BASE}/sincronizar/anio/${filtroAnio.value}`, null, {
        params: { modificado_por: numeroUsuario() },
      });
      return data;
    } catch (e) {
      console.error("Sincronizar falló:", e);
      showNotification("No se pudieron traer los cambios del ERP", "negative", "top-right", "error", 4000);
      return null;
    } finally {
      await consultarGantt(filtroAnio.value);
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

  // Aviso al terminar una importación: éxitos y, si hubo, las filas que el backend rechazó.
  const avisarResultado = (ok, fallidas, verbo) => {
    if (ok > 0) showNotification(`${ok} fila(s) ${verbo}`, "positive", "top-right", "check", 2500);
    if (fallidas.length) {
      showNotification(
        `No se pudieron guardar ${fallidas.length}: ${fallidas.join("; ")}`,
        "negative", "top-right", "error", 6000
      );
    }
  };

  const importables = ref([]);
  const loadingImport = ref(false);

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
      categoria: cand.ganado_tmq === 1 ? "CONTRATADO" : "PROYECCION",
      orden_visual: 0,
      creado_por: numeroUsuario(),
    });
    const fallidas = [];
    const post = async (fila, etiqueta) => {
      try {
        await axios.post(BASE, fila);
        ok++;
      } catch (e) {
        console.error("Import falló:", etiqueta, e);
        fallidas.push(etiqueta);
      }
    };

    // OT a nivel proyección (fallback cuando el pedido no trae la suya).
    const otProyId = (cand) => ((cand.ordenes || []).length === 1 ? cand.ordenes[0].id : null);
    const otProyTexto = (cand) => (cand.ordenes || []).map((o) => o.numero_orden).join(", ") || null;

    for (const cand of seleccion) {
      const pedidos = cand.pedidos || [];
      if (modo === "pedido" && pedidos.length) {
        // Una fila por cada pedido (contrato). OT del pedido (el backend la resuelve como la
        // consulta general de la orden; si son varias llega solo el texto); si no tiene,
        // hereda la OT ligada a la proyección.
        for (const p of pedidos) {
          const tieneOtPropia = p.ordenes_id && Number(p.ordenes_id) > 0;
          const ordenes_id = tieneOtPropia ? p.ordenes_id : p.orden_numero ? null : otProyId(cand);
          const ot_numero = p.orden_numero || otProyTexto(cand);
          await post(
            {
              ...base(cand),
              pedidos_id: p.id,
              ordenes_id: ordenes_id || null,
              ot_numero: ot_numero || null,
              // Fechas mandatorias del pedido (fallo se deja tentativo/manual).
              firma_contrato: p.firma_contrato || null,
              comienzo: p.inicio_contrato || null,
              fin: p.fin_contrato || null,
            },
            `${cand.cliente} / pedido ${p.numero}`
          );
        }
      } else {
        // Por proyección: una sola fila con las OTs del proyecto.
        await post({ ...base(cand), ordenes_id: otProyId(cand), ot_numero: otProyTexto(cand) }, cand.cliente);
      }
    }
    avisarResultado(ok, fallidas, "importada(s)");
    await consultarGantt(filtroAnio.value);
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

  // OT de garantía: ordenes.tipo 'G' (o 'CG'), o número con sufijo G (ej. '019/24G').
  const esOrdenGarantia = (o) => /G/i.test(o.tipo || "") || /G$/i.test(String(o.numero_orden || "").trim());

  /**
   * Agrega OTs adicionales (del catálogo) como filas del Gantt.
   * @param {String} modo 'ot' (una fila por OT) | 'pedido' (una fila por cada pedido de la OT;
   *   la OT sin pedidos entra como una sola fila). Por pedido, el backend adopta la fila "solo OT"
   *   que ya existiera de esa OT en lugar de duplicarla.
   */
  const agregarOrdenes = async (seleccion, grupo, modo = "ot") => {
    let ok = 0;
    const fallidas = [];
    const post = async (fila, etiqueta) => {
      try {
        await axios.post(BASE, fila);
        ok++;
      } catch (e) {
        console.error("Agregar OT falló:", etiqueta, e);
        fallidas.push(etiqueta);
      }
    };
    const pedidosHechos = new Set(); // varias OTs del mismo contrato => una sola fila
    for (const o of seleccion) {
      const base = {
        anio: filtroAnio.value,
        grupo,
        clientes_unidad_id: null,
        etiqueta_manual: o.cliente,
        ordenes_id: o.ordenes_id,
        ot_numero: o.numero_orden,
        categoria: esOrdenGarantia(o) ? "GARANTIA" : "CONTRATADO",
        orden_visual: 0,
        creado_por: numeroUsuario(),
      };
      const pedidos = o.pedidos || [];
      if (modo === "pedido" && pedidos.length) {
        for (const p of pedidos) {
          if (pedidosHechos.has(p.id)) continue;
          pedidosHechos.add(p.id);
          await post(
            {
              ...base,
              pedidos_id: p.id,
              // Todas las OTs del contrato (el backend las resuelve como la consulta general de la
              // orden): una sola => su id; varias => solo el texto '045/25, 050/25, ...'.
              ordenes_id: p.ordenes_id && Number(p.ordenes_id) > 0 ? p.ordenes_id : null,
              ot_numero: p.orden_numero || o.numero_orden,
              // Fechas mandatorias del pedido (fallo se deja tentativo/manual).
              firma_contrato: p.firma_contrato || null,
              comienzo: p.inicio_contrato || null,
              fin: p.fin_contrato || null,
            },
            `${o.numero_orden} / pedido ${p.numero}`
          );
        }
      } else {
        await post(base, o.numero_orden);
      }
    }
    avisarResultado(ok, fallidas, "agregada(s)");
    await consultarGantt(filtroAnio.value);
    return ok;
  };

  // ==================== COMPUTADOS ====================

  const filasFiltradas = computed(() =>
    filas.value.filter((f) => {
      if (filtroGrupo.value && f.grupo !== filtroGrupo.value) return false;
      if (filtroCategoria.value && f.categoria !== filtroCategoria.value) return false;
      if (filtroAtc.value && f.atc_id !== filtroAtc.value) return false;
      if (filtroGiro.value && f.giro_id !== filtroGiro.value) return false;
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

  // Giros presentes en los datos (para el filtro): [{ value: giro_id, label: giro_descripcion }].
  const girosDisponibles = computed(() => {
    const mapa = new Map();
    for (const f of filas.value) {
      if (f.giro_id != null && !mapa.has(f.giro_id)) {
        mapa.set(f.giro_id, { value: f.giro_id, label: f.giro_descripcion || `Giro ${f.giro_numero ?? f.giro_id}` });
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
    filtroGrupo.value = null;
    filtroCategoria.value = null;
    filtroAtc.value = null;
    filtroGiro.value = null;
  };

  return {
    // estado
    filas,
    aniosDisponibles,
    loading,
    error,
    filtroAnio,
    filtroGrupo,
    filtroCategoria,
    filtroAtc,
    filtroGiro,
    fechaReporte,
    esSnapshot,
    // computados
    filasFiltradas,
    atcsDisponibles,
    girosDisponibles,
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
    consultarAsOf,
    refrescarTablero,
    sincronizarConErp,
    agregarHito,
    actualizarHito,
    eliminarHito,
    reemplazarHitos,
    montoCorto,
    TIPOS_HITO,
    actualizarFila,
    eliminarFila,
    agregarTramo,
    actualizarTramo,
    eliminarTramo,
    limpiarFiltros,
  };
});
