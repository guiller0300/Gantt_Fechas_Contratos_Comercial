<script setup>
import { ref, onMounted, computed } from "vue";
import { storeToRefs } from "pinia";
import { useQuasar } from "quasar";
import { TmqGantt } from "@turbomaquinas/vue-gantt";
import { useGanttContratosStore } from "@/stores/GanttContratosStore";
import { useGetConfiguracion } from "@/composables/getConfiguracion";
import DialogImportarProyecciones from "@/components/DialogImportarProyecciones.vue";
import Swal from "sweetalert2";

const $q = useQuasar();
const { permiso_editar_gantt_contratos } = useGetConfiguracion();

const store = useGanttContratosStore();
const {
  filasFiltradas, loading, total, aniosDisponibles, conteoPorCategoria,
  filtroAnio, filtroTipo, filtroCategoria, filtroAtc, atcsDisponibles,
} = storeToRefs(store);
const {
  consultarAnios, consultarGantt, actualizarFila, eliminarFila,
  agregarTramo, actualizarTramo, eliminarTramo, limpiarFiltros,
} = store;

// Modo edición: solo disponible si el usuario tiene permiso (Jorge). Arranca en lectura.
const puedeEditar = computed(() => permiso_editar_gantt_contratos.value);
const editando = ref(false);
const dialogImportar = ref(false);
const mostrarInfo = ref(false); // muestra columnas informativas Fallo/Firma

const opcionesTipo = ["SERVICIOS", "BIENES", "GARANTIA"];
const opcionesCategoria = [
  { label: "Contratado", value: "CONTRATADO" },
  { label: "Proyección", value: "PROYECCION" },
  { label: "Garantía", value: "GARANTIA" },
];

const gruposDef = [
  { key: "Taller y servicio campo", label: "Taller y servicio campo" },
  { key: "Bienes", label: "Bienes" },
];

// Columnas del Gantt (Tipo se omite: ya está implícito en el grupo)
// Columnas informativas (Fallo/Firma) que se muestran/ocultan con el toggle.
const columnas = computed(() => {
  const base = [
    { field: "cliente", label: "Cliente", width: 170, type: "texto", align: "left", readonly: true },
    { field: "proyecto_folio", label: "No. Proyecto", width: 100, type: "texto", align: "center", readonly: true, emptyLabel: "—" },
    { field: "pedido_numero", label: "No. Contrato", width: 110, type: "texto", align: "center", readonly: true, emptyLabel: "—" },
  ];
  const info = [
    { field: "fallo", label: "Fallo", width: 100, type: "fecha", emptyLabel: "Pendiente" },
    { field: "firma_contrato", label: "Firma Contrato", width: 116, type: "texto" },
  ];
  const resto = [
    { field: "ot_numero", label: "OT", width: 84, type: "texto", align: "center", readonly: true },
    { field: "comienzo", label: "Comienzo", width: 96, type: "fecha" },
    { field: "fin", label: "Fin", width: 96, type: "fecha" },
    { field: "duracion", label: "Duración", width: 72, type: "duracion", align: "center" },
  ];
  // Columna de acciones (quitar/terminar) solo cuando se está editando.
  const acciones = editando.value
    ? [{ field: "_acciones", label: "", width: 44, type: "acciones", align: "center",
         icon: "check_circle_outline", color: "green-7",
         tooltip: "Marcar terminado / quitar del Gantt (se reactiva si lo reimportas)" }]
    : [];
  return [...base, ...(mostrarInfo.value ? info : []), ...resto, ...acciones];
});

// El padre es la fuente de verdad: aplica y persiste los cambios del Gantt.
function onUpdateRow(row, cambios) {
  actualizarFila(row.id, cambios);
}
function onTramoAdd(row, draft) {
  agregarTramo(row.id, draft);
}
function onTramoChange(row, tramo, { comienzo, fin }) {
  actualizarTramo(row.id, tramo.id, { comienzo, fin });
}
function onTramoRemove(row, tramo) {
  eliminarTramo(row.id, tramo.id);
}
async function onRowRemove(row) {
  const r = await Swal.fire({
    title: "¿Quitar del Gantt?",
    html: `<b>${row.cliente || ""}</b><br><small>Se ocultará del tablero (se reactiva si lo reimportas).</small>`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Quitar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#21ba45",
  });
  if (r.isConfirmed) await eliminarFila(row.id);
}

const refrescar = async () => {
  await consultarGantt(filtroAnio.value);
};

onMounted(async () => {
  $q.loading.show({
    message: "Cargando Gantt de contratos...",
    spinnerColor: "primary", spinnerSize: 80,
    backgroundColor: "white", messageColor: "black",
  });
  try {
    await consultarAnios();
    await consultarGantt();
  } finally {
    $q.loading.hide();
  }
});
</script>

<template>
  <div class="gantt-container bg-white">
    <!-- Header -->
    <q-toolbar class="text-white" style="background-color: #3b3f51">
      <q-icon name="event_note" size="28px" class="q-mr-sm" />
      <q-toolbar-title>
        <span class="text-weight-bold">Gantt de Fechas de Contratos</span>
      </q-toolbar-title>
      <q-badge color="light-blue-1" class="q-ml-md text-black text-bold text-subtitle1 q-pa-sm">
        {{ total }} filas
      </q-badge>
    </q-toolbar>

    <!-- Barra de filtros -->
    <q-card-section class="q-py-sm">
      <div class="row q-col-gutter-sm items-center">
        <div class="col-auto">
          <q-select
            v-model="filtroAnio"
            :options="aniosDisponibles"
            label="Año" outlined dense style="min-width: 110px"
            @update:model-value="refrescar"
          >
            <template v-slot:prepend><q-icon name="calendar_month" size="xs" /></template>
          </q-select>
        </div>
        <div class="col-auto">
          <q-select
            v-model="filtroAtc"
            :options="atcsDisponibles"
            emit-value map-options
            label="ATC" outlined dense clearable style="min-width: 200px"
          >
            <template v-slot:prepend><q-icon name="badge" size="xs" /></template>
          </q-select>
        </div>
        <div class="col-auto">
          <q-select
            v-model="filtroTipo"
            :options="opcionesTipo"
            label="Tipo" outlined dense clearable style="min-width: 150px"
          >
            <template v-slot:prepend><q-icon name="category" size="xs" /></template>
          </q-select>
        </div>
        <div class="col-auto">
          <q-select
            v-model="filtroCategoria"
            :options="opcionesCategoria"
            emit-value map-options
            label="Categoría" outlined dense clearable style="min-width: 160px"
          >
            <template v-slot:prepend><q-icon name="label" size="xs" /></template>
          </q-select>
        </div>
        <div class="col-auto">
          <q-btn flat dense color="grey-7" icon="filter_alt_off" @click="limpiarFiltros">
            <q-tooltip>Limpiar filtros</q-tooltip>
          </q-btn>
        </div>
        <div class="col-auto">
          <q-toggle v-model="mostrarInfo" icon="info" color="blue-grey-6" label="Fallo/Firma" left-label dense>
            <q-tooltip>Mostrar u ocultar las columnas Fallo y Firma de contrato</q-tooltip>
          </q-toggle>
        </div>

        <q-space />

        <!-- Leyenda de categorías -->
        <div class="col-auto row items-center q-gutter-sm leyenda">
          <span class="chip-leyenda" style="background:#5b7db1"></span>
          <span class="text-caption">Contratado ({{ conteoPorCategoria.CONTRATADO }})</span>
          <span class="chip-leyenda" style="background:#66bb6a"></span>
          <span class="text-caption">Proyección ({{ conteoPorCategoria.PROYECCION }})</span>
          <span class="chip-leyenda" style="background:#ef5350"></span>
          <span class="text-caption">Garantía ({{ conteoPorCategoria.GARANTIA }})</span>
        </div>

        <!-- Importar de proyecciones (solo con permiso) -->
        <div class="col-auto" v-if="puedeEditar">
          <q-btn
            color="primary" outline no-caps icon="cloud_download"
            label="Importar de Proyecciones"
            @click="dialogImportar = true"
          >
            <q-tooltip>Traer proyecciones del año con sus OT ligadas</q-tooltip>
          </q-btn>
        </div>
        <!-- Toggle edición (solo con permiso) -->
        <div class="col-auto">
          <q-toggle
            v-if="puedeEditar"
            v-model="editando"
            icon="edit"
            color="light-green-7"
            label="Editar"
            left-label
          >
            <q-tooltip>Habilitar edición de fechas y arrastre de barras</q-tooltip>
          </q-toggle>
          <q-chip v-else dense icon="lock" color="grey-3" text-color="grey-8">
            Solo lectura
          </q-chip>
        </div>
      </div>
    </q-card-section>

    <!-- Gantt -->
    <div class="gantt-content q-px-md q-pb-md">
      <div v-if="!loading && total === 0" class="empty-state">
        <q-icon name="event_busy" size="80px" color="grey-5" />
        <div class="text-h6 text-grey-7 q-mt-md">No hay filas para los filtros seleccionados</div>
      </div>

      <TmqGantt
        v-else
        :rows="filasFiltradas"
        group-by="grupo"
        :groups="gruposDef"
        :columns="columnas"
        category-field="categoria"
        :editable="editando"
        editable-field="_editable"
        :day-width="6"
        @update:row="onUpdateRow"
        @tramo-add="onTramoAdd"
        @tramo-change="onTramoChange"
        @tramo-remove="onTramoRemove"
        @row-remove="onRowRemove"
      />
    </div>

    <!-- Diálogo Importar/Match desde proyecciones (+ OTs adicionales) -->
    <DialogImportarProyecciones v-model="dialogImportar" />
  </div>
</template>

<style scoped>
.gantt-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.gantt-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.gantt-content > :deep(.tmq-gantt) {
  flex: 1;
  min-height: 0;
}
.leyenda { flex-wrap: wrap; }
.chip-leyenda {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}
</style>
