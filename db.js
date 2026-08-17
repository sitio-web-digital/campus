const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'crm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor' CHECK (role IN ('admin','vendedor','developer')),
  active INTEGER NOT NULL DEFAULT 1,
  permisos TEXT NOT NULL DEFAULT '["cfd","cobranza"]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campanas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel TEXT NOT NULL DEFAULT 'cfd',
  nombre TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (panel, nombre)
);

CREATE TABLE IF NOT EXISTS panel_etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel TEXT NOT NULL,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  UNIQUE (panel, nombre)
);

CREATE TABLE IF NOT EXISTS panel_campos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel TEXT NOT NULL,
  label TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS panel_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  fecha TEXT NOT NULL,
  valores TEXT NOT NULL DEFAULT '{}',
  notas TEXT,
  UNIQUE (panel, user_id, fecha)
);

CREATE TABLE IF NOT EXISTS panel_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  periodo TEXT NOT NULL CHECK (periodo IN ('dia','semana','mes')),
  valores TEXT NOT NULL DEFAULT '{}',
  UNIQUE (panel, user_id, periodo)
);

CREATE TABLE IF NOT EXISTS gondolas_etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gondolas_campos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gondolas_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  fecha TEXT NOT NULL,
  valores TEXT NOT NULL DEFAULT '{}',
  notas TEXT,
  UNIQUE (user_id, fecha)
);

CREATE TABLE IF NOT EXISTS gondolas_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  periodo TEXT NOT NULL CHECK (periodo IN ('semana','mes')),
  valores TEXT NOT NULL DEFAULT '{}',
  UNIQUE (user_id, periodo)
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  etapa TEXT NOT NULL DEFAULT 'Lead',
  mrr REAL,
  decisor TEXT,
  origen TEXT,
  proximo_paso TEXT,
  fecha_proximo_paso TEXT,
  fecha_primera_reunion TEXT,
  fecha_cierre TEXT,
  motivo_perdida TEXT,
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('creado','etapa','edicion')),
  detalle TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  texto TEXT NOT NULL,
  url TEXT,
  leida INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  periodo TEXT NOT NULL CHECK (periodo IN ('dia','semana','mes')),
  toques INTEGER NOT NULL DEFAULT 0,
  reuniones INTEGER NOT NULL DEFAULT 0,
  ganados INTEGER NOT NULL DEFAULT 0,
  mrr REAL NOT NULL DEFAULT 0,
  UNIQUE (user_id, periodo)
);

CREATE TABLE IF NOT EXISTS commission_rules (
  tipo_venta TEXT PRIMARY KEY,
  config TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  fecha_devengada TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado','cancelado')),
  pagado_at TEXT,
  invoice_path TEXT,
  invoice_nombre TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  fecha TEXT NOT NULL,
  contactos INTEGER NOT NULL DEFAULT 0,
  toques INTEGER NOT NULL DEFAULT 0,
  reuniones_agendadas INTEGER NOT NULL DEFAULT 0,
  reuniones_realizadas INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  UNIQUE (user_id, fecha)
);
`);

// Migración: agrega tipo_venta a bases creadas antes de la 1.8.0.
const dealCols = db.prepare('PRAGMA table_info(deals)').all().map((c) => c.name);
if (!dealCols.includes('tipo_venta')) {
  db.exec("ALTER TABLE deals ADD COLUMN tipo_venta TEXT NOT NULL DEFAULT 'Suscripción mensual'");
}
// Migración 2.1.0: aprobación de ventas ganadas. Los ganados históricos quedan aprobados.
if (!dealCols.includes('aprobacion')) {
  db.exec('ALTER TABLE deals ADD COLUMN aprobacion TEXT');
  db.exec("UPDATE deals SET aprobacion = 'aprobado' WHERE etapa = 'Ganado'");
}
// Migración 2.3.0: multi-panel (cfd | gondolas).
if (!dealCols.includes('panel')) {
  db.exec("ALTER TABLE deals ADD COLUMN panel TEXT NOT NULL DEFAULT 'cfd'");
}
// Migración 2.8.1: campañas por panel (las existentes quedan en CFD). Rebuild para UNIQUE(panel, nombre).
const campCols = db.prepare('PRAGMA table_info(campanas)').all().map((c) => c.name);
if (!campCols.includes('panel')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE campanas_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel TEXT NOT NULL DEFAULT 'cfd',
      nombre TEXT NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (panel, nombre)
    );
    INSERT INTO campanas_mig (id, panel, nombre, activa, created_at) SELECT id, 'cfd', nombre, activa, created_at FROM campanas;
    DROP TABLE campanas;
    ALTER TABLE campanas_mig RENAME TO campanas;
  `);
  db.pragma('foreign_keys = ON');
}

// Migración 2.8.0: campaña de origen y ubicación de la lead.
if (!dealCols.includes('campana_id')) {
  db.exec('ALTER TABLE deals ADD COLUMN campana_id INTEGER REFERENCES campanas(id)');
  db.exec("ALTER TABLE deals ADD COLUMN pais TEXT DEFAULT 'Argentina'");
  db.exec('ALTER TABLE deals ADD COLUMN provincia TEXT');
  db.exec('ALTER TABLE deals ADD COLUMN ciudad TEXT');
}
// Migración 2.3.0: rol developer + permisos por sistema en users (rebuild por el CHECK).
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('permisos')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE users_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'vendedor' CHECK (role IN ('admin','vendedor','developer')),
      active INTEGER NOT NULL DEFAULT 1,
      permisos TEXT NOT NULL DEFAULT '["cfd","cobranza"]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users_mig (id, name, email, password_hash, role, active, permisos, created_at)
      SELECT id, name, email, password_hash, role, active, '["cfd","gondolas","cobranza"]', created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_mig RENAME TO users;
  `);
  db.pragma('foreign_keys = ON');
}

// Paneles comerciales configurables (además del CFD fijo). Agregar una empresa nueva = una línea acá.
const PANELES_COMERCIALES = [
  { slug: 'gondolas', nombre: 'Góndolas' },
  { slug: 'estanterias', nombre: 'Estanterías Reforzadas' },
  { slug: 'sitioweb', nombre: 'SitioWeb Digital' },
];

// Sistemas del ecosistema (para permisos por usuario).
const SISTEMAS = [
  ['cfd', 'Comercial Cloud For Deploy'],
  ['gondolas', 'Comercial Góndolas'],
  ['estanterias', 'Comercial Estanterías Reforzadas'],
  ['sitioweb', 'Comercial SitioWeb Digital'],
  ['cobranza', 'Panel de Cobranza'],
];

// Migración 2.5.0: mover config de góndolas a las tablas genéricas de paneles.
if (db.prepare('SELECT COUNT(*) AS c FROM panel_etapas').get().c === 0 && db.prepare('SELECT COUNT(*) AS c FROM gondolas_etapas').get().c > 0) {
  db.exec(`INSERT INTO panel_etapas (panel, nombre, orden) SELECT 'gondolas', nombre, orden FROM gondolas_etapas;
    INSERT INTO panel_campos (panel, label, orden) SELECT 'gondolas', label, orden FROM gondolas_campos;
    INSERT INTO panel_activity (panel, user_id, fecha, valores, notas) SELECT 'gondolas', user_id, fecha, valores, notas FROM gondolas_activity;
    INSERT INTO panel_goals (panel, user_id, periodo, valores) SELECT 'gondolas', user_id, periodo, valores FROM gondolas_goals;`);
}

// Seeds por panel: etapas y campos por defecto (editables por el admin en Config).
for (const p of PANELES_COMERCIALES) {
  if (db.prepare('SELECT COUNT(*) AS c FROM panel_etapas WHERE panel = ?').get(p.slug).c === 0) {
    const ins = db.prepare('INSERT INTO panel_etapas (panel, nombre, orden) VALUES (?, ?, ?)');
    ['Lead', 'Contactado', 'Visita realizada', 'Cotización enviada', 'Negociación'].forEach((n, i) => ins.run(p.slug, n, i + 1));
  }
  if (db.prepare('SELECT COUNT(*) AS c FROM panel_campos WHERE panel = ?').get(p.slug).c === 0) {
    const ins = db.prepare('INSERT INTO panel_campos (panel, label, orden) VALUES (?, ?, ?)');
    ['Llamadas', 'Visitas', 'Cotizaciones enviadas'].forEach((n, i) => ins.run(p.slug, n, i + 1));
  }
  // Regla de comisión por rubro: % plano cobrable al momento (editable en Cobranza → Reglas).
  if (!db.prepare('SELECT 1 FROM commission_rules WHERE tipo_venta = ?').get(p.slug)) {
    db.prepare('INSERT INTO commission_rules (tipo_venta, config) VALUES (?, ?)')
      .run(p.slug, JSON.stringify({ tipo: 'flat', pct: 5, nota: `Venta de ${p.nombre}: comisión única cobrable al momento.` }));
  }
}

// Migración 2.6.0: los objetivos suman el período diario (rebuild por el CHECK de periodo).
const goalsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'goals'").get()?.sql || '';
if (goalsSql && !goalsSql.includes("'dia'")) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE goals_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      periodo TEXT NOT NULL CHECK (periodo IN ('dia','semana','mes')),
      toques INTEGER NOT NULL DEFAULT 0,
      reuniones INTEGER NOT NULL DEFAULT 0,
      ganados INTEGER NOT NULL DEFAULT 0,
      mrr REAL NOT NULL DEFAULT 0,
      UNIQUE (user_id, periodo)
    );
    INSERT INTO goals_mig (id, user_id, periodo, toques, reuniones, ganados, mrr) SELECT id, user_id, periodo, toques, reuniones, ganados, mrr FROM goals;
    DROP TABLE goals;
    ALTER TABLE goals_mig RENAME TO goals;
  `);
  db.pragma('foreign_keys = ON');
}
const pgoalsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'panel_goals'").get()?.sql || '';
if (pgoalsSql && !pgoalsSql.includes("'dia'")) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE panel_goals_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      periodo TEXT NOT NULL CHECK (periodo IN ('dia','semana','mes')),
      valores TEXT NOT NULL DEFAULT '{}',
      UNIQUE (panel, user_id, periodo)
    );
    INSERT INTO panel_goals_mig (id, panel, user_id, periodo, valores) SELECT id, panel, user_id, periodo, valores FROM panel_goals;
    DROP TABLE panel_goals;
    ALTER TABLE panel_goals_mig RENAME TO panel_goals;
  `);
  db.pragma('foreign_keys = ON');
}

// Migración 2.5.0: las notas de los deals pasan al historial (el campo del formulario queda siempre limpio).
const conNotas = db.prepare("SELECT id, user_id, notas FROM deals WHERE notas IS NOT NULL AND notas != ''").all();
if (conNotas.length) {
  const insEv = db.prepare("INSERT INTO deal_events (deal_id, user_id, tipo, detalle) VALUES (?, ?, 'edicion', ?)");
  for (const d of conNotas) insEv.run(d.id, d.user_id, `Nota: ${d.notas}`);
  db.exec('UPDATE deals SET notas = NULL');
}

const ETAPAS = ['Lead', 'Contactado', 'Reunión agendada', 'Discovery hecha', 'Propuesta enviada', 'Negociación', 'Ganado', 'Perdido'];
const TIPOS_VENTA = ['Proyecto único', 'Suscripción mensual', 'Infraestructura', 'Mantenimiento'];

// Reglas de comisión por defecto (editables desde Cobranza → Reglas).
const REGLAS_DEFAULT = {
  'Proyecto único': { tipo: 'tramos', tramos: [{ hasta: 2000, pct: 10 }, { hasta: 5000, pct: 12.5 }, { hasta: 8000, pct: 15 }, { hasta: null, pct: 20 }] },
  'Suscripción mensual': { tipo: 'fases', fases: [{ meses: 3, pct: 50 }, { meses: 3, pct: 25 }], nota: 'Si el cliente cancela la suscripción, se cancelan las cuotas restantes.' },
  'Infraestructura': { tipo: 'fases', fases: [{ meses: 6, pct: 10 }], nota: 'Solo si el cliente retiene el servicio.' },
  'Mantenimiento': { tipo: 'fases', fases: [{ meses: 6, pct: 10 }], nota: 'Solo si el cliente retiene el servicio.' },
};
if (db.prepare('SELECT COUNT(*) AS c FROM commission_rules').get().c === 0) {
  const ins = db.prepare('INSERT INTO commission_rules (tipo_venta, config) VALUES (?, ?)');
  for (const [t, cfg] of Object.entries(REGLAS_DEFAULT)) ins.run(t, JSON.stringify(cfg));
}
const ETAPAS_ACTIVAS = ETAPAS.slice(0, 6);
const ORIGENES = ['Outbound frío', 'Referido', 'Inbound / Marketing', 'Red personal'];
const MOTIVOS = ['Precio', 'Timing / no es prioridad', 'Eligió competencia', 'Sin presupuesto', 'No era el decisor', 'Dejó de responder', 'No calificado'];

// Primer arranque: crea el admin y muestra la clave inicial en consola.
function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return null;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(4).toString('hex');
  const email = process.env.ADMIN_EMAIL || 'admin@panel.local';
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Administrador', email, bcrypt.hashSync(password, 10), 'admin');
  return { email, password };
}

// El secreto de sesión persiste en data/ para que los logins sobrevivan reinicios.
function getSessionSecret() {
  const file = path.join(DATA_DIR, 'session-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret);
  return secret;
}

module.exports = { db, seedAdmin, getSessionSecret, ETAPAS, ETAPAS_ACTIVAS, ORIGENES, MOTIVOS, TIPOS_VENTA, SISTEMAS, PANELES_COMERCIALES };
