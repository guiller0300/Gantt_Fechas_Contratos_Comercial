import { ref, computed } from "vue";
import { defineStore } from "pinia";
import axios from "axios";
import { useGetNotify } from "@/composables/getNotify";

const { showNotification } = useGetNotify();

export const useContratosStore = defineStore("contratos", () => {
  // ==================== ESTADOS REACTIVOS ====================
  const contratos = ref([]);
  const loading = ref(false);
  const error = ref(null);
  const filtro = ref("");

  // ==================== ENDPOINTS DE CONSULTA ====================

  /**
   * Consultar los contratos del área comercial con sus fechas (Gantt)
   * @returns {Object} - { success, data } o { success, message }
   */
  const consultarContratos = async () => {
    loading.value = true;
    error.value = null;

    try {
      const response = await axios.get("/comercial/contratos/gantt");

      if (response.status === 200 && response.data) {
        contratos.value = response.data;

        return {
          success: true,
          data: response.data,
        };
      } else {
        const mensaje = "No se encontraron contratos";
        console.warn(mensaje);
        error.value = mensaje;

        return {
          success: false,
          message: mensaje,
        };
      }
    } catch (e) {
      console.error("Error al consultar contratos:", e);
      let mensajeError = "Error al consultar contratos";

      if (e.response?.status === 404) {
        mensajeError = "No hay contratos disponibles";
      } else if (e.response?.data?.message) {
        mensajeError = e.response.data.message;
      }

      error.value = mensajeError;
      showNotification(mensajeError, "negative", "top-right", "error", 3000);

      return {
        success: false,
        message: mensajeError,
        error: e.response?.data || e.message,
      };
    } finally {
      loading.value = false;
    }
  };

  /**
   * Refrescar la lista de contratos
   */
  const refrescarContratos = async () => {
    return await consultarContratos();
  };

  // ==================== COMPUTADOS ====================

  /**
   * Contratos filtrados por número, cliente o descripción
   */
  const contratosFiltrados = computed(() => {
    const txt = (filtro.value ?? "").toString();
    if (!txt.trim()) {
      return contratos.value;
    }

    const busqueda = txt.toLowerCase().trim();
    return contratos.value.filter(
      (contrato) =>
        contrato.numero?.toLowerCase().includes(busqueda) ||
        contrato.cliente?.toLowerCase().includes(busqueda) ||
        contrato.descripcion?.toLowerCase().includes(busqueda)
    );
  });

  /**
   * Total de contratos
   */
  const totalContratos = computed(() => contratos.value.length);

  /**
   * Limpiar filtro de búsqueda
   */
  const limpiarFiltro = () => {
    filtro.value = "";
  };

  return {
    // Estados
    contratos,
    loading,
    error,
    filtro,

    // Computados
    contratosFiltrados,
    totalContratos,

    // Acciones
    consultarContratos,
    refrescarContratos,
    limpiarFiltro,
  };
});
