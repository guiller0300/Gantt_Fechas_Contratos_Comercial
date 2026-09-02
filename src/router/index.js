import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'contratos-gantt',
      component: () => import('../views/ContratosGanttView.vue')
    }
  ]
})

export default router
