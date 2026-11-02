<script setup>
// Hitos de facturación programados de UNA fila del Gantt (va dentro del renglón desplegable).
// Cada hito = fecha estimada + monto (anticipo / estimación / finiquito). Si la fila no tiene hitos,
// el Gantt sigue usando su hito único de facturación al final del contrato.
import { computed, ref } from "vue";
import { useGanttContratosStore } from "@/stores/GanttContratosStore";
import DialogParcializar from "@/components/DialogParcializar.vue";

const props = defineProps({
  row: { type: Object, required: true },
  editable: { type: Boolean, default: false },
});

const store = useGanttContratosStore();
const { agregarHito, actualizarHito, eliminarHito, montoCorto, TIPOS_HITO } = store;

const dialogParcializar = ref(false);
const opcionesTipo = Object.entries(TIPOS_HITO).map(([value, label]) => ({ value, label }));
const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const hitos = computed(() => (Array.isArray(props.row.hitos) ? props.row.hitos : []));
const montoPedido = computed(() => (props.row.pedido_monto != null ? Number(props.row.pedido_monto) : null));
const total = computed(() => hitos.value.reduce((a, h) => a + (Number(h.monto) || 0), 0));
const diferencia = computed(() => (montoPedido.value == null ? null : montoPedido.value - total.value));
// Programado por año (ej. 2026: $60 M · 2027: $40 M).
const porAnio = computed(() => {
  const m = new Map();
  for (const h of hitos.value) {
    const a = String(h.fecha_programada || "").slice(0, 4) || "—";
    m.set(a, (m.get(a) || 0) + (Number(h.monto) || 0));
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
});

const dmy = (s) => {
  if (!s) return "—";
  const [y, mo, d] = String(s).slice(0, 10).split("-");
  return d && mo && y ? `${d}/${mo}/${y}` : s;
};
const finDeMes = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function guardar(h, campo, valor) {
  let v = valor;
  if (campo === "monto") v = valor === "" || valor == null ? null : Math.round(Number(valor) * 100) / 100;
  if ((h[campo] ?? null) === (v ?? null)) return;
  actualizarHito(props.row.id, h.id, { [campo]: v });
}

// Nuevo hito: un mes después del último (o al fin del contrato / fin de mes actual), por lo que falte.
function nuevoHito() {
  const ultimo = hitos.value[hitos.value.length - 1];
  let fecha;
  if (ultimo?.fecha_programada) {
    const d = new Date(ultimo.fecha_programada.slice(0, 10) + "T00:00:00");
    fecha = iso(finDeMes(new Date(d.getFullYear(), d.getMonth() + 1, 1)));
  } else {
    fecha = props.row.fin ? String(props.row.fin).slice(0, 10) : iso(finDeMes(new Date()));
  }
  const restante = diferencia.value != null && diferencia.value > 0 ? Math.round(diferencia.value * 100) / 100 : null;
  agregarHito(props.row.id, {
    tipo: "ESTIMACION",
    concepto: `Estimación ${hitos.value.length + 1}`,
    fecha_programada: fecha,
    monto: restante,
  });
}
</script>

<template>
  <div class="hitos-fact">
    <div class="hitos-fact__head">
      <span class="hitos-fact__titulo">🧾 Hitos de facturación</span>
      <template v-if="hitos.length">
        <span v-for="[anio, monto] in porAnio" :key="anio" class="hitos-fact__anio">
          {{ anio }}: <b>{{ montoCorto(monto) || "$0" }}</b>
        </span>
      </template>
      <q-space />
      <template v-if="editable">
        <q-btn flat dense no-caps size="sm" color="primary" icon="call_split" label="Parcializar…" @click="dialogParcializar = true">
          <q-tooltip>Repartir el contrato en estimaciones (p. ej. lo de este año en N partes y el resto después)</q-tooltip>
        </q-btn>
      </template>
    </div>

    <table class="hitos-fact__tbl">
      <thead>
        <tr>
          <th style="width: 92px">Tipo</th>
          <th>Concepto</th>
          <th style="width: 88px">Factura</th>
          <th style="width: 118px; text-align: right">Monto</th>
          <th style="width: 88px">Cobro est.</th>
          <th style="width: 26px"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="h in hitos" :key="h.id">
          <td :class="{ 'hitos-fact__edit': editable }">
            <span class="hitos-fact__chip" :class="'hitos-fact__chip--' + (h.tipo || 'OTRO').toLowerCase()">
              {{ TIPOS_HITO[h.tipo] || h.tipo }}
            </span>
            <q-popup-edit v-if="editable" :model-value="h.tipo" v-slot="scope" @save="(v) => guardar(h, 'tipo', v)">
              <q-select :model-value="scope.value" :options="opcionesTipo" emit-value map-options dense options-dense autofocus
                @update:model-value="(v) => { scope.value = v; scope.set(); }" />
            </q-popup-edit>
          </td>
          <td :class="{ 'hitos-fact__edit': editable }">
            <span :class="{ 'hitos-fact__vacio': !h.concepto }">{{ h.concepto || "Sin concepto" }}</span>
            <span v-if="h.ot_numero" class="hitos-fact__ot">OT {{ h.ot_numero }}</span>
            <q-popup-edit v-if="editable" :model-value="h.concepto" v-slot="scope" @save="(v) => guardar(h, 'concepto', v)">
              <q-input :model-value="scope.value" dense autofocus label="Concepto" placeholder="Ej. Estimación 2 – desmontaje"
                style="min-width: 240px" @update:model-value="(v) => (scope.value = v)" @keyup.enter="scope.set" />
            </q-popup-edit>
          </td>
          <td :class="{ 'hitos-fact__edit': editable }">
            {{ dmy(h.fecha_programada) }}
            <q-popup-edit v-if="editable" :model-value="String(h.fecha_programada || '').slice(0, 10)" v-slot="scope"
              @save="(v) => guardar(h, 'fecha_programada', v)">
              <q-date :model-value="scope.value" @update:model-value="(v) => (scope.value = v)" mask="YYYY-MM-DD" today-btn />
              <div class="row justify-end q-gutter-sm q-mt-sm">
                <q-btn flat dense label="Cancelar" @click.stop="scope.cancel" />
                <q-btn flat dense color="primary" label="OK" @click.stop="scope.set" />
              </div>
            </q-popup-edit>
          </td>
          <td :class="{ 'hitos-fact__edit': editable }" style="text-align: right">
            <span :class="{ 'hitos-fact__vacio': h.monto == null }">{{ h.monto != null ? fmt.format(Number(h.monto)) : "Sin monto" }}</span>
            <q-popup-edit v-if="editable" :model-value="h.monto" v-slot="scope" @save="(v) => guardar(h, 'monto', v)">
              <q-input :model-value="scope.value" type="number" step="0.01" dense autofocus label="Monto" prefix="$"
                style="min-width: 180px" @update:model-value="(v) => (scope.value = v)" @keyup.enter="scope.set" />
            </q-popup-edit>
          </td>
          <td class="hitos-fact__cobro">{{ dmy(h.fecha_cobro_estim) }}</td>
          <td>
            <q-btn v-if="editable" flat dense round size="xs" icon="close" color="red-6" @click.stop="eliminarHito(row.id, h.id)">
              <q-tooltip>Quitar hito</q-tooltip>
            </q-btn>
          </td>
        </tr>
        <tr v-if="!hitos.length">
          <td colspan="6" class="hitos-fact__empty">
            Sin hitos: el Gantt usa un solo rombo de facturación al final del contrato.
          </td>
        </tr>
      </tbody>
      <tfoot v-if="hitos.length">
        <tr class="hitos-fact__total">
          <td colspan="3" style="text-align: right">Programado:</td>
          <td style="text-align: right">{{ fmt.format(total) }}</td>
          <td colspan="2"></td>
        </tr>
        <tr v-if="montoPedido != null" class="hitos-fact__total">
          <td colspan="3" style="text-align: right">Importe del pedido:</td>
          <td style="text-align: right">{{ fmt.format(montoPedido) }}</td>
          <td colspan="2">
            <span v-if="Math.abs(diferencia) < 0.01" class="hitos-fact__ok">✔ cuadra</span>
            <span v-else :class="diferencia > 0 ? 'hitos-fact__falta' : 'hitos-fact__sobra'">
              {{ diferencia > 0 ? "falta" : "sobra" }} {{ montoCorto(Math.abs(diferencia)) }}
            </span>
          </td>
        </tr>
      </tfoot>
    </table>

    <div v-if="editable" class="hitos-fact__add" @click.stop="nuevoHito">
      <q-icon name="add" size="14px" /> Añadir hito
    </div>

    <DialogParcializar v-if="editable" v-model="dialogParcializar" :row="row" />
  </div>
</template>

<style scoped>
.hitos-fact { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cfd3dc; font-size: 11px; color: #2b2f3a; }
.hitos-fact__head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.hitos-fact__titulo { font-weight: 700; font-size: 12px; color: #3b3f51; }
.hitos-fact__anio { background: #fff8e1; border: 1px solid #ffe082; border-radius: 10px; padding: 0 7px; color: #6d4c00; }
.hitos-fact__tbl { width: 100%; border-collapse: collapse; background: #fff; }
.hitos-fact__tbl th { text-align: left; font-weight: 600; color: #5b6170; background: #eef1f5; padding: 3px 6px; border-bottom: 1px solid #dde1e8; }
.hitos-fact__tbl td { padding: 3px 6px; border-bottom: 1px solid #eef0f3; white-space: nowrap; }
.hitos-fact__edit { cursor: pointer; }
.hitos-fact__edit:hover { background: #fffde7; }
.hitos-fact__chip { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 10px; font-weight: 700; color: #fff; background: #78909c; }
.hitos-fact__chip--anticipo { background: #8e6bb1; }
.hitos-fact__chip--estimacion { background: #f9a825; color: #3b2a00; }
.hitos-fact__chip--finiquito { background: #2e7d32; }
.hitos-fact__ot { margin-left: 6px; color: #1565c0; font-weight: 600; }
.hitos-fact__vacio { color: #9aa3b2; font-style: italic; }
.hitos-fact__cobro { color: #2e7d32; }
.hitos-fact__empty { color: #9aa3b2; font-style: italic; text-align: center; padding: 6px; }
.hitos-fact__total td { background: #f7f9fc; font-weight: 600; border-bottom: none; }
.hitos-fact__ok { color: #2e7d32; }
.hitos-fact__falta { color: #e65100; }
.hitos-fact__sobra { color: #c62828; }
.hitos-fact__add { display: inline-flex; align-items: center; gap: 3px; margin-top: 6px; padding: 2px 8px; background: #fff8e1; color: #6d4c00; border: 1px dashed #f9a825; border-radius: 4px; cursor: pointer; font-size: 11px; }
</style>
