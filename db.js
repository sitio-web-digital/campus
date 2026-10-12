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
// 3.4.3: macro admin — el único que ve las herramientas en incubación (Inteligencia B2B).
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'macro')) {
  db.exec('ALTER TABLE users ADD COLUMN macro INTEGER NOT NULL DEFAULT 0');
}
db.prepare("UPDATE users SET macro = 1 WHERE email = 'admin@cloudfordeploy.com'").run();

// 3.6.0: formularios efímeros para clientes — un link público por lead, con vencimiento.
db.exec(`CREATE TABLE IF NOT EXISTS form_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'generico' CHECK (tipo IN ('generico', 'custom')),
  preguntas TEXT NOT NULL,
  respuestas TEXT,
  respondido_at TEXT,
  expira_at TEXT NOT NULL,
  creado_por INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

// 3.6.1: planillas de preguntas (estilo Google Forms) + titulo del link.
db.exec(`CREATE TABLE IF NOT EXISTS form_plantillas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  preguntas TEXT NOT NULL,
  creado_por INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
if (!db.prepare('PRAGMA table_info(form_links)').all().some((c) => c.name === 'titulo')) {
  db.exec('ALTER TABLE form_links ADD COLUMN titulo TEXT');
}
if (db.prepare('SELECT COUNT(*) AS c FROM form_plantillas').get().c === 0) {
  const insPl = db.prepare('INSERT INTO form_plantillas (nombre, preguntas) VALUES (?, ?)');
  insPl.run('Genéricas', JSON.stringify([
    '¿Cómo se llama tu negocio y a qué se dedica?',
    '¿Tenés página web o tienda online hoy? Si tenés, ¿cuál es?',
    '¿Qué te gustaría resolver o mejorar? (página web, tienda online, sistema a medida…)',
    '¿Qué funcionalidades no pueden faltar?',
    '¿Manejás un presupuesto aproximado?',
    '¿Para cuándo lo necesitás?',
    '¿Cuál es el mejor medio y horario para contactarte?',
  ]));
  insPl.run('Página web', JSON.stringify([
    '¿Tenés una web hoy? ¿Qué te gusta y qué no de la actual?',
    '¿Qué secciones querés? (galería, contacto, ubicación, turnos, preguntas frecuentes…)',
    '¿Tenés logo, fotos y textos propios, o hay que armarlos?',
    '¿Qué webs de otros negocios te gustan como referencia?',
    '¿Ya tenés dominio contratado? ¿Cuál?',
    '¿Para cuándo la necesitás?',
  ]));
  insPl.run('Tienda online', JSON.stringify([
    '¿Cuántos productos vas a vender aproximadamente?',
    '¿Cómo cobrás hoy? (efectivo, transferencia, MercadoPago, tarjetas…)',
    '¿Hacés envíos? ¿Con qué empresa o cómo?',
    '¿Tenés fotos y descripciones de los productos?',
    '¿Cómo manejás el stock hoy?',
    '¿Manejás un presupuesto y un plazo?',
  ]));
  insPl.run('Sistema a medida', JSON.stringify([
    '¿Qué proceso de tu negocio querés sistematizar?',
    '¿Cómo lo manejan hoy? (papel, Excel, otro sistema…)',
    '¿Cuántas personas lo usarían?',
    '¿Qué reportes o números necesitás ver?',
    '¿Tiene que integrarse con algo? (facturación, stock, otro software)',
    '¿Qué urgencia y presupuesto manejás?',
  ]));
}

// 3.6.2: dos planillas genéricas más (INSERT OR IGNORE: entra también en bases existentes).
{
  const insPl2 = db.prepare('INSERT OR IGNORE INTO form_plantillas (nombre, preguntas) VALUES (?, ?)');
  insPl2.run('Post-reunión', JSON.stringify([
    '¿Qué te pareció lo que charlamos en la reunión?',
    '¿Qué dudas te quedaron dando vueltas?',
    '¿Participa alguien más de la decisión? ¿Quién?',
    '¿El presupuesto que hablamos te cierra, o necesitás otra alternativa?',
    '¿Cuándo te gustaría arrancar?',
  ]));
  insPl2.run('Arranque de proyecto', JSON.stringify([
    'Nombre o razón social para la facturación',
    '¿Tenés logo y colores definidos? ¿Dónde los conseguimos?',
    'Textos y fotos: ¿los tenés vos o los armamos nosotros?',
    'Accesos que haya que tener a mano (dominio, hosting, redes)',
    '¿Quién va a ser el contacto del día a día y su teléfono?',
  ]));
}

// 3.7.1: relevamiento unificado con tópicos (los ítems {"t": "..."} son títulos de sección).
{
  db.prepare("DELETE FROM form_plantillas WHERE nombre LIKE 'Relevamiento _ ·%'").run();
  db.prepare('INSERT OR IGNORE INTO form_plantillas (nombre, preguntas) VALUES (?, ?)')
    .run('Relevamiento sistema a medida', JSON.stringify([{"t": "Operación y stock"}, "¿Cómo es el proceso completo desde que llega la mercadería hasta que queda disponible para vender?", "¿Qué representa exactamente una etiqueta dentro de la operación?", "¿Cuál es la unidad mínima que necesitan poder rastrear individualmente?", "¿En qué momento exacto una mercadería entra al stock y en qué momento deja de estar disponible?", "¿Qué información necesitan conocer de una unidad de stock en cualquier momento?", "¿Qué tipos de fraccionamiento realizan y cómo administran el saldo restante de una etiqueta parcialmente utilizada?", "¿Qué tipos de transformación realizan actualmente y qué productos pueden obtenerse de cada una?", "¿Una transformación puede utilizar varias etiquetas, lotes, marcas o proveedores al mismo tiempo? ¿Cómo debería mantenerse la trazabilidad?", "¿Qué ocurre con la etiqueta de origen después de un fraccionamiento o transformación?", "¿Cómo registran y clasifican diferencias de peso, mermas, descartes y subproductos?", "¿Qué errores operativos son los más frecuentes actualmente?", "¿Qué debería hacer el sistema cuando dos personas intentan trabajar simultáneamente sobre la misma existencia?", "Si un cliente reclama un producto vendido meses atrás, ¿qué información necesitan poder reconstruir desde la venta hasta el ingreso original?", "¿Qué procesos vinculados al stock realizan hoy fuera del sistema?", {"t": "Administración y costos"}, "¿Cómo se relaciona una recepción de mercadería con la factura y el remito del proveedor?", "¿Qué ocurre cuando el peso recibido no coincide con el peso facturado?", "¿Cómo determinan actualmente el costo de una mercadería al momento de ingresarla?", "Cuando un producto se fracciona o transforma, ¿cómo distribuyen el costo original entre los productos resultantes?", "¿Cómo se valorizan mermas, descartes, grasa, hueso y otros subproductos?", "¿Qué método de costeo utilizan o desean utilizar?", "¿Cómo es el proceso completo desde que un cliente realiza un pedido hasta que la mercadería es entregada y facturada?", "¿En qué momento se reserva o descuenta el stock de un pedido?", "¿Qué reglas comerciales existen por cliente?", "¿Cómo se registra actualmente un cobro y cuándo se considera realmente confirmado?", "¿Cómo funciona la rendición de los choferes y qué controles realiza Tesorería o Administración antes de imputar los pagos?", "¿Cómo debería funcionar la cuenta corriente de clientes y la de proveedores?", "¿Qué información necesitan obtener para calcular correctamente costo de mercadería vendida, margen y rentabilidad?", "¿Qué reportes o indicadores utilizan realmente para tomar decisiones diarias, semanales y mensuales?", "¿Qué tareas administrativas realizan hoy manualmente o fuera del sistema y consideran prioritario eliminar o automatizar?", {"t": "Sistema y seguridad"}, "¿Qué funcionalidades del sistema actual son imprescindibles y no pueden perderse en una nueva solución?", "¿Qué problemas concretos del sistema actual quieren eliminar sí o sí?", "¿Qué operaciones deberían poder corregirse o anularse y cuáles nunca deberían eliminarse físicamente?", "¿Qué roles de usuario existen y qué debería poder hacer cada uno?", "¿Qué operaciones deberían requerir autorización especial o doble aprobación?", "¿Qué información debe quedar registrada para poder auditar una operación meses después?", "¿Qué información consideran sensible o confidencial y quién debería poder acceder, visualizarla o exportarla?", "¿Qué sistemas o equipos deben integrarse obligatoriamente con la nueva solución?", "¿Qué información esperan intercambiar con cada integración y con qué frecuencia?", "¿Qué debe ocurrir si se corta Internet, falla una integración o un dispositivo deja de funcionar?", "¿Cuántos usuarios y operaciones simultáneas estiman en un día normal y en temporada alta?", "¿Qué nivel de disponibilidad necesitan y cuánto tiempo podrían operar sin sistema?", "¿Qué política esperan para backups y recuperación ante pérdida de información?", "¿Qué información del sistema actual debe migrarse?", "¿Qué acceso existe hoy al sistema actual y a su base de datos para analizar, exportar y validar la información antes de la migración?"]));
}

// 3.7.5: la planilla de relevamiento pasa a llamarse JRB (el cliente) + relevamiento CRM nuevo.
{
  // Si ya existe una planilla 'JRB' (creada a mano en su momento), el relevamiento manda: se pisa.
  if (db.prepare("SELECT 1 FROM form_plantillas WHERE nombre = 'Relevamiento sistema a medida'").get()) {
    db.prepare("DELETE FROM form_plantillas WHERE nombre = 'JRB'").run();
    db.prepare("UPDATE form_plantillas SET nombre = 'JRB' WHERE nombre = 'Relevamiento sistema a medida'").run();
  }
  db.prepare('INSERT OR IGNORE INTO form_plantillas (nombre, preguntas) VALUES (?, ?)')
    .run('Relevamiento CRM', JSON.stringify([{"t": "Tu equipo y cómo venden hoy"}, "¿Quiénes venden hoy? ¿Cuántas personas son y qué rol tiene cada una?", "¿Cómo es el recorrido de una venta, desde que aparece un interesado hasta que se cierra? Contanos las etapas como las viven ustedes.", "¿Dónde registran hoy a los clientes y las ventas? (cuaderno, Excel, WhatsApp, otro sistema…)", "¿Qué se pierde o se traspapela más seguido en ese proceso? (contactos sin responder, presupuestos sin seguimiento, datos desactualizados…)", "¿Qué define que una venta está \"ganada\"? ¿Quién la aprueba o la confirma?", {"t": "Clientes y oportunidades"}, "¿Por dónde llegan los interesados? (recomendación, redes, WhatsApp, local, vendedores que salen a buscar…) ¿Cuáles valen más?", "¿Qué datos de un cliente necesitan tener siempre a mano? (zona, rubro, historial de compras, condición de pago…)", "¿Cuántos clientes activos manejan y cuántos contactos nuevos aparecen por semana, aproximadamente?", "¿Separan a los clientes por tipo o importancia? ¿Cómo? (mayorista/minorista, tamaño, zona…)", "¿Un mismo cliente puede tener varias compras o negociaciones abiertas a la vez? ¿Cómo lo manejan?", {"t": "Seguimiento del día a día"}, "¿Por qué canales hablan con los clientes? (WhatsApp, llamadas, visitas, email…) ¿Cuál es el principal?", "¿Cómo se acuerdan hoy de volver a contactar a alguien? ¿Qué les gustaría que el sistema les recuerde solo?", "¿Qué debería pasar con los clientes de un vendedor cuando se va de la empresa o está de vacaciones?", "¿Los vendedores cargan información desde la calle? ¿Con qué dispositivo? (celular, tablet, solo en la oficina…)", {"t": "Números, metas y administración"}, "¿Qué números querés ver apenas abrís el sistema? (ventas del mes, cobros pendientes, ranking de vendedores, clientes sin visitar…)", "¿Manejan metas o comisiones por vendedor? ¿Cómo se calculan hoy?", "¿El CRM tiene que conectarse con algo que ya usan? (facturación, stock, contabilidad, planillas…)", "¿Quién debería poder ver qué? (¿un vendedor ve solo lo suyo? ¿quién ve los números globales y los precios especiales?)", "¿Hay algo más del día a día comercial que te gustaría que el sistema resuelva y no te preguntamos?"]));
}

// 3.8.0: relevamiento JRB completo (los 44 del base + la bateria de octubre, con destinatario).
db.prepare('INSERT OR IGNORE INTO form_plantillas (nombre, preguntas) VALUES (?, ?)')
  .run('Relevamiento JRB completo', JSON.stringify([{"t": "Operación y stock (base)"}, "¿Cómo es el proceso completo desde que llega la mercadería hasta que queda disponible para vender?", "¿Qué representa exactamente una etiqueta dentro de la operación?", "¿Cuál es la unidad mínima que necesitan poder rastrear individualmente?", "¿En qué momento exacto una mercadería entra al stock y en qué momento deja de estar disponible?", "¿Qué información necesitan conocer de una unidad de stock en cualquier momento?", "¿Qué tipos de fraccionamiento realizan y cómo administran el saldo restante de una etiqueta parcialmente utilizada?", "¿Qué tipos de transformación realizan actualmente y qué productos pueden obtenerse de cada una?", "¿Una transformación puede utilizar varias etiquetas, lotes, marcas o proveedores al mismo tiempo? ¿Cómo debería mantenerse la trazabilidad?", "¿Qué ocurre con la etiqueta de origen después de un fraccionamiento o transformación?", "¿Cómo registran y clasifican diferencias de peso, mermas, descartes y subproductos?", "¿Qué errores operativos son los más frecuentes actualmente?", "¿Qué debería hacer el sistema cuando dos personas intentan trabajar simultáneamente sobre la misma existencia?", "Si un cliente reclama un producto vendido meses atrás, ¿qué información necesitan poder reconstruir desde la venta hasta el ingreso original?", "¿Qué procesos vinculados al stock realizan hoy fuera del sistema?", {"t": "Administración y costos (base)"}, "¿Cómo se relaciona una recepción de mercadería con la factura y el remito del proveedor?", "¿Qué ocurre cuando el peso recibido no coincide con el peso facturado?", "¿Cómo determinan actualmente el costo de una mercadería al momento de ingresarla?", "Cuando un producto se fracciona o transforma, ¿cómo distribuyen el costo original entre los productos resultantes?", "¿Cómo se valorizan mermas, descartes, grasa, hueso y otros subproductos?", "¿Qué método de costeo utilizan o desean utilizar?", "¿Cómo es el proceso completo desde que un cliente realiza un pedido hasta que la mercadería es entregada y facturada?", "¿En qué momento se reserva o descuenta el stock de un pedido?", "¿Qué reglas comerciales existen por cliente?", "¿Cómo se registra actualmente un cobro y cuándo se considera realmente confirmado?", "¿Cómo funciona la rendición de los choferes y qué controles realiza Tesorería o Administración antes de imputar los pagos?", "¿Cómo debería funcionar la cuenta corriente de clientes y la de proveedores?", "¿Qué información necesitan obtener para calcular correctamente costo de mercadería vendida, margen y rentabilidad?", "¿Qué reportes o indicadores utilizan realmente para tomar decisiones diarias, semanales y mensuales?", "¿Qué tareas administrativas realizan hoy manualmente o fuera del sistema y consideran prioritario eliminar o automatizar?", {"t": "Sistema y seguridad (base)"}, "¿Qué funcionalidades del sistema actual son imprescindibles y no pueden perderse en una nueva solución?", "¿Qué problemas concretos del sistema actual quieren eliminar sí o sí?", "¿Qué operaciones deberían poder corregirse o anularse y cuáles nunca deberían eliminarse físicamente?", "¿Qué roles de usuario existen y qué debería poder hacer cada uno?", "¿Qué operaciones deberían requerir autorización especial o doble aprobación?", "¿Qué información debe quedar registrada para poder auditar una operación meses después?", "¿Qué información consideran sensible o confidencial y quién debería poder acceder, visualizarla o exportarla?", "¿Qué sistemas o equipos deben integrarse obligatoriamente con la nueva solución?", "¿Qué información esperan intercambiar con cada integración y con qué frecuencia?", "¿Qué debe ocurrir si se corta Internet, falla una integración o un dispositivo deja de funcionar?", "¿Cuántos usuarios y operaciones simultáneas estiman en un día normal y en temporada alta?", "¿Qué nivel de disponibilidad necesitan y cuánto tiempo podrían operar sin sistema?", "¿Qué política esperan para backups y recuperación ante pérdida de información?", "¿Qué información del sistema actual debe migrarse?", "¿Qué acceso existe hoy al sistema actual y a su base de datos para analizar, exportar y validar la información antes de la migración?", {"t": "Generales y alcance"}, "(P) ¿Cuáles son los 3 problemas que más les duelen hoy y que el sistema nuevo tiene que resolver sí o sí? — responde: Dueño", "(P) ¿Qué módulos entran en esta primera etapa: Stock, Ventas, Facturación, Clientes? ¿Contabilidad queda para después? — responde: Dueño", "¿Cuántas personas usan el sistema hoy y en qué puestos (depósito, fraccionamiento, facturación, ventas, administración, gerencia)? — responde: Admin", "¿Cuántas PCs y puestos de trabajo hay, y dónde está cada uno (precámara, pecera, administración, ventas)? — responde: Admin", "¿En qué horario opera la empresa cada día? ¿Hay algún momento sin actividad para mantenimiento o actualizaciones? — responde: Admin", "¿Volúmenes aproximados por día: lotes recibidos, etiquetas generadas, pedidos, comprobantes emitidos, kilos vendidos? — responde: Admin", "¿Tienen planes de abrir otra sucursal, otro depósito o vender online en los próximos años? — responde: Dueño", "¿Hay normativa sanitaria (SENASA, bromatología) que les exija registros de trazabilidad, temperaturas o vencimientos? — responde: Dueño", "¿Qué esperan del período de ajuste: cuánto tiempo pueden convivir el sistema viejo y el nuevo? — responde: Dueño", "¿Quién va a ser el referente del cliente para validar documentos y tomar decisiones del proyecto? — responde: Dueño", {"t": "Stock: recepción, lotes y costeo"}, "(P) ¿Nos pasan la lista de proveedores, indicando cuáles mandan código de barras en la caja y si incluyen peso neto? — responde: Admin", "(P) ¿Un lote es un ingreso de un proveedor en un día, o puede juntar varios proveedores o varios comprobantes? — responde: Admin", "¿Qué datos se cargan hoy en el lote: proveedor, remito, factura, fecha, vencimiento, temperatura, frigorífico, tropa? — responde: Depósito", "¿Se registra la fecha de vencimiento por caja o por lote? ¿Se usa para decidir qué se vende primero? — responde: Depósito", "¿Qué pasa si llegan menos bultos que los del remito, o cajas rotas o en mal estado? ¿Se registra un rechazo o diferencia? — responde: Depósito", "¿El remito llega siempre antes que la factura? ¿Qué pasa si la factura llega días después? — responde: Admin", "¿El costo se carga por kilo o por caja? ¿Neto de IVA? ¿Incluye flete u otros gastos? — responde: Admin", "¿Qué pasa si el proveedor cambia el precio o hace una nota de crédito sobre un lote ya cargado? — responde: Admin", "¿Cómo se fija el precio de venta: margen sobre el costo, precio fijo por producto, actualización manual? ¿Quién lo actualiza y cada cuánto? — responde: Dueño", "¿Qué impresoras de etiquetas usan, qué tamaño de etiqueta y qué datos imprime hoy (código, peso, producto, fecha, lote)? — responde: Depósito", "¿Cómo se identifica la etiqueta madre del granel si no tiene etiqueta física? — responde: Depósito", "¿Los congelados y los frescos tienen tratamientos distintos en la recepción? — responde: Depósito", {"t": "Stock: fraccionamiento, transformación, desposte y molida"}, "(P) ¿Nos pasan el catálogo de cortes que salen de una media res, con sus códigos y el porcentaje esperado de cada uno? — responde: Depósito", "(P) ¿Qué transformaciones hacen hoy además de nalga → feteada y matambre reenvasado? Necesitamos la lista completa con producto origen y productos resultantes. — responde: Depósito", "¿Cómo se reparte el costo en una transformación o desposte: todos los resultantes heredan el mismo costo por kilo, o un filet debería costar más que una molida? — responde: Admin", "¿Tienen porcentajes de merma esperados por producto y marca? ¿Quieren que el sistema avise cuando una merma supera lo normal? — responde: Admin", "¿Qué recetas usa el pastón de molida (qué recortes y en qué proporción)? ¿Hay distintos tipos de molida? — responde: Depósito", "¿Qué promos por unidad existen (bolsas de 3, 5, 7 kg, otras)? ¿El peso de la promo es exacto o aproximado? — responde: Ventas", "¿Cuántos puestos fraccionan al mismo tiempo y cuántas balanzas hay? ¿Qué marca y modelo de balanza? — responde: Depósito", "¿El descarte se vende (hueso, grasa) o se tira? ¿Tiene un precio de recupero? — responde: Admin", "¿Se puede fraccionar una etiqueta hija nuevamente (nietas)? ¿Cuántos niveles llega a tener el árbol? — responde: Depósito", "¿Qué debería pasar si se corta la luz a mitad de un fraccionamiento: retomar donde quedó o anular todo? — responde: Admin", "¿Quién puede autorizar una transformación que no balancea en cero? — responde: Admin", "¿Se fracciona según los pedidos del día, o se fracciona por adelantado y queda en stock? — responde: Depósito", {"t": "Stock: depósitos, control de stock y trazabilidad"}, "(P) ¿Las cuatro cámaras del depósito central se manejan como un solo depósito o necesitan saber en qué cámara está cada etiqueta? — responde: Depósito", "¿Qué pasos tiene una transferencia central → minorista y minorista → central? ¿Se imprime algún comprobante? — responde: Depósito", "¿Quiénes son autorizadores hoy y para qué operaciones además de la transferencia minorista → central? — responde: Admin", "¿Cada cuánto hacen control de stock físico? ¿Total o por rubro? ¿Cómo se registra la diferencia y se descuenta al empleado? — responde: Admin", "¿Quieren que el sistema avise la mercadería fresca con más de 24-48 h en boca de expendio? — responde: Dueño", "¿Quieren alertas de vencimiento próximo o stock mínimo por producto? — responde: Dueño", "¿Qué motivos de anulación de etiqueta existen hoy y quién puede anular? — responde: Admin", "Ante un reclamo, ¿hasta dónde necesitan rastrear: proveedor y factura, o también frigorífico, tropa y fecha de faena? — responde: Admin", "¿Hay devoluciones de clientes que vuelvan al stock? ¿Se reingresan con la misma etiqueta o se descartan? — responde: Admin", "¿Qué informes de stock usan de verdad hoy y cuáles podemos eliminar? — responde: Admin", {"t": "Ventas y pedidos"}, "(P) ¿Cómo es el día de un televendedor: a quién llama, en qué orden, cuántos llamados y pedidos hace por día? — responde: Ventas", "(P) ¿Qué datos lleva una nota de pedido: cliente, productos, cantidad en unidades o kilos, fecha y horario de entrega, observaciones? — responde: Ventas", "¿Por qué canales entran pedidos: teléfono, WhatsApp, el vendedor en la calle, el cliente en el local? — responde: Ventas", "¿Se puede modificar o cancelar un pedido después de cargado? ¿Hasta qué momento y quién? — responde: Ventas", "¿Qué pasa si no hay stock de lo pedido: se reemplaza por otro producto, se entrega parcial, queda pendiente? — responde: Ventas", "¿Cómo llega el pedido a la precámara para prepararlo? ¿Se imprime una lista? ¿Quién lo arma? — responde: Depósito", "¿Qué debería hacer la agenda para que la usen: recordatorios, lista de llamados del día, clientes que dejaron de comprar? — responde: Ventas", "¿Los televendedores negocian precios o descuentos, o solo venden a la lista asignada al cliente? — responde: Ventas", "¿Hay pedido mínimo, días de entrega por zona o cortes horarios para recibir pedidos? — responde: Ventas", "¿Qué esperan de la mensajería masiva: promociones, avisos de precios, recordatorios? ¿Por WhatsApp? — responde: Dueño", {"t": "Facturación, guías de reparto y rendiciones"}, "(P) ¿Qué tipos de comprobante emiten (Factura A, B, C, notas de crédito y débito, remito)? ¿Con qué puntos de venta? — responde: Admin", "(P) ¿Cuál es el circuito de una nota de venta (remito valorizado): cuándo y cómo se convierte en factura? El tratamiento fiscal lo define el contador. — responde: Admin", "¿Qué datos tiene una guía de reparto: ruta, chofer, vehículo, horario, comprobantes? ¿Cuántas rutas y choferes hay? — responde: Facturación", "(P) ¿Cómo rinde el chofer al volver: qué entrega (efectivo, transferencias, comprobantes firmados) y quién lo controla? — responde: Admin", "¿Qué pasa si el cliente rechaza mercadería en la entrega o no está? ¿Cómo vuelve al stock y se anula el comprobante? — responde: Admin", "¿El chofer cobra en la entrega o todo queda en cuenta corriente? ¿Emite recibos? — responde: Admin", "¿Qué medios de pago acepta la boca de expendio y cómo se cierra la caja al final del día? ¿Hay varios turnos o cajeros? — responde: Facturación", "¿Quieren automatizar la verificación de transferencias (hoy se manda foto al grupo y se revisa en el banco)? — responde: Admin", "¿Quién hace notas de crédito y por qué motivos? ¿Necesitan autorización? — responde: Admin", "¿Con qué frecuencia usan comprobantes manuales por cortes de luz? ¿Quieren que el sistema funcione sin conexión? — responde: Admin", "¿Nos pueden gestionar una clave para el ambiente de homologación de ARCA, para desarrollar sin afectar la facturación real? — responde: Admin", "¿Hay retenciones, percepciones (IIBB) o regímenes especiales que el comprobante tenga que calcular? — responde: Admin", {"t": "Clientes, listas de precios y comisiones"}, "(P) ¿Qué datos son obligatorios para dar de alta un cliente? ¿Qué pasa con consumidores finales sin CUIT? — responde: Admin", "¿Qué criterio define un cliente \"activo\": compró en los últimos 30, 60, 90 días? — responde: Dueño", "¿Quién decide si un cliente trabaja en cuenta corriente? ¿Tiene límite de crédito o plazo de pago? ¿Se bloquea si debe? — responde: Admin", "¿Qué diferencia hay entre \"fiado\" y \"cuenta corriente\"? — responde: Admin", "¿Para qué sirven las 6 listas de precios? ¿Cuáles se usan realmente (se mencionaron 1, 2, 3 y 4)? ¿Se calculan como porcentaje sobre la lista 1? — responde: Admin", "¿Hay precios especiales por cliente o promociones por cantidad? — responde: Ventas", "¿Qué parte de la base de clientes debería ver un televendedor: solo sus clientes asignados, o todos? ¿Puede exportar? — responde: Dueño", "¿Quieren que la migración incluya una depuración de clientes duplicados? ¿Quién valida qué registro queda? — responde: Admin", "(P) ¿Nos pasan la tabla de rangos de comisión (kilos desde/hasta e importe)? ¿Se calcula sobre kilos facturados, cobrados o entregados? — responde: Admin", "¿Las notas de crédito y devoluciones descuentan kilos de la comisión? — responde: Admin", "¿Proveedores, acreedores y empleados tienen que seguir en el mismo maestro que los clientes? — responde: Admin", {"t": "Informes y comparativas"}, "(P) ¿Qué comparativas quiere ver Julián en una sola pantalla (hoy vs ayer, mes vs mes anterior, vs mismo mes del año pasado)? ¿De qué indicadores: kilos, importe, clientes, margen? — responde: Dueño", "¿Qué 5 números mira Julián todos los días para saber cómo va el negocio? — responde: Dueño", "¿Qué informes arman hoy en Excel a partir de exportaciones del sistema? ¿Nos pueden pasar ejemplos? — responde: Admin", "¿Qué indicadores necesita el jefe de ventas por televendedor: kilos, pedidos, clientes contactados, clientes nuevos o perdidos? — responde: Ventas", "¿Necesitan un estado de resultados o margen por producto, por rubro o por cliente? — responde: Dueño", "¿Cuánto historial necesitan tener disponible al instante y cuánto puede estar archivado? — responde: Admin", "¿Desde dónde quieren ver los informes: solo en la empresa, o también desde el celular o fuera de la oficina? — responde: Dueño", {"t": "Usuarios, seguridad, infraestructura e integraciones"}, "(P) ¿Qué puede y qué no puede hacer cada perfil (administrador, administrativo, boca de expendio, encargado, venta, depósito)? — responde: Admin", "¿Los usuarios son personales o hay usuarios compartidos por puesto? — responde: Admin", "¿Qué características tiene el servidor actual (equipo, sistema operativo, base de datos, antigüedad)? — responde: Ingeniero", "¿Cómo y cada cuánto se hacen backups? ¿Dónde se guardan? ¿Alguna vez probaron restaurar uno? — responde: Ingeniero", "¿Qué medidas de seguridad tienen las PCs: antivirus, contraseñas de Windows, acceso a USB e internet? — responde: Ingeniero", "¿Tienen UPS en el servidor y en los puestos? ¿Cuánto duran los cortes de luz habituales? — responde: Admin", "¿Qué conexión a internet tienen y qué tan estable es? ¿Tienen una conexión de respaldo? — responde: Admin", "¿Prefieren el sistema instalado en el servidor de la empresa, en la nube, o una combinación? — responde: Dueño", "¿Qué lectores de código de barras usan (con cable o inalámbricos, marca y modelo)? — responde: Depósito", "¿Usan algún otro sistema que tenga que conectarse: contable, bancos, WhatsApp, planillas? — responde: Admin", "¿Nos pueden dar un usuario de solo lectura con acceso remoto al sistema actual para relevar pantallas y datos? — responde: Admin", {"t": "Migración, puesta en marcha y fase 2"}, "(P) ¿Qué datos del sistema actual hay que migrar: productos, clientes, stock vigente con sus etiquetas, saldos de cuenta corriente, historial de ventas? — responde: Admin", "¿Podemos acceder a la base de datos actual para analizar su estructura? ¿El ingeniero colaboraría con la migración? — responde: Ingeniero", "¿Prefieren arrancar con todos los módulos juntos o por etapas (por ejemplo, primero Stock)? — responde: Dueño", "¿Cuánto tiempo pueden dedicar los empleados a capacitación? ¿Quién podría ser el usuario clave de cada sector? — responde: Admin", "¿Qué parte de Contabilidad (cuentas corrientes de clientes y proveedores, cobranzas, pagos, libros IVA) tiene que estar en la primera etapa? — responde: Admin", "¿Hay un presupuesto o fecha límite para tener el sistema funcionando? — responde: Dueño"]));

// 3.8.1: la bateria sola, sin las 44 preguntas base (se deriva de la plantilla completa).
{
  const comp = db.prepare("SELECT preguntas FROM form_plantillas WHERE nombre = 'Relevamiento JRB completo'").get();
  if (comp) {
    const arr = JSON.parse(comp.preguntas);
    const i = arr.findIndex((x) => x && typeof x === 'object' && x.t === 'Generales y alcance');
    if (i >= 0) db.prepare('INSERT OR IGNORE INTO form_plantillas (nombre, preguntas) VALUES (?, ?)')
      .run('Batería relevamiento', JSON.stringify(arr.slice(i)));
  }
}

// 3.5.0: Finanzas del grupo (solo admins) — movimientos manuales y gastos fijos recurrentes.
// Las ventas aprobadas y las comisiones NO se copian acá: el panel las lee en vivo de deals/commissions.
db.exec(`CREATE TABLE IF NOT EXISTS fin_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  categoria TEXT,
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  fecha TEXT NOT NULL,
  recurrente_id INTEGER,
  periodo TEXT,
  notas TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_rec_periodo ON fin_movimientos (recurrente_id, periodo) WHERE recurrente_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS fin_recurrentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'egreso' CHECK (tipo IN ('ingreso', 'egreso')),
  categoria TEXT,
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  dia INTEGER NOT NULL DEFAULT 1,
  desde TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

// 3.4.0: Inteligencia B2B (prueba, solo admins) — cuentas investigadas, hallazgos, personas y eventos.
db.exec(`CREATE TABLE IF NOT EXISTS b2b_cuentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospecto_id INTEGER REFERENCES prospectos(id),
  nombre TEXT NOT NULL,
  sitio_web TEXT,
  rubro TEXT,
  zona TEXT,
  telefono TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'investigando', 'lista', 'error')),
  perfil TEXT,
  informe TEXT,
  score_total INTEGER,
  scores TEXT,
  info_faltante TEXT,
  proxima_accion TEXT,
  checks TEXT,
  calificacion TEXT,
  deal_id INTEGER REFERENCES deals(id),
  error TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  modelo TEXT,
  created_by INTEGER REFERENCES users(id),
  investigada_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS b2b_hallazgos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER NOT NULL REFERENCES b2b_cuentas(id),
  categoria TEXT NOT NULL,
  estado TEXT NOT NULL,
  titulo TEXT NOT NULL,
  detalle TEXT,
  evidencia TEXT,
  fuente_url TEXT,
  servicio TEXT,
  cargo_objetivo TEXT,
  validacion TEXT NOT NULL DEFAULT 'pendiente' CHECK (validacion IN ('pendiente', 'confirmada', 'rechazada')),
  validada_por INTEGER REFERENCES users(id),
  validada_at TEXT
);
CREATE TABLE IF NOT EXISTS b2b_personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER NOT NULL REFERENCES b2b_cuentas(id),
  nombre TEXT,
  cargo TEXT NOT NULL,
  buying_role TEXT,
  confianza TEXT,
  fuente_url TEXT,
  canal TEXT,
  verificada_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS b2b_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER NOT NULL REFERENCES b2b_cuentas(id),
  titulo TEXT NOT NULL,
  fecha TEXT,
  fuente_url TEXT,
  relevancia TEXT,
  relacion TEXT,
  reciente INTEGER NOT NULL DEFAULT 0
);`);

// 2.54.0: WhatsApp Cloud API — bandeja de conversaciones (por ahora solo admins).
db.exec(`CREATE TABLE IF NOT EXISTS wa_conversaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono TEXT NOT NULL UNIQUE,
  nombre TEXT,
  deal_id INTEGER REFERENCES deals(id),
  vendedor_id INTEGER REFERENCES users(id),
  ultimo_entrante_at TEXT,
  ultimo_mensaje_at TEXT,
  no_leidos INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wa_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id INTEGER NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  wamid TEXT,
  dir TEXT NOT NULL CHECK (dir IN ('in', 'out')),
  tipo TEXT NOT NULL DEFAULT 'text',
  texto TEXT,
  user_id INTEGER REFERENCES users(id),
  estado TEXT,
  error_detalle TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

// 2.48.0: generador de propuestas PDF por rubro (plantillas en plantillas-propuestas/).
db.exec(`CREATE TABLE IF NOT EXISTS propuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  deal_id INTEGER REFERENCES deals(id),
  plantilla TEXT NOT NULL,
  empresa TEXT NOT NULL,
  alias TEXT,
  datos TEXT,
  html TEXT NOT NULL,
  logo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

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
if (!db.prepare('PRAGMA table_info(reuniones)').all().some((c) => c.name === 'link')) {
  db.exec('ALTER TABLE reuniones ADD COLUMN link TEXT');
}
db.exec(`CREATE TABLE IF NOT EXISTS agenda_disponibilidad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dia INTEGER NOT NULL,
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  UNIQUE (admin_id, dia)
);`);
// 2.44.1: la disponibilidad NO se hereda ni se siembra: cada admin aparece en la agenda recién
// cuando carga la suya. Limpieza única de las franjas que la 2.44.0 había clonado a todos.
if (!db.prepare("SELECT 1 FROM panel_config WHERE panel = '_agenda' AND clave = 'sin_semilla'").get()) {
  db.exec('DELETE FROM agenda_disponibilidad');
  db.exec("INSERT OR IGNORE INTO panel_config (panel, clave, valor) VALUES ('_agenda', 'sin_semilla', '1')");
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
  ['propuestas', 'Generador de Propuestas'],
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
