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
    const permiso_contratos_editar = computed(() => {
        try{
            return javaObj.permiso_contratos_editar
        }catch(e){
            return false;
        }
    })

    return {
        usuario,
        departamento,
        baseUrlAxios,
        permiso_contratos_editar
    }
};
