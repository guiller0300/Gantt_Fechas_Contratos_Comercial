<script setup>
// Indicadores: MAT vs PYMAT (venta y cobranza de 12 meses móviles) y el tablero de KPIs estándar de
// Ventas y de Contabilidad/Cobranza, con referencia y semáforo. Clic en un KPI = ir a su pestaña.
// Cálculos y umbrales en composables/indicadores.js.
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import KpiTile from "@/dashboard/components/KpiTile.vue";
import GraficaColumnas from "@/dashboard/components/GraficaColumnas.vue";
import DetalleDialog from "@/dashboard/components/DetalleDialog.vue";
import { useDetalle } from "@/dashboard/composables/detalle";
import { moneda, monedaCorta } from "@/dashboard/composables/formato";

const store = useDashboardComercialStore();
const { indicadores: ind, anticiposResumen, mesIndicadores } = storeToRefs(store);
const detalle = useDetalle(store);
const { abierto, config } = detalle;
const mesElegido = computed({
  get: () => ind.value.mes.idx,
  set: (v) => (mesIndicadores.value = v),
});
const verMes = (fila) => detalle.facturacionMes(fila.anio, fila.mes);

// Mes a mes: ventas de los 12 meses hasta el elegido vs el mismo mes del año pasado (YoY visual).
const barrasMes = computed(() => [
  { key: "v", label: "Ventas del mes", color: "#2a78d6", values: ind.value.tablaMensual.map((f) => f.ventas) },
]);
const lineasMes = computed(() => [
  { key: "py", label: "Mismo mes del año pasado", color: "#898781", values: ind.value.tablaMensual.map((f) => f.ventasPy) },
]);
// Si hay muchos anticipos sin aplicar, el MAT de venta (contable) se ve bajo aunque sí se facturó y cobró.
const avisoAnticipos = computed(() => ind.value.mat > 0 && anticiposResumen.value.total > ind.value.mat * 0.1);
// El backlog y los descuentos salen de las órdenes abiertas (consulta pesada): se piden en segundo plano.
onMounted(() => store.consultarOrdenes());

const lineasMat = computed(() => [
  { key: "ventas", label: "Ventas netas MAT", color: "#2a78d6", values: ind.value.serie.ventas },
  { key: "cobranza", label: "Cobranza MAT", color: "#1baf7a", values: ind.value.serie.cobranza },
]);

const ESTADO = {
  bien: { label: "En meta", icon: "check_circle", color: "#0ca30c" },
  alerta: { label: "Atención", icon: "warning", color: "#c98500" },
  mal: { label: "Crítico", icon: "error", color: "#d03b3b" },
};
const delta = (d) => (d == null || !isFinite(d) ? "" : `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`);
const tableros = computed(() => [
  { key: "ventas", titulo: "Ventas", icono: "trending_up", kpis: ind.value.ventas },
  { key: "conta", titulo: "Contabilidad y cobranza", icono: "account_balance", kpis: ind.value.contabilidad },
]);
const resumenEstados = (kpis) => ["bien", "alerta", "mal"].map((e) => ({ e, n: kpis.filter((k) => k.estado === e).length }));
</script>

<template>
  <div class="panel">
    <div class="kpis">
      <KpiTile hero label="Ventas netas MAT (12 meses móviles)" :value="monedaCorta(ind.mat)" :delta="ind.crecimiento"
        delta-label="vs PYMAT" :nota="`${ind.periodo} · PYMAT ${monedaCorta(ind.pymat)} (${ind.periodoPy})`" />
      <KpiTile label="Crecimiento MAT" :value="delta(ind.crecimiento) || '—'" :nota="`Diferencia ${monedaCorta(ind.mat - ind.pymat)}`" />
      <KpiTile label="Cobranza MAT" :value="monedaCorta(ind.matCob)" :delta="ind.crecimientoCob" delta-label="vs PYMAT"
        :nota="`PYMAT ${monedaCorta(ind.pymatCob)}`" ir="Ver cobranza" @click="store.irA('cobranza')" />
    </div>

    <q-banner v-if="avisoAnticipos" rounded dense class="aviso">
      <template #avatar><q-icon name="info" color="orange-9" /></template>
      Hay <b>{{ monedaCorta(anticiposResumen.total) }}</b> en facturas de anticipo que contabilidad aún no aplica a venta
      ({{ anticiposResumen.facturas }} facturas). El MAT de venta no las incluye hasta su fecha de aplicación, así que puede verse
      una caída aunque el trabajo sí se facturó y se cobró (compárese con la cobranza MAT).
      <template #action><q-btn flat dense no-caps color="primary" label="Ver anticipos" @click="store.irA('facturacion')" /></template>
    </q-banner>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-cabecera">
        <div>
          <div class="tarjeta-titulo">Crecimiento mensual: MoM e YoY</div>
          <div class="tarjeta-sub">
            MoM = (mes − mes anterior) ÷ mes anterior × 100 · YoY = (mes − mismo mes del año pasado) ÷ mismo mes del año pasado × 100.
            En Turbomáquinas el MoM brinca mucho por contratos grandes; el YoY y el MAT dicen más de la tendencia.
          </div>
        </div>
        <q-select v-model="mesElegido" :options="ind.opcionesMes" emit-value map-options dense outlined label="Mes" style="min-width: 170px" />
      </div>
      <div v-if="ind.mes.sinDatosDespues" class="kpi-ref q-mb-xs">
        <q-icon name="info" size="14px" /> La información llega hasta {{ ind.mes.sinDatosDespues }}; los meses posteriores salen en cero.
      </div>
      <div class="mes-kpis">
        <div v-for="b in [
          { k: 'vm', titulo: 'Ventas · MoM', v: ind.mes.ventas.valor, ref: ind.mes.ventas.prev, refLabel: ind.mes.labelPrev, d: ind.mes.ventas.mom },
          { k: 'vy', titulo: 'Ventas · YoY', v: ind.mes.ventas.valor, ref: ind.mes.ventas.py, refLabel: ind.mes.labelPy, d: ind.mes.ventas.yoy },
          { k: 'cm', titulo: 'Cobranza · MoM', v: ind.mes.cobranza.valor, ref: ind.mes.cobranza.prev, refLabel: ind.mes.labelPrev, d: ind.mes.cobranza.mom },
          { k: 'cy', titulo: 'Cobranza · YoY', v: ind.mes.cobranza.valor, ref: ind.mes.cobranza.py, refLabel: ind.mes.labelPy, d: ind.mes.cobranza.yoy },
        ]" :key="b.k" class="mes-kpi">
          <div class="mes-kpi-titulo">{{ b.titulo }}</div>
          <div class="mes-kpi-delta num" :class="b.d == null ? '' : b.d >= 0 ? 'txt-bien' : 'txt-mal'">
            <q-icon v-if="b.d != null" :name="b.d >= 0 ? 'arrow_upward' : 'arrow_downward'" size="18px" />{{ delta(b.d) || "—" }}
          </div>
          <div class="mes-kpi-nota">{{ ind.mes.label }}{{ ind.mes.enCurso ? " (en curso)" : "" }}: {{ monedaCorta(b.v) }} · {{ b.refLabel }}: {{ monedaCorta(b.ref) }}</div>
        </div>
      </div>
      <GraficaColumnas :labels="ind.tablaMensual.map((f) => f.label)" :bars="barrasMes" :lines="lineasMes" :height="230" clickable
        :seleccionado="11" @select="(i) => verMes(ind.tablaMensual[i])" />
      <div class="tabla-mes">
        <div class="mes-fila mes-fila--cab">
          <span>Mes</span><span class="der">Ventas</span><span class="der">MoM</span><span class="der">Mismo mes año ant.</span><span class="der">YoY</span>
          <span class="der">Cobranza</span><span class="der">YoY cobranza</span>
        </div>
        <div v-for="f in [...ind.tablaMensual].reverse()" :key="f.key" class="mes-fila" role="button" tabindex="0" title="Ver la facturación del mes por cliente"
          @click="verMes(f)" @keydown.enter="verMes(f)">
          <span>{{ f.label }}<span v-if="f.enCurso" class="kpi-ref"> (en curso)</span></span>
          <span class="der num">{{ moneda(f.ventas) }}</span>
          <span class="der num" :class="f.mom == null ? '' : f.mom >= 0 ? 'txt-bien' : 'txt-mal'">{{ delta(f.mom) || "—" }}</span>
          <span class="der num kpi-comp">{{ moneda(f.ventasPy) }}</span>
          <span class="der num" :class="f.yoy == null ? '' : f.yoy >= 0 ? 'txt-bien' : 'txt-mal'">{{ delta(f.yoy) || "—" }}</span>
          <span class="der num">{{ moneda(f.cobranza) }}</span>
          <span class="der num" :class="f.yoyCob == null ? '' : f.yoyCob >= 0 ? 'txt-bien' : 'txt-mal'">{{ delta(f.yoyCob) || "—" }}</span>
        </div>
      </div>
    </q-card>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">MAT móvil · últimos 24 meses</div>
      <div class="tarjeta-sub">
        Cada punto es la suma de los 12 meses que terminan ese mes. Si la línea sube, el negocio crece aunque un mes
        sea malo. El punto de hace 12 meses es el PYMAT. Si la cobranza va por debajo de la venta, la cartera crece.
      </div>
      <GraficaColumnas :labels="ind.serie.labels" :lines="lineasMat" :height="260" />
    </q-card>

    <q-card v-for="t in tableros" :key="t.key" flat bordered class="tarjeta">
      <div class="tarjeta-cabecera">
        <div class="tarjeta-titulo"><q-icon :name="t.icono" size="18px" class="q-mr-xs" />KPIs de {{ t.titulo }}</div>
        <div class="semaforo-resumen">
          <span v-for="r in resumenEstados(t.kpis)" :key="r.e" class="chip-riesgo">
            <q-icon :name="ESTADO[r.e].icon" size="16px" :style="{ color: ESTADO[r.e].color }" />
            <span>{{ r.n }} {{ ESTADO[r.e].label.toLowerCase() }}</span>
          </span>
        </div>
      </div>
      <div class="tabla-kpi">
        <div class="kpi-fila kpi-fila--cab">
          <span>Indicador</span><span class="der">Valor</span><span class="der">Variación</span><span>Comparativo</span><span>Referencia</span><span>Estado</span>
        </div>
        <div v-for="k in t.kpis" :key="k.key" class="kpi-fila" role="button" tabindex="0" :title="`Ir a la pestaña con el detalle`"
          @click="store.irA(k.ir)" @keydown.enter="store.irA(k.ir)">
          <span class="kpi-nombre">
            {{ k.nombre }}
            <q-icon name="info_outline" size="14px" class="kpi-info"><q-tooltip max-width="320px">{{ k.que }}</q-tooltip></q-icon>
          </span>
          <span class="der kpi-valor num">{{ k.valor }}</span>
          <span class="der num" :class="k.delta == null ? '' : k.estado === 'mal' ? 'txt-mal' : k.estado === 'bien' ? 'txt-bien' : 'txt-neutro'">{{ delta(k.delta) }}</span>
          <span class="kpi-comp">{{ k.comparativo }}</span>
          <span class="kpi-ref">{{ k.referencia }}</span>
          <span>
            <span v-if="k.estado" class="chip-riesgo">
              <q-icon :name="ESTADO[k.estado].icon" size="16px" :style="{ color: ESTADO[k.estado].color }" />
              <span>{{ ESTADO[k.estado].label }}</span>
            </span>
            <span v-else class="kpi-ref">Seguimiento</span>
          </span>
        </div>
      </div>
    </q-card>

    <div class="nota-metodo">
      MAT = últimos 12 meses completos ({{ ind.periodo }}); PYMAT = los 12 previos ({{ ind.periodoPy }}). Venta = facturado neto
      (anticipos en su fecha de aplicación). Las referencias son sugeridas para una empresa industrial B2B y se ajustan en
      <code>composables/indicadores.js</code> (UMBRALES). Con filtros de grupo/ATC/cliente todos los KPIs se recalculan;
      la meta solo aplica sin filtros.
    </div>

    <DetalleDialog v-model="abierto" v-bind="config" @fila="detalle.alElegirFila" />
  </div>
</template>

<style scoped src="../dashboard.css"></style>
<style scoped>
.kpis > :first-child { grid-column: span 2; }
.aviso { background: #fff8e1; color: #0b0b0b; font-size: 13px; }
.mes-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 4px 0 12px; }
.mes-kpi { border: 1px solid rgba(11, 11, 11, 0.1); border-radius: 8px; padding: 8px 12px; }
.mes-kpi-titulo { font-size: 12px; color: #52514e; }
.mes-kpi-delta { font-size: 22px; font-weight: 600; display: flex; align-items: center; gap: 2px; }
.mes-kpi-nota { font-size: 11px; color: #898781; }
.tabla-mes { margin-top: 10px; overflow-x: auto; }
.mes-fila { display: grid; grid-template-columns: 110px repeat(6, minmax(110px, 1fr)); gap: 10px; padding: 6px; font-size: 13px;
  border-bottom: 1px solid #f0efec; min-width: 820px; cursor: pointer; border-radius: 6px; }
.mes-fila:hover { background: rgba(11, 11, 11, 0.04); }
.mes-fila--cab { font-size: 11px; color: #898781; text-transform: uppercase; letter-spacing: 0.03em; cursor: default; }
.mes-fila--cab:hover { background: none; }
.semaforo-resumen { display: flex; gap: 14px; font-size: 12px; color: #52514e; }
.tabla-kpi { margin-top: 8px; overflow-x: auto; }
.kpi-fila {
  display: grid; grid-template-columns: minmax(200px, 1.6fr) 130px 80px minmax(170px, 1.5fr) minmax(160px, 1.3fr) 100px;
  gap: 12px; align-items: center; padding: 8px 6px; border-bottom: 1px solid #f0efec; font-size: 13px; color: #0b0b0b; min-width: 860px;
}
.kpi-fila:not(.kpi-fila--cab) { cursor: pointer; border-radius: 6px; }
.kpi-fila:not(.kpi-fila--cab):hover { background: rgba(11, 11, 11, 0.04); }
.kpi-fila--cab { font-size: 11px; color: #898781; text-transform: uppercase; letter-spacing: 0.03em; }
.der { text-align: right; }
.kpi-nombre { font-weight: 600; }
.kpi-info { color: #898781; margin-left: 2px; }
.kpi-valor { font-weight: 600; }
.kpi-comp { font-size: 12px; color: #52514e; }
.kpi-ref { font-size: 12px; color: #898781; }
.txt-bien { color: #006300; font-weight: 600; }
.txt-mal { color: #c62828; font-weight: 600; }
.txt-neutro { color: #52514e; font-weight: 600; }
</style>
