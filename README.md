# Gantt_Fechas_Contratos_Comercial

Proyecto en Vue 3 + Pinia + Quasar (Vite) para el seguimiento tipo Gantt de las
fechas de contratos del área Comercial.

## Requisitos

- Node.js `^20.19.0 || >=22.12.0`

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

### Preview de la build

```sh
npm run preview
```

## Notas

- La URL base de la API se resuelve en `src/composables/getConfiguracion.js`
  (mismo patrón que el resto de módulos del ERP).
- El `base` de Vite está configurado en `vite.config.js` como
  `/turboerpvue/comercial/gantt_contratos/`; ajústalo si la ruta de despliegue
  cambia.
