# Dashboard Comercial y Cobranza

Pantalla para **comercial y contabilidad**: facturación, cobranza, cartera, clientes y pipeline,
con **proyección lineal** al cierre del año. Ruta `#/dashboard` (misma SPA que el Gantt).

## Estructura (una carpeta por tema)

```
src/dashboard/
  views/        DashboardComercialView.vue  ← barra de filtros (año, grupo, ATC) + pestañas
  stores/       DashboardComercialStore.js  ← Pinia: carga, filtros y TODOS los cálculos
  composables/  formato.js (moneda, meses, rangos de antigüedad, colores)
                proyeccion.js (regresión lineal + cierre estimado)
  components/   GraficaColumnas.vue · BarrasRanking.vue · KpiTile.vue (compartidos, SVG/HTML sin librerías)
  resumen/      ResumenPanel.vue       ← KPIs ejecutivos + focos de atención
  indicadores/  IndicadoresPanel.vue   ← MAT vs PYMAT (venta y cobranza) + tablero de KPIs estándar con semáforo
  facturacion/  FacturacionPanel.vue   ← real vs meta vs proyección, acumulado, grupo/ATC, contratos por facturar
  cobranza/     CobranzaPanel.vue      ← antigüedad, DSO, flujo esperado 6 meses, facturas abiertas
  clientes/     ClientesPanel.vue      ← más deuda, más facturación, concentración, días reales de pago, riesgo
  ordenes/      OrdenesPanel.vue       ← embudo cotizado→autorizado→facturado, descuentos/cortesías, pendiente de facturar
  proyecciones/ ProyeccionesPanel.vue  ← pipeline por mes; Totales por factibilidad (= cuadro de Proyección General,
                                         todos los ATC); comparativo por ATC (conversión, % ganado, perdido); clientes
  mock/         datosDashboardMock.js  ← datos de ejemplo si el backend no responde
  dashboard.css                         ← estilos compartidos de los paneles
```

Para agregar un tema nuevo: carpeta `src/dashboard/<tema>/<Tema>Panel.vue`, sus cálculos en el
store y una `q-tab` + `q-tab-panel` en la vista.

## Interacción

- **Filtros globales** (barra superior): año, grupo, ATC y **cliente** (buscador). Aplican a todas las pestañas.
- **Clic = filtrar** (clic otra vez lo quita): cliente en cualquier ranking o tabla, grupo y ATC en Facturación.
- **Clic = detalle** (`components/DetalleDialog.vue` + `composables/detalle.js`): un mes de facturación, cobranza o
  pipeline, una columna del flujo de cobro o un rango de antigüedad abre las filas que forman ese número; clic en una
  fila del detalle filtra por ese cliente.
- **Leyendas**: clic en una serie la oculta o muestra (el eje se reajusta).
- **KPIs con flecha**: llevan a la pestaña con el detalle (la pestaña activa vive en el store, `irA`).
- Locales: factibilidad en Proyecciones, riesgo alto en Clientes, rango de años en Órdenes.
- **Proyecciones: General | Por ATC**. "Por ATC" (con flechas anterior/siguiente) = la vista de Proyección General de un
  asesor; usa el filtro global de ATC. "General" lo quita y muestra el comparativo entre ATC.

## Fuentes (backend :8181)

Nuevos, solo lectura (`WSDashboardComercial` → `JDBCDashboardComercial`), filas ya agregadas:

| Endpoint | Qué trae |
|---|---|
| `GET /comercial/dashboard/facturacion/anio/{anio}?desde=` | por mes × cliente: facturado (sin IVA), con IVA, notas de crédito, penalizaciones |
| `GET /comercial/dashboard/cobranza/anio/{anio}?desde=` | por mes × cliente: cobrado (efectivo) y compensado (sanción/compensación) |
| `GET /comercial/dashboard/cartera` | facturas abiertas (saldo > 0, timbradas) con vencimiento, días vencida y fecha compromiso de cobro |
| `GET /comercial/dashboard/dias-pago/anio/{anio}?desde=` | por cliente: días reales timbrado → último pago (ponderado) y % a tiempo |
| `GET /comercial/dashboard/ordenes?desde=` | órdenes abiertas: cotizado, pte. autorizar, autorizado, descuento, cortesías, neto, facturado, NC anticipo, pendiente de facturar (funciones de BD de la Consulta general de orden; se pide al abrir la pestaña) |
| `GET /comercial/dashboard/proyectos/anio/{anio}` | proyecciones a nivel proyecto: folio, descripción, unidad, máquina, clasificación/subclasificación, factibilidad, mes, montos (inicial, ajustado, ganado, perdido), ganador, pedidos y OTs ligadas (se pide al abrir Proyecciones) |
| `GET /comercial/dashboard/pipeline/anio/{anio}` | proyecciones por mes × cliente × factibilidad × ganado (ajustado, inicial, ganado = monto_ganador, perdido vs competencia) |

Existentes: `GET /comercial/proyectos-gantt/anio/{anio}` (contratos: monto, facturación y cobro
estimados) y `GET /comercial/indicador/meta-venta/anio/{anio}` (meta anual + % por trimestre).

## Reglas de cálculo

- **Fecha** de factura = fecha de timbrado. **MXN**: USD × tipo de cambio del documento.
- **Facturado neto** = subtotal − descuento − notas de crédito (facturas finales + varios, estado T/L; NC timbradas sin sanción).
  Desglose: bruto, descuento, NC por anticipo (NC sobre factura final ligada a su anticipo: `importe_anticipo`/`anticipo_relacionado`)
  y otras NC. Las sanciones van aparte como penalizaciones.
- **Facturas de anticipo** (G/M anticipo, P/Q segunda factura, H/J anticipo que se va pagando): NO son venta al timbrarse;
  cuentan en `fecha_aplicacion_anticipo` (la propia o, para G/M, la de la factura que las tiene en `anticipo_relacionado`),
  igual que comisiones (`recalculofactura`: "no es venta" sin fecha de aplicación). Contabilidad la captura al liquidarse
  o al cierre del año aunque haya saldo. Sin fecha = "anticipo por aplicar" (`GET /comercial/dashboard/anticipos-por-aplicar`).
  El DSO sí usa todo lo facturado por timbrado.
- **Proyecciones**: como Proyección General — `monto_ajustado` vigente, ganado = `monto_ganador` con `ganado_TMQ=1`,
  perdido = no ganado con `ganador` (competidor); solo suman factibilidades `activa_operaciones=1`; etiqueta/color del catálogo.
- **Cartera** = `saldo` de facturas timbradas (lo mantienen los SP de pagos). Vencimiento =
  `fecha_vencimiento` o timbrado + `clientes.dias_credito`.
- **DSO** = cartera ÷ (facturado con IVA de los últimos 3 meses completos ÷ 91).
- **Gráfica principal de facturación** (Resumen y Facturación): facturado neto vs **Factibilidad 1** (proyecciones de
  mayor factibilidad, monto ajustado, ubicada en la `fecha_facturacion_estim` del Gantt: liga por `proyecciones_proyectos_id`
  o por pedido; varias filas = reparto por monto del pedido; sin Gantt = su mes factible, serie aparte en verde claro;
  fecha del Gantt en otro año = no se grafica) vs **contratos del Gantt con pedido** (`pedidos_id`/`pedido_numero`)
  en su `fecha_facturacion_estim`. Las filas del Gantt sin pedido NO cuentan (ni aquí ni en el flujo de cobro): un hito
  de facturación sin contrato es intención, no venta; aun con pedido es estimado.
- **Avisos de proyecciones** (`proyecciones/AvisosProyectos.vue`, campana del encabezado, foco en Resumen y aviso al
  abrir una vez por sesión): proyectos que suman, sin pedido (ni propio ni en su fila del Gantt), no ganados ni perdidos,
  cuya fecha proyectada ya pasó (vencido) o llega en ≤ `DIAS_AVISO` = 7 días (por vencer). Fecha = facturación del Gantt;
  sin Gantt, el mes factible (aviso 7 días antes de que empiece; vencido al terminar). Acción sugerida: mover en el Gantt
  o actualizar mes/estatus en Proyección General (`/comercial/proyeccion-general#/proyeccion-general/atc`).
- **Proyección estadística** (tarjeta aparte en Facturación, "solo referencia"): mínimos cuadrados sobre los últimos 18
  meses completos; el mes en curso cuenta como real pero no entra al ajuste. Rango = ± error estándar × √meses restantes.
- **Flujo esperado**: por compromiso (fecha que captura cobranza, si no el vencimiento) o por
  historial (timbrado + días reales que ese cliente tarda en pagar). Suma contratos del Gantt cuya
  factura aún no sale.
- **Riesgo de cliente**: alto si debe algo con > 90 días o paga en más del doble de (crédito + 15);
  medio si > 30 días o paga después de crédito + 15.
- La **meta es global**: con filtro de grupo/ATC no se compara.
- **MoM / YoY** (pestaña Indicadores, mes elegible; por defecto el último completo): MoM = (mes − mes anterior) ÷ mes
  anterior × 100; YoY = (mes − mismo mes del año pasado) ÷ mismo mes del año pasado × 100. Tabla de 12 meses clicable.
- **MAT / PYMAT**: MAT = últimos 12 meses completos; PYMAT = los 12 previos. Por eso facturación y cobranza se cargan
  con `desde = año − 3` (la serie móvil de 24 meses necesita 36). KPIs y umbrales en `composables/indicadores.js`
  (`UMBRALES`, ajustables): crecimiento MAT, YTD, ticket promedio, clientes activos/nuevos/perdidos, retención,
  concentración top 5, tasa de conversión (proyectos ganados ÷ captados, por número y monto), conversión de
  cotizaciones (autorizado ÷ cotizado), tasa de éxito (ganado ÷ ganado+perdido), backlog en meses, descuentos+cortesías, índice de cobranza, DSO, rotación,
  % vencida, % > 90 días, días reales de pago, NC sobre venta, penalizaciones, anticipos por aplicar.

## Pendientes / a validar con contabilidad
- NC por anticipo: se identifican por la factura final que afectan; validar contra `DESCUENTO_NOTA_CREDITO_POR_ANTICIPO_A_FF_ORDEN`
  (su definición no está en el repo).
- Órdenes: consulta pesada (funciones por orden); si tarda, guardar el resultado o filtrar `?desde=` año de la orden.
- Permiso: el host debe inyectar `javaObj.permiso_dashboard_comercial` (rol Keycloak sugerido
  `ro_co_dashboard_acceso`) y una entrada de menú que abra `/index/#/dashboard`.
