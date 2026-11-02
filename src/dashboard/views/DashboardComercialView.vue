<script setup>
import { ref, watch, onMounted } from "vue";
import { Notify } from "quasar";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import { ETIQUETA_GRUPO } from "@/dashboard/composables/formato";
import ResumenPanel from "@/dashboard/resumen/ResumenPanel.vue";
import IndicadoresPanel from "@/dashboard/indicadores/IndicadoresPanel.vue";
import FacturacionPanel from "@/dashboard/facturacion/FacturacionPanel.vue";
import CobranzaPanel from "@/dashboard/cobranza/CobranzaPanel.vue";
import ClientesPanel from "@/dashboard/clientes/ClientesPanel.vue";
import OrdenesPanel from "@/dashboard/ordenes/OrdenesPanel.vue";
import ProyeccionesPanel from "@/dashboard/proyecciones/ProyeccionesPanel.vue";

const router = useRouter();
const store = useDashboardComercialStore();
const { anio, anios, loading, loadingOrdenes, origen, filtroGrupo, filtroAtc, filtroCliente, atcsDisponibles, clientesDisponibles, hayFiltro, tab } =
  storeToRefs(store);
const { resumenAvisos, proyectosCargados } = storeToRefs(store);

// Aviso al abrir (una vez por sesión del navegador): proyecciones sin contrato vencidas o de esta semana.
const AVISO_KEY = "dashboard-comercial:aviso-proyecciones";
watch(proyectosCargados, (listo) => {
  if (!listo || !resumenAvisos.value.total) return;
  try { if (sessionStorage.getItem(AVISO_KEY)) return; sessionStorage.setItem(AVISO_KEY, "1"); } catch { /* sin storage */ }
  const r = resumenAvisos.value;
  Notify.create({
    type: "warning", position: "top-right", timeout: 10000, icon: "notifications_active",
    message: `${r.vencidos} proyección(es) vencida(s) y ${r.proximos} por vencer sin contrato`,
    caption: "Revisa si se van a dar, mueve la fecha o actualiza su estatus",
    actions: [{ label: "Ver avisos", color: "dark", handler: () => store.verAvisos() }],
  });
});
const { consultar, limpiarFiltros } = store;

const TAB_KEY = "dashboard-comercial:tab";
try { tab.value = localStorage.getItem(TAB_KEY) || "resumen"; } catch { /* sin storage */ }
// La pestaña vive en el store (los KPIs y los clics navegan); aquí solo se recuerda por usuario.
watch(tab, (v) => { try { localStorage.setItem(TAB_KEY, v); } catch { /* sin storage */ } });

// Buscador de cliente: filtra las opciones mientras se escribe.
const opcionesCliente = ref([]);
const filtrarClientes = (texto, actualizar) => {
  const q = texto.trim().toLowerCase();
  actualizar(() => {
    opcionesCliente.value = q ? clientesDisponibles.value.filter((c) => c.label.toLowerCase().includes(q)) : clientesDisponibles.value;
  });
};

const opcionesGrupo = [
  { label: "Todos", value: null },
  ...["CFE", "PEMEX", "OTROS"].map((g) => ({ label: ETIQUETA_GRUPO[g], value: g })),
];

const regresarComercial = () => {
  const isDev = window.javaObj?.springActiveProfile === "dev";
  const baseUrl = isDev ? "http://localhost:8282" : "http://192.168.100.18:8282";
  window.top.location.href = `${baseUrl}/comercial/index`;
};

onMounted(consultar);
</script>

<template>
  <div class="dash bg-grey-1">
    <q-toolbar class="text-white" style="background-color: #3b3f51">
      <q-icon name="insights" size="28px" class="q-mr-sm" />
      <q-toolbar-title>
        <span class="text-weight-bold">Dashboard Comercial y Cobranza</span>
        <q-badge v-if="origen === 'mock'" color="orange" text-color="white" class="q-ml-sm" label="datos de ejemplo" />
      </q-toolbar-title>
      <q-btn flat round dense icon="notifications" class="q-mr-sm" @click="store.verAvisos()">
        <q-badge v-if="resumenAvisos.total" floating rounded :color="resumenAvisos.vencidos ? 'red' : 'orange'" :label="resumenAvisos.total" />
        <q-tooltip>{{ resumenAvisos.vencidos }} proyección(es) vencida(s) y {{ resumenAvisos.proximos }} por vencer sin contrato</q-tooltip>
      </q-btn>
      <q-btn flat dense no-caps icon="event_note" label="Gantt" class="q-mr-sm" @click="router.push({ name: 'contratos-gantt' })">
        <q-tooltip>Gantt de fechas de contratos</q-tooltip>
      </q-btn>
      <q-btn flat round size="sm" icon="logout" @click="regresarComercial">
        <q-tooltip>Regresar</q-tooltip>
      </q-btn>
    </q-toolbar>

    <div class="filtros">
      <q-select v-model="anio" :options="anios" dense outlined label="Año" style="width: 100px" @update:model-value="consultar" />
      <q-btn-toggle v-model="filtroGrupo" :options="opcionesGrupo" dense no-caps unelevated toggle-color="primary" color="white" text-color="grey-9" class="toggle-grupo" />
      <q-select
        v-model="filtroAtc" :options="atcsDisponibles" emit-value map-options clearable dense outlined
        label="ATC" style="min-width: 240px"
      />
      <q-select
        v-model="filtroCliente" :options="opcionesCliente" emit-value map-options clearable dense outlined
        use-input input-debounce="150" label="Cliente" style="min-width: 260px" @filter="filtrarClientes"
      >
        <template #no-option><q-item><q-item-section class="text-grey">Sin coincidencias</q-item-section></q-item></template>
      </q-select>
      <q-btn v-if="hayFiltro" flat dense no-caps icon="filter_alt_off" label="Limpiar" @click="limpiarFiltros" />
      <q-space />
      <q-btn outline dense no-caps color="primary" icon="refresh" label="Actualizar" :loading="loading" @click="consultar" />
    </div>

    <q-tabs v-model="tab" dense align="left" no-caps active-color="primary" indicator-color="primary" class="tabs">
      <q-tab name="resumen" icon="dashboard" label="Resumen" />
      <q-tab name="indicadores" icon="speed" label="Indicadores" />
      <q-tab name="facturacion" icon="request_quote" label="Facturación" />
      <q-tab name="cobranza" icon="account_balance_wallet" label="Cobranza" />
      <q-tab name="clientes" icon="groups" label="Clientes" />
      <q-tab name="ordenes" icon="build" label="Órdenes">
        <q-spinner v-if="loadingOrdenes" size="12px" color="primary" class="tab-spinner" />
      </q-tab>
      <q-tab name="proyecciones" icon="trending_up" label="Proyecciones" />
    </q-tabs>

    <div class="contenido">
      <q-inner-loading :showing="loading" />
      <q-tab-panels v-model="tab" animated keep-alive class="bg-transparent">
        <q-tab-panel name="resumen" class="q-pa-none"><ResumenPanel /></q-tab-panel>
        <q-tab-panel name="indicadores" class="q-pa-none"><IndicadoresPanel /></q-tab-panel>
        <q-tab-panel name="facturacion" class="q-pa-none"><FacturacionPanel /></q-tab-panel>
        <q-tab-panel name="cobranza" class="q-pa-none"><CobranzaPanel /></q-tab-panel>
        <q-tab-panel name="clientes" class="q-pa-none"><ClientesPanel /></q-tab-panel>
        <q-tab-panel name="ordenes" class="q-pa-none"><OrdenesPanel /></q-tab-panel>
        <q-tab-panel name="proyecciones" class="q-pa-none"><ProyeccionesPanel /></q-tab-panel>
      </q-tab-panels>
    </div>
  </div>
</template>

<style scoped>
.dash { height: 100vh; display: flex; flex-direction: column; overflow: auto; }
.filtros { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e1e0d9; }
.toggle-grupo { border: 1px solid #c3c2b7; border-radius: 4px; }
.tab-spinner { position: absolute; top: 6px; right: 6px; }
.tabs { background: #fff; border-bottom: 1px solid #e1e0d9; padding: 0 8px; }
.contenido { position: relative; padding: 14px 16px 24px; max-width: 1500px; width: 100%; margin: 0 auto; }
</style>
