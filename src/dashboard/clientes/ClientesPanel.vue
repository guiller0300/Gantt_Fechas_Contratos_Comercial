<script setup>
// Clientes: quién debe más, quién factura más, concentración y comportamiento real de pago.
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import KpiTile from "@/dashboard/components/KpiTile.vue";
import BarrasRanking from "@/dashboard/components/BarrasRanking.vue";
import { moneda, monedaCorta, porcentaje, COLOR_GRUPO, ETIQUETA_GRUPO } from "@/dashboard/composables/formato";

const store = useDashboardComercialStore();
const { anio, resumenClientes, topDeudores, topFacturacion, concentracionTop5, filtroCliente } = storeToRefs(store);
const elegirCliente = (it) => store.alternarCliente(it.key);
// Filtro local de la tabla por nivel de riesgo (se activa desde el KPI).
const filtroRiesgo = ref(null);
const alternarRiesgo = (r) => (filtroRiesgo.value = filtroRiesgo.value === r ? null : r);

const VENCIDO = "#d03b3b";
const POR_VENCER = "#2a78d6";

const itemsDeuda = computed(() =>
  topDeudores.value.map((c) => ({
    key: c.cliente_id, label: c.cliente, sub: `${c.facturas_abiertas} factura(s) · máx. ${c.max_dias_vencido} días vencida`,
    segmentos: [
      { key: "v", label: "Vencido", value: c.vencido, color: VENCIDO },
      { key: "p", label: "Por vencer", value: c.saldo - c.vencido, color: POR_VENCER },
    ],
  }))
);
const itemsFact = computed(() =>
  topFacturacion.value.map((c) => ({
    key: c.cliente_id, label: c.cliente,
    sub: c.variacion != null ? `${c.variacion >= 0 ? "+" : ""}${(c.variacion * 100).toFixed(0)}% vs ${anio.value - 1}` : `nuevo en ${anio.value}`,
    segmentos: [{ key: "f", label: ETIQUETA_GRUPO[c.grupo_comercial], value: c.facturado, color: COLOR_GRUPO[c.grupo_comercial] }],
  }))
);

const conRiesgo = computed(() => ({
  alto: resumenClientes.value.filter((c) => c.riesgo === "alto").length,
  medio: resumenClientes.value.filter((c) => c.riesgo === "medio").length,
}));
const deudaTop5 = computed(() => {
  const total = resumenClientes.value.reduce((s, c) => s + c.saldo, 0);
  const top = topDeudores.value.slice(0, 5).reduce((s, c) => s + c.saldo, 0);
  return total > 0 ? top / total : null;
});

const RIESGO = {
  alto: { label: "Alto", icon: "error", color: "#d03b3b" },
  medio: { label: "Medio", icon: "warning", color: "#c98500" },
  bajo: { label: "Bajo", icon: "check_circle", color: "#0ca30c" },
};

const buscar = ref("");
const filas = computed(() => {
  const q = buscar.value.trim().toLowerCase();
  return resumenClientes.value
    .filter((c) => !filtroRiesgo.value || c.riesgo === filtroRiesgo.value)
    .filter((c) => !q || `${c.cliente} ${c.atc_nombre}`.toLowerCase().includes(q));
});
const dias = (v) => (v == null ? "—" : `${Math.round(v)} d`);
const columnas = [
  { name: "cliente", label: "Cliente", field: "cliente", align: "left", sortable: true },
  { name: "grupo", label: "Grupo", field: (c) => ETIQUETA_GRUPO[c.grupo_comercial], align: "left", sortable: true },
  { name: "atc", label: "ATC", field: "atc_nombre", align: "left", sortable: true },
  { name: "facturado", label: `Facturado`, field: "facturado", format: moneda, sortable: true },
  { name: "cobrado", label: "Cobrado", field: "cobrado", format: moneda, sortable: true },
  { name: "saldo", label: "Saldo", field: "saldo", format: moneda, sortable: true },
  { name: "vencido", label: "Vencido", field: "vencido", format: moneda, sortable: true },
  { name: "credito", label: "Crédito", field: "dias_credito", format: (v) => `${v ?? 0} d`, sortable: true },
  { name: "dias_pago", label: "Paga en", field: "dias_pago", format: dias, sortable: true },
  { name: "a_tiempo", label: "A tiempo", field: "pct_a_tiempo", format: (v) => porcentaje(v), sortable: true },
  { name: "riesgo", label: "Riesgo", field: (c) => ({ alto: 3, medio: 2, bajo: 1 })[c.riesgo], sortable: true },
];
</script>

<template>
  <div class="panel">
    <div class="kpis">
      <KpiTile hero label="Concentración: top 5 clientes" :value="porcentaje(concentracionTop5)" :nota="`de lo facturado en ${anio}`" />
      <KpiTile label="Top 5 deudores" :value="porcentaje(deudaTop5)" nota="de la cartera total" />
      <KpiTile label="Clientes con riesgo alto" :value="String(conRiesgo.alto)" :nota="`${conRiesgo.medio} con riesgo medio`"
        :ir="filtroRiesgo === 'alto' ? 'Quitar filtro de riesgo' : 'Ver solo riesgo alto en la tabla'" @click="alternarRiesgo('alto')" />
      <KpiTile label="Clientes con movimiento" :value="String(resumenClientes.length)" nota="Facturaron, pagaron o deben" />
    </div>

    <div class="dos-col">
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Clientes con más deuda</div>
        <div class="tarjeta-sub">Saldo abierto en MXN · clic para filtrar el dashboard por el cliente</div>
        <BarrasRanking :items="itemsDeuda" clickable :seleccionado="filtroCliente" @select="elegirCliente" :leyenda="[{ label: 'Vencido', color: VENCIDO }, { label: 'Por vencer', color: POR_VENCER }]" />
      </q-card>
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Clientes con más facturación {{ anio }}</div>
        <div class="tarjeta-sub">Sin IVA · color por grupo comercial · clic para filtrar</div>
        <BarrasRanking :items="itemsFact" clickable :seleccionado="filtroCliente" @select="elegirCliente" :leyenda="Object.keys(COLOR_GRUPO).map((g) => ({ label: ETIQUETA_GRUPO[g], color: COLOR_GRUPO[g] }))" />
      </q-card>
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-cabecera">
        <div>
          <div class="tarjeta-titulo">Comportamiento por cliente</div>
          <div class="tarjeta-sub">
            "Paga en" = días reales de timbrado a último pago (ponderado por importe, facturas liquidadas).
            Riesgo alto: deuda con más de 90 días o paga en más del doble de crédito + 15 días de aceptación.
          </div>
        </div>
        <q-input v-model="buscar" dense outlined clearable placeholder="Cliente o ATC" style="width: 240px">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div v-if="filtroRiesgo" class="q-mb-sm">
        <q-chip removable dense color="red-1" text-color="red-9" icon="error" @remove="filtroRiesgo = null">Solo riesgo {{ filtroRiesgo }}</q-chip>
      </div>
      <q-table :rows="filas" :columns="columnas" row-key="cliente_id" flat dense class="fila-click"
        @row-click="(_, c) => store.alternarCliente(c.cliente_id)"
        :pagination="{ rowsPerPage: 15, sortBy: 'saldo', descending: true }">
        <template #body-cell-riesgo="p">
          <q-td :props="p">
            <span class="chip-riesgo" :style="{ color: RIESGO[p.row.riesgo].color }">
              <q-icon :name="RIESGO[p.row.riesgo].icon" size="16px" />
              <span style="color: #0b0b0b">{{ RIESGO[p.row.riesgo].label }}</span>
            </span>
          </q-td>
        </template>
        <template #body-cell-dias_pago="p">
          <q-td :props="p" class="num">
            <span :class="{ 'text-red-8 text-weight-bold': p.row.dias_pago != null && p.row.dias_pago > (Number(p.row.dias_credito) || 0) + 15 }">{{ p.value }}</span>
          </q-td>
        </template>
      </q-table>
    </q-card>
  </div>
</template>

<style scoped src="../dashboard.css"></style>
