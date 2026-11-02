import { createRouter, createWebHashHistory } from 'vue-router'
import { useGetConfiguracion } from '@/composables/getConfiguracion'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'contratos-gantt',
      component: () => import('../views/ContratosGanttView.vue')
    },
    // Dashboard Comercial y Cobranza: POR AHORA SOLO EN DESARROLLO (npm run dev). En el build de
    // producción esta ruta no existe y su código no se empaqueta, así que en TurboERP no se puede
    // abrir. Para liberarlo: quitar la condición import.meta.env.DEV (y que el host mande el permiso).
    ...(import.meta.env.DEV
      ? [{
          path: '/dashboard',
          name: 'dashboard-comercial',
          component: () => import('../dashboard/views/DashboardComercialView.vue'),
          // Información financiera: sin permiso, regresa al Gantt.
          beforeEnter: () => {
            const { permiso_dashboard_comercial } = useGetConfiguracion()
            return permiso_dashboard_comercial.value ? true : { name: 'contratos-gantt' }
          }
        }]
      : []),
    // Cualquier otra ruta (p. ej. #/dashboard en producción) regresa al Gantt.
    { path: '/:pathMatch(.*)*', redirect: { name: 'contratos-gantt' } }
  ]
})

export default router
