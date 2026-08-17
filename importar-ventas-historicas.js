// Ventas históricas de la hoja "PAGOS Y COMISIONES" de la planilla → cobranza del campus.
// Hace tres cosas (todas idempotentes):
//  1. Genera las comisiones de las ventas ya importadas de Mateo (Benedicta y Jorge).
//  2. Completa la venta de David Ruiz (Romina): valor $1.730.000, la aprueba y le genera la comisión.
//  3. Crea las 5 ventas de Mateo que estaban solo en la hoja de pagos (Manuel, Gabriel Lopez,
//     Benedicta 2ª, Esteban, Jorge 2ª) como Ganado aprobado, con sus comisiones.
// Las comisiones salen de la regla vigente del rubro (Estanterías: 5% por venta, cobrable al momento).
// Ejecutar en el server: docker compose exec panel node importar-ventas-historicas.js
const { db } = require('./db');
const { generarComisiones } = require('./comisiones');

const MARCA_LEADS = 'Importada de la planilla histórica';
const MARCA_PAGOS = 'Importada de la planilla de pagos';

const user = (email) => db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
const mateo = user('mateogabriel7468@gmail.com');
const romina = user('rominalpz14@gmail.com');
if (!mateo || !romina) {
  console.error('Faltan los usuarios de Mateo o Romina (corré primero crear-vendedores.js).');
  process.exit(1);
}

// Busca un deal importado de la planilla de leads por título + vendedor.
const dealImportado = (empresa, userId) => db.prepare(`SELECT d.* FROM deals d
  JOIN deal_events e ON e.deal_id = d.id AND e.tipo = 'creado' AND e.detalle LIKE '${MARCA_LEADS}%'
  WHERE d.empresa = ? AND d.user_id = ?`).get(empresa, userId);

let cuotas = 0;

/* --- 1. Comisiones de las ventas ya importadas de Mateo (el motor no duplica si ya existen) --- */
for (const nombre of ['Benedicta', 'Jorge']) {
  const d = dealImportado(nombre, mateo.id);
  if (!d) { console.warn(`No encontré la venta importada "${nombre}" de Mateo — salteada.`); continue; }
  const n = generarComisiones(d);
  cuotas += n;
  console.log(`${nombre}: ${n ? `comisión generada ($${d.mrr} al 5%)` : 'ya tenía comisión, sin cambios'}`);
}

/* --- 2. David Ruiz (Romina): completar valor, aprobar y comisionar --- */
const david = dealImportado('David Ruiz', romina.id);
if (!david) {
  console.warn('No encontré la venta importada "David Ruiz" de Romina — salteada.');
} else {
  if (!david.mrr) {
    db.prepare(`UPDATE deals SET mrr = 1730000, fecha_cierre = '2026-08-13', aprobacion = 'aprobado',
      updated_at = '2026-08-13 12:00:00' WHERE id = ?`).run(david.id);
    db.prepare(`INSERT INTO deal_events (deal_id, user_id, tipo, detalle, created_at) VALUES (?, ?, 'edicion', ?, '2026-08-13 12:00:00')`)
      .run(david.id, romina.id, `${MARCA_PAGOS} — valor $1.730.000 según hoja de pagos; venta aprobada`);
    david.mrr = 1730000; david.fecha_cierre = '2026-08-13';
    console.log('David Ruiz: valor $1.730.000 cargado y venta aprobada.');
  }
  const n = generarComisiones(david);
  cuotas += n;
  if (n) console.log('David Ruiz: comisión generada.');
}

/* --- 3. Ventas de Mateo que estaban solo en la hoja de pagos --- */
const VENTAS = [
  ['Manuel', 1420000, '2026-08-01'],
  ['Gabriel Lopez', 1200000, '2026-08-06'],
  ['Benedicta (2ª venta)', 7000000, '2026-08-03'],
  ['Esteban', 2000000, '2026-08-04'],
  ['Jorge (2ª venta)', 3200000, '2026-08-10'],
];
const insDeal = db.prepare(`INSERT INTO deals
  (empresa, user_id, panel, etapa, tipo_venta, mrr, decisor, fecha_cierre, aprobacion, pais, created_at, updated_at)
  VALUES (?, ?, 'estanterias', 'Ganado', 'Proyecto único', ?, ?, ?, 'aprobado', 'Argentina', ?, ?)`);
for (const [nombre, valor, fecha] of VENTAS) {
  const ya = db.prepare(`SELECT d.id FROM deals d JOIN deal_events e ON e.deal_id = d.id AND e.detalle LIKE '${MARCA_PAGOS}%'
    WHERE d.empresa = ? AND d.user_id = ?`).get(nombre, mateo.id);
  if (ya) { console.log(`${nombre}: ya estaba cargada, sin cambios.`); continue; }
  const r = insDeal.run(nombre, mateo.id, valor, nombre.replace(/ \(2ª venta\)$/, ''), fecha, fecha + ' 12:00:00', fecha + ' 12:00:00');
  db.prepare(`INSERT INTO deal_events (deal_id, user_id, tipo, detalle, created_at) VALUES (?, ?, 'creado', ?, ?)`)
    .run(r.lastInsertRowid, mateo.id, `${MARCA_PAGOS} — venta cerrada el ${fecha.split('-').reverse().join('/')}`, fecha + ' 12:00:00');
  const d = db.prepare('SELECT * FROM deals WHERE id = ?').get(r.lastInsertRowid);
  const n = generarComisiones(d);
  cuotas += n;
  console.log(`${nombre}: venta $${valor.toLocaleString('es-AR')} creada${n ? ' con comisión' : ''}.`);
}

/* --- resumen --- */
const tot = db.prepare(`SELECT u.name, COUNT(*) AS n, SUM(c.monto) AS total FROM commissions c
  JOIN users u ON u.id = c.user_id WHERE c.deal_id IN (
    SELECT deal_id FROM deal_events WHERE detalle LIKE '${MARCA_LEADS}%' OR detalle LIKE '${MARCA_PAGOS}%'
  ) GROUP BY u.id`).all();
console.log(`\nCuotas nuevas generadas: ${cuotas}`);
for (const t of tot) console.log(`  ${t.name}: ${t.n} cuota${t.n === 1 ? '' : 's'} por $${Number(t.total).toLocaleString('es-AR')}`);
