<script setup>
// Columnas por categoría (meses) + líneas de referencia, en SVG y con un solo eje (MXN).
// - bars:  [{ key, label, color, values[], stack? }]  series con el mismo `stack` se apilan
//          (p. ej. real + proyectado ocupan el mismo mes); sin stack van lado a lado.
// - lines: [{ key, label, color, values[], dashed? }] referencias (año anterior, meta).
// Hover: cada mes es el blanco; el tooltip lista todas las series de ese mes.
// Interacción: clic en la leyenda prende/apaga una serie; con `clickable`, clic en un mes emite
// `select(indice)` (el panel abre el detalle) y `seleccionado` lo deja resaltado.
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { monedaCorta, moneda } from "@/dashboard/composables/formato";

const props = defineProps({
  labels: { type: Array, required: true },
  bars: { type: Array, default: () => [] },
  lines: { type: Array, default: () => [] },
  height: { type: Number, default: 260 },
  formato: { type: Function, default: moneda },
  clickable: { type: Boolean, default: false },
  seleccionado: { type: Number, default: null },
});
const emit = defineEmits(["select"]);

// Series apagadas desde la leyenda (por key). Se recalcula el eje con las visibles.
const ocultas = ref(new Set());
const alternarSerie = (key) => {
  const s = new Set(ocultas.value);
  s.has(key) ? s.delete(key) : s.add(key);
  ocultas.value = s;
};
const barsVis = computed(() => props.bars.filter((s) => !ocultas.value.has(s.key)));
const linesVis = computed(() => props.lines.filter((l) => !ocultas.value.has(l.key)));

const root = ref(null);
const ancho = ref(600);
let ro;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (ancho.value = Math.max(280, e.contentRect.width)));
  ro.observe(root.value);
});
onBeforeUnmount(() => ro?.disconnect());

const M = { top: 12, right: 12, bottom: 26, left: 56 };
const plotW = computed(() => ancho.value - M.left - M.right);
const plotH = computed(() => props.height - M.top - M.bottom);
const n = computed(() => props.labels.length);
const banda = computed(() => plotW.value / Math.max(1, n.value));

// Grupos de barras: cada stack (o serie suelta) es un grupo lado a lado dentro del mes.
const grupos = computed(() => {
  const orden = [];
  const m = new Map();
  for (const s of barsVis.value) {
    const g = s.stack || s.key;
    if (!m.has(g)) { m.set(g, []); orden.push(g); }
    m.get(g).push(s);
  }
  return orden.map((g) => m.get(g));
});

const maxValor = computed(() => {
  let max = 0;
  for (let i = 0; i < n.value; i++) {
    for (const g of grupos.value) max = Math.max(max, g.reduce((s, x) => s + (Number(x.values[i]) || 0), 0));
    for (const l of linesVis.value) max = Math.max(max, Number(l.values[i]) || 0);
  }
  return max || 1;
});

// Eje Y con números "limpios" (1, 2, 2.5, 5 × 10^k).
const ticks = computed(() => {
  const crudo = maxValor.value / 4;
  const p = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= crudo) || p * 10;
  const out = [];
  for (let v = 0; v <= maxValor.value + paso * 0.001; v += paso) out.push(v);
  if (out[out.length - 1] < maxValor.value) out.push(out[out.length - 1] + paso);
  return out;
});
const yMax = computed(() => ticks.value[ticks.value.length - 1] || 1);
const y = (v) => M.top + plotH.value - (v / yMax.value) * plotH.value;

const anchoBarra = computed(() => {
  const g = Math.max(1, grupos.value.length);
  return Math.max(4, Math.min(24, (banda.value * 0.7 - 2 * (g - 1)) / g));
});

// Rectángulos (con 2px de separación entre segmentos apilados; extremo redondeado de 4px).
const rects = computed(() => {
  const out = [];
  const g = grupos.value.length;
  const total = g * anchoBarra.value + (g - 1) * 2;
  for (let i = 0; i < n.value; i++) {
    const x0 = M.left + i * banda.value + (banda.value - total) / 2;
    grupos.value.forEach((series, gi) => {
      let acum = 0;
      const vivos = series.filter((s) => Number(s.values[i]) > 0);
      vivos.forEach((s, si) => {
        const v = Number(s.values[i]);
        const yTop = y(acum + v);
        const yBot = y(acum) - (si > 0 ? 2 : 0);
        acum += v;
        const h = Math.max(0, yBot - yTop);
        if (h < 0.5) return;
        out.push({ id: `${i}-${s.key}`, x: x0 + gi * (anchoBarra.value + 2), y: yTop, w: anchoBarra.value, h,
          color: s.color, tope: si === vivos.length - 1 });
      });
    });
  }
  return out;
});

const rutaBarra = (r) => {
  const rad = r.tope ? Math.min(4, r.h, r.w / 2) : 0;
  return `M${r.x},${r.y + r.h} V${r.y + rad} Q${r.x},${r.y} ${r.x + rad},${r.y} H${r.x + r.w - rad} Q${r.x + r.w},${r.y} ${r.x + r.w},${r.y + rad} V${r.y + r.h} Z`;
};

const rutasLinea = computed(() =>
  linesVis.value.map((l) => {
    const pts = [];
    l.values.forEach((v, i) => {
      if (v == null) return;
      pts.push([M.left + (i + 0.5) * banda.value, y(Number(v) || 0)]);
    });
    return { ...l, d: pts.map((p, k) => `${k ? "L" : "M"}${p[0]},${p[1]}`).join(" "), pts };
  })
);

// ---------- hover ----------
const hover = ref(null);
const tooltip = computed(() => {
  if (hover.value == null) return null;
  const i = hover.value;
  const filas = [
    ...barsVis.value.filter((s) => s.values[i] != null && Number(s.values[i]) !== 0).map((s) => ({ ...s, v: s.values[i] })),
    ...linesVis.value.filter((l) => l.values[i] != null).map((l) => ({ ...l, v: l.values[i], linea: true })),
  ];
  const x = M.left + (i + 0.5) * banda.value;
  return { titulo: props.labels[i], filas, izquierda: x > ancho.value * 0.6, x };
});

const leyenda = computed(() => [
  ...props.bars.map((s) => ({ ...s, tipo: "barra" })),
  ...props.lines.map((l) => ({ ...l, tipo: "linea" })),
]);
</script>

<template>
  <div ref="root" class="gc">
    <div v-if="leyenda.length > 1" class="gc-leyenda">
      <span v-for="s in leyenda" :key="s.key" class="gc-ley" :class="{ 'gc-ley--off': ocultas.has(s.key) }"
        role="button" tabindex="0" :title="ocultas.has(s.key) ? 'Mostrar serie' : 'Ocultar serie'"
        @click="alternarSerie(s.key)" @keydown.enter="alternarSerie(s.key)">
        <span v-if="s.tipo === 'barra'" class="gc-swatch" :style="{ background: s.color }"></span>
        <svg v-else width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" :stroke="s.color" stroke-width="2" :stroke-dasharray="s.dashed ? '4 3' : null" stroke-linecap="round" /></svg>
        {{ s.label }}
      </span>
    </div>
    <svg :width="ancho" :height="height" class="gc-svg" @mouseleave="hover = null">
      <!-- rejilla + eje Y -->
      <g v-for="t in ticks" :key="t">
        <line :x1="M.left" :x2="ancho - M.right" :y1="y(t)" :y2="y(t)" :class="t === 0 ? 'gc-base' : 'gc-grid'" />
        <text :x="M.left - 8" :y="y(t) + 4" text-anchor="end" class="gc-tick">{{ monedaCorta(t) }}</text>
      </g>
      <!-- eje X -->
      <text v-for="(l, i) in labels" :key="'x' + i" :x="M.left + (i + 0.5) * banda" :y="height - 8" text-anchor="middle" class="gc-tick">{{ l }}</text>
      <!-- foco del mes bajo el puntero -->
      <rect v-if="seleccionado != null" :x="M.left + seleccionado * banda" :y="M.top" :width="banda" :height="plotH" class="gc-sel" />
      <rect v-if="hover != null && hover !== seleccionado" :x="M.left + hover * banda" :y="M.top" :width="banda" :height="plotH" class="gc-foco" />
      <path v-for="r in rects" :key="r.id" :d="rutaBarra(r)" :fill="r.color" />
      <g v-for="l in rutasLinea" :key="l.key">
        <path :d="l.d" fill="none" :stroke="l.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" :stroke-dasharray="l.dashed ? '5 4' : null" />
        <circle v-for="(p, k) in l.pts" :key="k" :cx="p[0]" :cy="p[1]" r="3" :fill="l.color" stroke="#fff" stroke-width="2" />
      </g>
      <!-- blancos de hover (todo el mes) -->
      <rect v-for="(l, i) in labels" :key="'h' + i" :x="M.left + i * banda" :y="M.top" :width="banda" :height="plotH" fill="transparent"
        :class="{ 'gc-hit': clickable }" @mouseenter="hover = i" @click="clickable && emit('select', i)" />
    </svg>
    <div v-if="tooltip" class="gc-tip" :style="{ left: tooltip.x + 'px', transform: tooltip.izquierda ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }">
      <div class="gc-tip-titulo">{{ tooltip.titulo }}</div>
      <div v-for="f in tooltip.filas" :key="f.key" class="gc-tip-fila">
        <span v-if="!f.linea" class="gc-swatch" :style="{ background: f.color }"></span>
        <span v-else class="gc-linea" :style="{ borderColor: f.color, borderStyle: f.dashed ? 'dashed' : 'solid' }"></span>
        <b>{{ formato(f.v) }}</b><span class="gc-tip-label">{{ f.label }}</span>
      </div>
      <div v-if="!tooltip.filas.length" class="gc-tip-label">Sin movimientos</div>
      <div v-if="clickable" class="gc-tip-accion">Clic para ver el detalle</div>
    </div>
  </div>
</template>

<style scoped>
.gc { position: relative; width: 100%; }
.gc-svg { display: block; }
.gc-grid { stroke: #e1e0d9; stroke-width: 1; }
.gc-base { stroke: #c3c2b7; stroke-width: 1; }
.gc-tick { font-size: 11px; fill: #898781; font-variant-numeric: tabular-nums; }
.gc-foco { fill: rgba(11, 11, 11, 0.04); }
.gc-sel { fill: rgba(42, 120, 214, 0.1); }
.gc-hit { cursor: pointer; }
.gc-ley { cursor: pointer; user-select: none; border-radius: 4px; padding: 1px 4px; }
.gc-ley:hover { background: rgba(11, 11, 11, 0.05); }
.gc-ley--off { opacity: 0.4; text-decoration: line-through; }
.gc-tip-accion { margin-top: 4px; font-size: 11px; color: #2a78d6; }
.gc-leyenda { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: #52514e; margin-bottom: 6px; }
.gc-ley { display: inline-flex; align-items: center; gap: 6px; }
.gc-swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: none; }
.gc-linea { width: 14px; border-top-width: 2px; display: inline-block; flex: none; }
.gc-tip {
  position: absolute; top: 28px; pointer-events: none; background: #fff; border: 1px solid rgba(11, 11, 11, 0.1);
  border-radius: 8px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1); padding: 8px 10px; font-size: 12px; min-width: 170px; z-index: 5;
}
.gc-tip-titulo { font-weight: 600; color: #0b0b0b; margin-bottom: 4px; }
.gc-tip-fila { display: flex; align-items: center; gap: 6px; line-height: 1.6; color: #0b0b0b; white-space: nowrap; }
.gc-tip-label { color: #52514e; }
</style>
