<script setup>
// Cobranza: antigüedad de saldos, cobrado vs proyección, flujo esperado (por compromiso o por
// comportamiento histórico del cliente) y el detalle de facturas abiertas.
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import KpiTile from "@/dashboard/components/KpiTile.vue";
import GraficaColumnas from "@/dashboard/components/GraficaColumnas.vue";
import DetalleDialog from "@/dashboard/components/DetalleDialog.vue";
import { useDetalle } from "@/dashboard/composables/detalle";
import { MESES, moneda, monedaCorta, porcentaje, fechaCorta, rangoDe } from "@/dashboard/composables/formato";

const store = useDashboardComercialStore();
const {
  anio, proyCobranza, cobradoAnteriorMensual, compensadoAnio, carteraTotal, carteraVencida, antiguedad, dso,
  modoFlujo, flujoEsperado, cart,
} = storeToRefs(store);
const detalle = useDetalle(store);
const { abierto, config } = detalle;

const barrasCobro = computed(() => [
  { key: "real", label: `Cobrado ${anio.value}`, color: "#1baf7a", values: proyCobranza.value.real, stack: "a" },
  { key: "proy", label: "Proyección lineal", color: "#a8e3cc", values: proyCobranza.value.proyectado, stack: "a" },
]);
const lineasCobro = computed(() => [{ key: "ant", label: `${anio.value - 1}`, color: "#898781", values: cobradoAnteriorMensual.value }]);

const flujo = computed(() => {
  const { meses, series } = flujoEsperado.value;
  const cols = ["atrasado", ...meses.map((m) => m.key)];
  const labels = ["Atrasado", ...meses.map((m) => `${MESES[m.mes - 1]} ${String(m.anio).slice(2)}`)];
  const s = (key, label, color) => ({ key, label, color, stack: "f", values: cols.map((c) => series[key][c]) });
  const bars =
    modoFlujo.value === "historico"
      ? [s("historico", "Según días reales de pago", "#2a78d6"), s("compromiso", "Fecha compromiso (sin historia)", "#6250d6"),
         s("vencimiento", "Vencimiento (sin historia)", "#9ec5f4"), s("contratos", "Contratos del Gantt (aún sin factura)", "#eb6834")]
      : [s("compromiso", "Fecha compromiso de cobranza", "#6250d6"), s("vencimiento", "Vencimiento de la factura", "#9ec5f4"),
         s("contratos", "Contratos del Gantt (aún sin factura)", "#eb6834")];
  return { labels, bars, cols };
});
const verFlujo = (i) => detalle.flujoColumna(flujo.value.cols[i], flujo.value.labels[i]);

const totalAntiguedad = computed(() => antiguedad.value.reduce((s, r) => s + r.monto, 0) || 1);

// ---------- tabla ----------
const soloVencidas = ref(true);
const buscar = ref("");
const filasTabla = computed(() => {
  const q = buscar.value.trim().toLowerCase();
  return cart.value
    .filter((r) => !soloVencidas.value || Number(r.dias_vencido) > 0)
    .filter((r) => !q || `${r.cliente} ${r.folio} ${r.atc_nombre}`.toLowerCase().includes(q));
});
const columnas = [
  { name: "cliente", label: "Cliente", field: "cliente", align: "left", sortable: true },
  { name: "folio", label: "Factura", field: "folio", align: "left", sortable: true },
  { name: "atc", label: "ATC", field: "atc_nombre", align: "left", sortable: true },
  { name: "fecha", label: "Timbrado", field: "fecha_factura", format: fechaCorta, sortable: true },
  { name: "vence", label: "Vence", field: "fecha_vencimiento", format: fechaCorta, sortable: true },
  { name: "dias", label: "Días vencida", field: (r) => Number(r.dias_vencido), sortable: true },
  { name: "saldo", label: "Saldo (MXN)", field: (r) => Number(r.saldo_mxn), format: moneda, sortable: true },
  { name: "compromiso", label: "Compromiso de cobro", field: "fecha_cobro_estimada", format: fechaCorta, sortable: true },
  { name: "comentario", label: "Comentario", field: "comentario_cobro", align: "left" },
];
</script>

<template>
  <div class="panel">
    <div class="kpis">
      <KpiTile hero label="Cartera por cobrar" :value="monedaCorta(carteraTotal)" :nota="`${cart.length} facturas abiertas`" />
      <KpiTile label="Cartera vencida" :value="monedaCorta(carteraVencida)" :nota="`${porcentaje(carteraTotal ? carteraVencida / carteraTotal : null)} de la cartera`" />
      <KpiTile label="DSO" :value="dso != null ? `${dso} días` : '—'" nota="Días de venta que están en cartera" />
      <KpiTile :label="`Cierre estimado de cobranza ${anio}`" :value="monedaCorta(proyCobranza.cierre)" :nota="`Cobrado ${monedaCorta(proyCobranza.ytd)} · rango ${monedaCorta(proyCobranza.cierreMin)}–${monedaCorta(proyCobranza.cierreMax)}`" />
      <KpiTile label="Compensaciones / sanciones" :value="monedaCorta(compensadoAnio)" nota="Pagos que no son efectivo (no suman a lo cobrado)" />
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Antigüedad de saldos</div>
      <div class="tarjeta-sub">Días desde el vencimiento (fecha de vencimiento de la factura o timbrado + días de crédito) · clic en un rango para ver sus facturas</div>
      <div class="aging">
        <div v-for="r in antiguedad.filter((x) => x.monto > 0)" :key="r.key" class="aging-seg" :style="{ flexGrow: r.monto, background: r.color }"
          role="button" @click="detalle.antiguedadRango(r)">
          <q-tooltip>{{ r.label }}: {{ moneda(r.monto) }} · {{ r.facturas }} factura(s) · clic para ver el detalle</q-tooltip>
        </div>
      </div>
      <div class="aging-tabla">
        <div v-for="r in antiguedad" :key="r.key" class="aging-celda" role="button" tabindex="0" title="Ver facturas de este rango"
          @click="detalle.antiguedadRango(r)" @keydown.enter="detalle.antiguedadRango(r)">
          <div class="aging-et"><span class="sw" :style="{ background: r.color }"></span>{{ r.label }}</div>
          <div class="aging-monto">{{ monedaCorta(r.monto) }}</div>
          <div class="aging-pct">{{ porcentaje(r.monto / totalAntiguedad) }} · {{ r.facturas }} fact.</div>
        </div>
      </div>
    </q-card>

    <div class="dos-col">
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Cobrado por mes y proyección</div>
        <div class="tarjeta-sub">Pagos timbrados en MXN (con IVA), sin compensaciones</div>
        <GraficaColumnas :labels="MESES" :bars="barrasCobro" :lines="lineasCobro" :height="250" clickable
          @select="(i) => detalle.cobranzaMes(anio, i + 1)" />
      </q-card>
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-cabecera">
          <div>
            <div class="tarjeta-titulo">Flujo esperado de cobro · 6 meses</div>
            <div class="tarjeta-sub">"Atrasado" = ya debió cobrarse y no tiene fecha nueva</div>
          </div>
          <q-btn-toggle v-model="modoFlujo" dense no-caps unelevated toggle-color="primary" color="grey-2" text-color="grey-9" size="sm"
            :options="[{ label: 'Por compromiso', value: 'compromiso' }, { label: 'Por historial del cliente', value: 'historico' }]" />
        </div>
        <GraficaColumnas :labels="flujo.labels" :bars="flujo.bars" :height="250" clickable @select="verFlujo" />
      </q-card>
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-cabecera">
        <div class="tarjeta-titulo">Facturas abiertas</div>
        <div class="row items-center q-gutter-sm">
          <q-toggle v-model="soloVencidas" dense label="Solo vencidas" />
          <q-input v-model="buscar" dense outlined clearable placeholder="Cliente, factura o ATC" style="width: 240px">
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
      </div>
      <q-table
        :rows="filasTabla" :columns="columnas" :row-key="(r) => r.origen + r.id" flat dense
        :pagination="{ rowsPerPage: 15, sortBy: 'saldo', descending: true }" class="q-mt-sm fila-click"
        @row-click="(_, r) => store.alternarCliente(r.cliente_id)"
      >
        <template #body-cell-dias="p">
          <q-td :props="p" class="num">
            <span v-if="p.value > 0" class="dias-chip" :style="{ background: rangoDe(p.value).color, color: p.value > 60 ? '#fff' : '#0b0b0b' }">{{ p.value }}</span>
            <span v-else class="text-grey-7">al corriente</span>
          </q-td>
        </template>
        <template #body-cell-compromiso="p">
          <q-td :props="p">
            <span v-if="p.row.fecha_cobro_estimada">{{ p.value }}</span>
            <span v-else-if="Number(p.row.dias_vencido) > 0" class="text-red-8">Sin fecha</span>
            <span v-else class="text-grey-6">—</span>
            <q-badge v-if="Number(p.row.cobro_negociacion) === 1" color="orange-2" text-color="orange-10" label="negociación" class="q-ml-xs" />
          </q-td>
        </template>
      </q-table>
    </q-card>

    <DetalleDialog v-model="abierto" v-bind="config" @fila="detalle.alElegirFila" />
  </div>
</template>

<style scoped src="../dashboard.css"></style>
<style scoped>
.aging { display: flex; gap: 2px; height: 22px; border-radius: 4px; overflow: hidden; margin: 6px 0 12px; }
.aging-seg { min-width: 3px; cursor: pointer; }
.aging-seg:hover { filter: brightness(0.92); }
.aging-celda { cursor: pointer; border-radius: 6px; padding: 4px 6px; margin: -4px -6px; }
.aging-celda:hover { background: rgba(11, 11, 11, 0.04); }
.aging-tabla { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.aging-et { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #52514e; }
.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.aging-monto { font-size: 18px; font-weight: 600; color: #0b0b0b; }
.aging-pct { font-size: 11px; color: #898781; }
.dias-chip { display: inline-block; min-width: 34px; text-align: center; padding: 1px 6px; border-radius: 10px; font-size: 12px; font-weight: 600; }
</style>
