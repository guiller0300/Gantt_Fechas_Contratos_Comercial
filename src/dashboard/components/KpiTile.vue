<script setup>
// Tile de indicador: etiqueta · valor · delta opcional (vs un periodo nombrado) · nota.
// `bueno`: 'arriba' si subir es bueno (facturación), 'abajo' si bajar es bueno (cartera vencida).
import { computed } from "vue";

const props = defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  delta: { type: Number, default: null }, // fracción (0.12 = +12%)
  deltaLabel: { type: String, default: "" },
  bueno: { type: String, default: "arriba" },
  nota: { type: String, default: "" },
  hero: { type: Boolean, default: false },
  // Si se pasa `ir`, el tile es un atajo (p. ej. a la pestaña con el detalle) y emite click.
  ir: { type: String, default: "" },
});
const emit = defineEmits(["click"]);

const deltaInfo = computed(() => {
  if (props.delta == null || !isFinite(props.delta)) return null;
  const sube = props.delta >= 0;
  const favorable = props.bueno === "arriba" ? sube : !sube;
  return {
    texto: `${sube ? "+" : ""}${(props.delta * 100).toFixed(1)}%`,
    icono: sube ? "arrow_upward" : "arrow_downward",
    clase: favorable ? "kpi-delta--bien" : "kpi-delta--mal",
  };
});
</script>

<template>
  <div class="kpi" :class="{ 'kpi--hero': hero, 'kpi--link': ir }" :role="ir ? 'button' : null" :tabindex="ir ? 0 : null"
    @click="ir && emit('click')" @keydown.enter="ir && emit('click')">
    <q-icon v-if="ir" name="arrow_forward" size="14px" class="kpi-ir"><q-tooltip>{{ ir }}</q-tooltip></q-icon>
    <div class="kpi-label">{{ label }}</div>
    <div class="kpi-valor">{{ value }}</div>
    <div v-if="deltaInfo" class="kpi-delta" :class="deltaInfo.clase">
      <q-icon :name="deltaInfo.icono" size="14px" />{{ deltaInfo.texto }}
      <span class="kpi-delta-label">{{ deltaLabel }}</span>
    </div>
    <div v-if="nota" class="kpi-nota">{{ nota }}</div>
    <slot />
  </div>
</template>

<style scoped>
.kpi { position: relative; background: #fff; border: 1px solid rgba(11, 11, 11, 0.1); border-radius: 10px; padding: 12px 14px; min-width: 0; }
.kpi-label { font-size: 12px; color: #52514e; }
.kpi-valor { font-size: 24px; font-weight: 600; color: #0b0b0b; line-height: 1.25; margin-top: 2px; }
.kpi--hero .kpi-valor { font-size: 40px; }
.kpi-delta { display: inline-flex; align-items: center; gap: 2px; font-size: 12px; font-weight: 600; margin-top: 2px; }
.kpi-delta--bien { color: #006300; }
.kpi-delta--mal { color: #c62828; }
.kpi-delta-label { font-weight: 400; color: #898781; margin-left: 4px; }
.kpi--link { cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.kpi--link:hover { border-color: #2a78d6; box-shadow: 0 2px 8px rgba(42, 120, 214, 0.12); }
.kpi-ir { position: absolute; top: 10px; right: 10px; color: #898781; }
.kpi--link:hover .kpi-ir { color: #2a78d6; }
.kpi-nota { font-size: 11px; color: #898781; margin-top: 4px; }
</style>
