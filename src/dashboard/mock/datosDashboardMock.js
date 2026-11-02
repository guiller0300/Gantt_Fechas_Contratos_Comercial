// Datos de EJEMPLO del Dashboard (solo se usan si el backend no responde, p. ej. sin reiniciar
// con los endpoints /comercial/dashboard). La vista lo marca con la etiqueta "datos de ejemplo".
// Generador determinista (misma semilla => mismos números) para que la pantalla no "baile".

const ATCS = [
  { atc_id: 271, atc_nombre: "JOSE FRANCISCO LOPEZ ORTIZ" },
  { atc_id: 34, atc_nombre: "HUGO OCEGUERA" },
  { atc_id: 99, atc_nombre: "EDUARDO MENDOZA" },
  { atc_id: 118, atc_nombre: "OSCAR ARELLANO" },
];

const CLIENTES = [
  ["C.G.T. LOS HUMEROS", "CFE", 0, 30], ["C.T. PLUTARCO ELIAS CALLES", "CFE", 0, 30], ["C.T. CARBON II", "CFE", 1, 30],
  ["C.C.C. TULA", "CFE", 1, 30], ["C.T. ALTAMIRA", "CFE", 2, 30], ["C.G. CERRO PRIETO", "CFE", 0, 30],
  ["C.T. MANZANILLO", "CFE", 3, 30], ["C.C.C. EL SAUZ", "CFE", 2, 30],
  ["PEMEX REFINACION SALINA CRUZ", "PEMEX", 1, 20], ["PEMEX REFINACION TULA", "PEMEX", 3, 20],
  ["PEMEX EXPLORACION Y PRODUCCION", "PEMEX", 1, 20], ["PEMEX CADEREYTA", "PEMEX", 3, 20],
  ["GRUPO MEXICO", "OTROS", 2, 30], ["IBERDROLA MEXICO", "OTROS", 2, 30], ["TERNIUM", "OTROS", 0, 20],
  ["CEMEX", "OTROS", 3, 30], ["ENEL GREEN POWER", "OTROS", 1, 0], ["ARCELORMITTAL", "OTROS", 2, 30],
  ["SIEMENS ENERGY", "OTROS", 0, 30], ["KIMBERLY CLARK", "OTROS", 3, 20],
];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const cliente = (i) => {
  const [nombre, grupo, atc, dias] = CLIENTES[i];
  return {
    cliente_id: 1000 + i, cliente: nombre, grupo_comercial: grupo, dias_credito: dias,
    giro: grupo === "OTROS" ? "INDUSTRIA" : "GENERACIÓN", ...ATCS[atc],
  };
};

const iso = (d) => d.toISOString().slice(0, 10);

export function generarMock(anio, hoy = new Date()) {
  const r = rng(anio * 7919);
  const facturacion = [], cobranza = [];
  const ultimoMes = (y) => (y < hoy.getFullYear() ? 12 : y > hoy.getFullYear() ? 0 : hoy.getMonth() + 1);
  // Peso de cada cliente (CFE pesa más) y estacionalidad (cierres de trimestre más altos).
  const peso = CLIENTES.map((c, i) => (c[1] === "CFE" ? 3 : c[1] === "PEMEX" ? 2 : 1) * (0.5 + r()) * (i < 3 ? 2 : 1));
  const estacional = [0.6, 0.8, 1.2, 0.8, 0.9, 1.25, 0.85, 0.9, 1.2, 1.0, 1.05, 1.4];
  for (let y = anio - 3; y <= anio; y++) {
    const crec = 1 + 0.09 * (y - (anio - 2));
    for (let m = 1; m <= ultimoMes(y); m++) {
      CLIENTES.forEach((_, i) => {
        if (r() < 0.45) return; // no todos los clientes facturan cada mes
        const facturado = Math.round(420000 * peso[i] * estacional[m - 1] * crec * (0.6 + r() * 0.8));
        const descuento = r() < 0.2 ? Math.round(facturado * 0.04) : 0;
        const nc_anticipo = r() < 0.12 ? Math.round(facturado * 0.3) : 0;
        const nc_otras = r() < 0.06 ? Math.round(facturado * 0.05) : 0;
        const pen = cliente(i).grupo_comercial !== "OTROS" && r() < 0.05 ? Math.round(facturado * 0.03) : 0;
        const anticipo_aplicado = r() < 0.15 ? Math.round(facturado * 0.5) : 0;
        facturacion.push({ anio: y, mes: m, ...cliente(i), bruto: facturado + descuento, descuento, facturado, anticipo_aplicado,
          nc_anticipo, nc_otras, notas_credito: nc_anticipo + nc_otras, neto: facturado - nc_anticipo - nc_otras,
          facturado_total: Math.round(facturado * 1.16), penalizaciones: pen, num_facturas: 1 + Math.floor(r() * 3) });
        // Cobro desfasado ~1-2 meses: se registra en el mes siguiente (si existe).
        const desfase = 1 + Math.floor(r() * 2);
        const mc = m + desfase, yc = y + (mc > 12 ? 1 : 0), mm = ((mc - 1) % 12) + 1;
        if (yc <= anio && mm <= ultimoMes(yc) && r() > 0.1) {
          cobranza.push({ anio: yc, mes: mm, ...cliente(i), cobrado: Math.round(facturado * 1.16 * (0.85 + r() * 0.15)),
            compensado: 0, num_pagos: 1 });
        }
      });
    }
  }

  const cartera = [];
  for (let k = 0; k < 64; k++) {
    const i = Math.floor(r() ** 1.6 * CLIENTES.length);
    const c = cliente(i);
    const diasAtras = Math.floor(r() ** 1.4 * 200);
    const ff = new Date(hoy); ff.setDate(ff.getDate() - diasAtras);
    const fv = new Date(ff); fv.setDate(fv.getDate() + (c.dias_credito || 0) + 15);
    const dias_vencido = Math.round((hoy - fv) / 86400000);
    const total = Math.round(150000 + r() * 2600000);
    const saldo = r() < 0.2 ? Math.round(total * (0.2 + r() * 0.5)) : total;
    let fecha_cobro_estimada = null;
    if (r() < 0.55) { const d = new Date(hoy); d.setDate(d.getDate() + Math.floor(r() * 120) - 10); fecha_cobro_estimada = iso(d); }
    cartera.push({
      origen: "FF", id: 9000 + k, folio: `${4100 + k}A`, moneda: r() < 0.15 ? "USD" : "MXN",
      saldo, saldo_mxn: saldo, total_mxn: total, fecha_factura: iso(ff), fecha_vencimiento: iso(fv), dias_vencido,
      fecha_cobro_estimada, cobro_indefinido: 0, cobro_negociacion: dias_vencido > 90 && r() < 0.5 ? 1 : 0,
      comentario_cobro: fecha_cobro_estimada ? "Compromiso de pago con el cliente" : null,
      fecha_ultimo_pago: saldo < total ? iso(new Date(hoy - 20 * 86400000)) : null, ...c,
    });
  }

  const diasPago = CLIENTES.map((_, i) => {
    const c = cliente(i);
    const base = (c.dias_credito || 0) + 15;
    const facturas = 4 + Math.floor(r() * 30);
    const dias = Math.round(base * (0.7 + r() * 1.3));
    return { ...c, facturas, importe_mxn: Math.round(facturas * 900000 * (0.5 + r())), dias_ponderados: dias,
      dias_promedio: dias - 3, a_tiempo: Math.round(facturas * Math.max(0.1, Math.min(1, 1.4 - dias / base / 1.2))) };
  });

  const factibilidades = [["A", 1], ["B", 1], ["C", 0], ["D", 0]];
  const pipeline = [];
  CLIENTES.forEach((_, i) => {
    for (let m = 1; m <= 12; m++) {
      if (r() < 0.75) continue;
      const [f, act] = factibilidades[Math.floor(r() * 4)];
      const ganado = act && m <= hoy.getMonth() + 1 && r() < 0.6 ? 1 : 0;
      pipeline.push({ mes: String(m), factibilidad: f, activa_operaciones: act, ganado, proyectos: 1 + Math.floor(r() * 2),
        monto: Math.round(800000 + r() * 6000000), ...cliente(i) });
    }
  });

  const gantt = CLIENTES.slice(0, 14).map((_, i) => {
    const c = cliente(i);
    const fin = new Date(hoy); fin.setDate(fin.getDate() + Math.floor(r() * 200) - 30);
    const fac = new Date(fin); fac.setDate(fac.getDate() - (c.dias_credito === 0 ? 7 : 0));
    const cob = new Date(fac); cob.setDate(cob.getDate() + 15 + (c.dias_credito || 0));
    return { id: i + 1, cliente: c.cliente, cliente_id: c.cliente_id, grupo_comercial: c.grupo_comercial, atc_id: c.atc_id,
      atc_nombre: c.atc_nombre, categoria: r() < 0.7 ? "CONTRATADO" : "PROYECCION", pedido_monto: Math.round(1000000 + r() * 9000000),
      pedido_numero: `54000${37400 + i}`, fecha_facturacion_estim: iso(fac), fecha_cobro_estim: iso(cob) };
  });

  const totalAnterior = facturacion.filter((f) => f.anio === anio - 1).reduce((s, f) => s + f.facturado, 0);
  const meta = { anio, monto_objetivo: Math.round(totalAnterior * 1.15), porcentaje_trimestre1: 20,
    porcentaje_trimestre2: 25, porcentaje_trimestre3: 25, porcentaje_trimestre4: 30 };

  // Órdenes abiertas (embudo cotizado → autorizado → facturado → pendiente).
  const ordenes = Array.from({ length: 70 }, (_, k) => {
    const c = cliente(Math.floor(r() ** 1.5 * CLIENTES.length));
    const cotizado = Math.round(300000 + r() * 9000000);
    const pte_autorizar = r() < 0.3 ? Math.round(cotizado * (0.2 + r() * 0.8)) : 0;
    const autorizado = cotizado - pte_autorizar;
    const descuento_autorizado = r() < 0.35 ? Math.round(autorizado * r() * 0.12) : 0;
    const cortesias = r() < 0.15 ? Math.round(autorizado * r() * 0.05) : 0;
    const neto_autorizado = autorizado - descuento_autorizado - cortesias;
    const facturado_bruto = Math.round(neto_autorizado * (r() < 0.4 ? 0 : r()));
    const nc_anticipo = r() < 0.15 ? Math.round(facturado_bruto * 0.3) : 0;
    return { orden_id: 5000 + k, numero_orden: `${String(k + 1).padStart(3, "0")}/${String(anio).slice(2)}`, anio: Number(String(anio).slice(2)),
      tipo: r() < 0.08 ? "G" : "N", moneda: r() < 0.15 ? "USD" : "MXN", descripcion: "REPARACION DE TURBINA DE VAPOR", ...c,
      cotizado, pte_autorizar, autorizado, descuento_autorizado, cortesias, neto_autorizado,
      neto_sin_pedido: r() < 0.3 ? Math.round(neto_autorizado * 0.4) : 0, facturado_bruto, descuento_facturado: 0, nc_anticipo,
      pendiente_facturar: Math.max(0, neto_autorizado - facturado_bruto) };
  });

  pipeline.forEach((p) => {
    p.factibilidad_descripcion = { A: "Alta", B: "Media", C: "Baja", D: "Descartada" }[p.factibilidad];
    p.monto_inicial = p.monto;
    p.monto_ganado = p.ganado ? Math.round(p.monto * 0.9) : 0;
    p.monto_perdido = !p.ganado && r() < 0.2 ? p.monto : 0;
  });

  const anticipos = Array.from({ length: 12 }, (_, k) => {
    const c = cliente(Math.floor(r() * CLIENTES.length));
    const importe = Math.round(400000 + r() * 5000000);
    const pagada = r() < 0.4;
    const ff = new Date(hoy); ff.setDate(ff.getDate() - Math.floor(r() * 300));
    return { id: 7000 + k, folio: `${3900 + k}${["H", "G", "Q"][k % 3]}`, tipo: ["H", "G", "Q"][k % 3], moneda: "MXN",
      estado: pagada ? "L" : "T", importe_mxn: importe, saldo_mxn: pagada ? 0 : Math.round(importe * 1.16 * r()),
      fecha_factura: iso(ff), fecha_ultimo_pago: pagada ? iso(hoy) : null, ...c };
  });

  // Proyectos (detalle): cada fila agregada del pipeline se reparte en sus proyectos.
  const proyectos = [];
  pipeline.forEach((p, n) => {
    for (let j = 0; j < p.proyectos; j++) {
      const monto = Math.round(p.monto / p.proyectos);
      proyectos.push({ ...p, proyecto_id: n * 10 + j, folio: `${String(n * 10 + j + 1).padStart(3, "0")}/${p.atc_id}/${String(anio).slice(2)}P`,
        descripcion: ["Mantenimiento mayor turbina de vapor", "Rehabilitación de rotor", "Inspección boroscópica", "Suministro de refacciones"][j % 4],
        unidad: `U${1 + (n % 9)}`, maquina: ["TURBINA DE VAPOR GE", "GENERADOR SIEMENS", "TURBINA DE GAS ALSTOM"][n % 3],
        clasificacion: p.grupo_comercial === "OTROS" ? "INICIATIVA PRIVADA" : "GOBIERNO", subclasificacion: p.grupo_comercial,
        monto, monto_inicial: monto, monto_ganado: p.ganado ? Math.round(monto * 0.9) : 0, monto_perdido: p.monto_perdido ? monto : 0,
        ganador: p.ganado ? "TM" : p.monto_perdido ? "COMPETIDOR" : null, pedidos: p.ganado ? `54000${38000 + n}` : null, ordenes: null, proyectos: 1 });
    }
  });

  return { facturacion, cobranza, cartera, diasPago, pipeline, gantt, meta, ordenes, anticipos, proyectos };
}
