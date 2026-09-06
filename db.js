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

// Migración 2.20.0: teléfono de la lead.
if (!dealCols.includes('telefono')) {
  db.exec('ALTER TABLE deals ADD COLUMN telefono TEXT');
}
// Migración 2.22.0: calificación del cliente + timestamp del último movimiento de etapa + config por panel.
if (!dealCols.includes('calificacion')) {
  db.exec('ALTER TABLE deals ADD COLUMN calificacion TEXT');
}
if (!dealCols.includes('etapa_movida_at')) {
  db.exec('ALTER TABLE deals ADD COLUMN etapa_movida_at TEXT');
  db.exec('UPDATE deals SET etapa_movida_at = updated_at WHERE etapa_movida_at IS NULL');
}
// Migración 2.32.0: estrella para destacar leads (importantes a cerrar / mejor seguimiento).
if (!dealCols.includes('destacada')) {
  db.exec('ALTER TABLE deals ADD COLUMN destacada INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS panel_config (
  panel TEXT NOT NULL,
  clave TEXT NOT NULL,
  valor TEXT,
  PRIMARY KEY (panel, clave)
);`);
// Avisos de vencimiento por lead (mitad del tiempo / última hora): uno solo por cada período de inactividad.
db.exec(`CREATE TABLE IF NOT EXISTS robo_avisos (
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  marca TEXT NOT NULL,
  tipo TEXT NOT NULL,
  UNIQUE (deal_id, marca, tipo)
);`);
// Recordatorios de carga de actividad: un solo aviso por vendedor, panel y fecha.
db.exec(`CREATE TABLE IF NOT EXISTS actividad_avisos (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  panel TEXT NOT NULL,
  fecha TEXT NOT NULL,
  UNIQUE (user_id, panel, fecha)
);`);
// Soporte: tickets con hilo de mensajes (texto y/o imagen adjunta).
db.exec(`CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asunto TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ticket_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  texto TEXT NOT NULL DEFAULT '',
  imagen_path TEXT,
  imagen_nombre TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
// Migración 2.33.0: Panel de Developers — cada venta de CFD ganada y aprobada se convierte en proyecto.
db.exec(`CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL DEFAULT 'Por iniciar',
  dev_id INTEGER REFERENCES users(id),
  notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
// Backfill idempotente: las ventas de CFD que ya estaban ganadas y aprobadas entran como proyectos.
db.exec("INSERT OR IGNORE INTO proyectos (deal_id) SELECT id FROM deals WHERE panel = 'cfd' AND etapa = 'Ganado' AND aprobacion = 'aprobado'");

// Migración 2.35.0: Asesor IA — registro de consultas (sirve de log, tope diario y control de gasto).
db.exec(`CREATE TABLE IF NOT EXISTS ia_consultas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  deal_id INTEGER,
  pregunta TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  modelo TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
// 2.36.0: MiniJuan — bienvenida vista (una vez por usuario) y límite diario propio (NULL = usa el general).
{
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('ia_bienvenida')) db.exec('ALTER TABLE users ADD COLUMN ia_bienvenida INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('ia_limite')) db.exec('ALTER TABLE users ADD COLUMN ia_limite INTEGER');
  // 2.38.0: "Nueva charla" — la charla actual arranca después de esta consulta (las viejas quedan guardadas igual).
  if (!cols.includes('ia_charla_desde')) db.exec('ALTER TABLE users ADD COLUMN ia_charla_desde INTEGER NOT NULL DEFAULT 0');
}
// 2.41.0: Panel de Clientes — prospectos traídos de Google Maps (Places API) y su ciclo de vida.
db.exec(`CREATE TABLE IF NOT EXISTS prospectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT UNIQUE,
  nombre TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  sitio_web TEXT,
  rating REAL,
  resenas INTEGER,
  maps_url TEXT,
  rubro TEXT,
  zona TEXT,
  estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'tomado', 'descartado')),
  tomado_por INTEGER REFERENCES users(id),
  tomado_at TEXT,
  deal_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS prospecto_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rubro TEXT NOT NULL,
  zona TEXT NOT NULL,
  encontrados INTEGER NOT NULL DEFAULT 0,
  nuevos INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
if (!db.prepare('PRAGMA table_info(prospecto_scans)').all().some((c) => c.name === 'consultas')) {
  db.exec('ALTER TABLE prospecto_scans ADD COLUMN consultas INTEGER NOT NULL DEFAULT 1');
}
// 2.43.0: agenda de reuniones (Cloud For Deploy): los vendedores reservan turnos sobre la disponibilidad del equipo admin.
db.exec(`CREATE TABLE IF NOT EXISTS reuniones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  vendedor_id INTEGER NOT NULL REFERENCES users(id),
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  duracion INTEGER NOT NULL DEFAULT 45,
  estado TEXT NOT NULL DEFAULT 'agendada' CHECK (estado IN ('agendada', 'cancelada')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
if (!db.prepare('PRAGMA table_info(reuniones)').all().some((c) => c.name === 'modalidad')) {
  db.exec("ALTER TABLE reuniones ADD COLUMN modalidad TEXT NOT NULL DEFAULT 'meet'");
}
// 2.44.0: agenda por admin — cada administrador carga su propia disponibilidad y las reuniones son con alguien concreto.
if (!db.prepare('PRAGMA table_info(reuniones)').all().some((c) => c.name === 'admin_id')) {
  db.exec('ALTER TABLE reuniones ADD COLUMN admin_id INTEGER REFERENCES users(id)');
}
db.exec(`CREATE TABLE IF NOT EXISTS agenda_disponibilidad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dia INTEGER NOT NULL,
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  UNIQUE (admin_id, dia)
);`);
// Arranque: si nadie cargó disponibilidad todavía, cada admin activo hereda la franja global vieja (o L-V 9 a 18).
if (db.prepare('SELECT COUNT(*) AS c FROM agenda_disponibilidad').get().c === 0) {
  const val = (k, def) => { const r = db.prepare("SELECT valor FROM panel_config WHERE panel = '_agenda' AND clave = ?").get(k); return r ? r.valor : def; };
  const dias = String(val('dias', '1,2,3,4,5')).split(',').map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6);
  const desde = val('desde', '09:00'), hasta = val('hasta', '18:00');
  const insD = db.prepare('INSERT OR IGNORE INTO agenda_disponibilidad (admin_id, dia, desde, hasta) VALUES (?, ?, ?, ?)');
  for (const adm of db.prepare("SELECT id FROM users WHERE active = 1 AND role = 'admin'").all()) {
    for (const d of dias) insD.run(adm.id, d, desde, hasta);
  }
}

// 2.42.0: estado del negocio según Google (operativo / cerrado temporal; los cerrados definitivos no se cargan).
if (!db.prepare('PRAGMA table_info(prospectos)').all().some((c) => c.name === 'estado_negocio')) {
  db.exec('ALTER TABLE prospectos ADD COLUMN estado_negocio TEXT');
}

// 2.39.0: modo negocio — se distingue el tipo de consulta ('vendedor' | 'negocio').
if (!db.prepare('PRAGMA table_info(ia_consultas)').all().some((c) => c.name === 'tipo')) {
  db.exec("ALTER TABLE ia_consultas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'vendedor'");
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

// Paneles comerciales configurables. Agregar una empresa nueva = una línea acá.
// CFD (2.12.0) también es configurable: vive en las URLs raíz (/pipeline, /actividad…) y
// mantiene sus etapas y campos históricos como seed; sus comisiones siguen por tipo de venta.
const PANELES_COMERCIALES = [
  {
    slug: 'cfd', nombre: 'Cloud For Deploy',
    etapasSeed: ['Lead', 'Contactado', 'Reunión agendada', 'Discovery hecha', 'Propuesta enviada', 'Negociación'],
    camposSeed: ['Contactos nuevos', 'Toques (llamadas + mensajes + emails)', 'Reuniones agendadas', 'Reuniones realizadas'],
  },
  { slug: 'gondolas', nombre: 'Góndolas' },
  { slug: 'estanterias', nombre: 'Estanterías Reforzadas' },
  { slug: 'sitioweb', nombre: 'SitioWeb Digital' },
];

// Migración 2.27.0: campos calculados de la carga diaria (formula JSON: {op:'suma', campos:[ids]}).
// No se cargan ni se guardan: se calculan al leer sumando otros campos del mismo panel.
if (!db.prepare('PRAGMA table_info(panel_campos)').all().some((c) => c.name === 'formula')) {
  db.exec('ALTER TABLE panel_campos ADD COLUMN formula TEXT');
}
// 2.28.0: las fórmulas son expresiones ({5} + {7} * 2); las sumas de 2.27.0 se convierten.
for (const c of db.prepare('SELECT id, formula FROM panel_campos WHERE formula IS NOT NULL').all()) {
  try {
    const f = JSON.parse(c.formula);
    if (f && Array.isArray(f.campos)) db.prepare('UPDATE panel_campos SET formula = ? WHERE id = ?').run(JSON.stringify({ expr: f.campos.map((id) => `{${id}}`).join(' + ') }), c.id);
  } catch {}
}

// Migración 2.26.0: desde cuándo cada usuario está asignado a cada panel comercial —
// la constancia de carga (rojos/amarillos de la grilla, deudas, recordatorios) se mide desde ahí.
db.exec(`CREATE TABLE IF NOT EXISTS panel_asignaciones (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  panel TEXT NOT NULL,
  fecha TEXT NOT NULL,
  UNIQUE (user_id, panel)
);`);
// Backfill para usuarios previos a esta versión: su primera carga en el panel o el alta de la
// cuenta, lo que sea anterior. INSERT OR IGNORE lo hace idempotente en cada arranque.
{
  const insAsig = db.prepare('INSERT OR IGNORE INTO panel_asignaciones (user_id, panel, fecha) VALUES (?, ?, ?)');
  const primeraCarga = db.prepare('SELECT MIN(fecha) AS f FROM panel_activity WHERE panel = ? AND user_id = ?');
  for (const u of db.prepare('SELECT id, permisos, created_at FROM users').all()) {
    let perms = []; try { perms = JSON.parse(u.permisos || '[]'); } catch {}
    for (const P of PANELES_COMERCIALES) {
      if (!perms.includes(P.slug)) continue;
      const alta = (u.created_at || '').slice(0, 10);
      const prim = primeraCarga.get(P.slug, u.id).f;
      insAsig.run(u.id, P.slug, prim && prim < alta ? prim : alta);
    }
  }
}

// Migración 2.9.0: preferencias de notificaciones del admin.
const userCols2 = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols2.includes('notif_prefs')) {
  db.exec("ALTER TABLE users ADD COLUMN notif_prefs TEXT NOT NULL DEFAULT '{}'");
}

// Migración 2.10.0: último login / última interacción + historial de acciones del usuario.
if (!userCols2.includes('last_login_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT');
  db.exec('ALTER TABLE users ADD COLUMN last_seen_at TEXT');
}
db.exec(`CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tipo TEXT NOT NULL,
  detalle TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

// Migración 2.14.0: changelog al entrar, avisos con "visto por" y alertas modales del admin.
if (!userCols2.includes('last_version_vista')) {
  db.exec('ALTER TABLE users ADD COLUMN last_version_vista TEXT');
}

// Migración 2.15.2: foto de perfil del usuario (archivo en data/avatars).
if (!userCols2.includes('avatar')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
}

// Migración 2.16.0: Campus de formación (documentación y videos por empresa, estilo Udemy).
db.exec(`CREATE TABLE IF NOT EXISTS campus_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  url TEXT,
  archivo TEXT,
  archivo_nombre TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

// Migración 2.21.0: encuestas al equipo (modal de votación + resultados en vivo).
db.exec(`CREATE TABLE IF NOT EXISTS encuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pregunta TEXT NOT NULL,
  opciones TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS encuesta_votos (
  encuesta_id INTEGER NOT NULL REFERENCES encuestas(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opcion INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (encuesta_id, user_id)
);`);

// Migración 2.19.0: cursos del campus + quizzes por contenido.
db.exec(`CREATE TABLE IF NOT EXISTS campus_cursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS campus_quiz_preguntas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES campus_items(id) ON DELETE CASCADE,
  pregunta TEXT NOT NULL,
  opciones TEXT NOT NULL,
  correcta INTEGER NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS campus_quiz_intentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES campus_items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  puntaje INTEGER NOT NULL,
  aprobado INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
try {
  const ciCols2 = db.prepare('PRAGMA table_info(campus_items)').all().map((c) => c.name);
  if (ciCols2.length && !ciCols2.includes('curso_id')) {
    db.exec('ALTER TABLE campus_items ADD COLUMN curso_id INTEGER REFERENCES campus_cursos(id)');
  }
  // El primer curso existe siempre; todo el contenido que ya estaba cargado pasa adentro.
  let curso = db.prepare("SELECT id FROM campus_cursos WHERE nombre = 'Cloud for deploy basico'").get();
  if (!curso) {
    const adminId = (db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() || { id: 1 }).id;
    const r = db.prepare("INSERT INTO campus_cursos (empresa, nombre, descripcion, orden, created_by) VALUES ('cfd', 'Cloud for deploy basico', 'Formación inicial de Cloud For Deploy: mirá los contenidos en orden y aprobá los quizzes para avanzar.', 1, ?)").run(adminId);
    curso = { id: r.lastInsertRowid };
  }
  db.prepare("UPDATE campus_items SET curso_id = ?, empresa = 'cfd' WHERE curso_id IS NULL").run(curso.id);
} catch (e) { console.error('Migración cursos campus:', e.message); }

// Migración 2.18.0: orden del contenido del campus (curso secuencial).
try {
  const ciCols = db.prepare('PRAGMA table_info(campus_items)').all().map((c) => c.name);
  if (ciCols.length && !ciCols.includes('orden')) {
    db.exec('ALTER TABLE campus_items ADD COLUMN orden INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE campus_items SET orden = id');
  }
} catch {}

// Migración 2.17.1: validación de video completo — tiempo realmente reproducido y marca de completado.
try {
  const vCols = db.prepare('PRAGMA table_info(campus_vistas)').all().map((c) => c.name);
  if (vCols.length && !vCols.includes('reproducido')) {
    db.exec('ALTER TABLE campus_vistas ADD COLUMN reproducido REAL NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE campus_vistas ADD COLUMN completado_at TEXT');
  }
} catch {}

// Migración 2.17.0: tracking de vistas del campus (quién vio qué y, en videos subidos, hasta dónde).
db.exec(`CREATE TABLE IF NOT EXISTS campus_vistas (
  item_id INTEGER NOT NULL REFERENCES campus_items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  veces INTEGER NOT NULL DEFAULT 0,
  segundos REAL NOT NULL DEFAULT 0,
  duracion REAL,
  reproducido REAL NOT NULL DEFAULT 0,
  completado_at TEXT,
  primera_vista TEXT NOT NULL DEFAULT (datetime('now')),
  ultima_vista TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (item_id, user_id)
);`);
const notiCols = db.prepare('PRAGMA table_info(notifications)').all().map((c) => c.name);
if (!notiCols.includes('lote')) {
  db.exec('ALTER TABLE notifications ADD COLUMN lote TEXT');
  db.exec('ALTER TABLE notifications ADD COLUMN leida_at TEXT');
}
// Migración 2.16.1: quién generó la notificación (para mostrar nombre y foto).
if (!notiCols.includes('actor_id')) {
  db.exec('ALTER TABLE notifications ADD COLUMN actor_id INTEGER REFERENCES users(id)');
}
db.exec(`CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS banner_vistos (
  banner_id INTEGER NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  visto_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (banner_id, user_id)
);`);

// Sistemas del ecosistema (para permisos por usuario).
const SISTEMAS = [
  ['cfd', 'Comercial Cloud For Deploy'],
  ['gondolas', 'Comercial Góndolas'],
  ['estanterias', 'Comercial Estanterías Reforzadas'],
  ['sitioweb', 'Comercial SitioWeb Digital'],
  ['cobranza', 'Panel de Cobranza'],
  ['developers', 'Panel de Developers'],
  ['clientes', 'Panel de Clientes (prospectos)'],
];

// Etapas del tablero de proyectos del Panel de Developers.
const ETAPAS_DEV = ['Por iniciar', 'En desarrollo', 'En revisión', 'Entregado'];

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
    (p.etapasSeed || ['Lead', 'Contactado', 'Visita realizada', 'Cotización enviada', 'Negociación']).forEach((n, i) => ins.run(p.slug, n, i + 1));
  }
  if (db.prepare('SELECT COUNT(*) AS c FROM panel_campos WHERE panel = ?').get(p.slug).c === 0) {
    const ins = db.prepare('INSERT INTO panel_campos (panel, label, orden) VALUES (?, ?, ?)');
    (p.camposSeed || ['Llamadas', 'Visitas', 'Cotizaciones enviadas']).forEach((n, i) => ins.run(p.slug, n, i + 1));
  }
  if (p.slug === 'cfd') continue; // CFD comisiona por tipo de venta, no por regla de rubro.
  // Regla de comisión por rubro: % plano cobrable al momento (editable en Cobranza → Reglas).
  if (!db.prepare('SELECT 1 FROM commission_rules WHERE tipo_venta = ?').get(p.slug)) {
    db.prepare('INSERT INTO commission_rules (tipo_venta, config) VALUES (?, ?)')
      .run(p.slug, JSON.stringify({ tipo: 'flat', pct: 5, nota: `Venta de ${p.nombre}: comisión única cobrable al momento.` }));
  }
}

// Migración 2.12.0: CFD pasa a panel configurable — su actividad y objetivos históricos
// se copian a las tablas genéricas (una sola vez; la tabla vieja queda como respaldo).
try {
  const cfdCampos = db.prepare("SELECT id, label FROM panel_campos WHERE panel = 'cfd' ORDER BY orden").all();
  const campoId = (patron) => { const c = cfdCampos.find((x) => patron.test(x.label)); return c ? 'c' + c.id : null; };
  const kCon = campoId(/contacto/i), kToq = campoId(/toque/i), kAge = campoId(/agendada/i), kRea = campoId(/realizada/i);
  if (kToq && db.prepare("SELECT COUNT(*) c FROM panel_activity WHERE panel = 'cfd'").get().c === 0) {
    const insA = db.prepare("INSERT OR IGNORE INTO panel_activity (panel, user_id, fecha, valores, notas) VALUES ('cfd', ?, ?, ?, ?)");
    for (const a of db.prepare('SELECT * FROM activity').all()) {
      const v = {};
      if (kCon) v[kCon] = a.contactos || 0;
      v[kToq] = a.toques || 0;
      if (kAge) v[kAge] = a.reuniones_agendadas || 0;
      if (kRea) v[kRea] = a.reuniones_realizadas || 0;
      insA.run(a.user_id, a.fecha, JSON.stringify(v), a.notas);
    }
  }
  if (kToq && db.prepare("SELECT COUNT(*) c FROM panel_goals WHERE panel = 'cfd'").get().c === 0) {
    const insG = db.prepare("INSERT OR IGNORE INTO panel_goals (panel, user_id, periodo, valores) VALUES ('cfd', ?, ?, ?)");
    for (const g of db.prepare('SELECT * FROM goals').all()) {
      const v = { ganados: g.ganados || 0, ingresos: g.mrr || 0 };
      v[kToq] = g.toques || 0;
      if (kRea) v[kRea] = g.reuniones || 0;
      insG.run(g.user_id, g.periodo, JSON.stringify(v));
    }
  }
} catch (e) { console.error('Migración CFD→panel:', e.message); }

// Regla real de SitioWeb Digital (2.11.2): 80% del valor mensual durante 2 meses.
// Solo pisa el default sembrado (5% plano) para no tocar una regla que el admin ya haya editado.
try {
  const sw = db.prepare("SELECT config FROM commission_rules WHERE tipo_venta = 'sitioweb'").get();
  if (sw && JSON.parse(sw.config).tipo === 'flat' && JSON.parse(sw.config).pct === 5) {
    db.prepare("UPDATE commission_rules SET config = ? WHERE tipo_venta = 'sitioweb'").run(JSON.stringify({
      tipo: 'fases', fases: [{ meses: 2, pct: 80 }],
      nota: 'Venta de SitioWeb Digital: 80% del valor mensual durante los primeros 2 meses. Si el cliente cancela, se cancelan las cuotas restantes.',
    }));
  }
} catch {}

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
// Calificación del cliente: obligatoria para aprobar una venta Ganada.
const CALIFICACIONES = ['Calificado', 'Descalificado', 'Cliente', 'Cliente de Alto Valor'];
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

// Secciones del Campus de formación: una por empresa + General.
const CAMPUS_EMPRESAS = [['general', 'General'], ...PANELES_COMERCIALES.map((p) => [p.slug, p.nombre])];

module.exports = { db, seedAdmin, getSessionSecret, ETAPAS, ETAPAS_ACTIVAS, ORIGENES, MOTIVOS, TIPOS_VENTA, CALIFICACIONES, SISTEMAS, PANELES_COMERCIALES, CAMPUS_EMPRESAS, ETAPAS_DEV };
