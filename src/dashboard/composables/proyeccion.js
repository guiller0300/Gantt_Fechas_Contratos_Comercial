// Proyección lineal (mínimos cuadrados) para facturación y cobranza.
//
// Se ajusta una recta y = a + b·t sobre la serie mensual de los últimos meses COMPLETOS
// (el mes en curso va como real, pero no entra al ajuste porque está incompleto).
// El rango ± es el error estándar de los residuos: una banda honesta, no un intervalo formal.

/** Ajuste OLS. puntos = [{ t, y }]. Devuelve { a, b, sigma } o null si hay < 3 puntos. */
export function regresionLineal(puntos) {
  const n = puntos.length;
  if (n < 3) return null;
  const mt = puntos.reduce((s, p) => s + p.t, 0) / n;
  const my = puntos.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of puntos) {
    sxy += (p.t - mt) * (p.y - my);
    sxx += (p.t - mt) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mt;
  const sse = puntos.reduce((s, p) => s + (p.y - (a + b * p.t)) ** 2, 0);
  const sigma = Math.sqrt(sse / Math.max(1, n - 2));
  return { a, b, sigma };
}

/**
 * Proyecta los meses que faltan del año.
 * @param serie  Map 'YYYY-M' -> monto (meses sin dato = 0)
 * @param anio   año a proyectar
 * @param hoy    Date de referencia
 * @param ventana cuántos meses completos usar para el ajuste (default 18)
 * @returns { real: number[12], proyectado: number[12] (null donde hay real), cierre, cierreMin, cierreMax,
 *            ritmo (YTD / meses transcurridos × 12), tendenciaMensual (pendiente b), mesesAjuste }
 */
export function proyectarAnio(serie, anio, hoy = new Date(), ventana = 18) {
  const anioHoy = hoy.getFullYear();
  // Último mes con dato "real" del año: si el año ya pasó, diciembre; si es futuro, ninguno.
  const mesActual = anio < anioHoy ? 12 : anio > anioHoy ? 0 : hoy.getMonth() + 1;
  const ultimoCompleto = anio < anioHoy ? 12 : mesActual - 1; // en el año proyectado

  const real = Array.from({ length: 12 }, (_, i) => (i + 1 <= mesActual ? serie.get(`${anio}-${i + 1}`) || 0 : null));

  // Puntos de ajuste: `ventana` meses completos hacia atrás desde el último completo.
  const puntos = [];
  const idx = (y, m) => y * 12 + (m - 1);
  // (en enero cae en diciembre del año anterior; un año futuro se ajusta con lo último conocido).
  const fin = anio < anioHoy ? idx(anio, 12) : idx(anioHoy, hoy.getMonth() + 1) - 1;
  for (let k = fin - ventana + 1; k <= fin; k++) {
    const y = Math.floor(k / 12), m = (k % 12) + 1;
    puntos.push({ t: k, y: serie.get(`${y}-${m}`) || 0 });
  }
  const ajuste = regresionLineal(puntos);

  const proyectado = Array.from({ length: 12 }, (_, i) => {
    if (i + 1 <= mesActual || !ajuste) return null;
    return Math.max(0, ajuste.a + ajuste.b * idx(anio, i + 1));
  });

  const ytd = real.reduce((s, v) => s + (v || 0), 0);
  const restante = proyectado.reduce((s, v) => s + (v || 0), 0);
  const mesesFaltan = proyectado.filter((v) => v != null).length;
  const banda = ajuste ? ajuste.sigma * Math.sqrt(mesesFaltan) : 0;
  const cierre = ytd + restante;
  // Ritmo actual: lo que va del año prorrateado (usa meses completos para no castigar el mes en curso).
  const mesesRitmo = Math.max(1, ultimoCompleto);
  const ytdCompletos = real.slice(0, mesesRitmo).reduce((s, v) => s + (v || 0), 0);

  return {
    real,
    proyectado,
    ytd,
    cierre,
    cierreMin: Math.max(ytd, cierre - banda),
    cierreMax: cierre + banda,
    ritmo: mesActual === 0 ? null : (ytdCompletos / mesesRitmo) * 12,
    tendenciaMensual: ajuste ? ajuste.b : 0,
    mesesAjuste: puntos.length,
  };
}

/** Serie 'YYYY-M' -> monto a partir de filas { anio, mes, [campo] }. */
export function serieMensual(filas, campo) {
  const m = new Map();
  for (const f of filas) {
    const k = `${f.anio}-${f.mes}`;
    m.set(k, (m.get(k) || 0) + (Number(f[campo]) || 0));
  }
  return m;
}
