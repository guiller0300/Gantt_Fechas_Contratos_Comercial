<script setup>
// Facturación: real vs meta vs proyección, acumulado al cierre, por grupo comercial / ATC,
// y los contratos del Gantt que faltan por facturar (segunda estimación, independiente de la recta).
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import KpiTile from "@/dashboard/components/KpiTile.vue";
import GraficaColumnas from "@/dashboard/components/GraficaColumnas.vue";
import BarrasRanking from "@/dashboard/components/BarrasRanking.vue";
import DetalleDialog from "@/dashboard/components/DetalleDialog.vue";
import { useDetalle } from "@/dashboard/composables/detalle";
import { MESES, moneda, monedaCorta, porcentaje, fechaCorta, COLOR_GRUPO, ETIQUETA_GRUPO } from "@/dashboard/composables/formato";

const store = useDashboardComercialStore();
const {
  anio, proyFacturacion, facturadoAnteriorMensual, metaAnual, metaMensual, porGrupo, porAtc,
  porFacturarContratos, desgloseAnio, anticiposPend, anticiposResumen, penalizacionesAnio, facturadoYtd, mesCorte,
  filtroGrupo, filtroAtc, ganttMensual, factibilidad1Mensual, factibilidad1PorGantt, etiquetaFactibilidadAlta,
} = storeToRefs(store);
const detalle = useDetalle(store);
const { abierto, config } = detalle;
// Clic en grupo / ATC: filtra todo el dashboard (clic otra vez lo quita).
const elegirAtc = (it) => it.key !== "sin" && store.alternarAtc(it.key);

const acumular = (arr) => {
  let s = 0;
  return arr.map((v) => (v == null ? null : (s += v)));
};

// Acumulado: real hasta hoy y, desde ahí, la proyección continúa la misma curva.
const acumulado = computed(() => {
  const real = acumular(proyFacturacion.value.real);
  const ultimo = real.filter((v) => v != null).pop() || 0;
  let s = ultimo;
  const proy = proyFacturacion.value.proyectado.map((v, i) => {
    if (v == null) return i === real.filter((x) => x != null).length - 1 ? ultimo : null;
    return (s += v);
  });
  const lineas = [
    { key: "real", label: `Real ${anio.value}`, color: "#2a78d6", values: real },
    { key: "proy", label: "Estimado estadístico", color: "#2a78d6", values: proy, dashed: true },
    { key: "ant", label: `${anio.value - 1}`, color: "#898781", values: acumular(facturadoAnteriorMensual.value) },
  ];
  if (metaMensual.value) lineas.push({ key: "meta", label: "Meta", color: "#0b0b0b", values: acumular(metaMensual.value), dashed: true });
  return lineas;
});

// Gráfica principal: lo que se facturó vs lo que comercial espera (Factibilidad 1) vs lo que ya tiene
// contrato con fecha en el Gantt. Columnas lado a lado por mes; sin la recta estadística (va aparte).
const barras = computed(() => [
  { key: "real", label: `Facturado neto ${anio.value}`, color: "#2a78d6", values: proyFacturacion.value.real },
  { key: "f1", label: `${etiquetaFactibilidadAlta.value} · fecha del Gantt`, color: "#1baf7a", values: factibilidad1PorGantt.value.conGantt, stack: "f1" },
  { key: "f1m", label: `${etiquetaFactibilidadAlta.value} · mes factible (sin Gantt)`, color: "#a8e3cc", values: factibilidad1PorGantt.value.sinGantt, stack: "f1" },
  { key: "gantt", label: "Contratos con pedido (Gantt, estimado)", color: "#eb6834", values: ganttMensual.value },
]);
const totalF1 = computed(() => factibilidad1Mensual.value.reduce((s, v) => s + v, 0));
// Lo que se grafica de Factibilidad 1 en el año (sin lo que el Gantt manda a otro año).
const totalF1Graficado = computed(() => [...factibilidad1PorGantt.value.conGantt, ...factibilidad1PorGantt.value.sinGantt].reduce((s, v) => s + v, 0));
const totalGanttAnio = computed(() => ganttMensual.value.reduce((s, v) => s + v, 0));

// Proyección estadística (aparte, solo referencia): real + recta de mínimos cuadrados.
const barrasEstadistica = computed(() => [
  { key: "real", label: `Facturado neto ${anio.value}`, color: "#2a78d6", values: proyFacturacion.value.real, stack: "a" },
  { key: "proy", label: "Estimado estadístico", color: "#9ec5f4", values: proyFacturacion.value.proyectado, stack: "a" },
]);
const lineasMes = computed(() => {
  const l = [{ key: "ant", label: `${anio.value - 1}`, color: "#898781", values: facturadoAnteriorMensual.value }];
  if (metaMensual.value) l.push({ key: "meta", label: "Meta mensual", color: "#0b0b0b", values: metaMensual.value, dashed: true });
  return l;
});

// Del bruto al neto (cada renglón con su signo; la barra muestra cuánto pesa sobre el bruto).
const desglose = computed(() => {
  const d = desgloseAnio.value;
  return [
    { key: "bruto", label: "Facturado bruto (subtotal)", value: d.bruto, signo: "" },
    { key: "descuento", label: "Descuento en factura", value: d.descuento, signo: "−" },
    { key: "nc_anticipo", label: "Notas de crédito por anticipo", value: d.nc_anticipo, signo: "−", nota: "el anticipo ya se facturó antes" },
    { key: "nc_otras", label: "Otras notas de crédito", value: d.nc_otras, signo: "−" },
    { key: "neto", label: "Facturado neto", value: d.neto, signo: "=", total: true },
  ];
});

const ESTADO_FF = { T: "Timbrada (con saldo)", L: "Liquidada" };
const colsAnticipos = [
  { name: "folio", label: "Factura", field: "folio", align: "left", sortable: true },
  { name: "cliente", label: "Cliente", field: "cliente", align: "left", sortable: true },
  { name: "atc", label: "ATC", field: "atc_nombre", align: "left", sortable: true },
  { name: "fecha", label: "Timbrado", field: "fecha_factura", format: fechaCorta, sortable: true },
  { name: "importe", label: "Importe sin IVA", field: (a) => Number(a.importe_mxn), format: moneda, sortable: true },
  { name: "saldo", label: "Saldo", field: (a) => Number(a.saldo_mxn), format: moneda, sortable: true },
  { name: "pago", label: "Último pago", field: "fecha_ultimo_pago", format: fechaCorta, sortable: true },
  { name: "estado", label: "Estado", field: (a) => ESTADO_FF[a.estado] || a.estado, align: "left", sortable: true },
];
const verAnticipos = ref(false);

const totalContratos = computed(() => porFacturarContratos.value.reduce((s, v) => s + v, 0));
const restanteLineal = computed(() => proyFacturacion.value.proyectado.reduce((s, v) => s + (v || 0), 0));

const itemsGrupo = computed(() =>
  porGrupo.value.map((g) => ({
    key: g.key, label: ETIQUETA_GRUPO[g.key] || g.key,
    segmentos: [{ key: "f", label: "Facturado neto", value: g.neto, color: COLOR_GRUPO[g.key] || "#898781" }],
  }))
);
const itemsAtc = computed(() =>
  porAtc.value.slice(0, 10).map((a) => ({
    key: a.key ?? "sin", label: a.nombre, sub: facturadoYtd.value ? `${porcentaje(a.neto / facturadoYtd.value)} del total` : "",
    segmentos: [{ key: "f", label: "Facturado neto", value: a.neto, color: "#2a78d6" }],
  }))
);
</script>

<template>
  <div class="panel">
    <div class="kpis">
      <KpiTile hero :label="`Facturado neto ${anio}`" :value="monedaCorta(facturadoYtd)"
        :nota="`Venta real a la fecha (anticipos en su fecha de aplicación)`" />
      <KpiTile :label="`${etiquetaFactibilidadAlta} del año`" :value="monedaCorta(totalF1)"
        :nota="factibilidad1PorGantt.listo ? `${factibilidad1PorGantt.nConGantt} en fecha del Gantt · ${factibilidad1PorGantt.nSinGantt} por mes factible` : 'Proyecciones de mayor factibilidad'"
        ir="Ver proyecciones" @click="store.irA('proyecciones')" />
      <KpiTile label="Contratos con pedido por facturar" :value="monedaCorta(totalContratos)"
        nota="Fechas del Gantt que faltan este año · estimado, puede moverse" />
      <KpiTile v-if="metaAnual" label="Meta anual" :value="monedaCorta(metaAnual)" :nota="`Faltan ${monedaCorta(Math.max(0, metaAnual - facturadoYtd))}`" />
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Del facturado bruto al neto · {{ anio }}</div>
      <div class="tarjeta-sub">Sin IVA, en MXN. Las penalizaciones (notas de crédito por sanción) van aparte: {{ moneda(penalizacionesAnio) }}.</div>
      <div v-for="r in desglose" :key="r.key" class="dg-fila" :class="{ 'dg-total': r.total }">
        <span class="dg-signo">{{ r.signo }}</span>
        <span class="dg-label">{{ r.label }}<span v-if="r.nota" class="dg-nota"> · {{ r.nota }}</span></span>
        <span class="dg-pista"><span class="dg-barra" :style="{ width: (desgloseAnio.bruto ? (r.value / desgloseAnio.bruto) * 100 : 0) + '%', background: r.total ? '#2a78d6' : r.signo === '−' ? '#e8706a' : '#9ec5f4' }"></span></span>
        <span class="dg-valor num">{{ moneda(r.value) }}</span>
        <span class="dg-pct num">{{ r.key === "bruto" ? "" : porcentaje(desgloseAnio.bruto ? r.value / desgloseAnio.bruto : null, 1) }}</span>
      </div>
    </q-card>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-cabecera">
        <div>
          <div class="tarjeta-titulo">Anticipos facturados que aún no son venta</div>
          <div class="tarjeta-sub">
            Facturas de anticipo (G, M, P, Q, H, J) sin fecha de aplicación: se suman a la venta cuando contabilidad aplica el
            anticipo (al liquidarse o al cierre del año). En {{ anio }} ya se aplicaron {{ monedaCorta(desgloseAnio.anticipo_aplicado) }}, incluidos en el neto.
          </div>
        </div>
        <q-btn flat dense no-caps color="primary" :icon="verAnticipos ? 'expand_less' : 'expand_more'" :label="verAnticipos ? 'Ocultar detalle' : 'Ver facturas'" @click="verAnticipos = !verAnticipos" />
      </div>
      <div class="ant-kpis">
        <div><div class="ant-label">Por aplicar</div><div class="ant-valor">{{ monedaCorta(anticiposResumen.total) }}</div><div class="ant-nota">{{ anticiposResumen.facturas }} factura(s) · sin IVA</div></div>
        <div><div class="ant-label">Ya liquidados sin aplicar</div><div class="ant-valor">{{ monedaCorta(anticiposResumen.liquidados) }}</div><div class="ant-nota">{{ anticiposResumen.facturasLiquidadas }} factura(s): candidatos a pasar a venta</div></div>
        <div><div class="ant-label">Saldo por cobrar de esos anticipos</div><div class="ant-valor">{{ monedaCorta(anticiposResumen.saldo) }}</div><div class="ant-nota">con IVA</div></div>
      </div>
      <q-slide-transition>
        <q-table v-show="verAnticipos" :rows="anticiposPend" :columns="colsAnticipos" row-key="id" flat dense class="q-mt-sm fila-click"
          :pagination="{ rowsPerPage: 10, sortBy: 'importe', descending: true }"
          @row-click="(_, a) => store.alternarCliente(a.cliente_id)">
          <template #top-right><span class="filtro-activo">Clic en una factura para filtrar por su cliente</span></template>
        </q-table>
      </q-slide-transition>
    </q-card>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Facturación mensual: facturado vs {{ etiquetaFactibilidadAlta }} vs contratos (Gantt)</div>
      <div class="tarjeta-sub">
        <b>Facturado</b> = venta real. <b>{{ etiquetaFactibilidadAlta }}</b> = proyecciones de mayor factibilidad,
        ubicadas en su fecha estimada de facturación del Gantt (si no están en el Gantt, en su mes factible). <b>Contratos</b> = filas del Gantt que ya tienen pedido, en su
        fecha estimada de facturación: es un estimado, el hito puede moverse y no garantiza la factura. Clic en un mes
        para ver el detalle por cliente; en la leyenda, para ocultar series.
      </div>
      <GraficaColumnas :labels="MESES" :bars="barras" :lines="lineasMes" :height="300" clickable @select="(i) => detalle.comparativoMes(anio, i + 1)" />
        <div v-if="factibilidad1PorGantt.listo" class="kpi-sub q-mt-xs">
          {{ etiquetaFactibilidadAlta }}: {{ factibilidad1PorGantt.nConGantt }} proyecto(s) ubicados en su fecha de facturación del Gantt
          (verde) y {{ factibilidad1PorGantt.nSinGantt }} sin Gantt en su mes factible (verde claro).
          <span v-if="factibilidad1PorGantt.otroAnio">{{ monedaCorta(factibilidad1PorGantt.otroAnio) }} tienen fecha del Gantt en otro año y no se grafican.</span>
        </div>
        <div v-else class="kpi-sub q-mt-xs">Cargando proyectos para ubicar la {{ etiquetaFactibilidadAlta }} en su fecha del Gantt…</div>
      <div class="resumen-series">
        <span><span class="sw" style="background: #2a78d6"></span>Facturado {{ moneda(facturadoYtd) }}</span>
        <span><span class="sw" style="background: #1baf7a"></span>{{ etiquetaFactibilidadAlta }} {{ moneda(totalF1Graficado) }}</span>
        <span><span class="sw" style="background: #eb6834"></span>Contratos (Gantt) {{ moneda(totalGanttAnio) }}</span>
      </div>
    </q-card>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Proyección estadística (solo referencia)</div>
      <q-banner dense rounded class="aviso-estimado">
        <template #avatar><q-icon name="functions" color="grey-8" /></template>
        Estimado matemático: recta de mínimos cuadrados sobre los últimos {{ proyFacturacion.mesesAjuste }} meses de venta.
        No considera contratos, proyecciones ni la fecha real de los anticipos; en Turbomáquinas la venta es por proyectos
        y brinca mucho, así que tómese solo como referencia de tendencia.
      </q-banner>
      <div class="est-stats">
        <div><div class="ant-label">Cierre estimado {{ anio }}</div><div class="ant-valor">{{ monedaCorta(proyFacturacion.cierre) }}</div>
          <div class="ant-nota">Rango {{ monedaCorta(proyFacturacion.cierreMin) }} – {{ monedaCorta(proyFacturacion.cierreMax) }}</div></div>
        <div><div class="ant-label">Ritmo actual × 12</div><div class="ant-valor">{{ monedaCorta(proyFacturacion.ritmo) }}</div>
          <div class="ant-nota">Promedio de meses completos, anualizado</div></div>
        <div><div class="ant-label">Tendencia mensual</div><div class="ant-valor">{{ proyFacturacion.tendenciaMensual >= 0 ? "+" : "" }}{{ monedaCorta(proyFacturacion.tendenciaMensual) }}</div>
          <div class="ant-nota">Pendiente de la recta por mes</div></div>
        <div v-if="metaAnual"><div class="ant-label">Brecha vs meta</div><div class="ant-valor">{{ monedaCorta(proyFacturacion.cierre - metaAnual) }}</div>
          <div class="ant-nota">Cierre estimado − meta</div></div>
      </div>
      <div class="dos-col">
        <div>
          <div class="tarjeta-sub">Mensual: real + estimado de los meses que faltan</div>
          <GraficaColumnas :labels="MESES" :bars="barrasEstadistica" :height="220" />
        </div>
        <div>
          <div class="tarjeta-sub">Acumulado del año vs año anterior y meta</div>
          <GraficaColumnas :labels="MESES" :lines="acumulado" :height="220" />
        </div>
      </div>
    </q-card>

    <div class="dos-col">
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Por grupo comercial</div>
        <div class="tarjeta-sub">Facturado neto {{ anio }} sin IVA · clic para filtrar el dashboard</div>
        <BarrasRanking :items="itemsGrupo" clickable :seleccionado="filtroGrupo" @select="(it) => store.alternarGrupo(it.key)" />
      </q-card>
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Por ATC (asesor)</div>
        <div class="tarjeta-sub">Según el ATC dueño del cliente en el catálogo · clic para filtrar el dashboard</div>
        <BarrasRanking :items="itemsAtc" clickable :seleccionado="filtroAtc" @select="elegirAtc" />
      </q-card>
    </div>

    <div class="nota-metodo">
      Facturado neto = subtotal − descuento de facturas finales y de varios timbradas (estado T/L) − notas de crédito
      timbradas (sin sanciones), por fecha de timbrado — salvo las facturas de anticipo (G, M, P, Q, H, J), que cuentan en su
      fecha de aplicación del anticipo, igual que comisiones —, en MXN (USD × tipo de cambio del documento). "Por anticipo" = nota
      de crédito sobre una factura final ligada a su anticipo, la misma compensación que resta la Consulta general de orden.
    </div>

    <DetalleDialog v-model="abierto" v-bind="config" @fila="detalle.alElegirFila" />
  </div>
</template>

<style scoped src="../dashboard.css"></style>
<style scoped>
.dg-fila { display: grid; grid-template-columns: 16px minmax(180px, 1.4fr) 1fr 130px 54px; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; color: #0b0b0b; }
.dg-total { border-top: 1px solid #c3c2b7; font-weight: 600; margin-top: 2px; padding-top: 8px; }
.dg-signo { color: #52514e; text-align: center; }
.dg-nota { color: #898781; font-size: 11px; font-weight: 400; }
.dg-pista { height: 10px; }
.dg-barra { display: block; height: 100%; min-width: 2px; border-radius: 0 4px 4px 0; }
.dg-valor { text-align: right; }
.dg-pct { text-align: right; color: #898781; font-size: 12px; }
.resumen-series { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: #52514e; margin-top: 6px; }
.resumen-series > span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.aviso-estimado { background: #f0efec; color: #0b0b0b; font-size: 12px; margin: 6px 0 10px; }
.est-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 8px; }
.ant-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 4px; }
.ant-label { font-size: 12px; color: #52514e; }
.ant-valor { font-size: 20px; font-weight: 600; color: #0b0b0b; }
.ant-nota { font-size: 11px; color: #898781; }
@media (max-width: 600px) { .dg-fila { grid-template-columns: 16px 1fr 110px; } .dg-pista, .dg-pct { display: none; } }
</style>
