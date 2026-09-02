<script setup>
import { ref, onMounted, computed } from "vue";
import { storeToRefs } from "pinia";
import { useQuasar } from "quasar";
import { useContratosStore } from "@/stores/ContratosStore";

const $q = useQuasar();

// Store
const contratosStore = useContratosStore();
const { contratosFiltrados, loading, totalContratos, filtro } =
  storeToRefs(contratosStore);
const { consultarContratos, refrescarContratos, limpiarFiltro } =
  contratosStore;

// Estado local
const busqueda = ref("");

// Sincronizar búsqueda con el store (el botón "clear" del q-input envía null)
const actualizarFiltro = (valor) => {
  filtro.value = valor ?? "";
  if (valor === null) {
    busqueda.value = "";
  }
};

// Refrescar lista
const refrescar = async () => {
  await refrescarContratos();
};

// Total mostrado en el badge del header
const totalMostrado = computed(() => totalContratos.value);

// Cargar datos al montar
onMounted(async () => {
  limpiarFiltro();
  busqueda.value = "";

  $q.loading.show({
    message: "Cargando contratos...",
    spinnerColor: "primary",
    spinnerSize: 80,
    backgroundColor: "white",
    messageColor: "black",
  });

  try {
    await consultarContratos();
  } finally {
    $q.loading.hide();
  }
});
</script>

<template>
  <div class="contratos-container bg-white">
    <!-- Header característico -->
    <q-toolbar class="text-white" style="background-color: #3b3f51">
      <q-icon name="event_note" size="28px" class="q-mr-sm" />
      <q-toolbar-title>
        <span class="text-weight-bold">Gantt de Fechas de Contratos</span>
      </q-toolbar-title>
      <q-badge
        color="light-blue-1"
        class="q-ml-md text-black text-bold text-subtitle1 q-pa-sm"
      >
        {{ totalMostrado }} Contratos
      </q-badge>
    </q-toolbar>

    <!-- Barra de búsqueda y acciones -->
    <div class="header-section q-mb-md">
      <q-card-section class="q-pb-none">
        <div class="row q-gutter-md items-center">
          <div class="col-md-4 col-sm-12">
            <q-input
              v-model="busqueda"
              outlined
              dense
              placeholder="Buscar por contrato, cliente o descripción..."
              clearable
              @update:model-value="actualizarFiltro"
            >
              <template v-slot:prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
          <div class="col-auto">
            <q-btn
              color="primary"
              :loading="loading"
              @click="refrescar"
              outline
              no-caps
            >
              <q-icon name="refresh" class="q-mr-sm" />
              <span>Actualizar</span>
              <q-tooltip>Actualizar listado</q-tooltip>
            </q-btn>
          </div>
        </div>
      </q-card-section>
    </div>

    <!-- Contenido principal -->
    <div class="main-content q-pa-md">
      <!-- Estado vacío -->
      <div v-if="!loading && contratosFiltrados.length === 0" class="empty-state">
        <q-icon name="event_busy" size="80px" color="grey-5" />
        <div class="text-h6 text-grey-7 q-mt-md">
          {{ busqueda ? "No se encontraron contratos" : "No hay contratos" }}
        </div>
        <div class="text-caption text-grey-5">
          {{
            busqueda
              ? "Intenta con otra búsqueda"
              : "Los contratos aparecerán aquí"
          }}
        </div>
      </div>

      <!-- Aquí se integrará el componente de Gantt -->
      <div v-else class="gantt-placeholder">
        <q-banner class="bg-blue-1 text-blue-9 rounded-borders">
          <template v-slot:avatar>
            <q-icon name="timeline" color="blue-9" />
          </template>
          Espacio reservado para el diagrama de Gantt. Se recibieron
          <strong>{{ totalMostrado }}</strong> contrato(s) desde el store.
        </q-banner>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contratos-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header-section {
  flex-shrink: 0;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--q-grey-5) var(--q-grey-2);
}

.main-content::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-track {
  background: var(--q-grey-2);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb {
  background: var(--q-grey-5);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: var(--q-grey-6);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}
</style>
