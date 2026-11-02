import { ref, computed } from "vue";
import { defineStore } from "pinia";
import axios from "axios";
import { useGetNotify } from "@/composables/getNotify";
import { proyectarAnio, serieMensual } from "@/dashboard/composables/proyeccion";
import { RANGOS_ANTIGUEDAD, rangoDe, mesANumero } from "@/dashboard/composables/formato";
import { generarMock } from "@/dashboard/mock/datosDashboardMock";
import { calcularIndicadores } from "@/dashboard/composables/indicadores";

const { showNotification } = useGetNotify();

const BASE = "/comercial/dashboard";
const num = (v) => Number(v) || 0;
const sumar = (filas, campo) => filas.reduce((s, f) => s + num(f[campo]), 0);

/** Agrupa filas por una llave y suma los campos indicados. */
function agrupar(filas, llave, campos, extra = () => ({})) {
  const m = new Map();
  for (const f of filas) {
    const k = typeof llave === "function" ? llave(f) : f[llave];
    if (!m.has(k)) m.set(k, { key: k, ...extra(f), ...Object.fromEntries(campos.map((c) => [c, 0])) });
    const acc = m.get(k);
    for (const c of campos) acc[c] += num(f[c]);
  }
  return [...m.values()];
}

export const useDashboardComercialStore = defineStore("dashboardComercial", () => {
  // ==================== ESTADO ====================
  const hoy = new Date();
  const anio = ref(hoy.getFullYear());
  const loading = ref(false);
  const origen = ref(null); // 'api' | 'mock'

  const facturacion = ref([]);
  const cobranza = ref([]);
  const cartera = ref([]);
  const diasPago = ref([]);
  const pipeline = ref([]);
  const gantt = ref([]);
  const meta = ref(null);
  const anticipos = ref([]); // facturas de anticipo timbradas que aún no pasan a venta
  const ordenes = ref([]);
  const loadingOrdenes = ref(false);
  const ordenesCargadas = ref(false);
  // Hay órdenes "abiertas" desde 2003 que nunca se cerraron: por defecto solo las de los últimos 3 años.
  const ordenesDesde = ref(hoy.getFullYear() - 2);
  // Detalle de proyecciones a nivel proyecto (como Proyección General): se pide al abrir Proyecciones.
  const proyectos = ref([]);
  const loadingProyectos = ref(false);
  const proyectosCargados = ref(false);

  // Filtros (aplican a todas las pestañas)
  const filtroGrupo = ref(null); // CFE | PEMEX | OTROS
  const filtroAtc = ref(null); // atc_id
  const filtroCliente = ref(null); // cliente_id (se fija también con clic en cualquier ranking/tabla)
  const hayFiltro = computed(() => !!filtroGrupo.value || filtroAtc.value != null || filtroCliente.value != null);

  // Pestaña activa (en el store para que los KPIs y los clics puedan navegar entre pestañas).
  const tab = ref("resumen");
  const irA = (nombre) => (tab.value = nombre);
  // Campana / foco de Resumen: abre Proyecciones y lleva la vista a la tarjeta de avisos.
  const enfocarAvisos = ref(0);
  const verAvisos = () => {
    tab.value = "proyecciones";
    enfocarAvisos.value++;
  };

  const anios = computed(() => {
    const y = hoy.getFullYear();
    return Array.from({ length: 6 }, (_, i) => y - i);
  });

  // ==================== CONSULTA ====================
  const consultar = async () => {
    loading.value = true;
    const y = anio.value;
    try {
      const [f, c, ca, dp, pl, g, mt, an] = await Promise.all([
        axios.get(`${BASE}/facturacion/anio/${y}`, { params: { desde: y - 3 } }), // 3 años atrás: el MAT móvil de 24 meses necesita 36
        axios.get(`${BASE}/cobranza/anio/${y}`, { params: { desde: y - 3 } }), // 3 años atrás: el MAT móvil de 24 meses necesita 36
        axios.get(`${BASE}/cartera`),
        axios.get(`${BASE}/dias-pago/anio/${y}`),
        axios.get(`${BASE}/pipeline/anio/${y}`),
        // Fuentes existentes: contratos del Gantt (por facturar/cobrar) y meta anual de ventas.
        axios.get(`/comercial/proyectos-gantt/anio/${y}`).catch(() => ({ data: [] })),
        axios.get(`/comercial/indicador/meta-venta/anio/${y}`).catch(() => ({ data: null })),
        axios.get(`${BASE}/anticipos-por-aplicar`).catch(() => ({ data: [] })),
      ]);
      facturacion.value = f.data || [];
      cobranza.value = c.data || [];
      cartera.value = ca.data || [];
      diasPago.value = dp.data || [];
      pipeline.value = pl.data || [];
      gantt.value = g.data || [];
      meta.value = mt.data || null;
      anticipos.value = an.data || [];
      origen.value = "api";
    } catch (e) {
      // Datos de ejemplo SOLO en desarrollo (sin javaObj o perfil dev): en producción un número
      // inventado en un tablero financiero es peor que una pantalla vacía.
      if (!esDev()) {
        [facturacion, cobranza, cartera, diasPago, pipeline, gantt, anticipos].forEach((r) => (r.value = []));
        meta.value = null;
        origen.value = null;
        showNotification("No se pudo consultar el dashboard. Intenta de nuevo o avisa a sistemas.", "negative", "top-right", "error", 5000);
        return;
      }
      const m = generarMock(y, hoy);
      facturacion.value = m.facturacion;
      cobranza.value = m.cobranza;
      cartera.value = m.cartera;
      diasPago.value = m.diasPago;
      pipeline.value = m.pipeline;
      gantt.value = m.gantt;
      meta.value = m.meta;
      anticipos.value = m.anticipos;
      origen.value = "mock";
      showNotification("No se pudo consultar el dashboard; se muestran datos de ejemplo", "warning", "top-right", "info", 4000);
    } finally {
      loading.value = false;
    }
    if (ordenesCargadas.value) consultarOrdenes(true);
    consultarProyectos(true); // también ubica la Factibilidad 1 en su fecha del Gantt (Resumen/Facturación)
  };

  const esDev = () => typeof window.javaObj === "undefined" || window.javaObj?.springActiveProfile === "dev";

  // Órdenes abiertas: consulta pesada (funciones de BD por orden), se pide al abrir la pestaña.
  const consultarProyectos = async (forzar = false) => {
    if ((proyectosCargados.value && !forzar) || loadingProyectos.value) return;
    loadingProyectos.value = true;
    try {
      const { data } = await axios.get(`${BASE}/proyectos/anio/${anio.value}`);
      proyectos.value = data || [];
    } catch (e) {
      proyectos.value = esDev() ? generarMock(anio.value, hoy).proyectos : [];
      showNotification("No se pudo consultar el detalle de proyectos", esDev() ? "warning" : "negative", "top-right", "info", 4000);
    } finally {
      loadingProyectos.value = false;
      proyectosCargados.value = true;
    }
  };
  const proys = computed(() => proyectos.value.filter(pasa));

  const consultarOrdenes = async (forzar = false) => {
    if ((ordenesCargadas.value && !forzar) || loadingOrdenes.value) return;
    loadingOrdenes.value = true;
    try {
      const params = ordenesDesde.value ? { desde: ordenesDesde.value } : {};
      const { data } = await axios.get(`${BASE}/ordenes`, { params });
      ordenes.value = data || [];
    } catch (e) {
      ordenes.value = esDev() ? generarMock(anio.value, hoy).ordenes : [];
      // (mock: ignora el rango de años)
      showNotification("No se pudieron consultar las órdenes abiertas", esDev() ? "warning" : "negative", "top-right", "info", 4000);
    } finally {
      loadingOrdenes.value = false;
      ordenesCargadas.value = true;
    }
  };

  // ==================== FILTROS ====================
  const pasa = (r) =>
    (!filtroGrupo.value || (r.grupo_comercial || "OTROS") === filtroGrupo.value) &&
    (filtroAtc.value == null || r.atc_id === filtroAtc.value) &&
    (filtroCliente.value == null || r.cliente_id === filtroCliente.value);

  const fact = computed(() => facturacion.value.filter(pasa));
  const cob = computed(() => cobranza.value.filter(pasa));
  const cart = computed(() => cartera.value.filter(pasa));
  const dpago = computed(() => diasPago.value.filter(pasa));
  const pipe = computed(() => pipeline.value.filter(pasa));
  // ATC con proyecciones en el año (sin aplicar el filtro de ATC, para poder cambiar de uno a otro),
  // de mayor a menor monto ajustado de lo que suma.
  const atcsProyecciones = computed(() => {
    const m = new Map();
    for (const p of pipeline.value) {
      if (p.atc_id == null) continue;
      if (!m.has(p.atc_id)) m.set(p.atc_id, { value: p.atc_id, label: p.atc_nombre || `ATC ${p.atc_id}`, monto: 0, proyectos: 0 });
      const a = m.get(p.atc_id);
      a.proyectos += num(p.proyectos);
      if (num(p.activa_operaciones) === 1) a.monto += num(p.monto);
    }
    return [...m.values()].sort((a, b) => b.monto - a.monto);
  });
  // Del Gantt solo cuenta lo que YA tiene contrato (pedido): un hito de facturación en una fila sin
  // pedido es una intención, no una venta. Aun con pedido es un estimado (la fecha puede moverse).
  const tienePedido = (r) => !!(num(r.pedidos_id) || String(r.pedido_numero || "").trim());
  const contratos = computed(() => gantt.value.filter(pasa).filter(tienePedido));

  const atcsDisponibles = computed(() => {
    const m = new Map();
    for (const r of [...facturacion.value, ...cartera.value]) {
      if (r.atc_id != null && !m.has(r.atc_id)) m.set(r.atc_id, r.atc_nombre || `ATC ${r.atc_id}`);
    }
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  });

  const clientesDisponibles = computed(() => {
    const m = new Map();
    for (const r of [...facturacion.value, ...cartera.value, ...pipeline.value, ...ordenes.value]) {
      if (r.cliente_id != null && !m.has(r.cliente_id)) m.set(r.cliente_id, r.cliente || `Cliente ${r.cliente_id}`);
    }
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  });
  const nombreCliente = computed(() => clientesDisponibles.value.find((c) => c.value === filtroCliente.value)?.label || null);

  // Clic en un ranking/tabla: activa el filtro; clic otra vez sobre lo mismo lo quita.
  const alternarCliente = (id) => (filtroCliente.value = filtroCliente.value === id ? null : id);
  const alternarGrupo = (g) => (filtroGrupo.value = filtroGrupo.value === g ? null : g);
  const alternarAtc = (id) => (filtroAtc.value = filtroAtc.value === id ? null : id);

  const limpiarFiltros = () => {
    filtroGrupo.value = null;
    filtroAtc.value = null;
    filtroCliente.value = null;
  };

  // ==================== FACTURACIÓN ====================
  const factAnio = computed(() => fact.value.filter((f) => f.anio === anio.value));
  const factAnterior = computed(() => fact.value.filter((f) => f.anio === anio.value - 1));

  // Venta = facturado NETO: subtotal − descuento − notas de crédito (por anticipo y otras; las
  // sanciones van aparte como penalizaciones). Así el anticipo no se cuenta dos veces.
  const VENTA = "neto";
  const proyFacturacion = computed(() => proyectarAnio(serieMensual(fact.value, VENTA), anio.value, hoy));

  const mensual = (filas, campo) => {
    const arr = Array(12).fill(0);
    for (const f of filas) arr[f.mes - 1] += num(f[campo]);
    return arr;
  };
  const facturadoAnteriorMensual = computed(() => mensual(factAnterior.value, VENTA));

  // Mismo periodo del año anterior (hasta el mes en curso) para comparar el YTD.
  const mesCorte = computed(() => (anio.value < hoy.getFullYear() ? 12 : hoy.getMonth() + 1));
  const facturadoYtd = computed(() => proyFacturacion.value.ytd);
  const facturadoYtdAnterior = computed(() =>
    facturadoAnteriorMensual.value.slice(0, mesCorte.value).reduce((s, v) => s + v, 0)
  );
  const notasCreditoAnio = computed(() => sumar(factAnio.value, "notas_credito"));
  // Desglose del año: bruto − descuento en factura − NC por anticipo − otras NC = neto.
  const desgloseAnio = computed(() =>
    Object.fromEntries(["bruto", "descuento", "nc_anticipo", "nc_otras", "neto", "anticipo_aplicado"].map((c) => [c, sumar(factAnio.value, c)]))
  );
  const penalizacionesAnio = computed(() => sumar(factAnio.value, "penalizaciones"));

  // Meta: es GLOBAL (no se reparte por grupo/ATC); con filtros no se compara.
  const metaAnual = computed(() => (meta.value && !hayFiltro.value ? num(meta.value.monto_objetivo) : null));
  const metaMensual = computed(() => {
    if (metaAnual.value == null) return null;
    const pct = [1, 2, 3, 4].map((t) => num(meta.value[`porcentaje_trimestre${t}`]));
    const totalPct = pct.reduce((s, v) => s + v, 0) || 100;
    return Array.from({ length: 12 }, (_, i) => (metaAnual.value * (pct[Math.floor(i / 3)] / totalPct)) / 3);
  });

  const porGrupo = computed(() =>
    agrupar(factAnio.value, (f) => f.grupo_comercial || "OTROS", [VENTA]).sort((a, b) => b[VENTA] - a[VENTA])
  );
  const porAtc = computed(() =>
    agrupar(factAnio.value, "atc_id", [VENTA], (f) => ({ nombre: f.atc_nombre || "Sin ATC" })).sort(
      (a, b) => b[VENTA] - a[VENTA]
    )
  );

  // Por mes, todo el año: monto de contratos del Gantt (con pedido) según su fecha estimada de facturación.
  const ganttMensual = computed(() => {
    const arr = Array(12).fill(0);
    for (const r of contratos.value) {
      const fe = r.fecha_facturacion_estim;
      if (!fe || !r.pedido_monto || !fe.startsWith(String(anio.value))) continue;
      arr[Number(fe.slice(5, 7)) - 1] += num(r.pedido_monto);
    }
    return arr;
  });

  // Por mes: proyecciones de Factibilidad 1 (la más alta del catálogo de Proyección General), monto
  // ajustado según el mes factible capturado. Es la expectativa comercial "segura" del mes.
  const FACTIBILIDAD_ALTA = "1";
  const factibilidad1Mensual = computed(() => {
    const arr = Array(12).fill(0);
    for (const p of pipe.value) {
      if (String(p.factibilidad) !== FACTIBILIDAD_ALTA) continue;
      const m = mesANumero(p.mes);
      if (m) arr[m - 1] += num(p.monto);
    }
    return arr;
  });
  /**
   * Factibilidad 1 ubicada por la fecha estimada de facturación del GANTT (no por el mes factible):
   * - Liga proyecto ↔ fila del Gantt por proyecciones_proyectos_id o por pedido (un pedido de la
   *   proyección es el pedido de la fila).
   * - Si el proyecto tiene varias filas (varios pedidos), su monto se reparte según el monto de cada
   *   pedido (o en partes iguales si no hay monto) y cada parte va al mes de su fecha.
   * - Si no está en el Gantt, se queda en su mes factible (serie aparte, para que se note).
   * Requiere el detalle por proyecto; mientras carga, todo va por mes factible.
   */
  const factibilidad1PorGantt = computed(() => {
    const conGantt = Array(12).fill(0), sinGantt = Array(12).fill(0);
    let otroAnio = 0, nConGantt = 0, nSinGantt = 0, nOtroAnio = 0;
    const detalle = []; // proyecto → mes asignado (para el drill-down)
    if (!proyectosCargados.value) return { listo: false, conGantt: factibilidad1Mensual.value, sinGantt, otroAnio, nConGantt, nSinGantt, nOtroAnio, detalle };

    const filasGantt = gantt.value.filter(pasa).filter((r) => r.fecha_facturacion_estim);
    const porProyecto = new Map(), porPedido = new Map();
    for (const r of filasGantt) {
      if (num(r.proyecciones_proyectos_id)) {
        const k = num(r.proyecciones_proyectos_id);
        if (!porProyecto.has(k)) porProyecto.set(k, []);
        porProyecto.get(k).push(r);
      }
      const ped = String(r.pedido_numero || "").trim();
      if (ped) {
        if (!porPedido.has(ped)) porPedido.set(ped, []);
        porPedido.get(ped).push(r);
      }
    }
    const anioTxt = String(anio.value);
    for (const p of proys.value) {
      if (String(p.factibilidad) !== FACTIBILIDAD_ALTA) continue;
      const monto = num(p.monto);
      const filas = new Map((porProyecto.get(num(p.proyecto_id)) || []).map((r) => [r.id, r]));
      for (const ped of String(p.pedidos || "").split(",").map((x) => x.trim()).filter(Boolean)) {
        for (const r of porPedido.get(ped) || []) filas.set(r.id, r);
      }
      const base = { proyecto_id: p.proyecto_id, folio: p.folio, cliente: p.cliente, cliente_id: p.cliente_id, atc_nombre: p.atc_nombre,
        descripcion: p.descripcion, monto };
      if (!filas.size) {
        const m = mesANumero(p.mes);
        if (m) sinGantt[m - 1] += monto;
        nSinGantt++;
        detalle.push({ ...base, origen: "Mes factible (no está en el Gantt)", mes: m, anio: anio.value, parte: monto });
        continue;
      }
      nConGantt++;
      const lista = [...filas.values()];
      const totalPedidos = lista.reduce((s, r) => s + num(r.pedido_monto), 0);
      for (const r of lista) {
        const parte = totalPedidos > 0 ? (monto * num(r.pedido_monto)) / totalPedidos : monto / lista.length;
        const fe = r.fecha_facturacion_estim;
        const m = Number(fe.slice(5, 7));
        if (fe.startsWith(anioTxt)) conGantt[m - 1] += parte;
        else { otroAnio += parte; nOtroAnio++; }
        detalle.push({ ...base, origen: `Gantt${r.pedido_numero ? ` · pedido ${r.pedido_numero}` : ""}`, fecha: fe,
          mes: fe.startsWith(anioTxt) ? m : null, anio: Number(fe.slice(0, 4)), parte });
      }
    }
    return { listo: true, conGantt, sinGantt, otroAnio, nConGantt, nSinGantt, nOtroAnio, detalle };
  });

  /**
   * AVISOS de proyecciones: proyectos que siguen sumando, SIN contrato (sin pedido, ni propio ni en su
   * fila del Gantt), no ganados y sin perder, cuya fecha proyectada ya pasó o llega en los próximos
   * DIAS_AVISO días. Fecha proyectada = fecha de facturación del Gantt; si no está en el Gantt, el mes
   * factible (aviso desde DIAS_AVISO días antes de que empiece el mes; vencido cuando el mes terminó).
   * Sirve para decidir a tiempo: ¿se va a dar?, ¿se mueve la fecha? o ¿se actualiza el estatus?
   */
  const DIAS_AVISO = 7;
  const avisosProyectos = computed(() => {
    if (!proyectosCargados.value) return [];
    const dia = 86400000;
    const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const filasPorProy = new Map();
    for (const r of gantt.value.filter(pasa)) {
      const k = num(r.proyecciones_proyectos_id);
      if (!k) continue;
      if (!filasPorProy.has(k)) filasPorProy.set(k, []);
      filasPorProy.get(k).push(r);
    }
    const out = [];
    for (const p of proys.value) {
      if (num(p.activa_operaciones) !== 1 || num(p.ganado) === 1) continue;
      if (num(p.monto_perdido) > 0 || String(p.ganador || "").trim()) continue; // ya se decidió (perdido)
      const filas = filasPorProy.get(num(p.proyecto_id)) || [];
      if (String(p.pedidos || "").trim() || filas.some(tienePedido)) continue; // ya tiene contrato
      let inicio, fin, origen;
      const fechas = filas.map((r) => r.fecha_facturacion_estim).filter(Boolean).sort();
      if (fechas.length) {
        inicio = fin = new Date(`${fechas[0]}T00:00:00`);
        origen = "gantt";
      } else {
        const m = mesANumero(p.mes);
        if (!m) continue;
        const y = num(p.anio) || anio.value;
        inicio = new Date(y, m - 1, 1);
        fin = new Date(y, m, 0); // último día del mes
        origen = "mes";
      }
      let estado;
      if (fin < hoy0) estado = "vencido";
      else if ((inicio - hoy0) / dia <= DIAS_AVISO) estado = "proximo";
      else continue;
      out.push({
        ...p, origen, estado, fecha: iso(inicio), fechaFin: iso(fin),
        dias: Math.round((inicio - hoy0) / dia), // negativo = días de retraso
        gantt_id: filas[0]?.id ?? null,
      });
    }
    // Primero lo vencido (lo más atrasado arriba), luego lo próximo (lo más cercano arriba).
    return out.sort((a, b) => (a.estado === b.estado ? a.dias - b.dias : a.estado === "vencido" ? -1 : 1));
  });
  const resumenAvisos = computed(() => {
    const v = avisosProyectos.value.filter((a) => a.estado === "vencido");
    const p = avisosProyectos.value.filter((a) => a.estado === "proximo");
    return { vencidos: v.length, montoVencidos: sumar(v, "monto"), proximos: p.length, montoProximos: sumar(p, "monto"),
      total: avisosProyectos.value.length };
  });

  const etiquetaFactibilidadAlta = computed(
    () => pipeline.value.find((p) => String(p.factibilidad) === FACTIBILIDAD_ALTA)?.factibilidad_descripcion || "Factibilidad 1"
  );

  // Contratos del Gantt (con pedido) con facturación estimada en los meses que faltan (estimación
  // independiente de la proyección estadística: viene de las fechas del contrato + crédito del cliente).
  const porFacturarContratos = computed(() => {
    const arr = Array(12).fill(0);
    const desde = `${anio.value}-${String(mesCorte.value).padStart(2, "0")}-01`;
    for (const r of contratos.value) {
      const fe = r.fecha_facturacion_estim;
      if (!fe || !r.pedido_monto || fe < desde || !fe.startsWith(String(anio.value))) continue;
      arr[Number(fe.slice(5, 7)) - 1] += num(r.pedido_monto);
    }
    return arr;
  });

  // Anticipos por aplicar: ya facturados pero aún NO son venta (contabilidad no los aplica).
  // "Liquidados" = sin saldo: candidatos a aplicarse ya.
  const anticiposPend = computed(() => anticipos.value.filter(pasa));
  const anticiposResumen = computed(() => {
    const liq = anticiposPend.value.filter((a) => a.estado === "L" || num(a.saldo_mxn) <= 0.01);
    return {
      total: sumar(anticiposPend.value, "importe_mxn"),
      facturas: anticiposPend.value.length,
      liquidados: sumar(liq, "importe_mxn"),
      facturasLiquidadas: liq.length,
      saldo: sumar(anticiposPend.value, "saldo_mxn"),
    };
  });

  // ==================== COBRANZA ====================
  const cobAnio = computed(() => cob.value.filter((f) => f.anio === anio.value));
  const proyCobranza = computed(() => proyectarAnio(serieMensual(cob.value, "cobrado"), anio.value, hoy));
  const cobradoAnteriorMensual = computed(() => mensual(cob.value.filter((f) => f.anio === anio.value - 1), "cobrado"));
  const compensadoAnio = computed(() => sumar(cobAnio.value, "compensado"));

  const carteraTotal = computed(() => sumar(cart.value, "saldo_mxn"));
  const carteraVencida = computed(() => sumar(cart.value.filter((r) => num(r.dias_vencido) > 0), "saldo_mxn"));

  const antiguedad = computed(() =>
    RANGOS_ANTIGUEDAD.map((rg) => {
      const filas = cart.value.filter((r) => rangoDe(r.dias_vencido)?.key === rg.key);
      return { ...rg, monto: sumar(filas, "saldo_mxn"), facturas: filas.length };
    })
  );

  // DSO = cartera / venta diaria (facturado con IVA de los últimos 3 meses completos).
  const dso = computed(() => {
    const y = hoy.getFullYear(), m = hoy.getMonth() + 1;
    const meses = [1, 2, 3].map((k) => {
      const t = y * 12 + (m - 1) - k;
      return `${Math.floor(t / 12)}-${(t % 12) + 1}`;
    });
    const venta = fact.value.filter((f) => meses.includes(`${f.anio}-${f.mes}`)).reduce((s, f) => s + num(f.facturado_total), 0);
    return venta > 0 ? Math.round(carteraTotal.value / (venta / 91)) : null;
  });

  const diasPagoPorCliente = computed(() => new Map(dpago.value.map((d) => [d.cliente_id, d])));
  const diasPagoPromedio = computed(() => {
    const imp = sumar(dpago.value, "importe_mxn");
    return imp > 0 ? dpago.value.reduce((s, d) => s + num(d.dias_ponderados) * num(d.importe_mxn), 0) / imp : null;
  });

  /**
   * Flujo esperado de cobro (próximos 6 meses).
   * modo 'compromiso': fecha estimada que capturó cobranza; si no hay, el vencimiento.
   * modo 'historico' : fecha de factura + días REALES que ese cliente tarda en pagar (si tiene historia).
   * Lo que ya debió cobrarse y no tiene fecha nueva cae en "Atrasado".
   */
  const modoFlujo = ref("compromiso");
  const flujoEsperado = computed(() => {
    const hoyIso = hoy.toISOString().slice(0, 10);
    const base = hoy.getFullYear() * 12 + hoy.getMonth();
    const meses = Array.from({ length: 6 }, (_, k) => {
      const t = base + k;
      return { key: `${Math.floor(t / 12)}-${(t % 12) + 1}`, anio: Math.floor(t / 12), mes: (t % 12) + 1 };
    });
    const col = () => ({ atrasado: 0, ...Object.fromEntries(meses.map((m) => [m.key, 0])) });
    const series = { compromiso: col(), vencimiento: col(), historico: col(), contratos: col() };

    // Detalle por columna (para el drill-down): qué facturas/contratos forman cada barra.
    const detalle = Object.fromEntries(["atrasado", ...meses.map((m) => m.key)].map((k) => [k, []]));
    const ETIQUETA = { compromiso: "Fecha compromiso", vencimiento: "Vencimiento", historico: "Historial del cliente", contratos: "Contrato del Gantt" };

    const colocar = (serie, fechaIso, monto, r, folio) => {
      const k = !fechaIso || fechaIso < hoyIso ? "atrasado" : `${Number(fechaIso.slice(0, 4))}-${Number(fechaIso.slice(5, 7))}`;
      if (!(k in series[serie])) return;
      series[serie][k] += monto;
      detalle[k].push({ key: `${serie}-${folio}`, folio, cliente: r.cliente, cliente_id: r.cliente_id, atc_nombre: r.atc_nombre,
        criterio: ETIQUETA[serie], fecha: fechaIso, monto });
    };
    for (const r of cart.value) {
      const monto = num(r.saldo_mxn);
      if (modoFlujo.value === "historico") {
        const dp = diasPagoPorCliente.value.get(r.cliente_id);
        if (dp && r.fecha_factura) {
          const d = new Date(r.fecha_factura + "T00:00:00");
          d.setDate(d.getDate() + Math.round(num(dp.dias_ponderados)));
          colocar("historico", d.toISOString().slice(0, 10), monto, r, r.folio);
          continue;
        }
      }
      if (r.fecha_cobro_estimada) colocar("compromiso", r.fecha_cobro_estimada, monto, r, r.folio);
      else colocar("vencimiento", r.fecha_vencimiento, monto, r, r.folio);
    }
    // Contratos del Gantt cuya factura aún no sale (facturación estimada a futuro).
    for (const r of contratos.value) {
      if (!r.pedido_monto || !r.fecha_cobro_estim || !r.fecha_facturacion_estim || r.fecha_facturacion_estim < hoyIso) continue;
      if (r.fecha_cobro_estim < hoyIso) continue;
      colocar("contratos", r.fecha_cobro_estim, num(r.pedido_monto), r, r.pedido_numero ? `Pedido ${r.pedido_numero}` : `Gantt #${r.id}`);
    }
    return { meses, series, detalle };
  });

  // ==================== CLIENTES ====================
  const resumenClientes = computed(() => {
    const m = new Map();
    const base = (r) => ({
      cliente_id: r.cliente_id, cliente: r.cliente, grupo_comercial: r.grupo_comercial || "OTROS",
      atc_nombre: r.atc_nombre, dias_credito: r.dias_credito,
      facturado: 0, cobrado: 0, saldo: 0, vencido: 0, max_dias_vencido: 0, facturas_abiertas: 0,
      dias_pago: null, pct_a_tiempo: null, facturado_anterior: 0,
    });
    const get = (r) => {
      if (!m.has(r.cliente_id)) m.set(r.cliente_id, base(r));
      return m.get(r.cliente_id);
    };
    for (const f of factAnio.value) get(f).facturado += num(f[VENTA]);
    for (const f of factAnterior.value) get(f).facturado_anterior += num(f[VENTA]);
    for (const c of cobAnio.value) get(c).cobrado += num(c.cobrado);
    for (const r of cart.value) {
      const c = get(r);
      c.saldo += num(r.saldo_mxn);
      c.facturas_abiertas += 1;
      if (num(r.dias_vencido) > 0) {
        c.vencido += num(r.saldo_mxn);
        c.max_dias_vencido = Math.max(c.max_dias_vencido, num(r.dias_vencido));
      }
    }
    for (const d of dpago.value) {
      const c = get(d);
      c.dias_pago = d.dias_ponderados != null ? num(d.dias_ponderados) : null;
      c.pct_a_tiempo = num(d.facturas) > 0 ? num(d.a_tiempo) / num(d.facturas) : null;
    }
    for (const c of m.values()) {
      // Semáforo de riesgo de cobranza: deuda muy vencida o paga muy por encima de su crédito.
      const limite = num(c.dias_credito) + 15; // crédito + 15 días de aceptación (misma regla que el Gantt)
      if (c.max_dias_vencido > 90 || (c.dias_pago != null && c.dias_pago > limite * 2)) c.riesgo = "alto";
      else if (c.max_dias_vencido > 30 || (c.dias_pago != null && c.dias_pago > limite)) c.riesgo = "medio";
      else c.riesgo = "bajo";
      c.variacion = c.facturado_anterior > 0 ? c.facturado / c.facturado_anterior - 1 : null;
    }
    return [...m.values()];
  });

  const topDeudores = computed(() =>
    resumenClientes.value.filter((c) => c.saldo > 0).sort((a, b) => b.saldo - a.saldo).slice(0, 10)
  );
  const topFacturacion = computed(() =>
    resumenClientes.value.filter((c) => c.facturado > 0).sort((a, b) => b.facturado - a.facturado).slice(0, 10)
  );
  // Concentración: qué parte de la facturación del año hacen los 5 clientes más grandes.
  const concentracionTop5 = computed(() => {
    const total = sumar(factAnio.value, VENTA);
    const top5 = topFacturacion.value.slice(0, 5).reduce((s, c) => s + c.facturado, 0);
    return total > 0 ? top5 / total : null;
  });

  // ==================== ÓRDENES ABIERTAS ====================
  // Facturado neto de la orden = facturado − descuento facturado − NC por anticipo (como la Consulta general).
  const ords = computed(() =>
    ordenes.value.filter(pasa).map((o) => ({
      ...o,
      facturado_neto: num(o.facturado_bruto) - num(o.descuento_facturado) - num(o.nc_anticipo),
    }))
  );
  const CAMPOS_ORDEN = [
    "cotizado", "pte_autorizar", "autorizado", "descuento_autorizado", "cortesias", "neto_autorizado",
    "neto_sin_pedido", "facturado_bruto", "descuento_facturado", "nc_anticipo", "facturado_neto", "pendiente_facturar",
  ];
  const totalOrdenes = computed(() => Object.fromEntries(CAMPOS_ORDEN.map((c) => [c, sumar(ords.value, c)])));

  // ==================== PROYECCIONES (pipeline) ====================
  // Totales solo con factibilidades activas en operaciones: las no activas ('→' retomada en otro
  // año, 'X' descartada) duplicarían o inflarían el pipeline. Se siguen viendo en el desglose.
  const pipeActivo = computed(() => pipe.value.filter((p) => num(p.activa_operaciones) === 1));
  const pipelineTotal = computed(() => sumar(pipeActivo.value, "monto"));
  // Como Proyección General: ganado = monto_ganador de los ganados; perdido = no ganado con competidor capturado.
  const pipelineGanado = computed(() => sumar(pipeActivo.value, "monto_ganado"));
  const pipelinePerdido = computed(() => sumar(pipeActivo.value, "monto_perdido"));
  const pipelineInicial = computed(() => sumar(pipeActivo.value, "monto_inicial"));
  const pipelinePorFactibilidad = computed(() =>
    agrupar(pipe.value, (p) => p.factibilidad || "Sin factibilidad", ["monto", "proyectos", "monto_ganado", "monto_inicial", "monto_perdido"], (p) => ({
      activa: num(p.activa_operaciones) === 1,
      descripcion: p.factibilidad_descripcion,
      color: p.factibilidad_color ? `#${String(p.factibilidad_color).replace("#", "")}` : null,
    })).sort((a, b) => String(a.key).localeCompare(String(b.key)))
  );

  // ==================== INDICADORES (MAT / PYMAT + KPIs estándar) ====================
  // Crédito pactado promedio, ponderado por lo que cada cliente factura (para DSO / días de pago).
  const creditoPonderado = computed(() => {
    const imp = sumar(dpago.value, "importe_mxn");
    return imp > 0 ? dpago.value.reduce((s, d) => s + num(d.dias_credito) * num(d.importe_mxn), 0) / imp : null;
  });
  const mesIndicadores = ref(null); // índice de mes (año*12+mes−1) para MoM/YoY; null = último completo
  const indicadores = computed(() =>
    calcularIndicadores({
      mesSel: mesIndicadores.value,
      fact: fact.value, cob: cob.value, anio: anio.value, hoy,
      facturadoYtd: facturadoYtd.value, facturadoYtdAnterior: facturadoYtdAnterior.value, metaAnual: metaAnual.value,
      carteraTotal: carteraTotal.value, carteraVencida: carteraVencida.value,
      cartera90: antiguedad.value.find((r) => r.key === "d90")?.monto || 0,
      dso: dso.value, diasPagoPromedio: diasPagoPromedio.value, creditoPonderado: creditoPonderado.value,
      pipeGanado: pipelineGanado.value, pipePerdido: pipelinePerdido.value, pipe: pipe.value,
      ordenes: {
        listas: ordenesCargadas.value && !loadingOrdenes.value,
        cargando: loadingOrdenes.value,
        pendiente: totalOrdenes.value.pendiente_facturar,
        autorizado: totalOrdenes.value.autorizado,
        cotizado: totalOrdenes.value.cotizado,
        descCort: totalOrdenes.value.descuento_autorizado + totalOrdenes.value.cortesias,
      },
      anticiposPorAplicar: anticiposResumen.value.total,
    })
  );

  return {
    // estado
    anio, anios, loading, origen, consultar,
    filtroGrupo, filtroAtc, filtroCliente, hayFiltro, atcsDisponibles, clientesDisponibles, nombreCliente, limpiarFiltros,
    alternarCliente, alternarGrupo, alternarAtc, tab, irA,
    fact, cob,
    // facturación
    factAnio, proyFacturacion, facturadoAnteriorMensual, facturadoYtd, facturadoYtdAnterior, mesCorte,
    notasCreditoAnio, desgloseAnio, anticiposPend, anticiposResumen, penalizacionesAnio, metaAnual, metaMensual, porGrupo, porAtc, porFacturarContratos,
    ganttMensual, factibilidad1Mensual, factibilidad1PorGantt, etiquetaFactibilidadAlta, contratos,
    avisosProyectos, resumenAvisos, DIAS_AVISO, enfocarAvisos, verAvisos,
    // cobranza
    proyCobranza, cobradoAnteriorMensual, compensadoAnio, carteraTotal, carteraVencida, antiguedad, dso,
    diasPagoPromedio, modoFlujo, flujoEsperado, cart,
    // clientes
    resumenClientes, topDeudores, topFacturacion, concentracionTop5,
    // proyecciones
    ordenes, ords, totalOrdenes, loadingOrdenes, consultarOrdenes, ordenesDesde,
    proys, loadingProyectos, proyectosCargados, consultarProyectos,
    pipe, atcsProyecciones, pipeActivo, pipelineTotal, pipelineGanado, pipelinePerdido, pipelineInicial, pipelinePorFactibilidad,
    // indicadores
    indicadores, mesIndicadores,
  };
});
