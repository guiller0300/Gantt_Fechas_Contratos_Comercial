import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  base: '/turboerpvue/comercial/gantt_contratos/',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // La librería local @turbomaquinas/vue-gantt está enlazada (symlink) vía "file:".
  // Excluirla del pre-bundling hace que cada rebuild de su dist se refleje con solo
  // recargar la página (sin tener que reiniciar el dev server con --force).
  optimizeDeps: {
    exclude: ['@turbomaquinas/vue-gantt'],
  },
})
