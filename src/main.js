import 'quasar/dist/quasar.sass'
import '@turbomaquinas/vue-gantt/style.css'
import axios from "axios";
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { Quasar } from 'quasar'
import quasarUserOptions from './quasar-user-options'
import { useGetConfiguracion } from '@/composables/getConfiguracion'

const app = createApp(App).use(Quasar, quasarUserOptions)

app.use(createPinia(), axios)
app.use(router)

app.mount('#app')

const { baseUrlAxios } = useGetConfiguracion();
axios.defaults.baseURL = baseUrlAxios.value;
