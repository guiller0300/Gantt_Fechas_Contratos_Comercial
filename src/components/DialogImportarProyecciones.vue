<script setup>
import { ref, computed, watch } from "vue";
import { storeToRefs } from "pinia";
import Swal from "sweetalert2";
import { useGanttContratosStore } from "@/stores/GanttContratosStore";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const store = useGanttContratosStore();
const { importables, loadingImport, ordenesEncontradas, loadingOrdenes, filtroAnio } = storeToRefs(store);
const { consultarImportables, importarProyecciones, buscarOrdenes, agregarOrdenes } = store;

const busqueda = ref("");
const grupo = ref("Servicios");
const modo = ref("pedido"); // 'pedido' | 'proyecto' (solo para proyecciones)
const otsAdicionales = ref(false); // check: buscar en el catálogo completo de OTs
const filtroAnioOt = ref(null); // filtro de año dentro del catálogo de OTs (null = todos)
const seleccion = ref(new Set());
const agregando = ref(false);

const opcionesGrupo = ["Bienes", "Servicios", "Bienes y servicios"];
const opcionesModo = [
  { label: "Por proyecto", value: "proyecto" },
  { label: "Por pedido", value: "pedido" },
];

const fuente = computed(() => (otsAdicionales.value ? "ots" : "proyecciones"));

// Columnas según la fuente
const columnasProy = [
  { name: "cliente", label: "Cliente / Unidad", field: "cliente", align: "left" },
  { name: "proyecto_folio", label: "No. Proyecto", field: "proyecto_folio", align: "center" },
  { name: "descripcion", label: "Descripción", field: "descripcion", align: "left" },
  { name: "pedidos", label: "Pedidos (contratos)", field: "pedidos", align: "left" },
  { name: "ordenes", label: "OT", field: "ordenes", align: "left" },
  { name: "estado", label: "", field: "ya_importado", align: "center" },
];
const columnasOts = [
  { name: "numero_orden", label: "OT", field: "numero_orden", align: "left" },
  { name: "cliente", label: "Cliente", field: "cliente", align: "left" },
  { name: "descripcion", label: "Descripción", field: "descripcion", align: "left" },
  { name: "anio", label: "Año", field: "anio", align: "center" },
  { name: "tipo", label: "Tipo", field: "tipo", align: "center" },
  { name: "estado", label: "", field: "ya_importado", align: "center" },
];
const columnas = computed(() => (fuente.value === "ots" ? columnasOts : columnasProy));

const rowKey = computed(() => (fuente.value === "ots" ? "ordenes_id" : "proyecciones_proyectos_id"));
const keyOf = (row) => row[rowKey.value];

// Años disponibles en el catálogo de OTs cargado (para el filtro interno).
const aniosOt = computed(() =>
  [...new Set(ordenesEncontradas.value.map((o) => o.anio).filter((a) => a != null))].sort((a, b) => b - a)
);

// Filas mostradas. Ambas fuentes filtran cliente-side.
const filasMostradas = computed(() => {
  if (fuente.value === "ots") {
    const q = (busqueda.value || "").toLowerCase().trim();
    return ordenesEncontradas.value.filter(
      (o) =>
        (filtroAnioOt.value == null || o.anio === filtroAnioOt.value) &&
        (!q ||
          (o.numero_orden || "").toLowerCase().includes(q) ||
          (o.cliente || "").toLowerCase().includes(q) ||
          (o.descripcion || "").toLowerCase().includes(q))
    );
  }
  const q = (busqueda.value || "").toLowerCase().trim();
  if (!q) return importables.value;
  return importables.value.filter(
    (c) =>
      (c.cliente || "").toLowerCase().includes(q) ||
      (c.descripcion || "").toLowerCase().includes(q) ||
      (c.unidad || "").toLowerCase().includes(q) ||
      (c.atc_nombre || "").toLowerCase().includes(q) ||
      (c.proyecto_folio || "").toLowerCase().includes(q) ||
      (c.ordenes || []).some((o) => (o.numero_orden || "").toLowerCase().includes(q)) ||
      (c.pedidos || []).some((p) => (p.numero || "").toLowerCase().includes(q))
  );
});

const cargando = computed(() => (fuente.value === "ots" ? loadingOrdenes.value : loadingImport.value));
const seleccionables = computed(() => filasMostradas.value.filter((r) => !r.ya_importado));
const totalSeleccionados = computed(() => seleccion.value.size);

// Al abrir
watch(
  () => props.modelValue,
  (abierto) => {
    if (abierto) {
      busqueda.value = "";
      seleccion.value = new Set();
      otsAdicionales.value = false;
      consultarImportables("");
    }
  }
);

// Al activar OTs adicionales, carga TODO el catálogo una vez (el filtro es cliente-side).
watch(otsAdicionales, (on) => {
  busqueda.value = "";
  seleccion.value = new Set();
  filtroAnioOt.value = null;
  if (on) {
    buscarOrdenes(""); // todas las OT
  } else {
    ordenesEncontradas.value = [];
  }
});

function toggle(row) {
  // Las filas "Ya está" también pueden reimportarse: el backend reactiva y refresca su OT
  // sin duplicar (dedup por pedido/proyección). Útil para reparar OTs que faltaban.
  const s = new Set(seleccion.value);
  const k = keyOf(row);
  s.has(k) ? s.delete(k) : s.add(k);
  seleccion.value = s;
}
function toggleTodos() {
  if (totalSeleccionados.value === seleccionables.value.length && seleccionables.value.length) {
    seleccion.value = new Set();
  } else {
    seleccion.value = new Set(seleccionables.value.map(keyOf));
  }
}

async function importar() {
  const elegidos = filasMostradas.value.filter((r) => seleccion.value.has(keyOf(r)));
  if (!elegidos.length) return;
  agregando.value = true;
  try {
    if (fuente.value === "ots") {
      const n = await agregarOrdenes(elegidos, grupo.value);
      emit("update:modelValue", false);
      if (n > 0) {
        Swal.fire({
          icon: "info",
          title: "OT(s) agregada(s) al Gantt",
          html: `<b>Sugerencia:</b> agrega también esta(s) OT a <b>Proyecciones</b> para que queden ligadas al proyecto.`,
          confirmButtonColor: "#027be3",
        });
      }
    } else {
      await importarProyecciones(elegidos, grupo.value, modo.value);
      emit("update:modelValue", false);
    }
  } finally {
    agregando.value = false;
  }
}
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="(v) => emit('update:modelValue', v)">
    <q-card style="min-width: 840px; max-width: 96vw">
      <q-toolbar class="text-white" style="background-color: #3b3f51">
        <q-icon name="cloud_download" class="q-mr-sm" />
        <q-toolbar-title class="text-subtitle1 text-weight-bold">
          Importar desde Proyecciones — {{ filtroAnio }}
        </q-toolbar-title>
        <q-btn flat round dense icon="close" @click="emit('update:modelValue', false)" />
      </q-toolbar>

      <q-card-section class="q-pb-none">
        <div class="row q-col-gutter-sm items-center">
          <div class="col">
            <q-input
              v-model="busqueda" outlined dense clearable
              :placeholder="fuente === 'ots'
                ? 'Escribe OT, cliente o descripción para buscar en el catálogo...'
                : 'Buscar por cliente, unidad, ATC, folio, OT o pedido...'"
            >
              <template v-slot:prepend><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="col-auto" v-if="!otsAdicionales">
            <q-btn-toggle
              v-model="modo" :options="opcionesModo"
              no-caps dense unelevated toggle-color="primary" color="grey-3" text-color="grey-8"
            />
          </div>
          <div class="col-auto" v-if="otsAdicionales">
            <q-select
              v-model="filtroAnioOt" :options="aniosOt"
              label="Año OT" outlined dense clearable style="min-width: 120px"
            >
              <template v-slot:prepend><q-icon name="calendar_month" size="xs" /></template>
            </q-select>
          </div>
          <div class="col-auto">
            <q-select
              v-model="grupo" :options="opcionesGrupo"
              outlined dense label="Agregar a grupo" style="min-width: 200px"
            />
          </div>
        </div>
        <div class="row items-center justify-between q-mt-xs">
          <div class="text-caption text-grey-7">
            <template v-if="otsAdicionales">
              Catálogo completo de OTs. Al agregar, recuerda ligarla también a Proyecciones.
            </template>
            <template v-else>
              {{ modo === 'pedido'
                ? 'Por pedido: crea una fila por cada pedido (contrato) del proyecto, con su OT.'
                : 'Por proyecto: crea una sola fila por proyección.' }}
            </template>
          </div>
          <q-checkbox v-model="otsAdicionales" label="OTs adicionales (catálogo completo)" dense color="primary" />
        </div>
      </q-card-section>

      <q-card-section>
        <q-table
          :rows="filasMostradas"
          :columns="columnas"
          :row-key="rowKey"
          flat bordered dense
          :loading="cargando"
          :rows-per-page-options="[10, 25, 50, 0]"
          :no-data-label="fuente === 'ots' ? 'No hay OTs' : 'Sin proyecciones'"
          style="max-height: 55vh"
        >
          <!-- ===== Proyecciones ===== -->
          <template v-slot:body-cell-cliente="props">
            <q-td :props="props">
              <div class="row items-center no-wrap">
                <q-checkbox
                  v-if="fuente === 'proyecciones'"
                  :model-value="seleccion.has(keyOf(props.row))"
                  @update:model-value="toggle(props.row)"
                  dense class="q-mr-sm"
                />
                <span class="text-weight-medium">{{ props.row.cliente }}</span>
              </div>
            </q-td>
          </template>
          <template v-slot:body-cell-proyecto_folio="props">
            <q-td :props="props"><span class="text-weight-medium">{{ props.row.proyecto_folio || "—" }}</span></q-td>
          </template>
          <template v-slot:body-cell-descripcion="props">
            <q-td :props="props"><span class="descripcion">{{ props.row.descripcion || "—" }}</span></q-td>
          </template>
          <template v-slot:body-cell-pedidos="props">
            <q-td :props="props">
              <template v-if="props.row.pedidos && props.row.pedidos.length">
                <q-chip v-for="p in props.row.pedidos" :key="p.id" dense size="sm" color="deep-purple-1" text-color="deep-purple-9" icon="receipt_long">{{ p.numero }}</q-chip>
              </template>
              <span v-else class="text-grey-5">sin pedido</span>
            </q-td>
          </template>
          <template v-slot:body-cell-ordenes="props">
            <q-td :props="props">
              <template v-if="props.row.ordenes && props.row.ordenes.length">
                <q-chip v-for="o in props.row.ordenes" :key="o.id" dense size="sm" color="blue-1" text-color="blue-9" icon="description">{{ o.numero_orden }}</q-chip>
              </template>
              <span v-else class="text-grey-5">sin OT</span>
            </q-td>
          </template>

          <!-- ===== OTs adicionales ===== -->
          <template v-slot:body-cell-numero_orden="props">
            <q-td :props="props">
              <div class="row items-center no-wrap">
                <q-checkbox
                  :model-value="seleccion.has(keyOf(props.row))"
                  :disable="props.row.ya_importado"
                  @update:model-value="toggle(props.row)"
                  dense class="q-mr-sm"
                />
                <q-chip dense size="sm" color="blue-1" text-color="blue-9" icon="description">{{ props.row.numero_orden }}</q-chip>
              </div>
            </q-td>
          </template>
          <template v-slot:body-cell-anio="props">
            <q-td :props="props">{{ props.row.anio }}</q-td>
          </template>
          <template v-slot:body-cell-tipo="props">
            <q-td :props="props">{{ props.row.tipo }}</q-td>
          </template>

          <!-- ===== Estado (ambas) ===== -->
          <template v-slot:body-cell-estado="props">
            <q-td :props="props">
              <q-badge v-if="props.row.ya_importado" color="grey-5" text-color="white">Ya está</q-badge>
              <template v-else-if="fuente === 'proyecciones'">
                <q-badge v-if="props.row.ganado_tmq === 1" color="blue-6">Contratado</q-badge>
                <q-badge v-else color="green-6">Proyección</q-badge>
              </template>
            </q-td>
          </template>
        </q-table>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <div class="text-caption text-grey-7 q-mr-md">{{ totalSeleccionados }} seleccionada(s)</div>
        <q-btn flat label="Cancelar" @click="emit('update:modelValue', false)" />
        <q-btn
          color="primary" no-caps :icon="fuente === 'ots' ? 'add' : 'cloud_download'"
          :label="`${fuente === 'ots' ? 'Agregar OTs' : 'Importar'} (${totalSeleccionados})`"
          :disable="totalSeleccionados === 0"
          :loading="agregando"
          @click="importar"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.descripcion {
  display: inline-block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
</style>
