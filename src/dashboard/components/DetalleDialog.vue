<script setup>
// Diálogo de detalle (drill-down): al hacer clic en un mes, rango o barra, el panel lo abre con las
// filas que forman ese número. Clic en un renglón emite `fila` (p. ej. filtrar por ese cliente).
import { ref, computed, watch } from "vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  titulo: { type: String, default: "" },
  subtitulo: { type: String, default: "" },
  filas: { type: Array, default: () => [] },
  columnas: { type: Array, default: () => [] },
  rowKey: { type: [String, Function], default: "key" },
  totales: { type: Array, default: () => [] }, // [{ label, value }] ya formateados
  ordenarPor: { type: String, default: null },
  accionFila: { type: String, default: "" }, // texto de ayuda si la fila es clicable
});
const emit = defineEmits(["update:modelValue", "fila"]);

const buscar = ref("");
watch(() => props.modelValue, (v) => v && (buscar.value = ""));
const filtradas = computed(() => {
  const q = buscar.value.trim().toLowerCase();
  if (!q) return props.filas;
  return props.filas.filter((f) => Object.values(f).some((v) => typeof v === "string" && v.toLowerCase().includes(q)));
});
const paginacion = computed(() => ({ rowsPerPage: 12, sortBy: props.ordenarPor, descending: true }));
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="dd">
      <q-card-section class="dd-cabecera">
        <div class="dd-titulos">
          <div class="dd-titulo">{{ titulo }}</div>
          <div v-if="subtitulo" class="dd-sub">{{ subtitulo }}</div>
        </div>
        <q-btn flat round dense icon="close" @click="emit('update:modelValue', false)" />
      </q-card-section>
      <q-card-section v-if="totales.length" class="dd-totales">
        <div v-for="t in totales" :key="t.label">
          <div class="dd-tot-label">{{ t.label }}</div>
          <div class="dd-tot-valor">{{ t.value }}</div>
        </div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <div class="row items-center justify-between q-mb-sm">
          <div class="dd-ayuda">{{ accionFila }}</div>
          <q-input v-model="buscar" dense outlined clearable placeholder="Buscar" style="width: 220px">
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
        <q-table :rows="filtradas" :columns="columnas" :row-key="rowKey" flat dense :pagination="paginacion"
          :class="{ 'dd-click': !!accionFila }" @row-click="(_, fila) => emit('fila', fila)" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.dd { width: 920px; max-width: 95vw; border-radius: 12px; }
.dd-cabecera { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 6px; }
.dd-titulo { font-size: 16px; font-weight: 600; color: #0b0b0b; }
.dd-sub { font-size: 12px; color: #52514e; margin-top: 2px; }
.dd-totales { display: flex; flex-wrap: wrap; gap: 24px; padding-top: 0; }
.dd-tot-label { font-size: 11px; color: #52514e; }
.dd-tot-valor { font-size: 18px; font-weight: 600; color: #0b0b0b; }
.dd-ayuda { font-size: 11px; color: #898781; }
.dd-click :deep(tbody tr) { cursor: pointer; }
</style>
