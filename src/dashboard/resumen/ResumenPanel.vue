<script setup>
// Resumen ejecutivo: lo que dirección, comercial y contabilidad revisan primero.
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import KpiTile from "@/dashboard/components/KpiTile.vue";
import GraficaColumnas from "@/dashboard/components/GraficaColumnas.vue";
import DetalleDialog from "@/dashboard/components/DetalleDialog.vue";
import { useDetalle } from "@/dashboard/composables/detalle";
import { MESES, moneda, monedaCorta, porcentaje, fechaCorta } from "@/dashboard/composables/formato";

const store = useDashboardComercialStore();
const {
  anio, proyFacturacion, facturadoYtd, facturadoYtdAnterior, facturadoAnteriorMensual, metaAnual, metaMensual,
  proyCobranza, cobradoAnteriorMensual, mesCorte, carteraTotal, carteraVencida, dso, diasPagoPromedio,
  resumenClientes, cart, notasCreditoAnio, desgloseAnio, penalizacionesAnio, hayFiltro,
  ganttMensual, factibilidad1Mensual, factibilidad1PorGantt, etiquetaFactibilidadAlta, resumenAvisos, DIAS_AVISO,
} = storeToRefs(store);

const detalle = useDetalle(store);
const { abierto, config } = detalle;
// Factura vencida: filtra por su cliente y abre Cobranza con el detalle.
const verFactura = (r) => {
  store.alternarCliente(r.cliente_id);
  store.irA("cobranza");
};

const variacion = (a, b) => (b > 0 ? a / b - 1 : null);
const cobradoYtdAnterior = computed(() => cobradoAnteriorMensual.value.slice(0, mesCorte.value).reduce((s, v) => s + v, 0));

// Facturado vs lo que comercial espera (Factibilidad 1) vs contratos con pedido del Gantt (estimado).
const barras = computed(() => [
  { key: "real", label: `Facturado neto ${anio.value}`, color: "#2a78d6", values: proyFacturacion.value.real },
  { key: "f1", label: `${etiquetaFactibilidadAlta.value} · fecha del Gantt`, color: "#1baf7a", values: factibilidad1PorGantt.value.conGantt, stack: "f1" },
  { key: "f1m", label: `${etiquetaFactibilidadAlta.value} · mes factible (sin Gantt)`, color: "#a8e3cc", values: factibilidad1PorGantt.value.sinGantt, stack: "f1" },
  { key: "gantt", label: "Contratos con pedido (Gantt, estimado)", color: "#eb6834", values: ganttMensual.value },
]);
const lineas = computed(() => {
  const l = [{ key: "ant", label: `${anio.value - 1}`, color: "#898781", values: facturadoAnteriorMensual.value }];
  if (metaMensual.value) l.push({ key: "meta", label: "Meta mensual", color: "#0b0b0b", values: metaMensual.value, dashed: true });
  return l;
});

const vencidasGraves = computed(() =>
  cart.value.filter((r) => Number(r.dias_vencido) > 90).sort((a, b) => b.saldo_mxn - a.saldo_mxn).slice(0, 5)
);
const clientesRiesgo = computed(() => resumenClientes.value.filter((c) => c.riesgo === "alto"));
</script>

<template>
  <div class="panel">
    <div class="kpis">
      <KpiTile
        hero
        label="Facturado neto en el año (sin IVA)"
        :nota="`Bruto ${monedaCorta(desgloseAnio.bruto)} − descuentos ${monedaCorta(desgloseAnio.descuento)} − NC ${monedaCorta(desgloseAnio.nc_anticipo + desgloseAnio.nc_otras)}`"
        :value="monedaCorta(facturadoYtd)"
        :delta="variacion(facturadoYtd, facturadoYtdAnterior)"
        :delta-label="`vs ${MESES[0]}–${MESES[mesCorte - 1]} ${anio - 1}`"
        ir="Ver facturación"
        @click="store.irA('facturacion')"
      />
      <KpiTile
        v-if="metaAnual"
        label="Avance de la meta anual"
        :value="porcentaje(facturadoYtd / metaAnual)"
        :nota="`Meta ${monedaCorta(metaAnual)} · faltan ${monedaCorta(Math.max(0, metaAnual - facturadoYtd))}`"
      />
      <KpiTile
        label="Cobrado en el año"
        :value="monedaCorta(proyCobranza.ytd)"
        :delta="variacion(proyCobranza.ytd, cobradoYtdAnterior)"
        :delta-label="`vs mismo periodo ${anio - 1}`"
        ir="Ver cobranza"
        @click="store.irA('cobranza')"
      />
      <KpiTile
        label="Cartera por cobrar"
        :value="monedaCorta(carteraTotal)"
        :nota="`${porcentaje(carteraTotal ? carteraVencida / carteraTotal : null)} vencida (${monedaCorta(carteraVencida)})`"
        ir="Ver cobranza"
        @click="store.irA('cobranza')"
      />
      <KpiTile label="DSO (días de venta en cartera)" :value="dso != null ? `${dso} días` : '—'" nota="Cartera ÷ venta diaria de los últimos 3 meses"
        ir="Ver cobranza" @click="store.irA('cobranza')" />
      <KpiTile
        label="Días reales de pago"
        :value="diasPagoPromedio != null ? `${Math.round(diasPagoPromedio)} días` : '—'"
        nota="Promedio ponderado por importe: timbrado → último pago"
        ir="Ver comportamiento por cliente"
        @click="store.irA('clientes')"
      />
      <KpiTile
        :label="`Estimado estadístico de cierre ${anio}`"
        :value="monedaCorta(proyFacturacion.cierre)"
        :nota="`Solo referencia (recta sobre el histórico) · rango ${monedaCorta(proyFacturacion.cierreMin)} – ${monedaCorta(proyFacturacion.cierreMax)}`"
        ir="Ver proyección estadística"
        @click="store.irA('facturacion')"
      />
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Facturación mensual {{ anio }}: facturado vs {{ etiquetaFactibilidadAlta }} vs contratos (Gantt)</div>
      <div class="tarjeta-sub">
        Facturado = venta real · {{ etiquetaFactibilidadAlta }} = proyecciones de mayor factibilidad en su fecha de facturación del Gantt (o su mes factible si no están en el Gantt) ·
        Contratos = filas del Gantt con pedido en su fecha estimada de facturación (estimado, puede moverse).
        <span v-if="hayFiltro && !metaAnual">La meta es global: se oculta al filtrar.</span>
        Clic en un mes para ver qué clientes lo forman.
      </div>
      <GraficaColumnas :labels="MESES" :bars="barras" :lines="lineas" :height="280" clickable
        @select="(i) => detalle.comparativoMes(anio, i + 1)" />
        <div v-if="factibilidad1PorGantt.listo" class="kpi-sub q-mt-xs">
          {{ etiquetaFactibilidadAlta }}: {{ factibilidad1PorGantt.nConGantt }} proyecto(s) ubicados en su fecha de facturación del Gantt
          (verde) y {{ factibilidad1PorGantt.nSinGantt }} sin Gantt en su mes factible (verde claro).
          <span v-if="factibilidad1PorGantt.otroAnio">{{ monedaCorta(factibilidad1PorGantt.otroAnio) }} tienen fecha del Gantt en otro año y no se grafican.</span>
        </div>
        <div v-else class="kpi-sub q-mt-xs">Cargando proyectos para ubicar la {{ etiquetaFactibilidadAlta }} en su fecha del Gantt…</div>
    </q-card>

    <div class="dos-col">
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Facturas con más de 90 días vencidas</div>
        <div v-if="!vencidasGraves.length" class="vacio">Ninguna factura en ese rango.</div>
        <div v-for="r in vencidasGraves" :key="r.origen + r.id" class="foco foco--click" role="button" tabindex="0"
          title="Filtrar por este cliente y ver su cobranza" @click="verFactura(r)" @keydown.enter="verFactura(r)">
          <q-icon name="error" color="red-8" size="18px" />
          <div class="foco-txt">
            <div class="ellipsis"><b>{{ r.cliente }}</b> · {{ r.folio }}</div>
            <div class="foco-sub">{{ r.dias_vencido }} días · venció {{ fechaCorta(r.fecha_vencimiento) }}{{ r.fecha_cobro_estimada ? ` · compromiso ${fechaCorta(r.fecha_cobro_estimada)}` : " · sin fecha compromiso" }}</div>
          </div>
          <div class="foco-monto">{{ moneda(r.saldo_mxn) }}</div>
        </div>
      </q-card>
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Otros focos</div>
        <div class="foco foco--click" role="button" tabindex="0" title="Ver los avisos de proyecciones"
          @click="store.verAvisos()" @keydown.enter="store.verAvisos()">
          <q-icon name="notifications_active" :color="resumenAvisos.vencidos ? 'red-8' : 'orange-9'" size="18px" />
          <div class="foco-txt">
            <div><b>{{ resumenAvisos.total }}</b> proyección(es) sin contrato por vencer</div>
            <div class="foco-sub">{{ resumenAvisos.vencidos }} vencida(s) · {{ resumenAvisos.proximos }} en los próximos {{ DIAS_AVISO }} días</div>
          </div>
          <div class="foco-monto">{{ moneda(resumenAvisos.montoVencidos + resumenAvisos.montoProximos) }}</div>
        </div>
        <div class="foco foco--click" role="button" tabindex="0" title="Ver clientes y su riesgo"
          @click="store.irA('clientes')" @keydown.enter="store.irA('clientes')">
          <q-icon name="warning" color="orange-9" size="18px" />
          <div class="foco-txt">
            <div><b>{{ clientesRiesgo.length }}</b> cliente(s) con riesgo alto de cobranza</div>
            <div class="foco-sub ellipsis">{{ clientesRiesgo.slice(0, 4).map((c) => c.cliente).join(" · ") || "—" }}</div>
          </div>
        </div>
        <div class="foco">
          <q-icon name="receipt_long" color="grey-7" size="18px" />
          <div class="foco-txt">
            <div>Notas de crédito del año</div>
            <div class="foco-sub">Ya restadas del neto · {{ monedaCorta(desgloseAnio.nc_anticipo) }} por aplicación de anticipos</div>
          </div>
          <div class="foco-monto">{{ moneda(notasCreditoAnio) }}</div>
        </div>
        <div class="foco">
          <q-icon name="gavel" color="grey-7" size="18px" />
          <div class="foco-txt">
            <div>Penalizaciones / sanciones del año</div>
            <div class="foco-sub">Notas de crédito marcadas como sanción</div>
          </div>
          <div class="foco-monto">{{ moneda(penalizacionesAnio) }}</div>
        </div>
      </q-card>
    </div>

    <DetalleDialog v-model="abierto" v-bind="config" @fila="detalle.alElegirFila" />
  </div>
</template>

<style scoped src="../dashboard.css"></style>
