// Indicadores estándar de Ventas y Contabilidad/Cobranza, con MAT y PYMAT.
//
// MAT (Moving Annual Total) = suma de los últimos 12 meses COMPLETOS; PYMAT = los 12 meses previos a
// ese periodo (mismo corte, un año antes). Crecimiento MAT = MAT / PYMAT − 1. Quita estacionalidad y
// el efecto de "cierre de año", que en Turbomáquinas pesa mucho (pocos contratos grandes por mes).
//
// UMBRALES: referencias sugeridas para una empresa industrial B2B de servicios/proyectos como TMQ.
// Están aquí juntas para que comercial/contabilidad las ajusten sin tocar el cálculo.
import { MESES, moneda, monedaCorta, porcentaje } from "@/dashboard/composables/formato";

export const UMBRALES = {
  crecimiento: { bueno: 0, alerta: -0.1, mayorEsMejor: true }, // MAT vs PYMAT
  retencion: { bueno: 0.8, alerta: 0.6, mayorEsMejor: true },
  concentracionTop5: { bueno: 0.5, alerta: 0.7, mayorEsMejor: false }, // dependencia de pocos clientes
  winRate: { bueno: 0.4, alerta: 0.25, mayorEsMejor: true }, // B2B industrial típico 20–40 %
  conversion: { bueno: 0.3, alerta: 0.15, mayorEsMejor: true }, // leads (proyectos) → venta; B2B típico 10–30 %
  conversionCotizaciones: { bueno: 0.7, alerta: 0.5, mayorEsMejor: true }, // cotizado → autorizado (órdenes)
  backlogMeses: { bueno: 3, alerta: 1.5, mayorEsMejor: true }, // meses de venta asegurados
  descuentosCortesias: { bueno: 0.03, alerta: 0.06, mayorEsMejor: false },
  indiceCobranza: { bueno: 0.95, alerta: 0.8, mayorEsMejor: true }, // cobrado ÷ facturado (MAT)
  carteraVencida: { bueno: 0.25, alerta: 0.5, mayorEsMejor: false },
  cartera90: { bueno: 0.1, alerta: 0.25, mayorEsMejor: false },
  notasCredito: { bueno: 0.02, alerta: 0.05, mayorEsMejor: false },
};

/** 'bien' | 'alerta' | 'mal' | null según el umbral. */
export function estado(valor, u) {
  if (valor == null || !isFinite(valor) || !u) return null;
  if (u.mayorEsMejor) return valor >= u.bueno ? "bien" : valor >= u.alerta ? "alerta" : "mal";
  return valor <= u.bueno ? "bien" : valor <= u.alerta ? "alerta" : "mal";
}
const rel = (a, b) => (b > 0 ? a / b - 1 : null);
const div = (a, b) => (b > 0 ? a / b : null);
const num = (v) => Number(v) || 0;
const idx = (y, m) => y * 12 + (m - 1);
const etiquetaIdx = (k) => `${MESES[k % 12]} ${String(Math.floor(k / 12)).slice(2)}`;

/** Suma `campo` de las filas {anio, mes} en la ventana (fin−n, fin]. */
function ventana(filas, campo, fin, n = 12) {
  let s = 0;
  for (const f of filas) {
    const k = idx(f.anio, f.mes);
    if (k > fin - n && k <= fin) s += num(f[campo]);
  }
  return s;
}

/** Venta por cliente en la ventana. */
function porCliente(filas, campo, fin) {
  const m = new Map();
  for (const f of filas) {
    const k = idx(f.anio, f.mes);
    if (k > fin - 12 && k <= fin) m.set(f.cliente_id, (m.get(f.cliente_id) || 0) + num(f[campo]));
  }
  return m;
}

/**
 * @param d datos ya filtrados del store: fact, cob, anio, hoy, carteraTotal, carteraVencida, cartera90, dso,
 *          diasPagoPromedio, creditoPonderado, pipeGanado, pipePerdido, pipe (todas las proyecciones del año),
 *          ordenes ({listas, cargando, pendiente, autorizado, cotizado, descCort}),
 *          anticiposPorAplicar, metaAnual, facturadoYtd
 */
/** Suma mensual por índice de mes (y*12+m-1). */
function porMes(filas, campo) {
  const m = new Map();
  for (const f of filas) {
    const k = idx(f.anio, f.mes);
    m.set(k, (m.get(k) || 0) + num(f[campo]));
  }
  return m;
}

/**
 * MoM (crecimiento intermensual) = (mes − mes anterior) ÷ mes anterior.
 * YoY (crecimiento interanual)  = (mes − mismo mes del año pasado) ÷ mismo mes del año pasado.
 */
function crecimientoDelMes(vMes, k) {
  const v = vMes.get(k) || 0, prev = vMes.get(k - 1) || 0, py = vMes.get(k - 12) || 0;
  return { valor: v, prev, py, mom: rel(v, prev), yoy: rel(v, py) };
}

export function calcularIndicadores(d) {
  const anioHoy = d.hoy.getFullYear();
  // Corte = último mes completo (o diciembre si se consulta un año cerrado).
  const fin = d.anio < anioHoy ? idx(d.anio, 12) : idx(anioHoy, d.hoy.getMonth() + 1) - 1;
  const VENTA = "neto";

  // ---- MoM / YoY del mes elegido (por defecto, el último completo; el mes en curso se puede elegir) ----
  const mesActual = idx(anioHoy, d.hoy.getMonth() + 1);
  const ultimoDisponible = d.anio < anioHoy ? fin : mesActual;
  const vMes = porMes(d.fact, VENTA);
  const cMes = porMes(d.cob, "cobrado");
  // Por defecto: el último mes completo que SÍ tiene información (si la base llega a un corte anterior,
  // p. ej. una copia de la BD, no se compara contra meses vacíos que darían −100 %).
  const conDatos = [...vMes.keys(), ...cMes.keys()].filter((kk) => kk <= fin);
  const ultimoConDatos = conDatos.length ? Math.max(...conDatos) : fin;
  const mesSel = d.mesSel != null && d.mesSel <= ultimoDisponible ? d.mesSel : Math.min(fin, ultimoConDatos);
  const opcionesMes = Array.from({ length: 24 }, (_, i) => ultimoDisponible - i).map((kk) => ({
    value: kk, label: `${etiquetaIdx(kk)}${kk === mesActual ? " (en curso)" : ""}`,
  }));
  const mes = {
    idx: mesSel, label: etiquetaIdx(mesSel), labelPrev: etiquetaIdx(mesSel - 1), labelPy: etiquetaIdx(mesSel - 12),
    enCurso: mesSel === mesActual, anio: Math.floor(mesSel / 12), mes: (mesSel % 12) + 1,
    sinDatosDespues: ultimoConDatos < fin ? etiquetaIdx(ultimoConDatos) : null,
    ventas: crecimientoDelMes(vMes, mesSel), cobranza: crecimientoDelMes(cMes, mesSel),
  };
  // Tabla de los últimos 12 meses (hasta el mes elegido) con MoM y YoY.
  const tablaMensual = Array.from({ length: 12 }, (_, i) => mesSel - 11 + i).map((kk) => {
    const v = crecimientoDelMes(vMes, kk), c = crecimientoDelMes(cMes, kk);
    return { key: kk, anio: Math.floor(kk / 12), mes: (kk % 12) + 1, label: etiquetaIdx(kk), enCurso: kk === mesActual,
      ventas: v.valor, ventasPrev: v.prev, ventasPy: v.py, mom: v.mom, yoy: v.yoy, cobranza: c.valor, cobranzaPy: c.py, yoyCob: c.yoy };
  });

  const mat = ventana(d.fact, VENTA, fin);
  const pymat = ventana(d.fact, VENTA, fin - 12);
  const matCob = ventana(d.cob, "cobrado", fin);
  const pymatCob = ventana(d.cob, "cobrado", fin - 12);
  const matConIva = ventana(d.fact, "facturado_total", fin);
  const matFacturas = ventana(d.fact, "num_facturas", fin);
  const pyFacturas = ventana(d.fact, "num_facturas", fin - 12);
  const matNc = ventana(d.fact, "notas_credito", fin);
  const matBase = ventana(d.fact, "facturado", fin); // subtotal − descuento (antes de NC)
  const matPen = ventana(d.fact, "penalizaciones", fin);
  const pymatPen = ventana(d.fact, "penalizaciones", fin - 12);

  // Clientes: activos, nuevos, perdidos, retención.
  const cMat = porCliente(d.fact, VENTA, fin);
  const cPy = porCliente(d.fact, VENTA, fin - 12);
  const activos = [...cMat.values()].filter((v) => v > 0).length;
  const activosPy = [...cPy.values()].filter((v) => v > 0).length;
  let nuevos = 0, ventaNuevos = 0, perdidos = 0, ventaPerdidos = 0, recurrentes = 0;
  for (const [id, v] of cMat) {
    if (v <= 0) continue;
    if ((cPy.get(id) || 0) > 0) recurrentes++;
    else { nuevos++; ventaNuevos += v; }
  }
  for (const [id, v] of cPy) {
    if (v > 0 && !((cMat.get(id) || 0) > 0)) { perdidos++; ventaPerdidos += v; }
  }
  const top5 = [...cMat.values()].sort((a, b) => b - a).slice(0, 5).reduce((s, v) => s + v, 0);

  // Serie MAT móvil de 24 meses (cada punto = suma de los 12 meses que terminan ahí).
  const puntos = Array.from({ length: 24 }, (_, i) => fin - 23 + i);
  const serie = {
    labels: puntos.map(etiquetaIdx),
    ventas: puntos.map((k) => ventana(d.fact, VENTA, k)),
    cobranza: puntos.map((k) => ventana(d.cob, "cobrado", k)),
  };

  const periodo = `${etiquetaIdx(fin - 11)} – ${etiquetaIdx(fin)}`;
  const periodoPy = `${etiquetaIdx(fin - 23)} – ${etiquetaIdx(fin - 12)}`;
  const winRate = div(d.pipeGanado, d.pipeGanado + d.pipePerdido);
  // Conversión = ventas realizadas ÷ leads captados. Lead = proyecto registrado en Proyección General en el
  // año (factibilidades que suman + canceladas 'X'; se excluye '→ pasa próximo año' porque cuenta allá).
  const leads = (d.pipe || []).filter((p) => num(p.activa_operaciones) === 1 || p.factibilidad === "X");
  const nLeads = leads.reduce((s, p) => s + num(p.proyectos), 0);
  const nGanados = leads.filter((p) => num(p.ganado) === 1).reduce((s, p) => s + num(p.proyectos), 0);
  const montoLeads = leads.reduce((s, p) => s + num(p.monto), 0);
  const montoGanadoLeads = leads.reduce((s, p) => s + num(p.monto_ganado), 0);
  const conversion = div(nGanados, nLeads);
  const conversionMonto = div(montoGanadoLeads, montoLeads);
  const conversionCot = d.ordenes.listas ? div(d.ordenes.autorizado, d.ordenes.cotizado) : null;
  const backlogMeses = d.ordenes.listas && mat > 0 ? d.ordenes.pendiente / (mat / 12) : null;
  const descCort = d.ordenes.listas ? div(d.ordenes.descCort, d.ordenes.autorizado) : null;
  const indiceCob = div(matCob, matConIva);
  const rotacion = div(matConIva, d.carteraTotal);
  const pctVencida = div(d.carteraVencida, d.carteraTotal);
  const pct90 = div(d.cartera90, d.carteraTotal);
  const pctNc = div(matNc, matBase);
  const limiteDso = d.creditoPonderado != null ? d.creditoPonderado + 15 : null; // crédito + 15 días de aceptación

  const k = (o) => ({ delta: null, estado: null, comparativo: "", ...o });
  const ventas = [
    k({ key: "mat", nombre: "Ventas netas MAT", valor: moneda(mat), comparativo: `PYMAT ${moneda(pymat)}`, delta: rel(mat, pymat),
      estado: estado(rel(mat, pymat), UMBRALES.crecimiento), referencia: "Crecer vs PYMAT (≥ 0 %)",
      que: "Venta neta de los últimos 12 meses completos vs los 12 anteriores. Quita la estacionalidad.", ir: "facturacion" }),
    k({ key: "mom", nombre: `Crecimiento intermensual (MoM) · ${mes.label}`, valor: moneda(mes.ventas.valor),
      comparativo: `${mes.labelPrev}: ${moneda(mes.ventas.prev)}`, delta: mes.ventas.mom,
      referencia: "Muy volátil en TMQ: un contrato grande mueve el mes",
      que: "(Ventas del mes − ventas del mes anterior) ÷ ventas del mes anterior × 100.", ir: "facturacion" }),
    k({ key: "yoy", nombre: `Crecimiento interanual (YoY) · ${mes.label}`, valor: moneda(mes.ventas.valor),
      comparativo: `${mes.labelPy}: ${moneda(mes.ventas.py)}`, delta: mes.ventas.yoy,
      estado: estado(mes.ventas.yoy, UMBRALES.crecimiento), referencia: "Crecer vs el mismo mes del año pasado",
      que: "(Ventas del mes − ventas del mismo mes del año pasado) ÷ ventas del mismo mes del año pasado × 100.", ir: "facturacion" }),
    k({ key: "ytd", nombre: "Ventas del año (YTD)", valor: moneda(d.facturadoYtd), comparativo: `Mismo periodo ${d.anio - 1}: ${moneda(d.facturadoYtdAnterior)}`,
      delta: rel(d.facturadoYtd, d.facturadoYtdAnterior), estado: estado(rel(d.facturadoYtd, d.facturadoYtdAnterior), UMBRALES.crecimiento),
      referencia: "Crecer vs año anterior", que: "Acumulado del año contra el mismo corte del año pasado.", ir: "facturacion" }),
    ...(d.metaAnual ? [k({ key: "meta", nombre: "Avance de la meta anual", valor: porcentaje(div(d.facturadoYtd, d.metaAnual)),
      comparativo: `Meta ${moneda(d.metaAnual)}`, referencia: "Ir en línea con el % de año transcurrido",
      que: "Venta del año ÷ meta capturada en Indicador de meta de venta.", ir: "facturacion" })] : []),
    k({ key: "ticket", nombre: "Ticket promedio por factura (MAT)", valor: moneda(div(mat, matFacturas)),
      comparativo: `PYMAT ${moneda(div(pymat, pyFacturas))}`, delta: rel(div(mat, matFacturas), div(pymat, pyFacturas)),
      referencia: "Tendencia: subir = trabajos más grandes", que: "Venta neta ÷ número de facturas en el MAT.", ir: "facturacion" }),
    k({ key: "activos", nombre: "Clientes activos (MAT)", valor: String(activos), comparativo: `PYMAT ${activosPy}`, delta: rel(activos, activosPy),
      referencia: "Base estable o creciente", que: "Clientes con venta en los últimos 12 meses.", ir: "clientes" }),
    k({ key: "nuevos", nombre: "Clientes nuevos", valor: `${nuevos} · ${monedaCorta(ventaNuevos)}`, comparativo: "Sin venta en el PYMAT",
      referencia: "Captación de cuentas", que: "Clientes que compran en el MAT y no compraron en los 12 meses previos.", ir: "clientes" }),
    k({ key: "perdidos", nombre: "Clientes perdidos", valor: `${perdidos} · ${monedaCorta(ventaPerdidos)}`, comparativo: "Compraron en el PYMAT, no en el MAT",
      estado: perdidos === 0 ? "bien" : null, referencia: "Recuperar o explicar cada uno", que: "Venta que dejó de llegar: oportunidad de reactivación.", ir: "clientes" }),
    k({ key: "retencion", nombre: "Retención de clientes", valor: porcentaje(div(recurrentes, activosPy)), comparativo: `${recurrentes} de ${activosPy} siguen comprando`,
      estado: estado(div(recurrentes, activosPy), UMBRALES.retencion), referencia: "≥ 80 % bien · 60–80 % alerta",
      que: "Clientes del PYMAT que también compraron en el MAT.", ir: "clientes" }),
    k({ key: "top5", nombre: "Concentración: top 5 clientes", valor: porcentaje(div(top5, mat)), comparativo: "de la venta MAT",
      estado: estado(div(top5, mat), UMBRALES.concentracionTop5), referencia: "≤ 50 % bien · > 70 % riesgo",
      que: "Dependencia de pocos clientes (CFE/PEMEX pesan mucho).", ir: "clientes" }),
    k({ key: "conv", nombre: "Tasa de conversión (leads → venta)", valor: porcentaje(conversion, 1),
      comparativo: `${nGanados} ganados de ${nLeads} proyectos captados`, estado: estado(conversion, UMBRALES.conversion),
      referencia: "≥ 30 % bien · 15–30 % alerta",
      que: `(Proyectos ganados ÷ proyectos registrados en ${d.anio}) × 100. Lead = proyecto en Proyección General.`, ir: "proyecciones" }),
    k({ key: "convm", nombre: "Conversión por monto", valor: porcentaje(conversionMonto, 1),
      comparativo: `${monedaCorta(montoGanadoLeads)} ganados de ${monedaCorta(montoLeads)} proyectados`, estado: estado(conversionMonto, UMBRALES.conversion),
      referencia: "Comparar con la de número: si es menor, se pierden los grandes",
      que: "Monto ganado ÷ monto ajustado de todos los proyectos captados en el año.", ir: "proyecciones" }),
    k({ key: "convc", nombre: "Conversión de cotizaciones", valor: conversionCot == null ? (d.ordenes.cargando ? "Calculando…" : "—") : porcentaje(conversionCot, 1),
      comparativo: d.ordenes.listas ? `${monedaCorta(d.ordenes.autorizado)} autorizado de ${monedaCorta(d.ordenes.cotizado)} cotizado` : "",
      estado: estado(conversionCot, UMBRALES.conversionCotizaciones), referencia: "≥ 70 % bien · < 50 % revisar precio/alcance",
      que: "Autorizado ÷ cotizado en las órdenes abiertas (lo que el cliente acepta de lo que se le cotiza).", ir: "ordenes" }),
    k({ key: "win", nombre: "Tasa de éxito en proyecciones", valor: porcentaje(winRate), comparativo: `Ganado ${monedaCorta(d.pipeGanado)} · perdido ${monedaCorta(d.pipePerdido)}`,
      estado: estado(winRate, UMBRALES.winRate), referencia: "≥ 40 % bien · 25–40 % alerta",
      que: `Ganado ÷ (ganado + perdido vs competencia) en proyecciones ${d.anio}.`, ir: "proyecciones" }),
    k({ key: "backlog", nombre: "Backlog autorizado por facturar", valor: backlogMeses == null ? (d.ordenes.cargando ? "Calculando…" : "—") : `${backlogMeses.toFixed(1)} meses`,
      comparativo: d.ordenes.listas ? `${moneda(d.ordenes.pendiente)} pendiente` : "", estado: estado(backlogMeses, UMBRALES.backlogMeses),
      referencia: "≥ 3 meses de venta asegurada", que: "Pendiente de facturar de órdenes abiertas ÷ venta mensual promedio (MAT/12).", ir: "ordenes" }),
    k({ key: "desc", nombre: "Descuentos + cortesías", valor: descCort == null ? (d.ordenes.cargando ? "Calculando…" : "—") : porcentaje(descCort, 1),
      comparativo: "de lo autorizado", estado: estado(descCort, UMBRALES.descuentosCortesias), referencia: "≤ 3 % bien · > 6 % revisar",
      que: "Lo que se deja de cobrar sobre lo que el cliente autorizó.", ir: "ordenes" }),
  ];

  const contabilidad = [
    k({ key: "matcob", nombre: "Cobranza MAT", valor: moneda(matCob), comparativo: `PYMAT ${moneda(pymatCob)}`, delta: rel(matCob, pymatCob),
      estado: estado(rel(matCob, pymatCob), UMBRALES.crecimiento), referencia: "Crecer al ritmo de la venta",
      que: "Efectivo cobrado (con IVA) en los últimos 12 meses vs los 12 anteriores.", ir: "cobranza" }),
    k({ key: "icob", nombre: "Índice de cobranza (MAT)", valor: porcentaje(indiceCob), comparativo: `Cobrado ÷ facturado con IVA (${monedaCorta(matConIva)})`,
      estado: estado(indiceCob, UMBRALES.indiceCobranza), referencia: "≥ 95 % bien · < 80 % la cartera crece",
      que: "Si es menor a 100 %, se factura más de lo que se cobra y la cartera crece.", ir: "cobranza" }),
    k({ key: "dso", nombre: "DSO (días de venta en cartera)", valor: d.dso != null ? `${d.dso} días` : "—",
      comparativo: limiteDso != null ? `Crédito pactado + aceptación ≈ ${Math.round(limiteDso)} días` : "",
      estado: d.dso == null || limiteDso == null ? null : d.dso <= limiteDso ? "bien" : d.dso <= limiteDso * 2 ? "alerta" : "mal",
      referencia: "≤ crédito promedio + 15 días", que: "Cartera ÷ venta diaria (últimos 3 meses).", ir: "cobranza" }),
    k({ key: "rot", nombre: "Rotación de cartera", valor: rotacion == null ? "—" : `${rotacion.toFixed(1)} veces/año`,
      comparativo: rotacion ? `≈ ${Math.round(365 / rotacion)} días para cobrar` : "", referencia: "Más vueltas = cobro más rápido",
      que: "Facturado con IVA del MAT ÷ cartera actual.", ir: "cobranza" }),
    k({ key: "venc", nombre: "Cartera vencida", valor: porcentaje(pctVencida), comparativo: `${moneda(d.carteraVencida)} de ${moneda(d.carteraTotal)}`,
      estado: estado(pctVencida, UMBRALES.carteraVencida), referencia: "≤ 25 % bien · > 50 % crítico", que: "Saldo vencido ÷ cartera total.", ir: "cobranza" }),
    k({ key: "c90", nombre: "Cartera con más de 90 días", valor: porcentaje(pct90), comparativo: moneda(d.cartera90),
      estado: estado(pct90, UMBRALES.cartera90), referencia: "≤ 10 % bien · > 25 % riesgo de incobrable",
      que: "Saldo con más de 90 días de vencido (candidato a provisión).", ir: "cobranza" }),
    k({ key: "dpago", nombre: "Días reales de pago", valor: d.diasPagoPromedio != null ? `${Math.round(d.diasPagoPromedio)} días` : "—",
      comparativo: limiteDso != null ? `Crédito + aceptación ≈ ${Math.round(limiteDso)} días` : "",
      estado: d.diasPagoPromedio == null || limiteDso == null ? null : d.diasPagoPromedio <= limiteDso ? "bien" : d.diasPagoPromedio <= limiteDso * 2 ? "alerta" : "mal",
      referencia: "≤ crédito pactado + 15", que: "Timbrado → último pago, ponderado por importe (facturas liquidadas).", ir: "clientes" }),
    k({ key: "nc", nombre: "Notas de crédito sobre venta (MAT)", valor: porcentaje(pctNc, 1), comparativo: moneda(matNc),
      estado: estado(pctNc, UMBRALES.notasCredito), referencia: "≤ 2 % bien · > 5 % revisar causas", que: "Devoluciones, bonificaciones y aplicaciones de anticipo.", ir: "facturacion" }),
    k({ key: "pen", nombre: "Penalizaciones (MAT)", valor: moneda(matPen), comparativo: `PYMAT ${moneda(pymatPen)}`, delta: rel(matPen, pymatPen),
      estado: matPen === 0 ? "bien" : rel(matPen, pymatPen) != null && rel(matPen, pymatPen) > 0 ? "alerta" : null,
      referencia: "Tender a cero", que: "Notas de crédito por sanción (penas convencionales de contratos).", ir: "facturacion" }),
    k({ key: "ant", nombre: "Anticipos por aplicar", valor: moneda(d.anticiposPorAplicar), comparativo: "Facturados, aún no son venta",
      referencia: "Aplicar al liquidarse o al cierre", que: "Facturas de anticipo (G/M/P/Q/H/J) sin fecha de aplicación.", ir: "facturacion" }),
  ];

  return { mes, opcionesMes, tablaMensual, mat, pymat, matCob, pymatCob, crecimiento: rel(mat, pymat), crecimientoCob: rel(matCob, pymatCob), periodo, periodoPy, serie, ventas, contabilidad };
}
