import { Notify} from 'quasar'

export const useGetNotify = () => {

    const showNotification = (texto, tipo, posicion, icono, tiempo) => {
        Notify.create({
          message: texto,
          type: tipo,
          position: posicion,
          icon: icono,
          timeout: tiempo
        })
    }

    return {
        showNotification,
    }
};
