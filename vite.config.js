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
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Apunta la librería a su CÓDIGO FUENTE (no al dist): así los cambios en
      // tmq-vue-gantt/src se reflejan en local con HMR, sin reconstruir el dist.
      // El `$` (match exacto) evita capturar el subpath '@turbomaquinas/vue-gantt/style.css'.
      { find: /^@turbomaquinas\/vue-gantt$/, replacement: fileURLToPath(new URL('../tmq-vue-gantt/src/index.js', import.meta.url)) },
    ],
  },
  // La librería local ya no se pre-empaqueta (se consume desde fuente).
  optimizeDeps: {
    exclude: ['@turbomaquinas/vue-gantt'],
  },
})
