// Drill-down del dashboard: arma la configuración de <DetalleDialog> (título, filas, columnas,
// totales) para lo que el usuario cliquea: un mes de facturación/cobranza/pipeline, una columna del
// flujo de cobro o un rango de antigüedad. Clic en una fila del diálogo = filtrar por ese cliente.
import { ref } from "vue";
import { MESES, moneda, fechaCorta, rangoDe } from "@/dashboard/composables/formato";

const num = (v) => Number(v) || 0;
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Suma filas por cliente. */
function porCliente(filas, campos) {
  const m = new Map();
  for (const f of filas) {
    if (!m.has(f.cliente_id)) {
      m.set(f.cliente_id, { key: f.cliente_id, cliente_id: f.cliente_id, cliente: f.cliente, atc_nombre: f.atc_nombre,
        grupo: f.grupo_comercial, ...Object.fromEntries(campos.map((c) => [c, 0])) });
    }
    const acc = m.get(f.cliente_id);
    for (const c of campos) acc[c] += num(f[c]);
  }
  return [...m.values()];
}

/** Estado de un proyecto como en Proyección General: ganado por TM, perdido (competidor capturado) o en proceso. */
export const estadoProyecto = (p) =>
  num(p.ganado) === 1 ? "Ganado" : num(p.monto_perdido) > 0 || String(p.ganador || "").trim() ? "Perdido" : "En proceso";

const col = (name, label, field, opts = {}) => ({ name, label, field, sortable: true, align: opts.align || "right", format: opts.format });
const COL_CLIENTE = [col("cliente", "Cliente", "cliente", { align: "left" }), col("atc", "ATC", "atc_nombre", { align: "left" })];
const AYUDA_CLIENTE = "Clic en un cliente para filtrar todo el dashboard por él";

export function useDetalle(store) {
  const abierto = ref(false);
  const config = ref({ titulo: "", filas: [], columnas: [] });

  const abrir = (c) => {
    config.value = { accionFila: AYUDA_CLIENTE, rowKey: "key", ...c };
    abierto.value = true;
  };

  // Fila cliqueada: filtra por ese cliente y cierra.
  const alElegirFila = (fila) => {
    if (fila.cliente_id == null) return;
    store.alternarCliente(fila.cliente_id);
    abierto.value = false;
  };

  const facturacionMes = (anio, mes) => {
    const filas = porCliente(store.fact.filter((f) => f.anio === anio && f.mes === mes),
      ["bruto", "descuento", "notas_credito", "neto", "anticipo_aplicado", "num_facturas"]);
    const t = (c) => filas.reduce((s, f) => s + f[c], 0);
    abrir({
      titulo: `Facturación de ${MESES_LARGOS[mes - 1]} ${anio}`,
      subtitulo: "Neto por cliente (sin IVA, MXN). Los anticipos cuentan en su fecha de aplicación.",
      filas, ordenarPor: "neto",
      columnas: [...COL_CLIENTE, col("bruto", "Bruto", "bruto", { format: moneda }), col("descuento", "Descuento", "descuento", { format: moneda }),
        col("nc", "Notas de crédito", "notas_credito", { format: moneda }), col("anticipo", "Anticipo aplicado", "anticipo_aplicado", { format: moneda }),
        col("neto", "Neto", "neto", { format: moneda }), col("facturas", "Facturas", "num_facturas")],
      totales: [{ label: "Neto", value: moneda(t("neto")) }, { label: "Clientes", value: String(filas.length) },
        { label: "Facturas", value: String(t("num_facturas")) }, { label: "Anticipos aplicados", value: moneda(t("anticipo_aplicado")) }],
    });
  };

  // Mes de la gráfica principal: qué forma cada serie (facturado por cliente, proyectos de Factibilidad 1
  // en su fecha del Gantt o mes factible, y contratos del Gantt con pedido).
  const comparativoMes = (anio, mes) => {
    const fact = porCliente(store.fact.filter((f) => f.anio === anio && f.mes === mes), ["neto"]).map((f) => ({
      key: `fac-${f.cliente_id}`, tipo: "Facturado", referencia: "—", cliente_id: f.cliente_id, cliente: f.cliente,
      atc_nombre: f.atc_nombre, descripcion: "Venta neta del mes", fecha: null, monto: f.neto }));
    const f1 = (store.factibilidad1PorGantt.detalle || []).filter((d) => d.mes === mes && d.anio === anio).map((d, i) => ({
      key: `f1-${d.proyecto_id}-${i}`, tipo: `${store.etiquetaFactibilidadAlta} · ${d.origen}`, referencia: d.folio,
      cliente_id: d.cliente_id, cliente: d.cliente, atc_nombre: d.atc_nombre, descripcion: d.descripcion, fecha: d.fecha || null, monto: d.parte }));
    const mm = String(mes).padStart(2, "0");
    const gantt = store.contratos.filter((r) => r.pedido_monto && String(r.fecha_facturacion_estim || "").startsWith(`${anio}-${mm}`)).map((r) => ({
      key: `g-${r.id}`, tipo: "Contrato Gantt (estimado)", referencia: r.pedido_numero ? `Pedido ${r.pedido_numero}` : `Gantt #${r.id}`,
      cliente_id: r.cliente_id, cliente: r.cliente, atc_nombre: r.atc_nombre, descripcion: r.ot_numero ? `OT ${r.ot_numero}` : "",
      fecha: r.fecha_facturacion_estim, monto: num(r.pedido_monto) }));
    const filas = [...fact, ...f1, ...gantt];
    const t = (xs) => xs.reduce((s, f) => s + num(f.monto), 0);
    abrir({
      titulo: `${MESES_LARGOS[mes - 1]} ${anio}: facturado vs ${store.etiquetaFactibilidadAlta} vs contratos`,
      subtitulo: "Qué forma cada barra del mes. Los contratos y la factibilidad son estimados.",
      filas, ordenarPor: "monto",
      columnas: [col("tipo", "Serie", "tipo", { align: "left" }), col("ref", "Referencia", "referencia", { align: "left" }), ...COL_CLIENTE,
        col("desc", "Descripción / OT", "descripcion", { align: "left" }), col("fecha", "Fecha estimada", "fecha", { format: fechaCorta }),
        col("monto", "Monto", "monto", { format: moneda })],
      totales: [{ label: "Facturado", value: moneda(t(fact)) }, { label: store.etiquetaFactibilidadAlta, value: moneda(t(f1)) },
        { label: "Contratos (Gantt)", value: moneda(t(gantt)) }],
    });
  };

  const cobranzaMes = (anio, mes) => {
    const filas = porCliente(store.cob.filter((f) => f.anio === anio && f.mes === mes), ["cobrado", "compensado", "num_pagos"]);
    const t = (c) => filas.reduce((s, f) => s + f[c], 0);
    abrir({
      titulo: `Cobranza de ${MESES_LARGOS[mes - 1]} ${anio}`,
      subtitulo: "Pagos timbrados por cliente (con IVA, MXN)",
      filas, ordenarPor: "cobrado",
      columnas: [...COL_CLIENTE, col("cobrado", "Cobrado", "cobrado", { format: moneda }),
        col("compensado", "Compensado / sanción", "compensado", { format: moneda }), col("pagos", "Pagos", "num_pagos")],
      totales: [{ label: "Cobrado", value: moneda(t("cobrado")) }, { label: "Clientes", value: String(filas.length) },
        { label: "Compensaciones", value: moneda(t("compensado")) }],
    });
  };

  const pipelineMes = (mes, mesANumero, factibilidad = null) => {
    const deFact = (p) => !factibilidad || (p.factibilidad || "Sin factibilidad") === factibilidad;
    // Con el detalle por proyecto cargado, se baja hasta el proyecto (como Proyección General).
    if (store.proyectosCargados) {
      const filas = store.proys
        .filter((p) => num(p.activa_operaciones) === 1 && mesANumero(p.mes) === mes && deFact(p))
        .map((p) => ({ key: p.proyecto_id, cliente_id: p.cliente_id, cliente: p.cliente, atc_nombre: p.atc_nombre, folio: p.folio,
          unidad: p.unidad, descripcion: p.descripcion, factibilidad: p.factibilidad_descripcion || p.factibilidad,
          estado: estadoProyecto(p), monto: num(p.monto), ganado: num(p.monto_ganado) }));
      return abrir({
        titulo: `Proyectos de ${MESES_LARGOS[mes - 1]}`,
        subtitulo: "Mes factible capturado en Proyección General (solo factibilidades que suman)",
        filas, ordenarPor: "monto",
        columnas: [col("folio", "Folio", "folio", { align: "left" }), ...COL_CLIENTE, col("unidad", "Unidad", "unidad", { align: "left" }),
          col("desc", "Descripción", "descripcion", { align: "left" }), col("fact", "Factibilidad", "factibilidad", { align: "left" }),
          col("estado", "Estado", "estado", { align: "left" }), col("monto", "Monto ajustado", "monto", { format: moneda }),
          col("ganado", "Monto ganado", "ganado", { format: moneda })],
        totales: [{ label: "Monto ajustado", value: moneda(filas.reduce((s, f) => s + f.monto, 0)) }, { label: "Proyectos", value: String(filas.length) }],
      });
    }
    const filas = store.pipeActivo
      .filter((p) => mesANumero(p.mes) === mes && deFact(p))
      .map((p, i) => ({ key: `${p.cliente_id}-${p.factibilidad}-${p.ganado}-${i}`, cliente_id: p.cliente_id, cliente: p.cliente,
        atc_nombre: p.atc_nombre, factibilidad: p.factibilidad_descripcion || p.factibilidad, estado: num(p.ganado) === 1 ? "Ganado" : num(p.monto_perdido) > 0 ? "Perdido" : "En proceso",
        proyectos: num(p.proyectos), monto: num(p.monto), ganado: num(p.monto_ganado) }));
    abrir({
      titulo: `Proyecciones de ${MESES_LARGOS[mes - 1]}`,
      subtitulo: "Mes factible capturado en Proyección General (solo factibilidades que suman)",
      filas, ordenarPor: "monto",
      columnas: [...COL_CLIENTE, col("fact", "Factibilidad", "factibilidad", { align: "left" }), col("estado", "Estado", "estado", { align: "left" }),
        col("proyectos", "Proyectos", "proyectos"), col("monto", "Monto ajustado", "monto", { format: moneda }), col("ganado", "Monto ganado", "ganado", { format: moneda })],
      totales: [{ label: "Monto ajustado", value: moneda(filas.reduce((s, f) => s + f.monto, 0)) },
        { label: "Proyectos", value: String(filas.reduce((s, f) => s + f.proyectos, 0)) }],
    });
  };

  const flujoColumna = (key, etiqueta) => {
    const filas = store.flujoEsperado.detalle[key] || [];
    abrir({
      titulo: `Cobro esperado · ${etiqueta}`,
      subtitulo: key === "atrasado" ? "Ya debió cobrarse y no tiene fecha nueva" : "Facturas y contratos que se esperan cobrar en ese mes",
      filas, ordenarPor: "monto",
      columnas: [col("folio", "Factura / contrato", "folio", { align: "left" }), ...COL_CLIENTE,
        col("criterio", "Criterio", "criterio", { align: "left" }), col("fecha", "Fecha esperada", "fecha", { format: fechaCorta }),
        col("monto", "Monto", "monto", { format: moneda })],
      totales: [{ label: "Total", value: moneda(filas.reduce((s, f) => s + num(f.monto), 0)) }, { label: "Documentos", value: String(filas.length) }],
    });
  };

  const antiguedadRango = (rango) => {
    const filas = store.cart
      .filter((r) => rangoDe(r.dias_vencido)?.key === rango.key)
      .map((r) => ({ key: r.origen + r.id, cliente_id: r.cliente_id, cliente: r.cliente, atc_nombre: r.atc_nombre, folio: r.folio,
        vence: r.fecha_vencimiento, dias: num(r.dias_vencido), saldo: num(r.saldo_mxn), compromiso: r.fecha_cobro_estimada }));
    abrir({
      titulo: `Cartera · ${rango.label}`,
      subtitulo: "Facturas abiertas en ese rango de antigüedad",
      filas, ordenarPor: "saldo",
      columnas: [col("folio", "Factura", "folio", { align: "left" }), ...COL_CLIENTE, col("vence", "Vence", "vence", { format: fechaCorta }),
        col("dias", "Días vencida", "dias"), col("saldo", "Saldo", "saldo", { format: moneda }),
        col("compromiso", "Compromiso de cobro", "compromiso", { format: fechaCorta })],
      totales: [{ label: "Saldo", value: moneda(filas.reduce((s, f) => s + f.saldo, 0)) }, { label: "Facturas", value: String(filas.length) }],
    });
  };

  return { abierto, config, alElegirFila, facturacionMes, comparativoMes, cobranzaMes, pipelineMes, flujoColumna, antiguedadRango, MESES };
}
