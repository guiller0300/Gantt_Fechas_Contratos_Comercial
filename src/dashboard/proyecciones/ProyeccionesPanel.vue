<script setup>
// Proyecciones (pipeline comercial): cuánto hay en juego, cuánto se ha ganado, por factibilidad,
// por mes esperado y por cliente. Fuente: proyecciones_proyectos del año.
import { ref, computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useDashboardComercialStore } from "@/dashboard/stores/DashboardComercialStore";
import KpiTile from "@/dashboard/components/KpiTile.vue";
import GraficaColumnas from "@/dashboard/components/GraficaColumnas.vue";
import BarrasRanking from "@/dashboard/components/BarrasRanking.vue";
import DetalleDialog from "@/dashboard/components/DetalleDialog.vue";
import AvisosProyectos from "@/dashboard/proyecciones/AvisosProyectos.vue";
import { useDetalle, estadoProyecto } from "@/dashboard/composables/detalle";
import { moneda, MESES, monedaCorta, porcentaje, mesANumero } from "@/dashboard/composables/formato";

const store = useDashboardComercialStore();
const { anio, pipeActivo, pipelineTotal, pipelineGanado, pipelinePerdido, pipelineInicial, pipelinePorFactibilidad, proyFacturacion } =
  storeToRefs(store);
const { filtroCliente, filtroAtc, pipe, proys, loadingProyectos, proyectosCargados, atcsProyecciones } = storeToRefs(store);

// ---- Vista General / Por ATC ----
// "Por ATC" = la vista de Proyección General de un asesor; usa el filtro global de ATC, así que toda la
// pestaña (y el resto del dashboard) queda en ese ATC. "General" quita el filtro y compara a todos.
const vista = computed({
  get: () => (filtroAtc.value != null ? "atc" : "general"),
  set: (v) => {
    if (v === "general") filtroAtc.value = null;
    else if (filtroAtc.value == null) filtroAtc.value = atcsProyecciones.value[0]?.value ?? null;
  },
});
const posAtc = computed(() => atcsProyecciones.value.findIndex((a) => a.value === filtroAtc.value));
const atcActual = computed(() => atcsProyecciones.value[posAtc.value] || null);
const moverAtc = (paso) => {
  const lista = atcsProyecciones.value;
  if (!lista.length) return;
  const i = posAtc.value < 0 ? 0 : (posAtc.value + paso + lista.length) % lista.length;
  filtroAtc.value = lista[i].value;
};
// Detalle por proyecto (folio, unidad, máquina, clasificación): se pide al abrir esta pestaña.
onMounted(() => store.consultarProyectos());

// ---- Detalle de proyectos (mismo nivel que Proyección General, de todos los ATC o del filtrado) ----
const buscarProy = ref("");
const estadoProy = ref("todos"); // todos | Ganado | En proceso | Perdido
const clasifProy = ref(null);
const verNoSuman = ref(false);
const clasificaciones = computed(() => [...new Set(proys.value.map((p) => p.clasificacion).filter(Boolean))].sort());
const proyectosTabla = computed(() => {
  const q = buscarProy.value.trim().toLowerCase();
  return proys.value
    .map((p) => ({ ...p, estado: estadoProyecto(p), mesNum: mesANumero(p.mes) }))
    .filter((p) => verNoSuman.value || Number(p.activa_operaciones) === 1)
    .filter((p) => !filtroFact.value || (p.factibilidad || "Sin factibilidad") === filtroFact.value)
    .filter((p) => estadoProy.value === "todos" || p.estado === estadoProy.value)
    .filter((p) => !clasifProy.value || p.clasificacion === clasifProy.value)
    .filter((p) => !q || [p.folio, p.cliente, p.unidad, p.maquina, p.descripcion, p.atc_nombre, p.ganador, p.pedidos, p.ordenes]
      .some((v) => v && String(v).toLowerCase().includes(q)));
});
const totalTabla = computed(() => ({
  monto: proyectosTabla.value.reduce((s, p) => s + (Number(p.monto) || 0), 0),
  ganado: proyectosTabla.value.reduce((s, p) => s + (Number(p.monto_ganado) || 0), 0),
}));
const ESTADO_PROY = {
  Ganado: { color: "#0ca30c", icon: "emoji_events" },
  "En proceso": { color: "#2a78d6", icon: "hourglass_top" },
  Perdido: { color: "#d03b3b", icon: "cancel" },
};
const colsProyectos = [
  { name: "folio", label: "Folio", field: "folio", align: "left", sortable: true },
  { name: "cliente", label: "Cliente / unidad", field: "cliente", align: "left", sortable: true },
  { name: "descripcion", label: "Descripción", field: "descripcion", align: "left", sortable: true },
  { name: "atc", label: "ATC", field: "atc_nombre", align: "left", sortable: true },
  { name: "factibilidad", label: "Factibilidad", field: (p) => p.factibilidad_descripcion || p.factibilidad, align: "left", sortable: true },
  { name: "mes", label: "Mes", field: "mesNum", format: (v) => (v ? MESES[v - 1] : "—"), sortable: true },
  { name: "inicial", label: "Inicial", field: (p) => Number(p.monto_inicial), format: moneda, sortable: true },
  { name: "ajustado", label: "Ajustado", field: (p) => Number(p.monto), format: moneda, sortable: true },
  { name: "estado", label: "Estado", field: "estado", align: "left", sortable: true },
  { name: "ganado", label: "Ganado", field: (p) => Number(p.monto_ganado), format: moneda, sortable: true },
  { name: "liga", label: "Pedido / OT", field: (p) => [p.pedidos, p.ordenes].filter(Boolean).join(" · "), align: "left" },
];

// ---- Totales por factibilidad (mismo cuadro que Proyección General, pero de todos los ATC) ----
// % ganado = monto ganado ÷ monto ajustado (igual que Totales.vue de Proyección General).
const totalesFactibilidad = computed(() => {
  const filas = pipelinePorFactibilidad.value.map((f) => ({ ...f, pct: f.monto > 0 ? f.monto_ganado / f.monto : null }));
  const suman = filas.filter((f) => f.activa);
  const t = (c) => suman.reduce((s, f) => s + (Number(f[c]) || 0), 0);
  const total = { key: "total", descripcion: "Total (las que suman)", monto_inicial: t("monto_inicial"), monto: t("monto"),
    monto_ganado: t("monto_ganado"), proyectos: t("proyectos"), activa: true };
  total.pct = total.monto > 0 ? total.monto_ganado / total.monto : null;
  return { filas, total };
});

// ---- Comparativo por ATC: lo que Proyección General no puede mostrar (ahí se ve un ATC a la vez) ----
// Conversión = proyectos ganados ÷ captados (lead = factibilidad que suma o cancelada 'X'; '→' cuenta el año siguiente).
const porAtc = computed(() => {
  const m = new Map();
  for (const p of pipe.value) {
    const suma = Number(p.activa_operaciones) === 1;
    if (!suma && p.factibilidad !== "X") continue;
    if (filtroFact.value && (p.factibilidad || "Sin factibilidad") !== filtroFact.value) continue;
    const k = p.atc_id ?? "sin";
    if (!m.has(k)) m.set(k, { key: k, atc: p.atc_nombre || "Sin ATC", leads: 0, ganados: 0, inicial: 0, ajustado: 0, ganado: 0, perdido: 0, clientes: new Set() });
    const a = m.get(k);
    const n = Number(p.proyectos) || 0;
    a.leads += n;
    a.clientes.add(p.cliente_id);
    if (Number(p.ganado) === 1) a.ganados += n;
    // Montos solo de lo que suma (las canceladas cuentan como lead, no como pipeline).
    if (suma) {
      a.inicial += Number(p.monto_inicial) || 0;
      a.ajustado += Number(p.monto) || 0;
      a.ganado += Number(p.monto_ganado) || 0;
      a.perdido += Number(p.monto_perdido) || 0;
    }
  }
  return [...m.values()]
    .map((a) => ({ ...a, clientes: a.clientes.size, conversion: a.leads ? a.ganados / a.leads : null,
      pctGanado: a.ajustado > 0 ? a.ganado / a.ajustado : null, enProceso: Math.max(0, a.ajustado - a.ganado - a.perdido) }))
    .sort((x, y) => y.ajustado - x.ajustado);
});
const maxAtc = computed(() => Math.max(1, ...porAtc.value.map((a) => a.ajustado)));
const elegirAtc = (a) => a.key !== "sin" && store.alternarAtc(a.key);
const pct1 = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const detalle = useDetalle(store);
const { abierto: dialogoAbierto, config } = detalle;

// Clic en una factibilidad (activa): la gráfica por mes y el ranking de clientes muestran solo esa.
const filtroFact = ref(null);
const elegirFactibilidad = (it) => {
  if (!it.activa) return;
  filtroFact.value = filtroFact.value === it.key ? null : it.key;
};
const pipeVista = computed(() => pipeActivo.value.filter((p) => !filtroFact.value || (p.factibilidad || "Sin factibilidad") === filtroFact.value));

// KPIs de arriba: siguen a la factibilidad elegida (sin elegir = todas las que suman).
const sumaVista = (campo) => pipeVista.value.reduce((s, p) => s + (Number(p[campo]) || 0), 0);
const kpi = computed(() => ({
  total: sumaVista("monto"), inicial: sumaVista("monto_inicial"), ganado: sumaVista("monto_ganado"), perdido: sumaVista("monto_perdido"),
}));
// Abierto = proyectos aún sin ganar ni perder (monto ajustado).
const abierto = computed(() =>
  pipeVista.value
    .filter((p) => Number(p.ganado) !== 1)
    .reduce((s, p) => s + (Number(p.monto) || 0) - (Number(p.monto_perdido) || 0), 0)
);
const etiquetaFact = computed(() => {
  const f = pipelinePorFactibilidad.value.find((x) => x.key === filtroFact.value);
  return f ? f.descripcion || `Factibilidad ${f.key}` : null;
});

const GANADO = "#1baf7a";
const ABIERTO = "#2a78d6";
const NO_ACTIVA = "#c3c2b7";
const PERDIDO = "#e8706a";

const porMes = computed(() => {
  const ganado = Array(12).fill(0), abierto = Array(12).fill(0), sinMes = { monto: 0 };
  for (const p of pipeVista.value) {
    const m = mesANumero(p.mes);
    const v = Number(p.monto) || 0;
    if (!m) { sinMes.monto += v; continue; }
    if (Number(p.ganado) === 1) ganado[m - 1] += v;
    else abierto[m - 1] += v;
  }
  return { ganado, abierto, sinMes: sinMes.monto };
});
const barras = computed(() => [
  { key: "g", label: "Ganado", color: GANADO, values: porMes.value.ganado, stack: "p" },
  { key: "a", label: "En proceso / no ganado", color: ABIERTO, values: porMes.value.abierto, stack: "p" },
]);

const itemsFactibilidad = computed(() =>
  pipelinePorFactibilidad.value.map((f) => ({
    key: f.key, activa: f.activa, label: f.descripcion ? `${f.key} · ${f.descripcion}` : `Factibilidad ${f.key}`,
    sub: `${f.proyectos} proyecto(s) · ganado ${monedaCorta(f.monto_ganado)}${f.activa ? "" : " · no suma (no activa en operaciones)"}`,
    // Color del catálogo (el mismo de Proyección General); las no activas en gris.
    segmentos: [{ key: "m", label: "Monto ajustado", value: f.monto, color: f.activa ? f.color || ABIERTO : NO_ACTIVA }],
  }))
);

const itemsClientes = computed(() => {
  const m = new Map();
  for (const p of pipeVista.value) {
    if (!m.has(p.cliente_id)) m.set(p.cliente_id, { key: p.cliente_id, label: p.cliente, ganado: 0, abierto: 0, n: 0 });
    const c = m.get(p.cliente_id);
    c.n += Number(p.proyectos) || 0;
    if (Number(p.ganado) === 1) c.ganado += Number(p.monto) || 0;
    else c.abierto += Number(p.monto) || 0;
  }
  return [...m.values()]
    .sort((a, b) => b.ganado + b.abierto - (a.ganado + a.abierto))
    .slice(0, 10)
    .map((c) => ({
      key: c.key, label: c.label, sub: `${c.n} proyecto(s)`,
      segmentos: [
        { key: "g", label: "Ganado", value: c.ganado, color: GANADO },
        { key: "a", label: "En proceso / no ganado", value: c.abierto, color: ABIERTO },
      ],
    }));
});

const proyectos = computed(() => pipeVista.value.reduce((s, p) => s + (Number(p.proyectos) || 0), 0));
</script>

<template>
  <div class="panel">
    <div class="vista-bar">
      <q-btn-toggle v-model="vista" dense no-caps unelevated toggle-color="primary" color="white" text-color="grey-9" class="toggle-borde"
        :options="[{ label: 'General (todos los ATC)', value: 'general', icon: 'groups' }, { label: 'Por ATC', value: 'atc', icon: 'person' }]" />
      <template v-if="vista === 'atc'">
        <q-btn flat round dense icon="chevron_left" :disable="atcsProyecciones.length < 2" @click="moverAtc(-1)"><q-tooltip>ATC anterior</q-tooltip></q-btn>
        <q-select v-model="filtroAtc" :options="atcsProyecciones" emit-value map-options dense outlined label="Agente técnico (ATC)" style="min-width: 300px">
          <template #option="o">
            <q-item v-bind="o.itemProps">
              <q-item-section>
                <q-item-label>{{ o.opt.label }}</q-item-label>
                <q-item-label caption>{{ o.opt.proyectos }} proyecto(s) · {{ monedaCorta(o.opt.monto) }} ajustado</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <q-btn flat round dense icon="chevron_right" :disable="atcsProyecciones.length < 2" @click="moverAtc(1)"><q-tooltip>ATC siguiente</q-tooltip></q-btn>
        <span v-if="atcActual" class="kpi-sub">{{ posAtc + 1 }} de {{ atcsProyecciones.length }} ATC</span>
      </template>
      <span v-else class="kpi-sub">{{ atcsProyecciones.length }} ATC con proyecciones en {{ anio }}</span>
      <q-space />
      <span class="kpi-sub">Factibilidad:</span>
      <q-btn-toggle :model-value="filtroFact" dense no-caps unelevated toggle-color="primary" color="white" text-color="grey-9" class="toggle-borde"
        :options="[{ label: 'Todas', value: null }, ...pipelinePorFactibilidad.filter((f) => f.activa).map((f) => ({ label: f.descripcion || f.key, value: f.key }))]"
        @update:model-value="(v) => (filtroFact = v)" />
    </div>

    <AvisosProyectos :factibilidad="filtroFact" />

    <div class="kpis">
      <KpiTile hero :label="`Pipeline ${anio}${etiquetaFact ? ` · ${etiquetaFact}` : ''} (monto proyectado)`" :value="monedaCorta(kpi.total)" :nota="`${proyectos} proyectos${etiquetaFact ? '' : ' que suman'} · monto ajustado (inicial ${monedaCorta(kpi.inicial)})`" />
      <KpiTile label="Ganado por TM" :value="monedaCorta(kpi.ganado)" :nota="`${porcentaje(kpi.total ? kpi.ganado / kpi.total : null, 1)} del monto ajustado (monto ganador)`" />
      <KpiTile label="En proceso" :value="monedaCorta(abierto)" nota="Sin ganar ni perder" />
      <KpiTile label="Perdido vs competencia" :value="monedaCorta(kpi.perdido)" nota="No ganado con ganador capturado" />
      <KpiTile label="Pipeline vs facturación proyectada" :value="porcentaje(proyFacturacion.cierre ? kpi.total / proyFacturacion.cierre : null)" nota="Cobertura: monto en proyecciones ÷ cierre estimado" />
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Pipeline por mes esperado</div>
      <q-chip v-if="filtroFact" removable dense color="blue-1" text-color="blue-9" icon="filter_alt" class="q-ml-none" @remove="filtroFact = null">
        Factibilidad {{ filtroFact }}
      </q-chip>
      <div class="tarjeta-sub">
        Mes capturado en la proyección. Clic en un mes para ver sus proyectos.
        <span v-if="porMes.sinMes">{{ monedaCorta(porMes.sinMes) }} sin mes definido (no se grafica).</span>
      </div>
      <GraficaColumnas :labels="MESES" :bars="barras" :height="260" clickable @select="(i) => detalle.pipelineMes(i + 1, mesANumero, filtroFact)" />
    </q-card>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Totales por factibilidad</div>
      <div class="tarjeta-sub">El mismo cuadro de Proyección General, de todos los ATC (o del que filtres). % ganado = ganado ÷ ajustado. Clic en una factibilidad para ver solo esa.</div>
      <div class="tf-tabla">
        <div class="tf-fila tf-cab"><span>Factibilidad</span><span class="der">Proyectos</span><span class="der">Monto inicial</span><span class="der">Monto ajustado</span><span class="der">Monto ganado</span><span class="der">% ganado</span></div>
        <div v-for="f in totalesFactibilidad.filas" :key="f.key" class="tf-fila" :class="{ 'tf-no-suma': !f.activa, 'tf-sel': filtroFact === f.key }"
          role="button" :tabindex="f.activa ? 0 : null" :title="f.activa ? 'Ver solo esta factibilidad' : 'No suma (no activa en operaciones)'"
          @click="elegirFactibilidad(f)" @keydown.enter="elegirFactibilidad(f)">
          <span class="tf-nombre"><span class="sw" :style="{ background: f.color || '#c3c2b7' }"></span>{{ f.descripcion || f.key }}<span v-if="!f.activa" class="kpi-sub"> · no suma</span></span>
          <span class="der num">{{ f.proyectos }}</span>
          <span class="der num">{{ moneda(f.monto_inicial) }}</span>
          <span class="der num">{{ moneda(f.monto) }}</span>
          <span class="der num">{{ moneda(f.monto_ganado) }}</span>
          <span class="der num">{{ pct1(f.pct) }}</span>
        </div>
        <div class="tf-fila tf-total">
          <span>{{ totalesFactibilidad.total.descripcion }}</span>
          <span class="der num">{{ totalesFactibilidad.total.proyectos }}</span>
          <span class="der num">{{ moneda(totalesFactibilidad.total.monto_inicial) }}</span>
          <span class="der num">{{ moneda(totalesFactibilidad.total.monto) }}</span>
          <span class="der num">{{ moneda(totalesFactibilidad.total.monto_ganado) }}</span>
          <span class="der num">{{ pct1(totalesFactibilidad.total.pct) }}</span>
        </div>
      </div>
    </q-card>

    <q-card v-if="vista === 'general'" flat bordered class="tarjeta">
      <div class="tarjeta-titulo">Comparativo por ATC</div>
      <div class="tarjeta-sub">Proyección General muestra un ATC a la vez; aquí se comparan todos. Clic en un ATC para filtrar todo el dashboard por él (y otra vez para quitarlo).</div>
      <div class="atc-tabla">
        <div class="atc-fila atc-cab">
          <span>ATC</span><span class="der">Clientes</span><span class="der">Proyectos</span><span>Monto ajustado</span>
          <span class="der">Ganado</span><span class="der">% ganado</span><span class="der">Perdido</span><span class="der">Conversión</span>
        </div>
        <div v-for="a in porAtc" :key="a.key" class="atc-fila atc-click" role="button" tabindex="0"
          :class="{ 'atc-sel': filtroAtc === a.key, 'atc-atenuada': filtroAtc != null && filtroAtc !== a.key }"
          @click="elegirAtc(a)" @keydown.enter="elegirAtc(a)">
          <span class="atc-nombre">{{ a.atc }}</span>
          <span class="der num">{{ a.clientes }}</span>
          <span class="der num">{{ a.leads }}</span>
          <span class="atc-barra-celda">
            <span class="atc-barra">
              <span class="seg" :style="{ width: (a.ganado / maxAtc) * 100 + '%', background: GANADO }"><q-tooltip>Ganado: {{ moneda(a.ganado) }}</q-tooltip></span>
              <span class="seg" :style="{ width: (a.enProceso / maxAtc) * 100 + '%', background: ABIERTO }"><q-tooltip>En proceso: {{ moneda(a.enProceso) }}</q-tooltip></span>
              <span class="seg" :style="{ width: (a.perdido / maxAtc) * 100 + '%', background: PERDIDO }"><q-tooltip>Perdido vs competencia: {{ moneda(a.perdido) }}</q-tooltip></span>
            </span>
            <span class="num atc-monto">{{ monedaCorta(a.ajustado) }}</span>
          </span>
          <span class="der num">{{ monedaCorta(a.ganado) }}</span>
          <span class="der num">{{ pct1(a.pctGanado) }}</span>
          <span class="der num">{{ monedaCorta(a.perdido) }}</span>
          <span class="der num">{{ pct1(a.conversion) }} <span class="kpi-sub">({{ a.ganados }}/{{ a.leads }})</span></span>
        </div>
      </div>
      <div class="atc-leyenda">
        <span><span class="sw" :style="{ background: GANADO }"></span>Ganado</span>
        <span><span class="sw" :style="{ background: ABIERTO }"></span>En proceso</span>
        <span><span class="sw" :style="{ background: PERDIDO }"></span>Perdido vs competencia</span>
      </div>
    </q-card>

    <div class="dos-col">
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Por factibilidad</div>
        <div class="tarjeta-sub">Colores del catálogo de Proyección General; en gris las que no suman (no activas en operaciones)</div>
        <BarrasRanking :items="itemsFactibilidad" clickable :seleccionado="filtroFact" accion="Clic para ver solo esta factibilidad" @select="elegirFactibilidad" />
      </q-card>
      <q-card flat bordered class="tarjeta">
        <div class="tarjeta-titulo">Clientes con más pipeline</div>
        <div class="tarjeta-sub">Top 10 por monto proyectado</div>
        <BarrasRanking :items="itemsClientes" clickable :seleccionado="filtroCliente" @select="(it) => store.alternarCliente(it.key)" :leyenda="[{ label: 'Ganado', color: GANADO }, { label: 'En proceso / no ganado', color: ABIERTO }]" />
      </q-card>
    </div>

    <q-card flat bordered class="tarjeta">
      <div class="tarjeta-cabecera">
        <div>
          <div class="tarjeta-titulo">Detalle de proyectos</div>
          <div class="tarjeta-sub">
            Proyecto por proyecto, como en Proyección General (clasificación, cliente, unidad, máquina). Respeta los filtros
            de arriba y la factibilidad elegida. Clic en un proyecto para filtrar el dashboard por su cliente.
          </div>
        </div>
      </div>
      <div class="row items-center q-gutter-sm q-mb-sm">
        <q-btn-toggle v-model="estadoProy" dense no-caps unelevated toggle-color="primary" color="white" text-color="grey-9" class="toggle-borde"
          :options="[{ label: 'Todos', value: 'todos' }, { label: 'En proceso', value: 'En proceso' }, { label: 'Ganados', value: 'Ganado' }, { label: 'Perdidos', value: 'Perdido' }]" />
        <q-select v-model="clasifProy" :options="clasificaciones" dense outlined clearable label="Clasificación" style="min-width: 200px" />
        <q-toggle v-model="verNoSuman" dense label="Incluir los que no suman (pasa próximo año / cancelados)" />
        <q-space />
        <q-input v-model="buscarProy" dense outlined clearable placeholder="Folio, cliente, unidad, descripción, pedido, OT…" style="width: 300px">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div v-if="loadingProyectos" class="carga-proy">
        <q-spinner-gears size="32px" color="primary" /> <span>Cargando proyectos…</span>
      </div>
      <template v-else>
        <div class="kpi-sub q-mb-xs">
          {{ proyectosTabla.length }} proyecto(s) · ajustado {{ moneda(totalTabla.monto) }} · ganado {{ moneda(totalTabla.ganado) }}
        </div>
        <q-table :rows="proyectosTabla" :columns="colsProyectos" row-key="proyecto_id" flat dense class="fila-click"
          :pagination="{ rowsPerPage: 15, sortBy: 'ajustado', descending: true }"
          :no-data-label="proyectosCargados ? 'Sin proyectos con estos filtros' : 'Abre la pestaña para cargar'"
          @row-click="(_, p) => store.alternarCliente(p.cliente_id)">
          <template #body-cell-folio="c">
            <q-td :props="c" class="num">{{ c.value }}</q-td>
          </template>
          <template #body-cell-cliente="c">
            <q-td :props="c">
              <div class="text-weight-medium">{{ c.row.cliente }}{{ c.row.unidad ? ` · ${c.row.unidad}` : "" }}</div>
              <div class="kpi-sub">{{ [c.row.clasificacion, c.row.maquina].filter(Boolean).join(" · ") }}</div>
            </q-td>
          </template>
          <template #body-cell-descripcion="c">
            <q-td :props="c" class="desc-celda">
              {{ c.value }}
              <q-tooltip v-if="c.row.observaciones" max-width="360px">{{ c.row.observaciones }}</q-tooltip>
            </q-td>
          </template>
          <template #body-cell-factibilidad="c">
            <q-td :props="c">
              <span class="tf-nombre"><span class="sw" :style="{ background: c.row.factibilidad_color ? `#${String(c.row.factibilidad_color).replace('#', '')}` : '#c3c2b7' }"></span>{{ c.value }}</span>
            </q-td>
          </template>
          <template #body-cell-estado="c">
            <q-td :props="c">
              <span class="chip-riesgo">
                <q-icon :name="ESTADO_PROY[c.value].icon" size="16px" :style="{ color: ESTADO_PROY[c.value].color }" />
                <span>{{ c.value }}<span v-if="c.value === 'Perdido' && c.row.ganador" class="kpi-sub"> · {{ c.row.ganador }}</span></span>
              </span>
            </q-td>
          </template>
        </q-table>
      </template>
    </q-card>

    <DetalleDialog v-model="dialogoAbierto" v-bind="config" @fila="detalle.alElegirFila" />
  </div>
</template>

<style scoped src="../dashboard.css"></style>
<style scoped>
.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: none; }
.kpi-sub { font-size: 11px; color: #898781; font-weight: 400; }
.der { text-align: right; }
.tf-tabla, .atc-tabla { overflow-x: auto; }
.tf-fila { display: grid; grid-template-columns: minmax(180px, 1.4fr) 80px repeat(3, minmax(120px, 1fr)) 80px; gap: 10px; align-items: center;
  padding: 7px 6px; font-size: 13px; border-bottom: 1px solid #f0efec; min-width: 760px; border-radius: 6px; }
.tf-fila:not(.tf-cab):not(.tf-total) { cursor: pointer; }
.tf-fila:not(.tf-cab):not(.tf-total):hover { background: rgba(11, 11, 11, 0.04); }
.tf-cab, .atc-cab { font-size: 11px; color: #898781; text-transform: uppercase; letter-spacing: 0.03em; }
.tf-nombre { display: flex; align-items: center; gap: 8px; }
.tf-no-suma { color: #898781; cursor: default !important; }
.tf-sel, .atc-sel { background: rgba(42, 120, 214, 0.08); }
.tf-total { font-weight: 600; border-top: 1px solid #c3c2b7; border-bottom: 0; }
.atc-fila { display: grid; grid-template-columns: minmax(200px, 1.4fr) 70px 80px minmax(220px, 2fr) 90px 80px 90px 120px; gap: 10px;
  align-items: center; padding: 7px 6px; font-size: 13px; border-bottom: 1px solid #f0efec; min-width: 1000px; border-radius: 6px; }
.atc-click { cursor: pointer; }
.atc-click:hover { background: rgba(11, 11, 11, 0.04); }
.atc-atenuada { opacity: 0.45; }
.atc-nombre { font-weight: 600; }
.atc-barra-celda { display: flex; align-items: center; gap: 8px; min-width: 0; }
.atc-barra { display: flex; gap: 2px; flex: 1; height: 12px; }
.atc-barra .seg { height: 100%; min-width: 0; }
.atc-barra .seg:last-child { border-radius: 0 4px 4px 0; }
.atc-monto { font-size: 12px; color: #52514e; white-space: nowrap; }
.atc-leyenda { display: flex; gap: 14px; font-size: 12px; color: #52514e; margin-top: 8px; }
.carga-proy { display: flex; align-items: center; gap: 10px; padding: 24px; color: #52514e; font-size: 13px; }
.toggle-borde { border: 1px solid #c3c2b7; border-radius: 4px; }
.desc-celda { min-width: 240px; max-width: 360px; white-space: normal; }
.vista-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.atc-leyenda > span { display: inline-flex; align-items: center; gap: 6px; }
</style>
