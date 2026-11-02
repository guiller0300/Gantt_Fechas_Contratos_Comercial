<script setup>
// Avisos de proyecciones: proyectos sin contrato ni resultado cuya fecha proyectada ya pasó o llega en
// los próximos días (regla en el store: avisosProyectos). Por cada uno, qué hacer: mover la fecha en el
// Gantt o actualizar mes/estatus en Proyección General.
import { ref, computed, watch, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import { moneda, monedaCorta, fechaCorta, MESES } from "@/dashboard/composables/formato";

const props = defineProps({
  factibilidad: { default: null }, // filtro de factibilidad de la pestaña (opcional)
});

const router = useRouter();
const store = useDashboardComercialStore();
const { avisosProyectos, proyectosCargados, loadingProyectos, DIAS_AVISO, enfocarAvisos } = storeToRefs(store);

const filtroEstado = ref("todos");
const avisos = computed(() =>
  avisosProyectos.value.filter((a) => !props.factibilidad || (a.factibilidad || "Sin factibilidad") === props.factibilidad)
);
const cuenta = computed(() => ({
  vencidos: avisos.value.filter((a) => a.estado === "vencido"),
  proximos: avisos.value.filter((a) => a.estado === "proximo"),
}));
const filas = computed(() => avisos.value.filter((a) => filtroEstado.value === "todos" || a.estado === filtroEstado.value));
const suma = (xs) => xs.reduce((s, a) => s + (Number(a.monto) || 0), 0);

const ESTADO = {
  vencido: { label: "Vencido", icon: "error", color: "#d03b3b" },
  proximo: { label: "Por vencer", icon: "schedule", color: "#c98500" },
};
const cuando = (a) => {
  if (a.origen === "mes") {
    return a.estado === "vencido" ? "el mes ya terminó" : a.dias <= 0 ? "mes en curso" : `empieza en ${a.dias} día(s)`;
  }
  return a.dias < 0 ? `Hace ${-a.dias} día(s)` : a.dias === 0 ? "Hoy" : `En ${a.dias} día(s)`;
};

// Acciones: mover la fecha en el Gantt o actualizar mes/estatus en Proyección General (pantalla del ERP).
const abrirGantt = () => router.push({ name: "contratos-gantt" });
const abrirProyeccionGeneral = () => {
  const isDev = window.javaObj?.springActiveProfile === "dev";
  const base = isDev ? "http://localhost:8282" : "http://192.168.100.18:8282";
  window.open(`${base}/comercial/proyeccion-general#/proyeccion-general/atc`, "_blank");
};

const columnas = [
  { name: "estado", label: "Aviso", field: "estado", align: "left", sortable: true },
  { name: "fecha", label: "Fecha proyectada", field: "fecha", align: "left", sortable: true },
  { name: "folio", label: "Folio", field: "folio", align: "left", sortable: true },
  { name: "cliente", label: "Cliente / unidad", field: "cliente", align: "left", sortable: true },
  { name: "descripcion", label: "Descripción", field: "descripcion", align: "left" },
  { name: "atc", label: "ATC", field: "atc_nombre", align: "left", sortable: true },
  { name: "factibilidad", label: "Factibilidad", field: (a) => a.factibilidad_descripcion || a.factibilidad, align: "left", sortable: true },
  { name: "monto", label: "Monto ajustado", field: (a) => Number(a.monto), format: moneda, sortable: true },
  { name: "accion", label: "Qué hacer", field: "origen", align: "left" },
];

// La campana del encabezado pide enfocar esta tarjeta.
const raiz = ref(null);
watch(enfocarAvisos, async () => {
  await nextTick();
  raiz.value?.$el?.scrollIntoView({ behavior: "smooth", block: "start" });
});
</script>

<template>
  <q-card ref="raiz" flat bordered class="tarjeta avisos" :class="{ 'avisos--alerta': cuenta.vencidos.length }">
    <div class="tarjeta-cabecera">
      <div>
        <div class="tarjeta-titulo"><q-icon name="notifications_active" size="18px" class="q-mr-xs" />Avisos: proyecciones sin contrato por vencer</div>
        <div class="tarjeta-sub">
          Proyectos que suman, sin pedido, no ganados ni perdidos, cuya fecha proyectada ya pasó o llega en los próximos
          {{ DIAS_AVISO }} días (fecha de facturación del Gantt; si no está en el Gantt, su mes factible). Decide si se va a dar,
          si se mueve la fecha o si se actualiza su estatus.
        </div>
      </div>
      <q-btn-toggle v-model="filtroEstado" dense no-caps unelevated toggle-color="primary" color="white" text-color="grey-9" class="toggle-borde"
        :options="[
          { label: `Todos (${avisos.length})`, value: 'todos' },
          { label: `Vencidos (${cuenta.vencidos.length})`, value: 'vencido' },
          { label: `Por vencer (${cuenta.proximos.length})`, value: 'proximo' },
        ]" />
    </div>

    <div v-if="loadingProyectos && !proyectosCargados" class="kpi-sub q-pa-md">Revisando proyecciones…</div>
    <div v-else-if="!avisos.length" class="vacio"><q-icon name="check_circle" color="green-7" /> Sin avisos: nada vence en los próximos {{ DIAS_AVISO }} días sin contrato.</div>
    <template v-else>
      <div class="avisos-resumen">
        <span class="chip-riesgo"><q-icon name="error" size="16px" style="color: #d03b3b" />
          <b>{{ cuenta.vencidos.length }}</b> vencido(s) · {{ monedaCorta(suma(cuenta.vencidos)) }}</span>
        <span class="chip-riesgo"><q-icon name="schedule" size="16px" style="color: #c98500" />
          <b>{{ cuenta.proximos.length }}</b> en los próximos {{ DIAS_AVISO }} días · {{ monedaCorta(suma(cuenta.proximos)) }}</span>
      </div>
      <q-table :rows="filas" :columns="columnas" row-key="proyecto_id" flat dense :pagination="{ rowsPerPage: 8 }">
        <template #body-cell-estado="c">
          <q-td :props="c">
            <span class="chip-riesgo"><q-icon :name="ESTADO[c.value].icon" size="16px" :style="{ color: ESTADO[c.value].color }" />{{ ESTADO[c.value].label }}</span>
          </q-td>
        </template>
        <template #body-cell-fecha="c">
          <q-td :props="c">
            <div>{{ c.row.origen === "gantt" ? fechaCorta(c.value) : `${MESES[new Date(c.value + 'T00:00:00').getMonth()]} ${c.value.slice(0, 4)}` }}</div>
            <div class="kpi-sub">{{ c.row.origen === "gantt" ? "Facturación en el Gantt" : "Mes factible" }} · {{ cuando(c.row) }}</div>
          </q-td>
        </template>
        <template #body-cell-cliente="c">
          <q-td :props="c">
            <div>{{ c.row.cliente }}{{ c.row.unidad ? ` · ${c.row.unidad}` : "" }}</div>
          </q-td>
        </template>
        <template #body-cell-descripcion="c">
          <q-td :props="c" class="desc-celda">{{ c.value }}</q-td>
        </template>
        <template #body-cell-accion="c">
          <q-td :props="c">
            <q-btn v-if="c.row.origen === 'gantt'" dense flat no-caps size="sm" color="primary" icon="event" label="Mover en el Gantt" @click.stop="abrirGantt">
              <q-tooltip>Abre el Gantt para mover su fecha de facturación o marcar el avance</q-tooltip>
            </q-btn>
            <q-btn v-else dense flat no-caps size="sm" color="primary" icon="open_in_new" label="Actualizar en Proyección General" @click.stop="abrirProyeccionGeneral">
              <q-tooltip>Abre Proyección General para cambiar el mes factible, la factibilidad o marcar ganado/perdido</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </template>
  </q-card>
</template>

<style scoped src="../dashboard.css"></style>
<style scoped>
.avisos--alerta { border-left: 4px solid #d03b3b; }
.avisos-resumen { display: flex; flex-wrap: wrap; gap: 18px; font-size: 13px; margin: 4px 0 8px; }
.toggle-borde { border: 1px solid #c3c2b7; border-radius: 4px; }
.desc-celda { min-width: 220px; max-width: 340px; white-space: normal; }
</style>
