<script setup>
// "Parcializar": reparte un monto del contrato en N estimaciones y, opcionalmente, deja el resto
// en otra fecha (ej. contrato de $100 M: $60 M este año en 3 estimaciones y $40 M en 2027).
// Al guardar REEMPLAZA los hitos actuales de la fila.
import { computed, ref, watch } from "vue";
import { useGanttContratosStore } from "@/stores/GanttContratosStore";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  row: { type: Object, required: true },
});
const emit = defineEmits(["update:modelValue"]);

const { reemplazarHitos, montoCorto } = useGanttContratosStore();
const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const montoRepartir = ref(null);
const partes = ref(3);
const primeraFecha = ref("");
const frecuencia = ref("mensual"); // mensual | quincenal | hastaFin
const prefijo = ref("Estimación");
const conResto = ref(false);
const fechaResto = ref("");
const guardando = ref(false);

const opcionesFrecuencia = [
  { label: "Mensual", value: "mensual" },
  { label: "Quincenal", value: "quincenal" },
  { label: "Repartir hasta el fin", value: "hastaFin" },
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const aFecha = (s) => (s ? new Date(String(s).slice(0, 10) + "T00:00:00") : null);
const finDeMes = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const dmy = (s) => { const [y, m, d] = String(s || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${y}` : "—"; };
// Suma meses conservando "fin de mes" si la fecha base lo es (31/01 -> 28/02 -> 31/03).
function sumarMeses(d, n) {
  const esFin = d.getDate() === finDeMes(d).getDate();
  const base = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return esFin ? finDeMes(base) : new Date(base.getFullYear(), base.getMonth(), Math.min(d.getDate(), finDeMes(base).getDate()));
}

const montoPedido = computed(() => (props.row.pedido_monto != null ? Number(props.row.pedido_monto) : null));

// Valores iniciales al abrir: todo el pedido, 3 partes mensuales desde fin del mes actual (o del inicio del contrato si es futuro).
watch(
  () => props.modelValue,
  (abierto) => {
    if (!abierto) return;
    montoRepartir.value = montoPedido.value;
    partes.value = 3;
    frecuencia.value = "mensual";
    prefijo.value = "Estimación";
    const hoy = new Date();
    const ini = aFecha(props.row.comienzo);
    primeraFecha.value = iso(finDeMes(ini && ini > hoy ? ini : hoy));
    conResto.value = false;
    const fin = aFecha(props.row.fin);
    fechaResto.value = iso(fin && fin.getFullYear() > hoy.getFullYear() ? fin : new Date(hoy.getFullYear() + 1, 0, 31));
  }
);

const resto = computed(() => {
  if (montoPedido.value == null || montoRepartir.value == null) return 0;
  return Math.round((montoPedido.value - Number(montoRepartir.value)) * 100) / 100;
});

// Hitos que se van a guardar (vista previa).
const propuesta = computed(() => {
  const n = Math.max(1, Math.min(60, parseInt(partes.value, 10) || 1));
  const total = Number(montoRepartir.value) || 0;
  const p0 = aFecha(primeraFecha.value);
  if (!p0) return [];
  // Montos: partes iguales a centavos; la última absorbe el redondeo.
  const base = Math.floor((total * 100) / n) / 100;
  const fechas = [];
  if (frecuencia.value === "hastaFin") {
    const fin = aFecha(props.row.fin);
    const dias = fin && fin > p0 ? Math.round((fin - p0) / 86400000) : 0;
    for (let i = 0; i < n; i++) {
      const d = new Date(p0);
      d.setDate(d.getDate() + (n > 1 ? Math.round((dias * i) / (n - 1)) : 0));
      fechas.push(d);
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (frecuencia.value === "quincenal") { const d = new Date(p0); d.setDate(d.getDate() + 15 * i); fechas.push(d); }
      else fechas.push(sumarMeses(p0, i));
    }
  }
  const lista = fechas.map((d, i) => ({
    tipo: "ESTIMACION",
    concepto: n > 1 ? `${prefijo.value} ${i + 1}` : prefijo.value,
    fecha_programada: iso(d),
    monto: i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base,
  }));
  if (conResto.value && resto.value > 0 && fechaResto.value) {
    lista.push({ tipo: "FINIQUITO", concepto: "Resto del contrato", fecha_programada: fechaResto.value.slice(0, 10), monto: resto.value });
  }
  return lista;
});
const totalPropuesta = computed(() => propuesta.value.reduce((a, h) => a + (Number(h.monto) || 0), 0));
const hitosActuales = computed(() => (Array.isArray(props.row.hitos) ? props.row.hitos.length : 0));

async function guardar() {
  if (!propuesta.value.length) return;
  guardando.value = true;
  try {
    if (await reemplazarHitos(props.row.id, propuesta.value)) emit("update:modelValue", false);
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="(v) => emit('update:modelValue', v)">
    <q-card style="width: 620px; max-width: 95vw">
      <q-card-section class="q-pb-sm">
        <div class="text-subtitle1 text-weight-bold">Parcializar facturación</div>
        <div class="text-caption text-grey-7">
          {{ row.cliente }} · Contrato {{ row.pedido_numero || "—" }}
          <template v-if="montoPedido != null"> · Importe {{ fmt.format(montoPedido) }}</template>
        </div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div class="parc-grid">
          <q-input v-model.number="montoRepartir" type="number" step="0.01" dense outlined prefix="$"
            label="Monto a repartir" hint="P. ej. lo que se factura este año" />
          <q-input v-model.number="partes" type="number" min="1" max="60" dense outlined label="Número de estimaciones" />
          <q-input v-model="primeraFecha" dense outlined label="Primera factura" mask="####-##-##">
            <template v-slot:append>
              <q-icon name="event" class="cursor-pointer">
                <q-popup-proxy cover><q-date v-model="primeraFecha" mask="YYYY-MM-DD" today-btn /></q-popup-proxy>
              </q-icon>
            </template>
          </q-input>
          <q-select v-model="frecuencia" :options="opcionesFrecuencia" emit-value map-options dense outlined label="Frecuencia" />
          <q-input v-model="prefijo" dense outlined label="Concepto" hint="Se numera: Estimación 1, 2…" />
        </div>

        <div v-if="montoPedido != null && resto > 0" class="parc-resto">
          <q-checkbox v-model="conResto" dense :label="`Agregar el resto (${montoCorto(resto)}) como otro hito`" />
          <q-input v-if="conResto" v-model="fechaResto" dense outlined label="Fecha del resto" mask="####-##-##" style="width: 170px">
            <template v-slot:append>
              <q-icon name="event" class="cursor-pointer">
                <q-popup-proxy cover><q-date v-model="fechaResto" mask="YYYY-MM-DD" today-btn /></q-popup-proxy>
              </q-icon>
            </template>
          </q-input>
        </div>

        <table class="parc-tbl">
          <thead><tr><th>Concepto</th><th>Factura</th><th style="text-align: right">Monto</th></tr></thead>
          <tbody>
            <tr v-for="(h, i) in propuesta" :key="i">
              <td>{{ h.concepto }}</td>
              <td>{{ dmy(h.fecha_programada) }}</td>
              <td style="text-align: right">{{ fmt.format(h.monto) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td colspan="2" style="text-align: right">Total</td><td style="text-align: right">{{ fmt.format(totalPropuesta) }}</td></tr>
          </tfoot>
        </table>
        <div v-if="hitosActuales" class="text-caption text-orange-9 q-mt-xs">
          Reemplaza los {{ hitosActuales }} hito(s) que tiene la fila.
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat no-caps label="Cancelar" @click="emit('update:modelValue', false)" />
        <q-btn color="primary" no-caps icon="save" :label="`Guardar ${propuesta.length} hito(s)`"
          :disable="!propuesta.length" :loading="guardando" @click="guardar" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.parc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.parc-resto { display: flex; align-items: center; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.parc-tbl { width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 12px; }
.parc-tbl th { text-align: left; background: #eef1f5; padding: 4px 8px; font-weight: 600; color: #5b6170; }
.parc-tbl td { padding: 3px 8px; border-bottom: 1px solid #eef0f3; }
.parc-tbl tfoot td { font-weight: 700; background: #f7f9fc; }
</style>
