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
                "clave" : 'COM',
                "clave_depto_principal" : 'COM',
                "depto_principal_id": 5,
                "descripcion": "COMERCIAL",
            }
        }
    })

    /* PERMISOS */
    // Solo Jorge Morales (y quien tenga el permiso) puede editar el Gantt; los demás leen.
    const permiso_editar_gantt_contratos = computed(() => {
        try{
            return javaObj.permiso_editar_gantt_contratos
        }catch(e){
            return true; // en dev sin javaObj, permitir edición para pruebas
        }
    })

    // ATCs (asesores) cuyas filas puede EDITAR el usuario. Comercial se organiza por ATC.
    //   ['*']           => todos los ATC (usar con atcs_gantt_excluir para "los demás").
    //   [271, 235]      => solo esos ATC (ej. Claudia: Francisco López 271, Alberto García 235).
    // Ej. Jorge => atcs_gantt_editar ['*'] + atcs_gantt_excluir [271,235] (todos menos los de Claudia).
    const atcs_gantt_editar = computed(() => {
        try{
            return javaObj.atcs_gantt_editar
        }catch(e){
            return ['*']; // dev: todos
        }
    })
    const atcs_gantt_excluir = computed(() => {
        try{
            return javaObj.atcs_gantt_excluir
        }catch(e){
            return [];
        }
    })

    return {
        usuario,
        departamento,
        baseUrlAxios,
        permiso_editar_gantt_contratos,
        atcs_gantt_editar,
        atcs_gantt_excluir
    }
};
