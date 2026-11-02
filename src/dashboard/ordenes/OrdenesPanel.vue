<script setup>
// Órdenes abiertas: el embudo de la "Consulta general de orden" sumado para todas las órdenes no
// cerradas (cotizado → autorizado → − descuentos − cortesías → facturado → pendiente de facturar).
// La consulta es pesada (funciones de BD por orden): se pide al abrir esta pestaña.
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import KpiTile from "@/dashboard/components/KpiTile.vue";
import BarrasRanking from "@/dashboard/components/BarrasRanking.vue";
import { moneda, monedaCorta, porcentaje } from "@/dashboard/composables/formato";

const store = useDashboardComercialStore();
const { ords, ordenes, totalOrdenes, loadingOrdenes, facturadoYtd, anio, ordenesDesde, filtroCliente } = storeToRefs(store);
const elegirCliente = (it) => it.key !== "sin" && store.alternarCliente(it.key);
const y = new Date().getFullYear();
const opcionesDesde = [
  { label: `Desde ${y - 2}`, value: y - 2 },
  { label: `Desde ${y - 4}`, value: y - 4 },
  { label: "Todas las abiertas", value: 0 }, // 0 = sin filtro (q-btn-toggle no selecciona null)
];
const cambiarDesde = (v) => {
  ordenesDesde.value = v;
  store.consultarOrdenes(true);
};
onMounted(() => store.consultarOrdenes());

// Carga visible: la consulta tarda (funciones de BD por orden). Primera vez = tarjeta de carga con
// segundos transcurridos; al cambiar el rango = barra de progreso y el contenido anterior atenuado.
const primeraCarga = computed(() => loadingOrdenes.value && !ordenes.value.length);
const segundos = ref(0);
let reloj = null;
watch(
  loadingOrdenes,
  (cargando) => {
    clearInterval(reloj);
    segundos.value = 0;
    if (cargando) reloj = setInterval(() => (segundos.value += 1), 1000);
  },
  { immediate: true }
);
onBeforeUnmount(() => clearInterval(reloj));
const etiquetaRango = computed(() => (ordenesDesde.value ? `desde ${ordenesDesde.value}` : "de todos los años"));
const tiempoEsperado = computed(() => (ordenesDesde.value ? "unos 10 segundos" : "alrededor de 30 segundos"));

const t = totalOrdenes;
const pct = (a, b) => (b ? a / b : null);

const embudo = computed(() => [
  { key: "cot", label: "Cotizado", sub: "Todo lo cotizado en las órdenes abiertas", value: t.value.cotizado, color: "#9ec5f4" },
  { key: "aut", label: "Autorizado", sub: `${porcentaje(pct(t.value.autorizado, t.value.cotizado))} de lo cotizado`, value: t.value.autorizado, color: "#5598e7" },
  { key: "neto", label: "Neto autorizado", sub: "Autorizado − descuentos − cortesías", value: t.value.neto_autorizado, color: "#2a78d6" },
  { key: "fac", label: "Facturado neto", sub: "Facturado − descuento − NC por anticipo", value: t.value.facturado_neto, color: "#1baf7a" },
  { key: "pend", label: "Pendiente de facturar", sub: `${porcentaje(pct(t.value.pendiente_facturar, t.value.neto_autorizado))} del neto autorizado`, value: t.value.pendiente_facturar, color: "#eb6834" },
].map((e) => ({ key: e.key, label: e.label, sub: e.sub, segmentos: [{ key: e.key, label: e.label, value: e.value, color: e.color }] })));

const DESC = "#e8706a";
const CORT = "#d03b3b";
const agruparPor = (campoLlave, nombre, campos) => {
  const m = new Map();
  for (const o of ords.value) {
    const k = o[campoLlave] ?? "sin";
    if (!m.has(k)) m.set(k, { key: k, label: o[nombre] || "Sin ATC", n: 0, ...Object.fromEntries(campos.map((c) => [c, 0])) });
    const acc = m.get(k);
    acc.n += 1;
    for (const c of campos) acc[c] += Number(o[c]) || 0;
  }
  return [...m.values()];
};

const fugasPorCliente = computed(() =>
  agruparPor("cliente_id", "cliente", ["descuento_autorizado", "cortesias", "autorizado"])
    .filter((c) => c.descuento_autorizado + c.cortesias > 0)
    .sort((a, b) => b.descuento_autorizado + b.cortesias - (a.descuento_autorizado + a.cortesias))
    .slice(0, 10)
    .map((c) => ({
      key: c.key, label: c.label, sub: `${porcentaje(pct(c.descuento_autorizado + c.cortesias, c.autorizado), 1)} de lo autorizado · ${c.n} orden(es)`,
      segmentos: [
        { key: "d", label: "Descuento autorizado", value: c.descuento_autorizado, color: DESC },
        { key: "c", label: "Cortesías", value: c.cortesias, color: CORT },
      ],
    }))
);

const pendientePorCliente = computed(() =>
  agruparPor("cliente_id", "cliente", ["pendiente_facturar"])
    .filter((c) => c.pendiente_facturar > 0)
    .sort((a, b) => b.pendiente_facturar - a.pendiente_facturar)
    .slice(0, 10)
    .map((c) => ({ key: c.key, label: c.label, sub: `${c.n} orden(es)`,
      segmentos: [{ key: "p", label: "Pendiente de facturar", value: c.pendiente_facturar, color: "#eb6834" }] }))
);

// ---------- tabla ----------
const buscar = ref("");
const soloPendientes = ref(true);
const filas = computed(() => {
  const q = buscar.value.trim().toLowerCase();
  return ords.value
    .filter((o) => !soloPendientes.value || Number(o.pendiente_facturar) > 0)
    .filter((o) => !q || `${o.numero_orden} ${o.cliente} ${o.atc_nombre} ${o.descripcion}`.toLowerCase().includes(q));
});
const columnas = [
  { name: "orden", label: "OT", field: "numero_orden", align: "left", sortable: true },
  { name: "cliente", label: "Cliente", field: "cliente", align: "left", sortable: true },
  { name: "atc", label: "ATC", field: "atc_nombre", align: "left", sortable: true },
  { name: "cotizado", label: "Cotizado", field: (o) => Number(o.cotizado), format: moneda, sortable: true },
  { name: "autorizado", label: "Autorizado", field: (o) => Number(o.autorizado), format: moneda, sortable: true },
  { name: "descuento", label: "Descuento", field: (o) => Number(o.descuento_autorizado), format: moneda, sortable: true },
  { name: "cortesias", label: "Cortesías", field: (o) => Number(o.cortesias), format: moneda, sortable: true },
  { name: "neto", label: "Neto autorizado", field: (o) => Number(o.neto_autorizado), format: moneda, sortable: true },
  { name: "facturado", label: "Facturado neto", field: "facturado_neto", format: moneda, sortable: true },
  { name: "pendiente", label: "Pendiente de facturar", field: (o) => Number(o.pendiente_facturar), format: moneda, sortable: true },
  { name: "avance", label: "% facturado", field: (o) => pct(o.facturado_neto, Number(o.neto_autorizado)), format: (v) => porcentaje(v), sortable: true },
];
</script>

<template>
  <div class="panel">
    <div class="rango">
      <span class="rango-label">Órdenes abiertas por año de la orden</span>
      <q-btn-toggle :model-value="ordenesDesde" :options="opcionesDesde" dense no-caps unelevated toggle-color="primary"
        color="white" text-color="grey-9" class="rango-toggle" :disable="loadingOrdenes" @update:model-value="cambiarDesde" />
      <span class="rango-nota">Hay órdenes sin cerrar desde 2003; "Todas" tarda más (~30 s).</span>
    </div>
    <q-linear-progress v-if="loadingOrdenes && !primeraCarga" indeterminate color="primary" class="barra-carga" />

    <q-card v-if="primeraCarga" flat bordered class="tarjeta carga">
      <q-spinner-gears size="48px" color="primary" />
      <div class="carga-titulo">Calculando importes de las órdenes abiertas {{ etiquetaRango }}…</div>
      <div class="carga-sub">Cotizado, autorizado, descuentos, cortesías, facturado y pendiente de cada orden. Suele tardar {{ tiempoEsperado }}.</div>
      <div class="carga-reloj num">{{ segundos }} s</div>
    </q-card>

    <div v-else class="contenido-ordenes" :class="{ atenuado: loadingOrdenes }">
    <div class="kpis">
      <KpiTile hero label="Pendiente de facturar (autorizado)" :value="monedaCorta(t.pendiente_facturar)"
        :nota="`${ords.length} órdenes abiertas · trabajo autorizado que aún no se factura`" />
      <KpiTile :label="`Si se factura todo en ${anio}`" :value="monedaCorta(facturadoYtd + t.pendiente_facturar)"
        nota="Facturado neto del año + pendiente de facturar (techo)" />
      <KpiTile label="Descuentos + cortesías autorizados" :value="monedaCorta(t.descuento_autorizado + t.cortesias)"
        :nota="`${porcentaje(pct(t.descuento_autorizado + t.cortesias, t.autorizado), 1)} de lo autorizado · cortesías ${monedaCorta(t.cortesias)}`" />
      <KpiTile label="Pendiente de autorizar" :value="monedaCorta(t.pte_autorizar)" nota="Cotizado que el cliente aún no autoriza" />
      <KpiTile label="Autorizado sin pedido" :value="monedaCorta(t.neto_sin_pedido)" nota="Neto autorizado que no tiene pedido ligado" />
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Embudo de las órdenes abiertas</div>
      <div class="tarjeta-sub">Mismos cálculos que la Consulta general de orden, sumados (MXN; órdenes en USD al último tipo de cambio)</div>
      <BarrasRanking :items="embudo" />
    </q-card>

    <div class="dos-col">
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Descuentos y cortesías por cliente</div>
        <div class="tarjeta-sub">Lo que se deja de cobrar sobre lo autorizado · clic para filtrar por el cliente</div>
        <BarrasRanking :items="fugasPorCliente" clickable :seleccionado="filtroCliente" @select="elegirCliente" :leyenda="[{ label: 'Descuento autorizado', color: DESC }, { label: 'Cortesías', color: CORT }]" />
      </q-card>
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Pendiente de facturar por cliente</div>
        <div class="tarjeta-sub">Top 10 · trabajo autorizado por facturar · clic para filtrar</div>
        <BarrasRanking :items="pendientePorCliente" clickable :seleccionado="filtroCliente" @select="elegirCliente" />
      </q-card>
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-cabecera">
        <div class="tarjeta-titulo">Órdenes abiertas</div>
        <div class="row items-center q-gutter-sm">
          <q-toggle v-model="soloPendientes" dense label="Solo con pendiente de facturar" />
          <q-input v-model="buscar" dense outlined clearable placeholder="OT, cliente, ATC o descripción" style="width: 260px">
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
      </div>
      <q-table :rows="filas" :columns="columnas" row-key="orden_id" flat dense class="q-mt-sm fila-click"
        @row-click="(_, o) => store.alternarCliente(o.cliente_id)"
        :pagination="{ rowsPerPage: 15, sortBy: 'pendiente', descending: true }">
        <template #body-cell-orden="p">
          <q-td :props="p">
            {{ p.value }}
            <q-badge v-if="p.row.moneda === 'USD'" color="grey-3" text-color="grey-9" label="USD" class="q-ml-xs" />
            <q-tooltip v-if="p.row.descripcion">{{ p.row.descripcion }}</q-tooltip>
          </q-td>
        </template>
      </q-table>
    </q-card>

    <div class="nota-metodo">
      Órdenes activas, no cerradas ni canceladas. Cotizado, autorizado, descuento, cortesías, neto y pendiente salen de las funciones
      de BD de la Consulta general de orden (IMPORTE_COTIZADO_ORDEN, IMPORTE_AUTORIZADO_ORDEN, IMPORTE_DESCUENTO_AUTORIZADO,
      IMPORTE_CORTESIAS_AUTORIZADO_ORDEN, IMPORTE_PENDIENTE_ORDEN…). Facturado neto = facturado timbrado − descuento − NC por anticipo.
    </div>
    </div>
  </div>
</template>

<style scoped src="../dashboard.css"></style>
<style scoped>
.carga { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 16px; text-align: center; }
.carga-titulo { font-size: 15px; font-weight: 600; color: #0b0b0b; }
.carga-sub { font-size: 12px; color: #52514e; max-width: 520px; }
.carga-reloj { font-size: 12px; color: #898781; }
.barra-carga { border-radius: 2px; }
.contenido-ordenes { display: flex; flex-direction: column; gap: 14px; transition: opacity 0.2s; }
.atenuado { opacity: 0.45; pointer-events: none; }
.rango { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.rango-label { font-size: 13px; color: #0b0b0b; font-weight: 600; }
.rango-toggle { border: 1px solid #c3c2b7; border-radius: 4px; }
.rango-nota { font-size: 11px; color: #898781; }
</style>
