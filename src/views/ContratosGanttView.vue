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
  filtroGrupo, filtroCategoria, filtroAtc, atcsDisponibles, filtroGiro, girosDisponibles,
  fechaReporte, esSnapshot,
} = storeToRefs(store);
const {
  consultarAnios, consultarGantt, refrescarTablero, actualizarFila, eliminarFila,
  agregarTramo, actualizarTramo, eliminarTramo, limpiarFiltros, sincronizarConErp,
} = store;

// Modo edición: solo con permiso (Jorge) Y en el Gantt vivo (nunca sobre un snapshot histórico).
const puedeEditar = computed(() => permiso_editar_gantt_contratos.value && !esSnapshot.value);
const editando = ref(false);
const ganttRef = ref(null); // para "Hoy" en la leyenda (centra la línea de tiempo en hoy)
const sincronizando = ref(false);

// Botón "Actualizar". Con permiso: trae del ERP los cambios de contratos/OTs/proyecciones a las
// filas (lo mismo que reimportar, para todo el año) y muestra qué cambió. Sin permiso: recarga.
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function onActualizar() {
  if (!puedeEditar.value) {
    sincronizando.value = true;
    try { await refrescarTablero(); } finally { sincronizando.value = false; }
    return;
  }
  const ok = await Swal.fire({
    title: "¿Traer los últimos cambios del ERP?",
    html:
      "<div style='text-align:left;font-size:14px'>Se actualizan las filas del año con lo que haya cambiado:<ul style='margin:6px 0 0 18px'>" +
      "<li>OTs y fechas de firma, inicio y fin de los <b>contratos</b> (solo si el pedido las trae; no borra lo capturado).</li>" +
      "<li><b>Proyecciones</b> que ya tienen contrato pasan a ser la fila del pedido (conservan fechas y tramos).</li>" +
      "<li>OTs agregadas sueltas que ya tienen contrato se <b>agrupan</b> en la fila del contrato.</li>" +
      "<li>Proyección ganada → Contratado.</li></ul></div>",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Actualizar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#027be3",
  });
  if (!ok.isConfirmed) return;
  sincronizando.value = true;
  try {
    const r = await sincronizarConErp();
    if (!r) return;
    const detalle = r.detalle || [];
    const errores = r.errores || [];
    const lista = (items) =>
      `<ul style='margin:4px 0 0 18px;max-height:220px;overflow:auto'>${items.map((d) => `<li>${escHtml(d)}</li>`).join("")}</ul>`;
    Swal.fire({
      icon: errores.length ? "warning" : "success",
      title: detalle.length || r.nuevas || r.ocultas ? "Gantt actualizado" : "Todo estaba al día",
      html:
        "<div style='text-align:left;font-size:13px'>" +
        `<b>${r.actualizadas || 0}</b> fila(s) con cambios · <b>${r.nuevas || 0}</b> nueva(s) · <b>${r.ocultas || 0}</b> agrupada(s)/oculta(s)` +
        (detalle.length ? lista(detalle) : "") +
        (errores.length ? `<div style='margin-top:8px;color:#c62828'><b>No se pudieron actualizar:</b></div>${lista(errores)}` : "") +
        "</div>",
      width: 640,
      confirmButtonColor: "#027be3",
    });
  } finally {
    sincronizando.value = false;
  }
}
const dialogImportar = ref(false);
const mostrarInfo = ref(false); // muestra el detalle: Fallo (tentativo), Firma y Monto
const mostrarHitos = ref(true); // muestra los hitos de facturación (fin) y cobro (fin + 30–45)

// Hitos anclados al crédito del cliente (el backend los calcula y los manda por fila):
//  - Facturación (editable/arrastrable): default 0-crédito=fin−7, con crédito=fin. Guarda `fecha_facturacion`.
//  - Aceptación = factura + 15 (inicio de la banda de crédito).
//  - Cobro      = factura + 15 + dias_credito (fin de la banda).
// La banda tenue dibuja la ventana de crédito (aceptación → cobro).
const hitosDef = [
  {
    field: "fecha_facturacion_estim", color: "#f9a825", icon: "🧾", label: "Facturación",
    draggable: true, persistField: "fecha_facturacion", // arrastrar guarda esta columna; el resto se recalcula
  },
  { field: "fecha_cobro_estim", color: "#2e7d32", icon: "💰", label: "Cobro" },
];
const bandDef = {
  startField: "fecha_cobro_ini",
  endField: "fecha_cobro_estim",
  color: "#e8f5e9",
  label: "Ventana de cobro (crédito del cliente)",
};

// Arrastre del rombo de facturación: persiste la fecha (campo) y, de forma optimista, mueve
// también el derivado que dibuja el rombo (fecha_facturacion_estim) para que se quede donde
// lo sueltas al instante; el backend devuelve luego cobro/aceptación recalculados.
function onMilestoneChange(row, campo, nuevaFecha) {
  actualizarFila(row.id, { [campo]: nuevaFecha, fecha_facturacion_estim: nuevaFecha });
}

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

// Tipos y colores de tramo (fechas de campo). BIENES/SERVICIOS definen la barra en la calle "Bienes y servicios".
const segmentTypeOptions = ["CAMPO", "BIENES", "SERVICIOS"];
const segmentColors = { CAMPO: "#1565c0", BIENES: "#8e6bb1", SERVICIOS: "#2e7d32" };
// Descripciones sugeridas (un clic); el campo sigue aceptando texto libre.
const segmentLabelSuggestions = ["Días en campo", "Desmontaje", "Armado en campo", "Montaje", "Pruebas", "Traslado"];

// Drag&drop entre calles: persiste el nuevo grupo. La clasificación es el grupo (sin 'tipo').
// Al pasar a "Bienes y servicios" siembra los tramos BIENES/SERVICIOS (desglose) si faltan.
async function onRowGroupChange(row, nuevoGrupo) {
  await actualizarFila(row.id, { grupo: nuevoGrupo });
  if (nuevoGrupo === "Bienes y servicios") await sembrarBienesServicios(row);
}

// Crea los tramos BIENES y SERVICIOS de una fila B&S si aún no existen (default: rango del contrato).
async function sembrarBienesServicios(row) {
  const tipos = new Set((row.tramos || []).map((t) => t.tipo_tramo));
  for (const tipo of ["BIENES", "SERVICIOS"]) {
    if (tipos.has(tipo)) continue;
    await agregarTramo(row.id, {
      tipo_tramo: tipo,
      etiqueta: tipo === "BIENES" ? "Bienes" : "Servicios",
      comienzo: row.comienzo || null,
      fin: row.fin || null,
      color: segmentColors[tipo],
    });
  }
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
function onTramoChange(row, tramo, cambios) {
  actualizarTramo(row.id, tramo.id, cambios);
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
      <!-- Fila 1: filtros (izquierda) + acciones (derecha; si no caben, bajan pero siguen a la derecha) -->
      <div class="barra-fila">
        <div class="barra-filtros">
          <q-input
            :model-value="fechaReporte"
            @update:model-value="onFechaReporte"
            label="Fecha reporte" outlined dense clearable
            mask="####-##-##" placeholder="AAAA-MM-DD"
            style="width: 160px"
            :bg-color="esSnapshot ? 'amber-1' : undefined"
          >
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
          <q-select
            v-model="filtroAtc"
            :options="atcsDisponibles"
            emit-value map-options
            label="ATC" outlined dense clearable style="width: 160px"
          >
            <template v-slot:prepend><q-icon name="badge" size="xs" /></template>
          </q-select>
          <q-select
            v-model="filtroGiro"
            :options="girosDisponibles"
            emit-value map-options
            label="Giro" outlined dense clearable style="width: 150px"
          >
            <template v-slot:prepend><q-icon name="business" size="xs" /></template>
          </q-select>
          <q-select
            v-model="filtroGrupo"
            :options="opcionesGrupo"
            label="Grupo" outlined dense clearable style="width: 150px"
          >
            <template v-slot:prepend><q-icon name="view_stream" size="xs" /></template>
          </q-select>
          <q-select
            v-model="filtroCategoria"
            :options="opcionesCategoria"
            emit-value map-options
            label="Categoría" outlined dense clearable style="width: 145px"
          >
            <template v-slot:prepend><q-icon name="label" size="xs" /></template>
          </q-select>
          <q-btn flat round dense color="grey-7" icon="filter_alt_off" @click="limpiarFiltros">
            <q-tooltip>Limpiar filtros</q-tooltip>
          </q-btn>
        </div>

        <div class="barra-acciones">
          <!-- Actualizar: con permiso trae los cambios del ERP (sincroniza); sin permiso solo recarga -->
          <q-btn
            v-if="!esSnapshot"
            color="primary" flat no-caps padding="8px 10px" icon="sync" label="Actualizar"
            :loading="sincronizando"
            @click="onActualizar"
          >
            <q-tooltip>
              {{ puedeEditar
                ? "Traer los últimos cambios de contratos, OTs y proyecciones del ERP"
                : "Recargar el Gantt" }}
            </q-tooltip>
          </q-btn>
          <!-- Importar de proyecciones (solo con permiso) -->
          <q-btn
            v-if="puedeEditar"
            color="primary" outline no-caps padding="8px 10px" icon="cloud_download"
            label="Importar"
            @click="dialogImportar = true"
          >
            <q-tooltip>Importar de Proyecciones: traer proyecciones del año (o OTs del catálogo) con sus pedidos</q-tooltip>
          </q-btn>
          <!-- Modo edición (solo con permiso): botón que se prende/apaga -->
          <q-btn
            v-if="puedeEditar"
            no-caps padding="8px 10px"
            icon="edit"
            :label="editando ? 'Editando' : 'Editar'"
            :color="editando ? 'light-green-7' : 'grey-7'"
            :outline="!editando"
            :unelevated="editando"
            @click="editando = !editando"
          >
            <q-tooltip>{{ editando ? "Terminar edición" : "Habilitar edición de fechas y arrastre de barras" }}</q-tooltip>
          </q-btn>
          <q-chip v-else dense icon="lock" color="grey-3" text-color="grey-8">
            Solo lectura
          </q-chip>
        </div>
      </div>

      <!-- Fila 2: opciones de vista (izquierda) + leyenda (derecha) -->
      <div class="barra-fila barra-fila--vista">
        <div class="barra-opciones">
          <span class="text-caption text-grey-7">Mostrar:</span>
          <q-toggle v-model="mostrarInfo" color="blue-grey-6" label="Detalle" dense size="sm">
            <q-tooltip>Mostrar u ocultar Fallo, Firma de contrato y Monto</q-tooltip>
          </q-toggle>
          <q-toggle v-model="mostrarHitos" color="amber-8" label="Facturación/Cobro" dense size="sm">
            <q-tooltip>Mostrar los hitos de facturación y cobro</q-tooltip>
          </q-toggle>
        </div>

        <!-- Leyenda: cada elemento (marca + texto) es una pieza que no se parte al acomodarse -->
        <div class="leyenda">
          <span class="ley-item"><span class="chip-leyenda" style="background:#5b7db1"></span>Contratado ({{ conteoPorCategoria.CONTRATADO }})</span>
          <span class="ley-item"><span class="chip-leyenda" style="background:#66bb6a"></span>Proyección ({{ conteoPorCategoria.PROYECCION }})</span>
          <span class="ley-item"><span class="chip-leyenda" style="background:#ef5350"></span>Garantía ({{ conteoPorCategoria.GARANTIA }})</span>
          <template v-if="mostrarHitos">
            <span class="sep-leyenda"></span>
            <span class="ley-item"><span class="rombo-leyenda" style="background:#f9a825"></span>Facturación</span>
            <span class="ley-item"><span class="rombo-leyenda" style="background:#2e7d32"></span>Cobro (factura + crédito)</span>
          </template>
          <span class="sep-leyenda"></span>
          <span class="ley-item ir-hoy" title="Ir al día de hoy en el Gantt" @click="ganttRef?.irAHoy()">
            <span class="hoy-leyenda"></span>Hoy
          </span>
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
        ref="ganttRef"
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
        expandable
        expand-default-field="_expandDefault"
        :segment-type-options="segmentTypeOptions"
        :segment-label-suggestions="segmentLabelSuggestions"
        :segment-colors="segmentColors"
        segment-default-type="CAMPO"
        persist-widths-key="contratos"
        :day-width="6"
        @update:row="onUpdateRow"
        @row-group-change="onRowGroupChange"
        @milestone-change="onMilestoneChange"
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
/* Barra de controles: flexbox simple (sin gutters anidados de Quasar) */
.barra-fila {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.barra-filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.barra-acciones {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto; /* siempre a la derecha, aunque baje de renglón */
}
.barra-fila--vista {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #eceff3;
}
.barra-opciones {
  display: flex;
  align-items: center;
  gap: 14px;
}
.leyenda {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-left: auto;
  font-size: 12px;
  color: #4a5060;
}
.ley-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.chip-leyenda {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
.rombo-leyenda {
  display: inline-block;
  width: 10px;
  height: 10px;
  transform: rotate(45deg);
  border: 1px solid #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.ir-hoy {
  cursor: pointer;
  border-radius: 3px;
  padding: 1px 4px;
}
.ir-hoy:hover {
  background: #ffebee;
}
.hoy-leyenda {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: #e53935;
  vertical-align: middle;
}
.sep-leyenda {
  display: inline-block;
  width: 1px;
  height: 14px;
  background: #cfd3dc;
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
