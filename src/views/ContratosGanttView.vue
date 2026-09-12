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
  filasFiltradas, loading, conteoPorCategoria,
  filtroGrupo, filtroCategoria, filtroAtc, atcsDisponibles,
  fechaReporte, esSnapshot,
} = storeToRefs(store);
const {
  consultarAnios, consultarGantt, refrescarTablero, actualizarFila, eliminarFila,
  agregarTramo, actualizarTramo, eliminarTramo, limpiarFiltros,
} = store;

// Modo edición: solo con permiso (Jorge) Y en el Gantt vivo (nunca sobre un snapshot histórico).
const puedeEditar = computed(() => permiso_editar_gantt_contratos.value && !esSnapshot.value);
const editando = ref(false);
const dialogImportar = ref(false);
const mostrarInfo = ref(false); // muestra el detalle: Fallo (tentativo), Firma y Monto
const mostrarHitos = ref(true); // muestra los hitos de facturación (fin) y cobro (fin + 30–45)

// Hitos derivados de la fecha Fin (el backend los calcula y los manda por fila):
//  - Facturación estimada = fin
//  - Cobro estimado        = fin + 45 días (extremo de la ventana)
// La banda tenue dibuja la ventana de cobro (fin+30 → fin+45).
const hitosDef = [
  { field: "fecha_facturacion_estim", color: "#f9a825", icon: "🧾", label: "Facturación estimada" },
  { field: "fecha_cobro_estim", color: "#2e7d32", icon: "💰", label: "Cobro estimado" },
];
const bandDef = {
  startField: "fecha_cobro_ini",
  endField: "fecha_cobro_estim",
  color: "#fff3e0",
  label: "Ventana de cobro (30–45 días)",
};

const opcionesCategoria = [
  { label: "Contratado", value: "CONTRATADO" },
  { label: "Proyección", value: "PROYECCION" },
  { label: "Garantía", value: "GARANTIA" },
];

// Calles (grupo) del Gantt. El grupo es la clasificación; se arrastra la fila a la que corresponda.
const gruposDef = [
  { key: "Bienes", label: "Bienes" },
  { key: "Servicios", label: "Servicios" },
  { key: "Bienes y servicios", label: "Bienes y servicios" },
];
const opcionesGrupo = gruposDef.map((g) => g.key);

// Drag&drop entre calles: persiste el nuevo grupo. La clasificación es el grupo (sin 'tipo').
function onRowGroupChange(row, nuevoGrupo) {
  actualizarFila(row.id, { grupo: nuevoGrupo });
}

// Columnas del Gantt (Tipo se omite: ya está implícito en el grupo)
// Columnas informativas (Fallo/Firma) que se muestran/ocultan con el toggle.
const columnas = computed(() => {
  const base = [
    { field: "cliente", label: "Cliente", width: 170, type: "texto", align: "left", readonly: true },
    { field: "proyecto_folio", label: "No. Proyecto", width: 100, type: "texto", align: "center", readonly: true, emptyLabel: "—" },
    { field: "pedido_numero", label: "No. Contrato", width: 110, type: "texto", align: "center", readonly: true, emptyLabel: "—" },
  ];
  // Bloque de detalle (oculto tras el toggle): Fallo (tentativo), Firma y Monto.
  // Monto solo para comercial (con permiso), como el activar/desactivar filas.
  const detalle = mostrarInfo.value
    ? [
        { field: "fallo", label: "Fallo", width: 100, type: "fecha", emptyLabel: "Pendiente" },
        { field: "firma_contrato", label: "Firma Contrato", width: 110, type: "fecha", emptyLabel: "—" },
        ...(puedeEditar.value
          ? [{ field: "pedido_monto_fmt", label: "Monto", width: 116, type: "texto", align: "right", readonly: true, emptyLabel: "—" }]
          : []),
      ]
    : [];
  // Siempre visibles: OT + fechas mandatorias del contrato/pedido.
  const centro = [
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
  return [...base, ...detalle, ...centro, ...acciones];
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

// Cambio de la fecha del reporte: al fijarla se ve el snapshot (solo lectura); al limpiarla, el vivo.
function onFechaReporte(val) {
  fechaReporte.value = val || null;
  if (esSnapshot.value) editando.value = false;
  refrescarTablero();
}

// Formatea la fecha del snapshot para el aviso (DD/MM/YYYY).
const fechaReporteDMY = computed(() => {
  if (!fechaReporte.value) return "";
  const [y, m, d] = String(fechaReporte.value).split("-");
  return d && m && y ? `${d}/${m}/${y}` : fechaReporte.value;
});

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

const regresarComercial = () => {
  const isDev = window.javaObj?.springActiveProfile === 'dev'
  const baseUrl = isDev ? 'http://localhost:8282' : 'http://192.168.100.18:8282'
  window.top.location.href = `${baseUrl}/comercial/index`
}
</script>

<template>
  <div class="gantt-container bg-white">
    <!-- Header -->
    <q-toolbar class="text-white" style="background-color: #3b3f51">
      <q-icon name="event_note" size="28px" class="q-mr-sm" />
      <q-toolbar-title>
        <span class="text-weight-bold">Gantt de Fechas de Contratos</span>
      </q-toolbar-title>
      <q-btn
          @click="regresarComercial"
          flat
          round
          size="sm"
          icon="logout"
          class="back-btn"
        >
          <q-tooltip>Regresar</q-tooltip>
        </q-btn>
    </q-toolbar>

    <!-- Barra de controles -->
    <q-card-section class="q-py-sm barra-controles">
      <!-- Fila 1: filtros (izquierda) + acciones (derecha) -->
      <div class="row q-col-gutter-sm items-center">
        <div class="col-auto">
          <q-input
            :model-value="fechaReporte"
            @update:model-value="onFechaReporte"
            label="Fecha del reporte" outlined dense clearable
            mask="####-##-##" placeholder="AAAA-MM-DD"
            style="min-width: 180px"
            :bg-color="esSnapshot ? 'amber-1' : undefined"
          >
            <template v-slot:prepend><q-icon name="history" size="xs" /></template>
            <template v-slot:append>
              <q-icon name="event" class="cursor-pointer">
                <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                  <q-date
                    :model-value="fechaReporte"
                    @update:model-value="onFechaReporte"
                    mask="YYYY-MM-DD" today-btn
                  >
                    <div class="row items-center justify-end">
                      <q-btn v-close-popup label="Cerrar" color="primary" flat />
                    </div>
                  </q-date>
                </q-popup-proxy>
              </q-icon>
            </template>
            <q-tooltip>Elige una fecha para ver el Gantt como estaba ese día (solo lectura)</q-tooltip>
          </q-input>
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
            v-model="filtroGrupo"
            :options="opcionesGrupo"
            label="Grupo" outlined dense clearable style="min-width: 170px"
          >
            <template v-slot:prepend><q-icon name="view_stream" size="xs" /></template>
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

        <q-space />

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

      <!-- Fila 2: opciones de vista (izquierda) + leyenda (derecha) -->
      <div class="row items-center q-mt-sm q-gutter-x-md">
        <div class="col-auto row items-center q-gutter-x-md">
          <q-toggle v-model="mostrarInfo" icon="info" color="blue-grey-6" label="Detalle" left-label dense>
            <q-tooltip>Mostrar u ocultar Fallo, Firma de contrato y Monto</q-tooltip>
          </q-toggle>
          <q-toggle v-model="mostrarHitos" icon="flag" color="amber-8" label="Facturación/Cobro" left-label dense>
            <q-tooltip>Mostrar los hitos de facturación (fin) y cobro (fin + 30–45 días)</q-tooltip>
          </q-toggle>
        </div>

        <q-space />

        <!-- Leyenda -->
        <div class="col-auto row items-center q-gutter-sm leyenda">
          <span class="chip-leyenda" style="background:#5b7db1"></span>
          <span class="text-caption">Contratado ({{ conteoPorCategoria.CONTRATADO }})</span>
          <span class="chip-leyenda" style="background:#66bb6a"></span>
          <span class="text-caption">Proyección ({{ conteoPorCategoria.PROYECCION }})</span>
          <span class="chip-leyenda" style="background:#ef5350"></span>
          <span class="text-caption">Garantía ({{ conteoPorCategoria.GARANTIA }})</span>
          <template v-if="mostrarHitos">
            <span class="sep-leyenda"></span>
            <span class="rombo-leyenda" style="background:#f9a825"></span>
            <span class="text-caption">🧾 Facturación (fin)</span>
            <span class="rombo-leyenda" style="background:#2e7d32"></span>
            <span class="text-caption">💰 Cobro (fin + 30–45 d)</span>
          </template>
        </div>
      </div>
    </q-card-section>

    <!-- Aviso de snapshot (solo lectura) -->
    <div v-if="esSnapshot" class="snapshot-banner">
      <q-icon name="history" size="18px" class="q-mr-xs" />
      <span>Viendo el Gantt como estaba al <b>{{ fechaReporteDMY }}</b> — solo lectura.</span>
      <q-space />
      <q-btn flat dense no-caps size="sm" icon="close" label="Volver al vivo" @click="onFechaReporte(null)" />
    </div>

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
        :milestones="mostrarHitos ? hitosDef : []"
        :band="mostrarHitos ? bandDef : null"
        :editable="editando"
        editable-field="_editable"
        :row-draggable="editando"
        persist-widths-key="contratos"
        :day-width="6"
        @update:row="onUpdateRow"
        @row-group-change="onRowGroupChange"
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
  height: 100%;
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
.snapshot-banner {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 16px 8px;
  padding: 6px 12px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: 6px;
  color: #8a6d00;
  font-size: 13px;
}
.leyenda { flex-wrap: wrap; }
.chip-leyenda {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.rombo-leyenda {
  display: inline-block;
  width: 11px;
  height: 11px;
  transform: rotate(45deg);
  border: 1px solid #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.sep-leyenda {
  display: inline-block;
  width: 1px;
  height: 16px;
  background: #cfd3dc;
  margin: 0 4px;
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
