import { ref, computed } from "vue";

export const useGetConfiguracion = () => {

    const baseUrlAxios = computed(() => {
        try{
            if(javaObj.springActiveProfile == 'dev'){
                return 'http://localhost:8181'
                //return 'http://192.168.20.58:8181'
            }else{
                return "http://192.168.100.18:8181"
            }
        }catch(e){
            return 'http://localhost:8181'
            //return 'http://192.168.20.56:8181'
        }
    })

    const usuario = computed(() => {
        try{
            return javaObj.usuario
        }catch(e){
            return {
                id: 132,
                nombre: 'ALFREDO',
                paterno: 'RANIREZ',
                materno: 'RODRIGUEZ',
                numero: 526,
                departamentos_id: 12
            }
        }
    });

    const departamento = computed(() => {
        try{
            return javaObj.departamento
        }catch(e){
            return {
                "id" : 5,
                "clave" : 'CO',
                "clave_depto_principal" : 'CO',
                "depto_principal_id": 5,
                "descripcion": "COMERCIAL",
            }
        }
    })

    /* PERMISOS (3 permisos, uno por grupo comercial, vía roles de Keycloak) */
    // Cada permiso es un booleano (sí/no) que corresponde a un rol de Keycloak:
    //   permiso_editar_gantt_cfe    <- ro_co_gantt_editar_cfe
    //   permiso_editar_gantt_pemex  <- ro_co_gantt_editar_pemex
    //   permiso_editar_gantt_varios <- ro_co_gantt_editar_varios
    // El frontend host los resuelve del token y los inyecta en javaObj. Una fila es editable
    // según su grupo_comercial (CFE / PEMEX / OTROS=Varios), que deriva el backend.
    const permiso_editar_gantt_cfe = computed(() => {
        try{ return !!javaObj.permiso_editar_gantt_cfe }catch(e){ return true; } // dev: permitido
    })
    const permiso_editar_gantt_pemex = computed(() => {
        try{ return !!javaObj.permiso_editar_gantt_pemex }catch(e){ return true; }
    })
    const permiso_editar_gantt_varios = computed(() => {
        try{ return !!javaObj.permiso_editar_gantt_varios }catch(e){ return true; }
    })

    // ¿Puede editar el Gantt (al menos un grupo)? Controla el botón/toggle Editar.
    const permiso_editar_gantt_contratos = computed(() =>
        permiso_editar_gantt_cfe.value || permiso_editar_gantt_pemex.value || permiso_editar_gantt_varios.value
    )

    return {
        usuario,
        departamento,
        baseUrlAxios,
        permiso_editar_gantt_contratos,
        permiso_editar_gantt_cfe,
        permiso_editar_gantt_pemex,
        permiso_editar_gantt_varios
    }
};
