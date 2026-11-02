<script setup>
// Ranking horizontal (top N). Cada renglón: etiqueta · barra (segmentos opcionales) · valor al final.
// items: [{ key, label, sub?, segmentos: [{ key, label, value, color }] }]
import { computed } from "vue";
import { moneda, monedaCorta } from "@/dashboard/composables/formato";

const props = defineProps({
  items: { type: Array, required: true },
  leyenda: { type: Array, default: () => [] }, // [{ label, color }] cuando hay > 1 segmento
  // Con `clickable`, clic en un renglón emite select(item) (p. ej. filtrar todo por ese cliente);
  // `seleccionado` = key del renglón activo (los demás se atenúan).
  clickable: { type: Boolean, default: false },
  seleccionado: { default: null },
  accion: { type: String, default: "Clic para filtrar" },
});
const emit = defineEmits(["select"]);
const elegir = (it) => props.clickable && emit("select", it);

const max = computed(() =>
  Math.max(1, ...props.items.map((it) => it.segmentos.reduce((s, x) => s + (Number(x.value) || 0), 0)))
);
const total = (it) => it.segmentos.reduce((s, x) => s + (Number(x.value) || 0), 0);
</script>

<template>
  <div class="br">
    <div v-if="leyenda.length > 1" class="br-leyenda">
      <span v-for="l in leyenda" :key="l.label"><span class="br-swatch" :style="{ background: l.color }"></span>{{ l.label }}</span>
    </div>
    <div v-for="it in items" :key="it.key" class="br-fila"
      :class="{ 'br-fila--click': clickable, 'br-fila--sel': seleccionado != null && seleccionado === it.key, 'br-fila--atenuada': seleccionado != null && seleccionado !== it.key }"
      :role="clickable ? 'button' : null" :tabindex="clickable ? 0 : null" :title="clickable ? accion : null"
      @click="elegir(it)" @keydown.enter="elegir(it)">
      <div class="br-label" :title="it.label">
        <div class="ellipsis">{{ it.label }}</div>
        <div v-if="it.sub" class="br-sub ellipsis">{{ it.sub }}</div>
      </div>
      <div class="br-pista">
        <div class="br-barra" :style="{ width: (total(it) / max) * 100 + '%' }">
          <div v-for="s in it.segmentos.filter((x) => Number(x.value) > 0)" :key="s.key" class="br-seg" :style="{ flexGrow: Number(s.value), background: s.color }">
            <q-tooltip>{{ s.label }}: {{ moneda(s.value) }}</q-tooltip>
          </div>
        </div>
        <span class="br-valor">{{ monedaCorta(total(it)) }}</span>
      </div>
    </div>
    <div v-if="!items.length" class="br-vacio">Sin datos con los filtros actuales</div>
  </div>
</template>

<style scoped>
.br-leyenda { display: flex; gap: 14px; font-size: 12px; color: #52514e; margin-bottom: 8px; }
.br-leyenda > span { display: inline-flex; align-items: center; gap: 6px; }
.br-swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.br-fila { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 10px; align-items: center; padding: 4px 0; }
.br-label { font-size: 12px; color: #0b0b0b; min-width: 0; }
.br-sub { font-size: 11px; color: #898781; }
.br-pista { display: flex; align-items: center; gap: 8px; min-width: 0; }
.br-barra { display: flex; gap: 2px; height: 16px; min-width: 2px; }
.br-seg { height: 100%; min-width: 2px; }
.br-seg:first-child { border-radius: 0; }
.br-seg:last-child { border-radius: 0 4px 4px 0; }
.br-valor { font-size: 12px; color: #52514e; font-variant-numeric: tabular-nums; white-space: nowrap; }
.br-fila--click { cursor: pointer; border-radius: 6px; margin: 0 -6px; padding: 4px 6px; }
.br-fila--click:hover { background: rgba(11, 11, 11, 0.04); }
.br-fila--sel { background: rgba(42, 120, 214, 0.08); }
.br-fila--atenuada { opacity: 0.45; }
.br-vacio { font-size: 12px; color: #898781; padding: 12px 0; }
</style>
