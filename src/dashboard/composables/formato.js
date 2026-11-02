// Formatos y catálogos compartidos del Dashboard Comercial.

export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const MESES_LARGOS = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/** Normaliza el mes de proyecciones (texto '3', '03' o 'MARZO') a 1-12; null si no se reconoce. */
export function mesANumero(mes) {
  if (mes == null || mes === "") return null;
  const n = Number(mes);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const txt = String(mes).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const i = MESES_LARGOS.findIndex((m) => txt.startsWith(m.slice(0, 3)));
  return i >= 0 ? i + 1 : null;
}

const fmtMxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** $1,234,567 */
export const moneda = (v) => fmtMxn.format(Number(v) || 0);

/** $1.2 M / $850 K — para ejes, KPI y etiquetas cortas. */
export function monedaCorta(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const signo = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${signo}$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)} mil M`;
  if (abs >= 1e6) return `${signo}$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)} M`;
  if (abs >= 1e3) return `${signo}$${Math.round(abs / 1e3)} K`;
  return `${signo}$${Math.round(abs)}`;
}

export const porcentaje = (v, dec = 0) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(dec)}%`);

export const fechaCorta = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** Colores por grupo comercial (identidad fija: no cambia al filtrar). */
export const COLOR_GRUPO = { CFE: "#2a78d6", PEMEX: "#eb6834", OTROS: "#1baf7a" };
export const ETIQUETA_GRUPO = { CFE: "CFE", PEMEX: "PEMEX", OTROS: "Varios" };

/** Antigüedad de saldos: por vencer (azul) + rampa ordinal roja para lo vencido (validada). */
export const RANGOS_ANTIGUEDAD = [
  { key: "por_vencer", label: "Por vencer", color: "#2a78d6", min: -Infinity, max: 0 },
  { key: "d1_30", label: "1–30 días", color: "#f2a39b", min: 1, max: 30 },
  { key: "d31_60", label: "31–60 días", color: "#e8706a", min: 31, max: 60 },
  { key: "d61_90", label: "61–90 días", color: "#d03b3b", min: 61, max: 90 },
  { key: "d90", label: "Más de 90", color: "#8f2424", min: 91, max: Infinity },
];

export const rangoDe = (diasVencido) =>
  RANGOS_ANTIGUEDAD.find((r) => (Number(diasVencido) || 0) >= r.min && (Number(diasVencido) || 0) <= r.max);
