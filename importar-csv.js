// Importa las leads del CSV "Tracker - Agosto.csv" (export corregido de la planilla)
// a los paneles Góndolas y Estanterías Reforzadas.
// - Idempotente: si ya se importó este CSV, no duplica (correr con --force para repetir igual).
// - Crea las etapas Frío / Caliente / Seguimiento si no existen (Ganado y Perdido son fijas).
// - "Vendido" entra como Ganado aprobado y GENERA la comisión del vendedor con la regla
//   vigente del rubro (Estanterías: 5% por venta, cobrable al momento).
// - David Ruiz (Romina) viene sin valor en el CSV: se carga $1.730.000 según la hoja de pagos.
// Ejecutar en el server: docker compose exec panel node importar-csv.js
const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { generarComisiones } = require('./comisiones');

const FORCE = process.argv.includes('--force');
const ARCHIVO = path.join(__dirname, 'Tracker - Agosto.csv');
const MARCA = 'Importada del CSV Tracker Agosto';

const VENDEDORES = {
  ana: 'anadeliciafernandez1@gmail.com',
  leandro: 'leandroulrich9@gmail.com',
  celina: 'celinanunezcarabajal25@gmail.com',
  mateo: 'mateogabriel7468@gmail.com',
  romina: 'rominalpz14@gmail.com',
};

const MAPA_ESTADOS = {
  'Vendido': 'Ganado', 'Perdido': 'Perdido', '1º Contacto': 'Contactado',
  'Negociación': 'Negociación', 'Seguimiento': 'Seguimiento', 'Frío': 'Frío', 'Caliente': 'Caliente',
};

// Ventas sin valor en el CSV → valor conocido por la hoja de pagos (clave: nombre|vendedor).
const VALORES_VENTAS = { 'david ruiz|romina': 1730000 };

/* ---------- helpers ---------- */

// Parser CSV con comillas (campos con comas, saltos de línea y "" escapadas).
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Limpia caracteres invisibles de WhatsApp/Sheets y guiones raros en los celulares.
const limpiar = (s) => (s || '').replace(/[‎‏‪-‮﻿]/g, '').replace(/‑/g, '-').replace(/\s+/g, ' ').trim();

// "6/8/2026" → "2026-08-06" (tolera dobles barras y años mal tipeados: 0206, 2023).
function fechaISO(s) {
  const m = limpiar(s).replace(/\/+/g, '/').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  if (y < 2020 || y > 2030) y = 2026;
  return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

const num = (s) => {
  const v = parseFloat(limpiar(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/* ---------- chequeos previos ---------- */

if (!fs.existsSync(ARCHIVO)) { console.error('No encuentro el archivo:', ARCHIVO); process.exit(1); }

if (!FORCE) {
  const ya = db.prepare(`SELECT COUNT(*) AS c FROM deal_events WHERE detalle LIKE '${MARCA}%'`).get().c;
  if (ya > 0) { console.log(`El CSV ya está importado (${ya} leads marcadas) — sin cambios. Usá --force para repetir.`); process.exit(0); }
}

const usuarios = {};
for (const [nombre, email] of Object.entries(VENDEDORES)) {
  const u = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
  if (!u) { console.error(`Falta el usuario ${nombre} <${email}> (corré primero crear-vendedores.js).`); process.exit(1); }
  usuarios[nombre] = u;
}

for (const panel of ['gondolas', 'estanterias']) {
  const existentes = db.prepare('SELECT nombre FROM panel_etapas WHERE panel = ?').all(panel).map((e) => e.nombre);
  let orden = db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM panel_etapas WHERE panel = ?').get(panel).m;
  for (const etapa of Object.values(MAPA_ESTADOS)) {
    if (etapa === 'Ganado' || etapa === 'Perdido' || existentes.includes(etapa)) continue;
    db.prepare('INSERT INTO panel_etapas (panel, nombre, orden) VALUES (?, ?, ?)').run(panel, etapa, ++orden);
    existentes.push(etapa);
    console.log(`Etapa creada en ${panel}: ${etapa}`);
  }
}

/* ---------- parseo y deduplicación ---------- */

const filas = parseCSV(fs.readFileSync(ARCHIVO, 'utf8'));
filas.shift(); // encabezado
const leads = [];
const vistos = new Map();
let salteadas = 0;

for (const f of filas) {
  const [estado, celular, ultimo, empresa, valor, nombre, clasif, gestion, provincia, vendedor, aprop, primero, fuente, url, notas] = f.map(limpiar);
  const etapa = MAPA_ESTADOS[estado];
  const user = usuarios[vendedor.toLowerCase()];
  if (!etapa || !user) { console.warn('Fila salteada (estado o vendedor desconocido):', estado, '|', vendedor, '|', nombre || celular); salteadas++; continue; }
  const panel = empresa === 'ER' ? 'estanterias' : 'gondolas';
  const lead = {
    panel, etapa, user, celular, nombre, clasif, gestion, fuente, url, notas,
    titulo: nombre || celular || 'Lead sin nombre',
    sinEmpresa: !empresa,
    mrr: num(valor) || VALORES_VENTAS[`${nombre.toLowerCase()}|${vendedor.toLowerCase()}`] || null,
    valorDePagos: !num(valor) && !!VALORES_VENTAS[`${nombre.toLowerCase()}|${vendedor.toLowerCase()}`],
    provincia: provincia ? provincia.replace('Santiago Del Estero', 'Santiago del Estero') : null,
    creada: fechaISO(aprop) || fechaISO(primero) || fechaISO(ultimo) || '2026-08-06',
    ultimo: fechaISO(ultimo),
    primero: fechaISO(primero),
    estadoOriginal: estado,
  };
  const clave = `${panel}|${nombre.toLowerCase()}|${celular.replace(/\D/g, '')}|${user.id}`;
  if ((nombre || celular) && vistos.has(clave)) {
    const idx = vistos.get(clave);
    if ((lead.ultimo || '') > (leads[idx].ultimo || '')) leads[idx] = lead;
    continue;
  }
  vistos.set(clave, leads.length);
  leads.push(lead);
}

/* ---------- inserción ---------- */

const insDeal = db.prepare(`INSERT INTO deals
  (empresa, user_id, panel, etapa, tipo_venta, mrr, decisor, origen, fecha_cierre, aprobacion, pais, provincia, created_at, updated_at)
  VALUES (@empresa, @user_id, @panel, @etapa, 'Proyecto único', @mrr, @decisor, @origen, @fecha_cierre, @aprobacion, 'Argentina', @provincia, @created_at, @updated_at)`);
const insEv = db.prepare('INSERT INTO deal_events (deal_id, user_id, tipo, detalle, created_at) VALUES (?, ?, ?, ?, ?)');

const resumen = {};
let cuotas = 0, montoComisiones = 0;
db.transaction(() => {
  for (const l of leads) {
    const cerrada = l.etapa === 'Ganado' || l.etapa === 'Perdido';
    const r = insDeal.run({
      empresa: l.titulo,
      user_id: l.user.id,
      panel: l.panel,
      etapa: l.etapa,
      mrr: l.mrr,
      decisor: l.nombre || null,
      origen: l.fuente || null,
      fecha_cierre: cerrada ? (l.ultimo || l.creada) : null,
      aprobacion: l.etapa === 'Ganado' ? (l.mrr ? 'aprobado' : 'pendiente') : null,
      provincia: l.provincia,
      created_at: l.creada + ' 12:00:00',
      updated_at: (l.ultimo || l.creada) + ' 12:00:00',
    });
    insEv.run(r.lastInsertRowid, l.user.id, 'creado', `${MARCA} — estado original: ${l.estadoOriginal}`, l.creada + ' 12:00:00');
    const extras = [
      l.celular && `Celular: ${l.celular}`,
      l.clasif && `Clasificación: ${l.clasif}`,
      l.gestion && `Gestión: ${l.gestion}`,
      l.primero && `1º contacto: ${l.primero.split('-').reverse().join('/')}`,
      l.url && `URL: ${l.url}`,
      l.sinEmpresa && 'El CSV no especificaba empresa (se asignó a Góndolas)',
      l.valorDePagos && 'Valor tomado de la hoja de pagos de la planilla',
      l.notas && `Nota: ${l.notas}`,
    ].filter(Boolean);
    if (extras.length) insEv.run(r.lastInsertRowid, l.user.id, 'edicion', `Nota: ${extras.join(' · ')}`, (l.ultimo || l.creada) + ' 12:00:00');
    if (l.etapa === 'Ganado' && l.mrr) {
      const d = db.prepare('SELECT * FROM deals WHERE id = ?').get(r.lastInsertRowid);
      const n = generarComisiones(d);
      cuotas += n;
      if (n) montoComisiones += db.prepare('SELECT COALESCE(SUM(monto), 0) AS m FROM commissions WHERE deal_id = ?').get(d.id).m;
    }
    const k = `${l.panel} / ${l.etapa}`;
    resumen[k] = (resumen[k] || 0) + 1;
  }
})();

console.log(`\nImportadas ${leads.length} leads del CSV (${filas.length - leads.length - salteadas} duplicadas unificadas, ${salteadas} salteadas):`);
for (const [k, n] of Object.entries(resumen).sort()) console.log(`  ${k}: ${n}`);
const porVendedor = db.prepare(`SELECT u.name, COUNT(*) n, COALESCE(SUM(c.monto), 0) total FROM commissions c
  JOIN users u ON u.id = c.user_id
  WHERE c.deal_id IN (SELECT deal_id FROM deal_events WHERE detalle LIKE '${MARCA}%') GROUP BY u.id`).all();
console.log(`\nComisiones generadas por las ventas: ${cuotas} cuota${cuotas === 1 ? '' : 's'} ($${montoComisiones.toLocaleString('es-AR')}):`);
for (const t of porVendedor) console.log(`  ${t.name}: ${t.n} cuota${t.n === 1 ? '' : 's'} por $${Number(t.total).toLocaleString('es-AR')}`);
