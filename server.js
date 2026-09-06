const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { db, seedAdmin, getSessionSecret, ETAPAS, ETAPAS_ACTIVAS, ORIGENES, MOTIVOS, TIPOS_VENTA, CALIFICACIONES, SISTEMAS, PANELES_COMERCIALES, CAMPUS_EMPRESAS, ETAPAS_DEV } = require('./db');
const PANEL_SLUGS = PANELES_COMERCIALES.map((p) => p.slug);
const V = require('./views');
const C = require('./comisiones');
const F = require('./formulas');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');

const INVOICE_DIR = path.join(__dirname, 'data', 'invoices');
if (!fs.existsSync(INVOICE_DIR)) fs.mkdirSync(INVOICE_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: INVOICE_DIR,
    filename: (req, file, cb) => cb(null, `inv-${req.params.cid}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['.pdf', '.png', '.jpg', '.jpeg'].includes(path.extname(file.originalname).toLowerCase())),
});

// Fotos de perfil: viven en data/ (persisten con el volumen del contenedor).
const AVATAR_DIR = path.join(__dirname, 'data', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => cb(null, `u${req.user.id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase())),
});

const SOPORTE_DIR = path.join(__dirname, 'data', 'soporte');
if (!fs.existsSync(SOPORTE_DIR)) fs.mkdirSync(SOPORTE_DIR, { recursive: true });
const uploadSoporte = multer({
  storage: multer.diskStorage({
    destination: SOPORTE_DIR,
    filename: (req, file, cb) => cb(null, `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(file.originalname).toLowerCase())),
});

const app = express();
app.set('trust proxy', 1);
app.get('/health', (req, res) => res.json({ ok: true }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieSession({
  name: 'sesion',
  secret: getSessionSecret(),
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: 'lax',
  httpOnly: true,
}));

const seeded = seedAdmin();
if (seeded) {
  console.log('==============================================');
  console.log('  PRIMER ARRANQUE — usuario administrador:');
  console.log(`  Email: ${seeded.email}`);
  console.log(`  Clave: ${seeded.password}`);
  console.log('  Cambiala en Perfil apenas ingreses.');
  console.log('==============================================');
}

/* ---------------- helpers ---------------- */

function currentUser(req) {
  if (!req.session.uid) return null;
  const u = db.prepare('SELECT id, name, email, role, active, permisos, last_seen_at, last_version_vista, avatar, ia_bienvenida, ia_limite, ia_charla_desde FROM users WHERE id = ? AND active = 1').get(req.session.uid) || null;
  if (u) { try { u.permisos = JSON.parse(u.permisos || '[]'); } catch { u.permisos = []; } }
  return u;
}

// Permisos por sistema: el admin siempre puede todo.
const puede = (user, sistema) => user.role === 'admin' || (user.permisos || []).includes(sistema);

// Deudas del vendedor según las reglas de Config del panel: días de actividad sin cargar
// y leads propias vencidas (liberadas por inactividad). Alimentan el brillo de los íconos de la barra.
// Desde cuándo se le mide la constancia a un usuario en un panel: la fecha en que se le
// asignó el panel (fallback: alta de la cuenta, para admins u otros casos sin registro).
function inicioPanelDe(userId, slug) {
  const asig = db.prepare('SELECT fecha FROM panel_asignaciones WHERE user_id = ? AND panel = ?').get(userId, slug);
  if (asig && asig.fecha) return asig.fecha;
  return (db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId)?.created_at || '').slice(0, 10) || null;
}

function deudasDe(user, slug) {
  if (!user || user.role !== 'vendedor' || !PANEL_SLUGS.includes(slug)) return null;
  try {
    const inicio = inicioPanelDe(user.id, slug);
    const ventana = ventanaFechas(diasAtrasDe(slug)).slice(1).filter((f) => !inicio || f >= inicio);
    let diasFaltan = 0;
    if (ventana.length) {
      const cargadas = db.prepare('SELECT fecha FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(slug, user.id, ventana[ventana.length - 1]).map((r) => r.fecha);
      diasFaltan = ventana.filter((f) => !cargadas.includes(f)).length;
    }
    let vencidas = 0;
    const robo = configRobo(slug);
    if (robo.activo && robo.horas > 0) {
      const abiertas = db.prepare("SELECT etapa_movida_at FROM deals WHERE panel = ? AND user_id = ? AND etapa NOT IN ('Ganado','Perdido')").all(slug, user.id);
      vencidas = abiertas.filter((d) => Number.isFinite(msDesde(d.etapa_movida_at)) && msDesde(d.etapa_movida_at) >= robo.horas * 3600 * 1000).length;
    }
    return { actividad: diasFaltan > 0, pipeline: vencidas > 0, diasFaltan, vencidas };
  } catch { return null; }
}

// Resumen para el inicio y el menú de paneles: qué te espera en cada uno antes de entrar.
// Vendedor: sus leads abiertas + deudas según las reglas de Config. Admin: totales del equipo.
function resumenPaneles(user) {
  const r = {};
  if (!user) return r;
  try {
    for (const slug of PANEL_SLUGS) {
      if (!puede(user, slug)) continue;
      if (user.role === 'vendedor') {
        const abiertas = db.prepare("SELECT COUNT(*) AS c FROM deals WHERE panel = ? AND user_id = ? AND etapa NOT IN ('Ganado','Perdido')").get(slug, user.id).c;
        r[slug] = { abiertas, ...(deudasDe(user, slug) || {}) };
      } else {
        const abiertas = db.prepare("SELECT COUNT(*) AS c FROM deals WHERE panel = ? AND etapa NOT IN ('Ganado','Perdido')").get(slug).c;
        let liberadas = 0;
        const robo = configRobo(slug);
        if (robo.activo && robo.horas > 0) {
          const filas = db.prepare("SELECT etapa_movida_at FROM deals WHERE panel = ? AND etapa NOT IN ('Ganado','Perdido')").all(slug);
          liberadas = filas.filter((d) => Number.isFinite(msDesde(d.etapa_movida_at)) && msDesde(d.etapa_movida_at) >= robo.horas * 3600 * 1000).length;
        }
        r[slug] = { abiertas, liberadas };
      }
    }
    if (puede(user, 'cobranza')) {
      r.cobranza = user.role === 'admin'
        ? db.prepare(`SELECT
            COALESCE(SUM(CASE WHEN estado='pendiente' THEN monto END),0) AS pendiente,
            COALESCE(SUM(CASE WHEN estado='pendiente' AND fecha_devengada <= date('now') THEN monto END),0) AS exigible,
            COUNT(DISTINCT CASE WHEN estado='pendiente' THEN user_id END) AS personas
            FROM commissions`).get()
        : resumenComisiones(user.id);
    }
  } catch {}
  return r;
}

const requireSistema = (sistema) => (req, res, next) => {
  if (!puede(req.user, sistema)) return res.status(403).send('No tenés acceso a este sistema. Pedile al administrador que te lo habilite.');
  req.user.deudas = deudasDe(req.user, sistema);
  next();
};

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.redirect('/login');
  user.unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND leida = 0').get(user.id).c;
  // Última interacción: se estampa como mucho una vez por minuto para no escribir en cada request.
  const haceUnMin = new Date(Date.now() - 60000).toISOString().replace('T', ' ').slice(0, 19);
  if (!user.last_seen_at || user.last_seen_at < haceUnMin) {
    db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(user.id);
  }
  // Ventana modal pendiente, en orden de prioridad: alerta del admin > encuesta sin votar > changelog nuevo.
  user.modalBanner = db.prepare(`SELECT b.* FROM banners b WHERE b.activo = 1
    AND NOT EXISTS (SELECT 1 FROM banner_vistos v WHERE v.banner_id = b.id AND v.user_id = ?)
    ORDER BY b.id DESC LIMIT 1`).get(user.id) || null;
  if (!user.modalBanner) {
    const enc = db.prepare(`SELECT e.* FROM encuestas e WHERE e.activo = 1
      AND NOT EXISTS (SELECT 1 FROM encuesta_votos v WHERE v.encuesta_id = e.id AND v.user_id = ?)
      ORDER BY e.id ASC LIMIT 1`).get(user.id) || null;
    if (enc) { try { enc.opciones = JSON.parse(enc.opciones); } catch { enc.opciones = []; } }
    user.modalEncuesta = enc && enc.opciones.length >= 2 ? enc : null;
  }
  if (!user.modalBanner && !user.modalEncuesta && user.last_version_vista !== CHANGELOG[0].version) user.modalChangelog = CHANGELOG[0];
  user.resumen = resumenPaneles(user);
  req.user = user;
  next();
}

const logUserEvent = (userId, tipo, detalle) =>
  db.prepare('INSERT INTO user_events (user_id, tipo, detalle) VALUES (?, ?, ?)').run(userId, tipo, detalle);

/* --- historial de deals y notificaciones --- */

const nombreUsuario = (id) => (db.prepare('SELECT name FROM users WHERE id = ?').get(id) || {}).name || 'otro vendedor';

// Venta de CFD (software) ganada y aprobada → proyecto en el Panel de Developers. Idempotente:
// si el proyecto ya existía (venta reabierta y re-aprobada), no se duplica ni pierde su avance.
function crearProyectoSi(dealId) {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
  if (!deal || deal.panel !== 'cfd') return;
  const r = db.prepare('INSERT OR IGNORE INTO proyectos (deal_id) VALUES (?)').run(deal.id);
  if (r.changes > 0) {
    logDealEvent(deal.id, deal.user_id, 'edicion', 'La venta pasó al Panel de Developers como proyecto');
    for (const u of db.prepare("SELECT id, permisos FROM users WHERE active = 1 AND role = 'developer'").all()) {
      let perms = []; try { perms = JSON.parse(u.permisos || '[]'); } catch {}
      if (perms.includes('developers')) notifyUser(u.id, `Nuevo proyecto para desarrollar: «${deal.empresa}» (${deal.tipo_venta || 'venta de software'})`, '/developers');
    }
  }
}

function logDealEvent(dealId, userId, tipo, detalle) {
  db.prepare('INSERT INTO deal_events (deal_id, user_id, tipo, detalle) VALUES (?, ?, ?, ?)').run(dealId, userId, tipo, detalle);
}

// Notifica a todos los admins activos menos al que hizo la acción.
// tipo: 'deal_nuevo' | 'cambio_etapa' (silenciables por preferencia) · 'ganado' (siempre) · otro (siempre).
function notifyAdmins(actorId, texto, url, tipo = 'otro') {
  const admins = db.prepare("SELECT id, notif_prefs FROM users WHERE role = 'admin' AND active = 1 AND id != ?").all(actorId);
  const ins = db.prepare('INSERT INTO notifications (user_id, texto, url, actor_id) VALUES (?, ?, ?, ?)');
  for (const a of admins) {
    if (tipo === 'deal_nuevo' || tipo === 'cambio_etapa') {
      let p = {}; try { p = JSON.parse(a.notif_prefs || '{}'); } catch {}
      if (p[tipo] === false) continue;
    }
    ins.run(a.id, texto, url, actorId);
  }
}

// Notifica a un usuario puntual. actorId = quién generó la acción (null = el sistema).
function notifyUser(userId, texto, url, lote = null, actorId = null) {
  db.prepare('INSERT INTO notifications (user_id, texto, url, lote, actor_id) VALUES (?, ?, ?, ?, ?)').run(userId, texto, url, lote, actorId);
}

const CAMPOS_DEAL = {
  empresa: 'Empresa', tipo_venta: 'Tipo de venta', mrr: 'Valor', telefono: 'Teléfono', calificacion: 'Calificación', decisor: 'Decisor', origen: 'Origen',
  campana_id: 'Campaña', pais: 'País', provincia: 'Provincia', ciudad: 'Ciudad',
  proximo_paso: 'Próximo paso', fecha_proximo_paso: 'Fecha próximo paso',
  fecha_primera_reunion: 'Fecha primera reunión', fecha_cierre: 'Fecha de cierre',
  motivo_perdida: 'Motivo de pérdida', user_id: 'Vendedor',
};

function diffDeal(antes, despues) {
  const cambios = [];
  for (const [campo, label] of Object.entries(CAMPOS_DEAL)) {
    const a = antes[campo] ?? null, b = despues[campo] ?? null;
    if (String(a ?? '') === String(b ?? '')) continue;
    if (campo === 'user_id') {
      const nombre = (id) => db.prepare('SELECT name FROM users WHERE id = ?').get(id)?.name || '—';
      cambios.push(`${label}: ${nombre(a)} → ${nombre(b)}`);
    } else if (campo === 'campana_id') {
      const nc = (id) => (id ? db.prepare('SELECT nombre FROM campanas WHERE id = ?').get(id)?.nombre || '—' : '—');
      cambios.push(`${label}: ${nc(a)} → ${nc(b)}`);
    } else if (campo === 'notas') {
      cambios.push('Notas actualizadas');
    } else {
      const v = (x) => (x == null || x === '' ? '—' : String(x));
      cambios.push(`${label}: ${v(a)} → ${v(b)}`);
    }
  }
  return cambios;
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).send('Solo el administrador puede ver esta página.');
  next();
}

const clean = (s) => (typeof s === 'string' && s.trim() !== '' ? s.trim() : null);
const cleanNum = (s) => { const n = parseFloat(s); return Number.isFinite(n) && n >= 0 ? n : null; };
const cleanInt = (s) => { const n = parseInt(s, 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
const cleanDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const cleanEnum = (s, list) => (list.includes(s) ? s : null);

// Etapas válidas según el panel: CFD fijas; paneles configurables dinámicas + Ganado/Perdido (fijas por la lógica de aprobación).
function etapasDePanel(panel) {
  if (PANEL_SLUGS.includes(panel)) {
    const din = db.prepare('SELECT nombre FROM panel_etapas WHERE panel = ? ORDER BY orden').all(panel).map((r) => r.nombre);
    return [...din, 'Ganado', 'Perdido'];
  }
  return ETAPAS;
}

// Paleta para etapas dinámicas (por orden) + fijas.
function coloresDePanel(panel) {
  if (!PANEL_SLUGS.includes(panel)) return null;
  const paleta = ['#8494A6', '#4A90C8', '#2E7BB8', '#1D6FB8', '#14538C', '#0F3459', '#5A7CA6', '#3E6B96', '#6B8CAE', '#48627E'];
  const map = {};
  db.prepare('SELECT nombre FROM panel_etapas WHERE panel = ? ORDER BY orden').all(panel).forEach((r, i) => { map[r.nombre] = paleta[i % paleta.length]; });
  map['Ganado'] = '#3E9B57'; map['Perdido'] = '#C05450';
  return map;
}

// CFD vive en las URLs raíz (/pipeline, /actividad…); los demás paneles en /<slug>/…
const baseDePanel = (slug) => (slug === 'cfd' ? '' : `/${slug}`);
const homeDePanel = (panel) => (PANEL_SLUGS.includes(panel) ? `${baseDePanel(panel)}/pipeline` : '/pipeline');

function dealFromBody(body, user, panel = 'cfd', etapaActual = 'Lead', tipoActual = 'Proyecto único') {
  let userId = user.id;
  if (user.role === 'admin' && body.user_id) {
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(parseInt(body.user_id, 10));
    if (target) userId = target.id;
  }
  return {
    empresa: clean(body.empresa),
    user_id: userId,
    panel,
    etapa: cleanEnum(body.etapa, etapasDePanel(panel)) || etapaActual,
    tipo_venta: cleanEnum(body.tipo_venta, TIPOS_VENTA) || tipoActual,
    mrr: cleanNum(body.mrr),
    telefono: clean(body.telefono),
    calificacion: cleanEnum(body.calificacion, CALIFICACIONES),
    decisor: clean(body.decisor),
    // CFD valida contra sus orígenes de venta de software; los paneles aceptan cualquier origen
    // (el selector ofrece los suyos, y las leads importadas traen valores propios que no deben perderse).
    origen: panel === 'cfd' ? cleanEnum(body.origen, ORIGENES) : (clean(body.origen) || null),
    proximo_paso: clean(body.proximo_paso),
    fecha_proximo_paso: cleanDate(body.fecha_proximo_paso),
    fecha_primera_reunion: cleanDate(body.fecha_primera_reunion),
    fecha_cierre: cleanDate(body.fecha_cierre),
    motivo_perdida: cleanEnum(body.motivo_perdida, MOTIVOS),
    campana_id: (() => { const id = parseInt(body.campana_id, 10); return Number.isFinite(id) && db.prepare('SELECT 1 FROM campanas WHERE id = ?').get(id) ? id : null; })(),
    pais: clean(body.pais) || 'Argentina',
    provincia: clean(body.provincia),
    ciudad: clean(body.ciudad),
    notas: null,
    nota: clean(body.notas), // nota nueva → va al historial
  };
}

/* ---------------- auth ---------------- */

app.get('/login', (req, res) => {
  if (currentUser(req)) return res.redirect('/');
  res.send(V.loginPage({ seeded: !!seeded }));
});

app.post('/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(clean(req.body.email)?.toLowerCase());
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password_hash)) {
    return res.send(V.loginPage({ err: 'Email o contraseña incorrectos.' }));
  }
  req.session.uid = user.id;
  db.prepare("UPDATE users SET last_login_at = datetime('now'), last_seen_at = datetime('now') WHERE id = ?").run(user.id);
  logUserEvent(user.id, 'login', 'Inició sesión');
  if (user.role === 'vendedor') avisarDiasFaltantes(user);
  res.redirect('/');
});

// Al entrar, si al vendedor le faltan días de actividad (ayer a -3), se lo recuerda por notificación.
function avisarDiasFaltantes(user) {
  try {
    let permisos = []; try { permisos = JSON.parse(user.permisos || '[]'); } catch {}
    const ddmm = (f) => `${+f.slice(8, 10)}/${+f.slice(5, 7)}`;
    const avisos = [];
    for (const P of PANELES_COMERCIALES) {
      if (!permisos.includes(P.slug)) continue;
      const ventana = ventanaFechas(diasAtrasDe(P.slug)).slice(1); // ayer .. -N
      if (!ventana.length) continue;
      const cargadas = db.prepare('SELECT fecha FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(P.slug, user.id, ventana[ventana.length - 1]).map((r) => r.fecha);
      const faltan = ventana.filter((d) => !cargadas.includes(d));
      if (faltan.length) avisos.push({ texto: `Te faltan cargar días de actividad en Comercial ${P.nombre}: ${faltan.map(ddmm).join(', ')}`, url: `${baseDePanel(P.slug)}/actividad?fecha=${faltan[0]}` });
    }
    if (avisos.length) {
      db.prepare("DELETE FROM notifications WHERE user_id = ? AND leida = 0 AND texto LIKE 'Te faltan cargar días%'").run(user.id);
      for (const a of avisos) notifyUser(user.id, a.texto, a.url);
    }
  } catch (e) { console.error('avisarDiasFaltantes:', e.message); }
}

app.post('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

app.get('/', requireAuth, (req, res) => res.redirect('/hub'));

app.get('/hub', requireAuth, (req, res) => res.send(V.hubPage({ user: req.user })));

/* ---------------- pipeline / deals ---------------- */

// El admin supervisa: su pipeline arranca en "Todos"; el vendedor, en "Míos".
const scopeDefault = (req) => (req.query.scope ? (req.query.scope === 'todos' ? 'todos' : 'mios') : (req.user.role === 'admin' ? 'todos' : 'mios'));

// Filtros del tablero: búsqueda de texto + vendedor + origen (los selectores se arman con lo que hay).
function filtrarPipeline(req, deals) {
  const q = clean(req.query.q) || '';
  const fVendedor = parseInt(req.query.vendedor, 10) || null;
  const fOrigen = clean(req.query.origen) || null;
  const fEtapa = clean(req.query.etapa) || null;
  const origenes = [...new Set(deals.map((d) => d.origen).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const vendedores = [...new Map(deals.map((d) => [d.user_id, d.vendedor_name]))].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const totalSinFiltro = deals.length;
  const ql = q.toLowerCase();
  if (ql) deals = deals.filter((d) => [d.empresa, d.decisor, d.telefono, d.ciudad, d.provincia, d.origen, d.vendedor_name].some((v) => v && v.toLowerCase().includes(ql)));
  if (fVendedor) deals = deals.filter((d) => d.user_id === fVendedor);
  if (fOrigen) deals = deals.filter((d) => d.origen === fOrigen);
  if (fEtapa) deals = deals.filter((d) => d.etapa === fEtapa);
  return { deals, q, fVendedor, fOrigen, fEtapa, origenes, vendedores, totalSinFiltro };
}

// Fondo de tablero + modal según el panel del deal (todos los paneles, CFD incluido, son configurables).
function renderModalSobrePipeline(req, res, modal, panel) {
  const slug = PANEL_SLUGS.includes(panel) ? panel : 'cfd';
  res.send(V.pipelinePage({ user: req.user, ...panelPipelineData(req, slug), modal, ...panelOpts(slug) }));
}

app.get('/deals/new', requireAuth, (req, res) => {
  const panel = PANEL_SLUGS.includes(req.query.panel) ? req.query.panel : 'cfd';
  if (!puede(req.user, panel)) return res.status(403).send('Sin acceso a este panel.');
  const vendedores = db.prepare('SELECT id, name FROM users WHERE active = 1 ORDER BY name').all();
  const modal = V.dealFormModal({
    user: req.user, deal: null, vendedores, isAdmin: req.user.role === 'admin', mencionables: mencionablesDe(panel),
    panel, etapas: etapasDePanel(panel), backHref: homeDePanel(panel),
    campanas: db.prepare('SELECT id, nombre FROM campanas WHERE panel = ? AND activa = 1 ORDER BY nombre').all(panel),
  });
  renderModalSobrePipeline(req, res, modal, panel);
});

app.post('/deals', requireAuth, (req, res) => {
  const panel = PANEL_SLUGS.includes(req.body.panel) ? req.body.panel : 'cfd';
  if (!puede(req.user, panel)) return res.status(403).send('Sin acceso a este panel.');
  const home = homeDePanel(panel);
  const d = dealFromBody(req.body, req.user, panel);
  if (!d.empresa) return res.redirect(home);
  // Ganado por admin CON valor cargado: aprobado directo. Sin valor o ganado por vendedor: pendiente.
  d.aprobacion = d.etapa === 'Ganado' ? (req.user.role === 'admin' && d.mrr > 0 && d.calificacion ? 'aprobado' : 'pendiente') : null;
  const { nota: _n1, ...dInsert } = d;
  const r = db.prepare(`INSERT INTO deals (empresa, user_id, panel, etapa, tipo_venta, mrr, telefono, calificacion, decisor, origen, proximo_paso, fecha_proximo_paso, fecha_primera_reunion, fecha_cierre, motivo_perdida, campana_id, pais, provincia, ciudad, notas, aprobacion, etapa_movida_at)
    VALUES (@empresa, @user_id, @panel, @etapa, @tipo_venta, @mrr, @telefono, @calificacion, @decisor, @origen, @proximo_paso, @fecha_proximo_paso, @fecha_primera_reunion, @fecha_cierre, @motivo_perdida, @campana_id, @pais, @provincia, @ciudad, @notas, @aprobacion, datetime('now'))`).run(dInsert);
  logDealEvent(r.lastInsertRowid, req.user.id, 'creado', `Deal creado en etapa ${d.etapa}`);
  if (d.nota) logDealEvent(r.lastInsertRowid, req.user.id, 'edicion', `Nota: ${d.nota}`);
  // Lead creada a nombre de otra persona: que se entere de que la tiene en su pipeline.
  if (d.user_id && d.user_id !== req.user.id) notifyUser(d.user_id, `Te asignó la lead «${d.empresa}» en ${d.etapa}${d.nota ? ` · nota: «${d.nota}»` : ''}`.slice(0, 400), `/deals/${r.lastInsertRowid}`, null, req.user.id);
  // @menciones en la nota inicial: solo personas del panel, nunca uno mismo.
  for (const uid of mencionadosEn(d.nota, d.panel)) if (uid !== req.user.id) notifyUser(uid, `Te mencionó en una nota de la lead «${d.empresa}»: «${d.nota}»`.slice(0, 400), `/deals/${r.lastInsertRowid}`, null, req.user.id);
  notifyAdmins(req.user.id, `Creó el deal «${d.empresa}» en ${d.etapa}${d.aprobacion === 'pendiente' ? ' — requiere tu aprobación' : ''}`, `/deals/${r.lastInsertRowid}`, d.etapa === 'Ganado' ? 'ganado' : 'deal_nuevo');
  if (d.aprobacion === 'aprobado') { C.generarComisiones({ ...d, id: r.lastInsertRowid, fecha_cierre: d.fecha_cierre || new Date().toISOString().slice(0, 10) }); crearProyectoSi(r.lastInsertRowid); }
  res.redirect(home);
});

app.get('/deals/:id', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.redirect('/hub');
  if (!puede(req.user, deal.panel)) return res.status(403).send('Sin acceso a este panel.');
  const vendedores = db.prepare('SELECT id, name FROM users WHERE active = 1 ORDER BY name').all();
  const eventos = db.prepare(`SELECT e.*, u.name AS user_name FROM deal_events e JOIN users u ON u.id = e.user_id
    WHERE e.deal_id = ? ORDER BY e.created_at DESC, e.id DESC`).all(deal.id);
  const ultimaEd = eventos[0] ? { nombre: eventos[0].user_name, fecha: eventos[0].created_at } : null;
  const modal = V.dealFormModal({
    user: req.user, deal, vendedores, isAdmin: req.user.role === 'admin', eventos, ultimaEd,
    errAprob: req.query.err === 'valor', errCalif: req.query.err === 'calificacion', errMigrar: req.query.err === 'migrar-ganado',
    tiempos: tiemposDeLead(deal), companeros: companerosDe(deal, req.user), mencionables: mencionablesDe(deal.panel),
    tomar: (() => { const robo = configRobo(deal.panel); return leadDisponible(deal, robo) && deal.user_id !== req.user.id ? { horas: robo.horas } : null; })(),
    reunionAgendada: deal.panel === 'cfd' ? db.prepare("SELECT r.fecha, r.hora, u.name AS admin FROM reuniones r LEFT JOIN users u ON u.id = r.admin_id WHERE r.deal_id = ? AND r.estado = 'agendada' AND r.fecha >= ? ORDER BY r.fecha, r.hora LIMIT 1").get(deal.id, hoyAR()) || null : null,
    panel: deal.panel, etapas: etapasDePanel(deal.panel), backHref: homeDePanel(deal.panel),
    campanas: db.prepare('SELECT id, nombre FROM campanas WHERE panel = ? AND (activa = 1 OR id = ?) ORDER BY nombre').all(deal.panel, deal.campana_id || 0),
  });
  renderModalSobrePipeline(req, res, modal, deal.panel);
});

app.post('/deals/:id', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.redirect('/hub');
  if (!puede(req.user, deal.panel)) return res.status(403).send('Sin acceso a este panel.');
  const home = homeDePanel(deal.panel);
  const d = dealFromBody(req.body, req.user, deal.panel, deal.etapa, deal.tipo_venta);
  if (!d.empresa) return res.redirect(`/deals/${deal.id}`);
  if (req.user.role !== 'admin') d.user_id = deal.user_id; // un vendedor no reasigna deals
  d.proximo_paso = deal.proximo_paso; d.fecha_proximo_paso = deal.fecha_proximo_paso; // campo retirado de la ficha (2.26.2)
  // Si pasa a Ganado/Perdido sin fecha de cierre, se estampa hoy.
  if (['Ganado', 'Perdido'].includes(d.etapa) && !d.fecha_cierre) d.fecha_cierre = new Date().toISOString().slice(0, 10);
  const cambioEtapa = d.etapa !== deal.etapa;
  // Aprobación: si entra a Ganado depende de quién lo hace Y de que el valor esté cargado; si sale, se limpia; si no cambió, se conserva.
  d.aprobacion = d.etapa !== 'Ganado' ? null
    : cambioEtapa ? (req.user.role === 'admin' && d.mrr > 0 && d.calificacion ? 'aprobado' : 'pendiente')
    : deal.aprobacion;
  const { nota: _n2, ...dUpdate } = d;
  db.prepare(`UPDATE deals SET empresa=@empresa, user_id=@user_id, panel=@panel, etapa=@etapa, tipo_venta=@tipo_venta, mrr=@mrr, telefono=@telefono, calificacion=@calificacion, decisor=@decisor, origen=@origen,
    proximo_paso=@proximo_paso, fecha_proximo_paso=@fecha_proximo_paso, fecha_primera_reunion=@fecha_primera_reunion,
    fecha_cierre=@fecha_cierre, motivo_perdida=@motivo_perdida, campana_id=@campana_id, pais=@pais, provincia=@provincia, ciudad=@ciudad, notas=@notas, aprobacion=@aprobacion,
    etapa_movida_at = CASE WHEN etapa != @etapa THEN datetime('now') ELSE etapa_movida_at END, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...dUpdate, id: deal.id });

  // Historial: cambio de etapa es un evento propio; el resto va como edición.
  const otros = diffDeal(deal, d);
  if (cambioEtapa) {
    const det = [`${deal.etapa} → ${d.etapa}`, ...otros].join(' · ');
    logDealEvent(deal.id, req.user.id, 'etapa', det);
    notifyAdmins(req.user.id, `Movió «${d.empresa}» de ${deal.etapa} a ${d.etapa}${d.aprobacion === 'pendiente' ? ' — requiere tu aprobación' : ''}`, `/deals/${deal.id}`, d.etapa === 'Ganado' ? 'ganado' : 'cambio_etapa');
    if (d.etapa === 'Ganado' && d.aprobacion === 'aprobado') { C.generarComisiones({ ...d, id: deal.id }); crearProyectoSi(deal.id); }
    if (deal.etapa === 'Ganado' && d.etapa !== 'Ganado') C.cancelarPendientes(deal.id);
  } else if (otros.length) {
    logDealEvent(deal.id, req.user.id, 'edicion', otros.join(' · '));
  }
  if (d.nota) logDealEvent(deal.id, req.user.id, 'edicion', `Nota: ${d.nota}`);
  // El reloj de inactividad mide TRABAJO sobre la lead, no solo etapa: una nota o una edición
  // real también lo reinician (guardar sin cambiar nada, no).
  if (!cambioEtapa && (otros.length || d.nota)) {
    db.prepare("UPDATE deals SET etapa_movida_at = datetime('now') WHERE id = ?").run(deal.id);
  }
  // Si la lead la tocó otra persona (un admin o un compañero), el dueño se entera de QUÉ le cambiaron:
  // la nota completa, los campos editados y/o el cambio de etapa. La notificación lleva la foto de quien editó.
  const mencionados = d.nota ? mencionadosEn(d.nota, deal.panel).filter((id) => id !== req.user.id) : [];
  const soloNota = !cambioEtapa && !otros.length && !!d.nota;
  const reasignada = deal.user_id !== d.user_id;
  if (cambioEtapa || otros.length || d.nota) {
    const partes = [];
    if (cambioEtapa) partes.push(`etapa ${deal.etapa} → ${d.etapa}`);
    if (otros.length) partes.push(otros.join(' · '));
    if (d.nota) partes.push(`nota: «${d.nota}»`);
    const detalle = partes.join(' · ').slice(0, 400);
    if (reasignada) {
      if (deal.user_id && deal.user_id !== req.user.id) notifyUser(deal.user_id, `Reasignó tu lead «${d.empresa}» a ${nombreUsuario(d.user_id)}${partes.length > 1 || !otros.length ? ` · ${detalle}` : ''}`, `/deals/${deal.id}`, null, req.user.id);
      if (d.user_id !== req.user.id) notifyUser(d.user_id, `Te asignó la lead «${d.empresa}»${d.nota ? ` · nota: «${d.nota}»` : ''}`.slice(0, 400), `/deals/${deal.id}`, null, req.user.id);
    } else if (d.user_id && req.user.id !== d.user_id && !(soloNota && mencionados.includes(d.user_id))) {
      notifyUser(d.user_id, `Modificó tu lead «${d.empresa}»: ${detalle}`, `/deals/${deal.id}`, null, req.user.id);
    }
  }
  for (const uid of mencionados) notifyUser(uid, `Te mencionó en una nota de la lead «${d.empresa}»: «${d.nota}»`.slice(0, 400), `/deals/${deal.id}`, null, req.user.id);
  res.redirect(home);
});

// Estrella: marcar / desmarcar una lead como destacada. La puede tocar el dueño o un admin.
// No cuenta como "trabajo" sobre la lead (no mueve el reloj de inactividad) pero sí queda en el historial.
app.post('/deals/:id/destacar', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT id, panel, user_id, destacada FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.status(404).end();
  if (!puede(req.user, deal.panel)) return res.status(403).end();
  if (req.user.role !== 'admin' && deal.user_id !== req.user.id) return res.status(403).end();
  const nueva = deal.destacada ? 0 : 1;
  db.prepare('UPDATE deals SET destacada = ? WHERE id = ?').run(nueva, deal.id);
  logDealEvent(deal.id, req.user.id, 'edicion', nueva ? 'Marcó la lead con estrella (destacada)' : 'Quitó la estrella');
  const volver = typeof req.body.volver === 'string' && req.body.volver.startsWith('/') && !req.body.volver.startsWith('//') ? req.body.volver : homeDePanel(deal.panel);
  res.redirect(volver);
});

// Cambio de etapa desde el tablero (drag & drop).
app.post('/deals/:id/etapa', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.status(404).end();
  if (!puede(req.user, deal.panel)) return res.status(403).end();
  if (req.user.role !== 'admin' && deal.user_id !== req.user.id) return res.status(403).end();
  const home = homeDePanel(deal.panel);
  const etapa = cleanEnum(req.body.etapa, etapasDePanel(deal.panel));
  if (!etapa || etapa === deal.etapa) return res.redirect(home);
  let fechaCierre = deal.fecha_cierre;
  if (['Ganado', 'Perdido'].includes(etapa) && !fechaCierre) fechaCierre = hoyAR();
  if (!['Ganado', 'Perdido'].includes(etapa)) fechaCierre = null; // se reabre
  // Arrastrar a Ganado NUNCA aprueba (ni siendo admin): la revisión de datos se hace en la ficha con "Aprobar venta".
  const aprobacion = etapa === 'Ganado' ? 'pendiente' : null;
  db.prepare("UPDATE deals SET etapa = ?, fecha_cierre = ?, aprobacion = ?, etapa_movida_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(etapa, fechaCierre, aprobacion, deal.id);
  logDealEvent(deal.id, req.user.id, 'etapa', `${deal.etapa} → ${etapa}`);
  notifyAdmins(req.user.id, `Movió «${deal.empresa}» de ${deal.etapa} a ${etapa}${aprobacion === 'pendiente' ? ' — requiere tu aprobación' : ''}`, `/deals/${deal.id}`, etapa === 'Ganado' ? 'ganado' : 'cambio_etapa');
  if (req.user.id !== deal.user_id) {
    notifyUser(deal.user_id, `Movió tu lead «${deal.empresa}» de ${deal.etapa} a ${etapa}`, `/deals/${deal.id}`, null, req.user.id);
  }
  if (deal.etapa === 'Ganado' && etapa !== 'Ganado') C.cancelarPendientes(deal.id);
  res.redirect(home);
});

// Aprobación de una venta ganada por un vendedor: recién acá impactan métricas y comisiones.
app.post('/deals/:id/aprobar', requireAuth, requireAdmin, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (deal && deal.etapa === 'Ganado' && deal.aprobacion !== 'aprobado') {
    // Sin valor cargado no hay base para calcular la comisión: se rechaza la aprobación.
    if (!deal.mrr || deal.mrr <= 0) return res.redirect(`/deals/${deal.id}?err=valor`);
    // Sin calificación del cliente tampoco: es el dato que pidió administración para cerrar.
    if (!deal.calificacion) return res.redirect(`/deals/${deal.id}?err=calificacion`);
    db.prepare("UPDATE deals SET aprobacion = 'aprobado', updated_at = datetime('now') WHERE id = ?").run(deal.id);
    logDealEvent(deal.id, req.user.id, 'etapa', 'Venta aprobada — impacta en métricas y cobranza');
    C.generarComisiones({ ...deal, aprobacion: 'aprobado' });
    crearProyectoSi(deal.id);
    if (deal.user_id !== req.user.id) {
      notifyUser(deal.user_id, `Aprobó tu venta «${deal.empresa}» (${money2(deal.mrr)}) — tu comisión ya está en Cobranza`, `/cobranza/vendedor/${deal.user_id}`, null, req.user.id);
    }
  }
  res.redirect(`/deals/${req.params.id}`);
});

const money2 = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

const nombrePanel = (slug) => (PANELES_COMERCIALES.find((p) => p.slug === slug) || { nombre: slug }).nombre;

// Última actividad de etapa y promedio de tiempo entre cambios de etapa de una lead.
function tiemposDeLead(deal) {
  const ts = db.prepare("SELECT created_at FROM deal_events WHERE deal_id = ? AND tipo IN ('creado','etapa') ORDER BY created_at").all(deal.id)
    .map((r) => Date.parse(r.created_at.replace(' ', 'T') + 'Z')).filter(Number.isFinite);
  let promedio = null;
  if (ts.length >= 2) promedio = Math.round((ts[ts.length - 1] - ts[0]) / (ts.length - 1) / 1000);
  return { ultima: deal.etapa_movida_at || deal.updated_at, promedio };
}

// Compañeros a los que el dueño puede traspasar la lead (activos, con permiso al panel).
// Personas mencionables con @ en las notas de una lead: las que pertenecen a ese panel (admins incluidos), activas.
function mencionablesDe(slug) {
  return db.prepare("SELECT id, name, role, permisos, avatar FROM users WHERE active = 1 AND role != 'developer' ORDER BY name").all()
    .filter((u) => u.role === 'admin' || (() => { try { return JSON.parse(u.permisos || '[]').includes(slug); } catch { return false; } })())
    .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar || null }));
}
// Ids mencionados en un texto (@Nombre Apellido), solo entre las personas del panel; sin distinguir mayúsculas.
function mencionadosEn(texto, slug) {
  if (!texto || !String(texto).includes('@')) return [];
  const t = String(texto).toLowerCase();
  return mencionablesDe(slug).filter((u) => t.includes('@' + u.name.toLowerCase())).map((u) => u.id);
}

function companerosDe(deal, user) {
  if (deal == null || (deal.user_id !== user.id && user.role !== 'admin')) return [];
  return db.prepare("SELECT id, name, role, permisos FROM users WHERE active = 1 AND role != 'developer' AND id != ? ORDER BY name").all(deal.user_id)
    .filter((u) => { if (u.role === 'admin') return true; try { return JSON.parse(u.permisos || '[]').includes(deal.panel); } catch { return false; } });
}

const getPanelConfig = (slug, clave, def = null) => {
  const r = db.prepare('SELECT valor FROM panel_config WHERE panel = ? AND clave = ?').get(slug, clave);
  return r ? r.valor : def;
};
const setPanelConfig = (slug, clave, valor) => db.prepare(`INSERT INTO panel_config (panel, clave, valor) VALUES (?, ?, ?)
  ON CONFLICT(panel, clave) DO UPDATE SET valor = excluded.valor`).run(slug, clave, String(valor));

// Config de toma de leads inactivas de un panel: { activo, horas }.
function configRobo(slug) {
  return { activo: getPanelConfig(slug, 'robo_activo') === '1', horas: parseFloat(getPanelConfig(slug, 'robo_horas')) || 0 };
}
const msDesde = (sqliteUtc) => Date.now() - Date.parse((sqliteUtc || '').replace(' ', 'T') + 'Z');

// ¿La lead está liberada para que otro vendedor la tome? (abierta + robo activo + sin movimiento hace más de X horas)
function leadDisponible(deal, robo) {
  if (!robo.activo || !(robo.horas > 0)) return false;
  if (['Ganado', 'Perdido'].includes(deal.etapa)) return false;
  const ms = msDesde(deal.etapa_movida_at || deal.updated_at);
  return Number.isFinite(ms) && ms >= robo.horas * 3600 * 1000;
}

// Un vendedor toma una lead liberada. Anti-desincronización: se revalida acá adentro (SQLite es
// secuencial), así el segundo que llega recibe el aviso de que ya la tomaron y el reloj arranca de cero.
app.post('/deals/:id/tomar', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal || !puede(req.user, deal.panel)) return res.status(404).end();
  const home = homeDePanel(deal.panel);
  if (deal.user_id === req.user.id) return res.redirect(`/deals/${deal.id}`);
  const robo = configRobo(deal.panel);
  if (!leadDisponible(deal, robo)) {
    const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(deal.user_id);
    return res.redirect(`${home}?scope=todos&err=lead-tomada&lead=${encodeURIComponent(deal.empresa)}&por=${encodeURIComponent(owner ? owner.name : 'otro vendedor')}`);
  }
  const anterior = db.prepare('SELECT id, name FROM users WHERE id = ?').get(deal.user_id);
  db.prepare("UPDATE deals SET user_id = ?, etapa_movida_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.user.id, deal.id);
  logDealEvent(deal.id, req.user.id, 'edicion', `Tomó la lead por inactividad (${robo.horas}+ horas sin actividad; era de ${anterior ? anterior.name : '—'})`);
  if (anterior) notifyUser(anterior.id, `Tomó tu lead «${deal.empresa}» por inactividad (${robo.horas} h sin actividad)`, `/deals/${deal.id}`, null, req.user.id);
  res.redirect(`/deals/${deal.id}`);
});

// El dueño de la lead se la traspasa a un compañero (el admin ya reasigna desde la ficha).
app.post('/deals/:id/traspasar', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal || !puede(req.user, deal.panel)) return res.status(404).end();
  if (deal.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).end();
  const destino = db.prepare("SELECT id, name, permisos FROM users WHERE id = ? AND active = 1 AND role != 'developer'").get(parseInt(req.body.a, 10));
  let permisosOk = false;
  if (destino) { try { permisosOk = destino.id !== deal.user_id && JSON.parse(destino.permisos || '[]').includes(deal.panel); } catch {} }
  if (destino && (permisosOk || db.prepare('SELECT role FROM users WHERE id = ?').get(destino.id).role === 'admin')) {
    db.prepare("UPDATE deals SET user_id = ?, etapa_movida_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(destino.id, deal.id);
    logDealEvent(deal.id, req.user.id, 'edicion', `Traspasó la lead a ${destino.name}`);
    if (destino.id !== req.user.id) notifyUser(destino.id, `Te traspasó la lead «${deal.empresa}»`, `/deals/${deal.id}`, null, req.user.id);
  }
  res.redirect(`/deals/${deal.id}`);
});

// Migra una lead a otro panel comercial. Solo admin. Los datos comunes viajan; lo específico
// del panel se ajusta o se quita (queda registrado en el historial). Ganado aprobado no se migra:
// sus comisiones pertenecen a las reglas del panel de origen.
app.post('/deals/:id/migrar', requireAuth, requireAdmin, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  const destino = req.body.destino;
  if (!deal || !PANEL_SLUGS.includes(destino) || destino === deal.panel) return res.redirect(`/deals/${req.params.id}`);
  if (deal.etapa === 'Ganado' && deal.aprobacion === 'aprobado') return res.redirect(`/deals/${deal.id}?err=migrar-ganado`);
  const etapasDest = etapasDePanel(destino);
  const etapaNueva = etapasDest.includes(deal.etapa) ? deal.etapa : etapasDest[0];
  const ajustes = [];
  if (deal.campana_id) ajustes.push('se quitó la campaña (son propias de cada panel)');
  if (etapaNueva !== deal.etapa) ajustes.push(`etapa ${deal.etapa} → ${etapaNueva} (no existía en el destino)`);
  db.prepare("UPDATE deals SET panel = ?, etapa = ?, campana_id = NULL, updated_at = datetime('now') WHERE id = ?").run(destino, etapaNueva, deal.id);
  logDealEvent(deal.id, req.user.id, 'edicion', `Migrada de Comercial ${nombrePanel(deal.panel)} a Comercial ${nombrePanel(destino)}${ajustes.length ? ' — ' + ajustes.join('; ') : ''}`);
  if (deal.user_id !== req.user.id) {
    notifyUser(deal.user_id, `Migró tu lead «${deal.empresa}» a Comercial ${nombrePanel(destino)}`, `/deals/${deal.id}`, null, req.user.id);
  }
  res.redirect(`/deals/${deal.id}`);
});

app.post('/deals/:id/delete', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
  res.redirect('/pipeline');
});

/* ---------------- actividad ---------------- */

// Ventana de carga: hoy y hasta N días atrás (configurable por panel; el admin no tiene límite).
function ventanaFechas(dias = 3) {
  const out = [];
  for (let i = 0; i <= dias; i++) {
    const d = new Date(hoyAR() + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Días para atrás que el vendedor puede cargar en un panel (Config; 3 por defecto).
function diasAtrasDe(slug) {
  const n = parseInt(getPanelConfig(slug, 'dias_atras'), 10);
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : 3;
}

// Resuelve a quién y qué fecha se carga (vendedor: solo él, ventana de 3 días; admin: cualquiera, fecha libre).
function targetActividad(req, fuente, slug) {
  const esAdmin = req.user.role === 'admin';
  let target = { id: req.user.id, name: req.user.name };
  const vendedorId = parseInt(fuente.vendedor || fuente.user_id, 10);
  if (esAdmin && Number.isFinite(vendedorId)) {
    const t = db.prepare('SELECT id, name FROM users WHERE id = ? AND active = 1').get(vendedorId);
    if (t) target = t;
  }
  let fecha = cleanDate(fuente.fecha) || hoyAR();
  if (!esAdmin && !ventanaFechas(slug ? diasAtrasDe(slug) : 3).includes(fecha)) fecha = hoyAR();
  return { esAdmin, target, fecha };
}

/* ---------------- dashboard ---------------- */

// Suma por día de un campo de actividad de un panel (para la curva del dashboard).
function seriePorDia(slug, campoKey, desde, hasta = '9999-12-31') {
  const sum = {};
  for (const r of db.prepare('SELECT fecha, valores FROM panel_activity WHERE panel = ? AND fecha BETWEEN ? AND ?').all(slug, desde, hasta)) {
    try { sum[r.fecha] = (sum[r.fecha] || 0) + (Number(JSON.parse(r.valores || '{}')[campoKey]) || 0); } catch {}
  }
  return Object.keys(sum).sort().map((f) => ({ label: f.slice(8, 10) + '/' + f.slice(5, 7), v: sum[f] }));
}

// El dashboard unificado por panel (métricas + gráficas + reportes) se registra en la fábrica de paneles.

/* ---------------- equipo ---------------- */

/* ---------------- panel administración (usuarios, roles y permisos) ---------------- */

const ROLES = ['admin', 'vendedor', 'developer'];

function usuariosAdmin() {
  return db.prepare('SELECT id, name, email, role, active, permisos, avatar, created_at, last_login_at, last_seen_at FROM users ORDER BY role, name').all()
    .map((u) => { try { u.permisos = JSON.parse(u.permisos || '[]'); } catch { u.permisos = []; } return u; });
}

// Historial de un usuario: deals que tocó + sesiones y cambios de cuenta + días de actividad cargados.
function historialUsuario(userId, limite = 120) {
  const eventos = [];
  const VERBO = { creado: 'Creó el deal', etapa: 'Movió el deal', edicion: 'Editó el deal' };
  for (const e of db.prepare(`SELECT e.tipo, e.detalle, e.created_at, d.id AS deal_id, d.empresa, d.panel
      FROM deal_events e JOIN deals d ON d.id = e.deal_id WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT ?`).all(userId, limite)) {
    const P = PANELES_COMERCIALES.find((p) => p.slug === e.panel);
    eventos.push({ tipo: e.tipo, texto: `${VERBO[e.tipo] || 'Cambió el deal'} «${e.empresa}»${P ? ` (${P.nombre})` : ''}${e.detalle ? ': ' + e.detalle : ''}`, url: `/deals/${e.deal_id}`, cuando: e.created_at });
  }
  for (const e of db.prepare('SELECT tipo, detalle, created_at FROM user_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limite)) {
    eventos.push({ tipo: e.tipo, texto: e.detalle || e.tipo, cuando: e.created_at });
  }
  for (const a of db.prepare('SELECT panel, fecha FROM panel_activity WHERE user_id = ? ORDER BY fecha DESC LIMIT 60').all(userId)) {
    const P = PANELES_COMERCIALES.find((p) => p.slug === a.panel);
    eventos.push({ tipo: 'actividad', texto: `Cargó su actividad diaria en Comercial ${P ? P.nombre : a.panel}`, cuando: a.fecha + ' 23:59:59', soloFecha: true });
  }
  return eventos.sort((a, b) => (a.cuando < b.cuando ? 1 : -1)).slice(0, limite);
}

function permisosDeBody(body) {
  const validos = SISTEMAS.map(([slug]) => slug);
  let elegidos = body.permisos || [];
  if (!Array.isArray(elegidos)) elegidos = [elegidos];
  return JSON.stringify(elegidos.filter((p) => validos.includes(p)));
}

// El viejo /equipo redirige al panel nuevo.
app.get('/equipo', requireAuth, requireAdmin, (req, res) => res.redirect('/admin'));

// Sección Usuarios: tabla del equipo + alta.
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.send(V.adminPage({ user: req.user, users: usuariosAdmin(), sistemas: SISTEMAS, abrir: req.query.abrir === '1', errEmail: req.query.err === 'email' }));
});

// Sección Comunicación: avisos (con quién los vio) y alertas modales.
app.get('/admin/comunicacion', requireAuth, requireAdmin, (req, res) => {
  const avisos = db.prepare(`SELECT lote, MIN(texto) texto, MIN(created_at) created_at, COUNT(*) total, SUM(leida) vistos
    FROM notifications WHERE lote IS NOT NULL GROUP BY lote ORDER BY MIN(created_at) DESC LIMIT 10`).all()
    .map((a) => ({ ...a, destinatarios: db.prepare('SELECT u.name, n.leida, n.leida_at FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.lote = ? ORDER BY n.leida DESC, u.name').all(a.lote) }));
  const totalUsuarios = db.prepare('SELECT COUNT(*) c FROM users WHERE active = 1').get().c;
  const banners = db.prepare('SELECT b.*, (SELECT COUNT(*) FROM banner_vistos v WHERE v.banner_id = b.id) vistos FROM banners b ORDER BY b.id DESC LIMIT 10').all()
    .map((b) => ({ ...b, quienes: db.prepare('SELECT u.name, v.visto_at FROM banner_vistos v JOIN users u ON u.id = v.user_id WHERE v.banner_id = ? ORDER BY v.visto_at').all(b.id) }));
  const encuestas = db.prepare('SELECT e.* FROM encuestas e ORDER BY e.id DESC LIMIT 10').all().map((e) => {
    let ops = []; try { ops = JSON.parse(e.opciones); } catch {}
    const votos = db.prepare('SELECT v.*, u.name, u.avatar FROM encuesta_votos v JOIN users u ON u.id = v.user_id WHERE v.encuesta_id = ? ORDER BY v.created_at').all(e.id);
    const sinVotar = db.prepare(`SELECT name FROM users WHERE active = 1 AND role != 'developer'
      AND id NOT IN (SELECT user_id FROM encuesta_votos WHERE encuesta_id = ?) ORDER BY name`).all(e.id).map((u) => u.name);
    return { ...e, opciones: ops, votos, sinVotar, conteo: ops.map((_, i) => votos.filter((v) => v.opcion === i).length) };
  });
  res.send(V.adminComunicacionPage({ user: req.user, users: usuariosAdmin(), avisos, banners, encuestas, totalUsuarios }));
});

// Sección Preferencias: notificaciones del propio admin.
app.get('/admin/preferencias', requireAuth, requireAdmin, (req, res) => {
  let prefs = {}; try { prefs = JSON.parse(db.prepare('SELECT notif_prefs FROM users WHERE id = ?').get(req.user.id).notif_prefs || '{}'); } catch {}
  const cfgIA = iaConfig();
  // Gasto real: cada consulta guardó con qué modelo se hizo, así que se valúa fila por fila.
  const costoIA = (soloMes) => db.prepare(`SELECT modelo, COALESCE(SUM(tokens_in),0) AS ti, COALESCE(SUM(tokens_out),0) AS tsal, COUNT(*) AS n
      FROM ia_consultas ${soloMes ? "WHERE substr(datetime(created_at, '-3 hours'), 1, 7) = ?" : ''} GROUP BY modelo`)
    .all(...(soloMes ? [hoyAR().slice(0, 7)] : []))
    .reduce((acc, r) => {
      const m = IA_MODELOS[r.modelo] || IA_MODELOS[Object.keys(IA_MODELOS).find((k) => String(r.modelo || '').startsWith(k))] || IA_MODELOS[cfgIA.modelo];
      acc.usd += (r.ti / 1e6) * m.entrada + (r.tsal / 1e6) * m.salida; acc.n += r.n; return acc;
    }, { usd: 0, n: 0 });
  const mesIA = costoIA(true), totalIA = costoIA(false);
  res.send(V.adminPreferenciasPage({ user: req.user, prefs, ia: {
    ...cfgIA, keyOk: !!process.env.ANTHROPIC_API_KEY, modelos: IA_MODELOS,
    hoy: db.prepare("SELECT COUNT(*) AS c FROM ia_consultas WHERE substr(datetime(created_at, '-3 hours'), 1, 10) = ?").get(hoyAR()).c,
    mes: mesIA, costoMes: mesIA.usd, gastoTotal: totalIA.usd, restante: Math.max(0, cfgIA.credito - totalIA.usd),
    vendedores: db.prepare("SELECT id, name, avatar, role, ia_limite FROM users WHERE active = 1 AND role IN ('vendedor', 'admin') ORDER BY role = 'admin', name").all().map((v) => ({
      ...v, hoy: iaConsultasHoy(v.id),
      mes: db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(tokens_in + tokens_out), 0) AS t FROM ia_consultas WHERE user_id = ? AND substr(datetime(created_at, '-3 hours'), 1, 7) = ?").get(v.id, hoyAR().slice(0, 7)),
    })),
    ultimas: db.prepare('SELECT c.*, u.name FROM ia_consultas c JOIN users u ON u.id = c.user_id ORDER BY c.id DESC LIMIT 15').all(),
  } }));
});

// Grilla de constancia de un usuario en un panel: suma de lo cargado por día (clave = fecha).
// Un día cargado con todo en cero también figura (clave presente con 0): se cargó, aunque no hubo movimiento.
function heatDe(slug, uid, desdeHeat) {
  const heat = {};
  for (const r of db.prepare('SELECT fecha, valores FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(slug, uid, desdeHeat)) {
    try { heat[r.fecha] = (heat[r.fecha] || 0) + Object.values(JSON.parse(r.valores || '{}')).reduce((acu, x) => acu + (Number(x) || 0), 0); } catch { heat[r.fecha] = heat[r.fecha] || 0; }
  }
  return heat;
}

// Actividad de un usuario por panel comercial (ficha del admin): grilla, constancia y números clave.
function actividadDeUsuario(u) {
  const dHeat = new Date(hoyAR() + 'T00:00:00Z'); dHeat.setUTCDate(dHeat.getUTCDate() - 181);
  const desdeHeat = dHeat.toISOString().slice(0, 10);
  const ultimos30 = ventanaFechas(29);
  const paneles = PANELES_COMERCIALES.filter((P) => u.role === 'admin' || (u.permisos || []).includes(P.slug));
  return paneles.map((P) => {
    const slug = P.slug;
    const inicio = inicioPanelDe(u.id, slug);
    const heat = heatDe(slug, u.id, desdeHeat);
    const ventana = ventanaFechas(diasAtrasDe(slug)).filter((f, i) => i === 0 || !inicio || f >= inicio);
    const dias30 = ultimos30.filter((f) => !inicio || f >= inicio);
    const cargados30 = dias30.filter((f) => f in heat).length;
    const desde30 = dias30[dias30.length - 1] || hoyAR();
    const campos = camposPanel(slug);
    return {
      slug, nombre: P.nombre, base: baseDePanel(slug), heat, ventana, inicio, campos,
      hoyCargado: ventana[0] in heat,
      pendientes: ventana.filter((f, i) => i > 0 && !(f in heat)).length,
      cargados30, esperados30: dias30.length,
      ultima: db.prepare('SELECT MAX(fecha) AS f FROM panel_activity WHERE panel = ? AND user_id = ?').get(slug, u.id).f,
      abiertas: db.prepare("SELECT COUNT(*) AS c FROM deals WHERE panel = ? AND user_id = ? AND etapa NOT IN ('Ganado','Perdido')").get(slug, u.id).c,
      mes: panelStats(slug, u.id, inicioMes()),
      tot30: panelStats(slug, u.id, desde30),
    };
  });
}

// Ficha del usuario: datos, permisos, actividad por panel y su historial de acciones.
app.get('/admin/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const target = usuariosAdmin().find((u) => u.id === parseInt(req.params.id, 10));
  if (!target) return res.redirect('/admin');
  res.send(V.adminUserPage({ user: req.user, target, sistemas: SISTEMAS, historial: historialUsuario(target.id), actividad: actividadDeUsuario(target) }));
});

app.post('/admin/usuarios', requireAuth, requireAdmin, (req, res) => {
  const name = clean(req.body.name); const email = clean(req.body.email)?.toLowerCase();
  const password = req.body.password || '';
  const role = ROLES.includes(req.body.role) ? req.body.role : 'vendedor';
  if (name && email && password.length >= 6) {
    try {
      const permisosStr = permisosDeBody(req.body);
      const r = db.prepare('INSERT INTO users (name, email, password_hash, role, permisos) VALUES (?, ?, ?, ?, ?)')
        .run(name, email, bcrypt.hashSync(password, 10), role, permisosStr);
      for (const slug of JSON.parse(permisosStr)) {
        if (PANEL_SLUGS.includes(slug)) db.prepare('INSERT OR REPLACE INTO panel_asignaciones (user_id, panel, fecha) VALUES (?, ?, ?)').run(r.lastInsertRowid, slug, hoyAR());
      }
      logUserEvent(r.lastInsertRowid, 'cuenta', `Cuenta creada por ${req.user.name}`);
    } catch (e) { return res.redirect('/admin?err=email&abrir=1'); }
  }
  res.redirect('/admin');
});

// Cambiar rol (promocionar/degradar) y permisos por sistema.
app.post('/admin/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT id, role, permisos FROM users WHERE id = ?').get(req.params.id);
  if (target && target.id !== req.user.id) {
    const role = ROLES.includes(req.body.role) ? req.body.role : 'vendedor';
    let antes = []; try { antes = JSON.parse(target.permisos || '[]'); } catch {}
    const permisosStr = permisosDeBody(req.body);
    const ahora = JSON.parse(permisosStr);
    db.prepare('UPDATE users SET role = ?, permisos = ? WHERE id = ?').run(role, permisosStr, target.id);
    for (const slug of PANEL_SLUGS) {
      if (ahora.includes(slug) && !antes.includes(slug)) db.prepare('INSERT OR REPLACE INTO panel_asignaciones (user_id, panel, fecha) VALUES (?, ?, ?)').run(target.id, slug, hoyAR());
      if (!ahora.includes(slug) && antes.includes(slug)) db.prepare('DELETE FROM panel_asignaciones WHERE user_id = ? AND panel = ?').run(target.id, slug);
    }
    logUserEvent(target.id, 'cuenta', `${req.user.name} actualizó su rol y permisos${role !== target.role ? ` (ahora ${role})` : ''}`);
  }
  res.redirect(`/admin/usuarios/${req.params.id}`);
});

app.post('/admin/usuarios/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id !== req.user.id) {
    db.prepare('UPDATE users SET active = 1 - active WHERE id = ?').run(id);
    const u = db.prepare('SELECT active FROM users WHERE id = ?').get(id);
    if (u) logUserEvent(id, 'cuenta', `${req.user.name} ${u.active ? 'activó' : 'desactivó'} la cuenta`);
  }
  res.redirect(`/admin/usuarios/${id}`);
});

/* --- campañas (por panel: cada empresa gestiona las suyas) --- */

const campanasDePanel = (panel) => db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM deals d WHERE d.campana_id = c.id) AS leads FROM campanas c WHERE c.panel = ? ORDER BY c.activa DESC, c.nombre`).all(panel);

function registrarRutasCampanas(basePath, panel, backUrl) {
  app.post(basePath, requireAuth, requireAdmin, (req, res) => {
    const nombre = clean(req.body.nombre);
    if (nombre) { try { db.prepare('INSERT INTO campanas (panel, nombre) VALUES (?, ?)').run(panel, nombre); } catch {} }
    res.redirect(backUrl);
  });
  app.post(basePath + '/:id', requireAuth, requireAdmin, (req, res) => {
    const c = db.prepare('SELECT * FROM campanas WHERE id = ? AND panel = ?').get(req.params.id, panel);
    if (c) {
      if (req.body.accion === 'renombrar') {
        const nombre = clean(req.body.nombre);
        if (nombre) { try { db.prepare('UPDATE campanas SET nombre = ? WHERE id = ?').run(nombre, c.id); } catch {} }
      } else if (req.body.accion === 'toggle') {
        db.prepare('UPDATE campanas SET activa = 1 - activa WHERE id = ?').run(c.id);
      }
    }
    res.redirect(backUrl);
  });
}

// Las campañas se gestionan en la Config de cada panel (la vieja pestaña redirige).
app.get('/campanas', requireAuth, requireAdmin, (req, res) => res.redirect('/config'));
registrarRutasCampanas('/campanas', 'cfd', '/config');
for (const P of PANELES_COMERCIALES) {
  if (P.slug === 'cfd') continue; // CFD ya quedó registrado arriba (pestaña Campañas del dashboard)
  registrarRutasCampanas(`${baseDePanel(P.slug)}/campanas`, P.slug, `${baseDePanel(P.slug)}/config`);
}

// Estadísticas de campañas de un panel. Sin rango: histórico completo.
// Con rango: leads creadas en el período + cierres (ganadas/perdidas/ingresos) del período.
function statsCampanas(panel, desde = '0000-01-01', hasta = '9999-12-31') {
  return db.prepare(`SELECT COALESCE(c.nombre, 'Sin campaña') AS nombre,
      SUM(CASE WHEN substr(d.created_at,1,10) BETWEEN @desde AND @hasta THEN 1 ELSE 0 END) AS leads,
      SUM(CASE WHEN d.etapa = 'Ganado' AND d.aprobacion = 'aprobado' AND d.fecha_cierre BETWEEN @desde AND @hasta THEN 1 ELSE 0 END) AS ganadas,
      COALESCE(SUM(CASE WHEN d.etapa = 'Ganado' AND d.aprobacion = 'aprobado' AND d.fecha_cierre BETWEEN @desde AND @hasta THEN d.mrr END), 0) AS ingresos,
      SUM(CASE WHEN d.etapa = 'Perdido' AND d.fecha_cierre BETWEEN @desde AND @hasta THEN 1 ELSE 0 END) AS perdidas
    FROM deals d LEFT JOIN campanas c ON c.id = d.campana_id
    WHERE d.panel = @panel GROUP BY d.campana_id
    HAVING leads > 0 OR ganadas > 0 OR perdidas > 0
    ORDER BY ganadas DESC, ingresos DESC, leads DESC`).all({ panel, desde, hasta });
}

/* --- ventanas modales: changelog al entrar y alertas del admin --- */

app.post('/changelog/visto', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET last_version_vista = ? WHERE id = ?').run(CHANGELOG[0].version, req.user.id);
  res.json({ ok: true });
});

app.post('/banners/:id/visto', requireAuth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO banner_vistos (banner_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Voto de encuesta: una sola vez por usuario; vuelve a la página donde estaba.
app.post('/encuestas/:id/votar', requireAuth, (req, res) => {
  const enc = db.prepare('SELECT * FROM encuestas WHERE id = ? AND activo = 1').get(req.params.id);
  if (enc) {
    let ops = []; try { ops = JSON.parse(enc.opciones); } catch {}
    const opcion = parseInt(req.body.opcion, 10);
    if (Number.isFinite(opcion) && opcion >= 0 && opcion < ops.length) {
      db.prepare('INSERT OR IGNORE INTO encuesta_votos (encuesta_id, user_id, opcion) VALUES (?, ?, ?)').run(enc.id, req.user.id, opcion);
    }
  }
  const volver = req.get('referer');
  res.redirect(volver && volver.startsWith(`${req.protocol}://${req.get('host')}/`) ? volver : '/hub');
});

// Encuestas del admin: crear (2 a 5 opciones) y cerrar/reabrir.
app.post('/admin/encuestas', requireAuth, requireAdmin, (req, res) => {
  const pregunta = clean(req.body.pregunta);
  const opciones = [req.body.op1, req.body.op2, req.body.op3, req.body.op4, req.body.op5].map((o) => clean(o)).filter(Boolean);
  if (pregunta && opciones.length >= 2) {
    db.prepare('INSERT INTO encuestas (pregunta, opciones, created_by) VALUES (?, ?, ?)').run(pregunta, JSON.stringify(opciones), req.user.id);
  }
  res.redirect('/admin/comunicacion');
});

app.post('/admin/encuestas/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE encuestas SET activo = 1 - activo WHERE id = ?').run(req.params.id);
  res.redirect('/admin/comunicacion');
});

// Alerta modal del admin: le aparece a cada usuario al entrar hasta que toque "Entendido".
app.post('/admin/banners', requireAuth, requireAdmin, (req, res) => {
  const titulo = clean(req.body.titulo);
  const texto = clean(req.body.texto);
  if (titulo && texto) db.prepare('INSERT INTO banners (titulo, texto, created_by) VALUES (?, ?, ?)').run(titulo, texto, req.user.id);
  res.redirect('/admin/comunicacion');
});

app.post('/admin/banners/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE banners SET activo = 1 - activo WHERE id = ?').run(req.params.id);
  res.redirect('/admin/comunicacion');
});

// Preferencias de notificaciones del admin (el paso a Ganado no se puede silenciar).
app.post('/admin/mis-notificaciones', requireAuth, requireAdmin, (req, res) => {
  const prefs = { deal_nuevo: req.body.deal_nuevo === 'on', cambio_etapa: req.body.cambio_etapa === 'on' };
  db.prepare('UPDATE users SET notif_prefs = ? WHERE id = ?').run(JSON.stringify(prefs), req.user.id);
  res.redirect('/admin/preferencias');
});

// Aviso manual del admin: a un usuario puntual o global por rol.
app.post('/admin/notificar', requireAuth, requireAdmin, (req, res) => {
  const texto = clean(req.body.texto);
  if (texto) {
    const destino = req.body.destino || 'todos';
    let usuarios;
    if (destino.startsWith('u:')) usuarios = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').all(parseInt(destino.slice(2), 10));
    else if (['vendedor', 'developer', 'admin'].includes(destino)) usuarios = db.prepare('SELECT id FROM users WHERE role = ? AND active = 1').all(destino);
    else usuarios = db.prepare('SELECT id FROM users WHERE active = 1').all();
    const msg = `Aviso: ${texto}`;
    const lote = 'aviso-' + Date.now();
    for (const u of usuarios) if (u.id !== req.user.id) notifyUser(u.id, msg, '/notificaciones', lote, req.user.id);
  }
  res.redirect('/admin/comunicacion');
});

app.post('/admin/usuarios/:id/reset', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.params.id);
  if (!target || target.id === req.user.id) return res.redirect('/admin');
  const password = require('crypto').randomBytes(4).toString('hex');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), target.id);
  logUserEvent(target.id, 'cuenta', `${req.user.name} le reseteó la clave`);
  const t = usuariosAdmin().find((u) => u.id === target.id);
  res.send(V.adminUserPage({ user: req.user, target: t, sistemas: SISTEMAS, historial: historialUsuario(t.id), resetInfo: { name: target.name, password } }));
});

/* ---------------- objetivos y ranking ---------------- */

// "Hoy" en fecha argentina (los vendedores cargan su día en hora local).
const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

function inicioSemana() { // lunes de la semana actual
  const d = new Date(hoyAR() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const inicioMes = () => hoyAR().slice(0, 8) + '01';

// Series históricas de un vendedor en un panel: por campo de actividad + ingresos aprobados.
// Devuelve { diario, semanal, mensual } con un valor por campo (clave c<id>) más "ingresos".
function panelSeries(slug, uid) {
  const campos = camposPanel(slug);
  const keys = [...campos.map((c) => 'c' + c.id), 'ingresos'];
  const desde = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const sum = {};
  const cero = () => Object.fromEntries(keys.map((k) => [k, 0]));
  const add = (fecha, k, v) => { (sum[fecha] = sum[fecha] || cero())[k] += Number(v) || 0; };
  for (const r of db.prepare('SELECT fecha, valores FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(slug, uid, desde)) {
    const v = valoresDeFila(campos, r.valores); for (const c of campos) add(r.fecha, 'c' + c.id, v['c' + c.id]);
  }
  for (const w of db.prepare("SELECT fecha_cierre f, mrr FROM deals WHERE panel = ? AND user_id = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND fecha_cierre >= ?").all(slug, uid, desde)) {
    if (w.f) add(w.f, 'ingresos', w.mrr);
  }
  const get = (k) => sum[k] || cero();
  const hoy = hoyAR();
  const diario = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(hoy + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - i);
    const k = d.toISOString().slice(0, 10);
    diario.push({ label: `${+k.slice(8, 10)}/${+k.slice(5, 7)}`, ...get(k) });
  }
  const semanal = [];
  for (let i = 7; i >= 0; i--) {
    const s = new Date(inicioSemana() + 'T00:00:00Z'); s.setUTCDate(s.getUTCDate() - 7 * i);
    const t = cero();
    for (let j = 0; j < 7; j++) {
      const d = new Date(s); d.setUTCDate(d.getUTCDate() + j);
      const g = get(d.toISOString().slice(0, 10));
      for (const k of keys) t[k] += g[k];
    }
    const k = s.toISOString().slice(0, 10);
    semanal.push({ label: `${+k.slice(8, 10)}/${+k.slice(5, 7)}`, ...t });
  }
  const MES_N = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mensual = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(hoy.slice(0, 8) + '01T00:00:00Z'); m.setUTCMonth(m.getUTCMonth() - i);
    const clave = m.toISOString().slice(0, 7);
    const t = cero();
    for (const k of Object.keys(sum)) if (k.slice(0, 7) === clave) { for (const kk of keys) t[kk] += sum[k][kk]; }
    mensual.push({ label: MES_N[+clave.slice(5, 7) - 1], ...t });
  }
  return { campos, series: { diario, semanal, mensual } };
}

/* ---------------- reportes (admin) ---------------- */

function rangoPeriodo(p, off) {
  if (p === 'dia') {
    const d = new Date(hoyAR() + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - off);
    const f = d.toISOString().slice(0, 10);
    return { desde: f, hasta: f };
  }
  if (p === 'mes') {
    const d = new Date(hoyAR().slice(0, 8) + '01T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - off);
    const fin = new Date(d); fin.setUTCMonth(fin.getUTCMonth() + 1); fin.setUTCDate(0);
    return { desde: d.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
  }
  const d = new Date(inicioSemana() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7 * off);
  const fin = new Date(d); fin.setUTCDate(fin.getUTCDate() + 6);
  return { desde: d.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
}

const periodoDeQuery = (q) => (q === 'mes' ? 'mes' : q === 'dia' ? 'dia' : 'semana');
const PERIODO_NOMBRE = { dia: 'diario', semana: 'semanal', mes: 'mensual' };

function reporteData(slug, desde, hasta) {
  const campos = camposPanel(slug);
  const keys = campos.map((c) => 'c' + c.id);
  const usuarios = db.prepare("SELECT id, name FROM users WHERE active = 1 AND role != 'developer' ORDER BY name").all();
  const porVendedor = usuarios.map((u) => {
    const act = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const r of db.prepare('SELECT valores FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha BETWEEN ? AND ?').all(slug, u.id, desde, hasta)) {
      const v = valoresDeFila(campos, r.valores); for (const k of keys) act[k] += Number(v[k]) || 0;
    }
    const creados = db.prepare('SELECT COUNT(*) n FROM deals WHERE panel = ? AND user_id = ? AND substr(created_at,1,10) BETWEEN ? AND ?').get(slug, u.id, desde, hasta).n;
    const g = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(mrr),0) m FROM deals WHERE panel = ? AND user_id = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND fecha_cierre BETWEEN ? AND ?").get(slug, u.id, desde, hasta);
    const perdidos = db.prepare("SELECT COUNT(*) n FROM deals WHERE panel = ? AND user_id = ? AND etapa = 'Perdido' AND fecha_cierre BETWEEN ? AND ?").get(slug, u.id, desde, hasta).n;
    return { id: u.id, name: u.name, ...act, creados, ganados: g.n, perdidos, mrr: g.m };
  });
  const tot = porVendedor.reduce((acc, v) => {
    for (const k of [...keys, 'creados', 'ganados', 'perdidos', 'mrr']) acc[k] = (acc[k] || 0) + v[k];
    return acc;
  }, {});
  // "Actividad del equipo" para la tarjeta del resumen: el campo Toques si existe, si no el primero.
  const campoToques = campos.find((c) => /toque/i.test(c.label)) || campos[0];
  tot.toques = campoToques ? (tot['c' + campoToques.id] || 0) : 0;
  const motivos = db.prepare("SELECT COALESCE(motivo_perdida,'Sin motivo') label, COUNT(*) n FROM deals WHERE panel = ? AND etapa = 'Perdido' AND fecha_cierre BETWEEN ? AND ? GROUP BY label ORDER BY n DESC").all(slug, desde, hasta);
  const cerrados = db.prepare(`SELECT d.empresa, d.etapa, d.tipo_venta, d.mrr, d.fecha_cierre, d.motivo_perdida, u.name vendedor FROM deals d JOIN users u ON u.id = d.user_id
    WHERE d.panel = ? AND (d.etapa = 'Perdido' OR (d.etapa = 'Ganado' AND d.aprobacion = 'aprobado')) AND d.fecha_cierre BETWEEN ? AND ? ORDER BY d.fecha_cierre`).all(slug, desde, hasta);
  const mrrNuevo = db.prepare("SELECT COALESCE(SUM(mrr),0) s FROM deals WHERE panel = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND tipo_venta != 'Proyecto único' AND fecha_cierre BETWEEN ? AND ?").get(slug, desde, hasta).s;
  const ingresosProyectos = db.prepare("SELECT COALESCE(SUM(mrr),0) s FROM deals WHERE panel = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND tipo_venta = 'Proyecto único' AND fecha_cierre BETWEEN ? AND ?").get(slug, desde, hasta).s;
  const winRate = tot.ganados + tot.perdidos > 0 ? Math.round((tot.ganados / (tot.ganados + tot.perdidos)) * 100) : null;
  return { campos, porVendedor, tot, motivos, cerrados, winRate, mrrNuevo, ingresosProyectos };
}

// Datos completos del dashboard unificado de un panel: snapshot del pipeline + métricas del período.
function dashboardData(slug, p, off) {
  const { desde, hasta } = rangoPeriodo(p, off);
  const r = reporteData(slug, desde, hasta);
  const etapas = etapasPanelCfg(slug).map((e) => e.nombre);
  const colores = coloresDePanel(slug);
  const funnel = {};
  for (const row of db.prepare("SELECT etapa, COUNT(*) n FROM deals WHERE panel = ? AND etapa NOT IN ('Ganado','Perdido') GROUP BY etapa").all(slug)) funnel[row.etapa] = row.n;
  const activos = Object.values(funnel).reduce((a, b) => a + b, 0);
  // "En juego": las dos últimas etapas activas (las más cercanas al cierre), foto de hoy.
  const etapasJuego = etapas.slice(-2);
  const enJuego = etapasJuego.length
    ? db.prepare(`SELECT COALESCE(SUM(mrr),0) s FROM deals WHERE panel = ? AND etapa IN (${etapasJuego.map(() => '?').join(',')})`).get(slug, ...etapasJuego).s
    : 0;
  // Curva diaria del campo principal; si el período es un solo día, muestra los últimos 14 para dar contexto.
  const campoCurva = r.campos.find((c) => /toque/i.test(c.label)) || r.campos[0];
  const curvaDesde = p === 'dia' ? new Date(new Date(hasta + 'T00:00:00Z').getTime() - 13 * 864e5).toISOString().slice(0, 10) : desde;
  const curva = campoCurva ? seriePorDia(slug, 'c' + campoCurva.id, curvaDesde, hasta) : [];
  const estancados = db.prepare(`SELECT d.id, d.empresa, d.etapa, d.updated_at, u.name vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE d.panel = ? AND d.etapa NOT IN ('Ganado','Perdido') AND d.updated_at < datetime('now','-14 days') ORDER BY d.updated_at ASC`).all(slug);
  const provincias = db.prepare(`SELECT COALESCE(NULLIF(provincia,''),'Sin provincia') label, COUNT(*) n FROM deals
    WHERE panel = ? AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY label ORDER BY n DESC LIMIT 12`).all(slug, desde, hasta);
  const campanas = statsCampanas(slug, desde, hasta);
  return { desde, hasta, r, etapas, colores, funnel, activos, enJuego, curva, curvaLabel: campoCurva ? campoCurva.label : '', estancados, provincias, campanas, esCfd: slug === 'cfd' };
}

// CSV del dashboard: por vendedor + cierres + campañas + provincias del período.
function csvDashboard(d, p, info) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const keys = d.r.campos.map((c) => 'c' + c.id);
  const L = [];
  L.push(`Reporte ${PERIODO_NOMBRE[p]} · ${info.nombre};${d.desde} a ${d.hasta}`);
  L.push('');
  L.push(['Vendedor', ...d.r.campos.map((c) => esc(c.label)), 'Leads creadas', 'Ganados', 'Perdidos', 'Ingresos ganados'].join(';'));
  for (const v of d.r.porVendedor) L.push([esc(v.name), ...keys.map((k) => v[k] || 0), v.creados, v.ganados, v.perdidos, v.mrr].join(';'));
  L.push([esc('TOTAL'), ...keys.map((k) => d.r.tot[k] || 0), d.r.tot.creados, d.r.tot.ganados, d.r.tot.perdidos, d.r.tot.mrr].join(';'));
  L.push('');
  L.push(['Deal cerrado', 'Resultado', 'Valor', 'Fecha cierre', 'Motivo de pérdida', 'Vendedor'].join(';'));
  for (const c of d.r.cerrados) L.push([esc(c.empresa), c.etapa, c.mrr ?? '', c.fecha_cierre, esc(c.motivo_perdida || ''), esc(c.vendedor)].join(';'));
  L.push('');
  L.push(['Campaña', 'Leads del período', 'Ganadas', 'Perdidas', 'Ingresos'].join(';'));
  for (const c of d.campanas) L.push([esc(c.nombre), c.leads, c.ganadas, c.perdidas, c.ingresos].join(';'));
  L.push('');
  L.push(['Provincia (leads creadas)', 'Leads'].join(';'));
  for (const pr of d.provincias) L.push([esc(pr.label), pr.n].join(';'));
  return L.join('\r\n');
}

// Las URLs viejas de Reportes redirigen al dashboard unificado.
const qsPeriodo = (req) => `?p=${periodoDeQuery(req.query.p)}&off=${Math.max(0, parseInt(req.query.off, 10) || 0)}`;
app.get('/reportes', requireAuth, requireAdmin, (req, res) => res.redirect('/dashboard' + qsPeriodo(req)));
app.get('/reportes/imprimir', requireAuth, requireAdmin, (req, res) => res.redirect('/dashboard/imprimir' + qsPeriodo(req)));
app.get('/reportes.csv', requireAuth, requireAdmin, (req, res) => res.redirect('/dashboard.csv' + qsPeriodo(req)));

/* ---------------- paneles comerciales configurables (una empresa = un panel) ---------------- */

const camposPanel = (slug) => db.prepare('SELECT * FROM panel_campos WHERE panel = ? ORDER BY orden').all(slug);
// Campos calculados (Config): fórmula con {id} de otros campos (formulas.js). Se resuelven al leer cada fila.
function valoresDeFila(campos, json) {
  let v = {}; try { v = JSON.parse(json || '{}'); } catch {}
  return F.resolverCalculados(campos, v);
}
// Convierte la fórmula escrita con etiquetas a ids validando sintaxis, campos y que use al menos un campo.
function compilarFormula(texto, campos) {
  const expr = F.labelsAIds(String(texto || '').trim(), campos);
  if (!F.idsEn(expr).length) throw new Error('La fórmula tiene que usar al menos un campo');
  return expr;
}
const etapasPanelCfg = (slug) => db.prepare('SELECT * FROM panel_etapas WHERE panel = ? ORDER BY orden').all(slug);

// Opciones de vista compartidas por todas las pantallas de un panel configurable.
function panelOpts(slug) {
  return {
    etapasActivas: etapasPanelCfg(slug).map((e) => e.nombre),
    colores: coloresDePanel(slug),
    base: baseDePanel(slug),
    nuevoHref: '/deals/new?panel=' + slug,
    sistema: slug,
  };
}

function panelPipelineData(req, slug) {
  const scope = scopeDefault(req);
  const closed = req.query.cerrados === '1';
  const params = [slug];
  const where = ['d.panel = ?'];
  if (closed) where.push("d.etapa IN ('Ganado','Perdido')");
  else { where.push("(d.etapa NOT IN ('Ganado','Perdido') OR d.fecha_cierre >= ?)"); params.push(inicioMes()); }
  if (scope === 'mios') { where.push('d.user_id = ?'); params.push(req.user.id); }
  const deals = db.prepare(`SELECT d.*, u.name AS vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE ${where.join(' AND ')} ORDER BY d.destacada DESC, d.fecha_proximo_paso IS NULL DESC, d.fecha_proximo_paso ASC, d.updated_at DESC`).all(...params);
  const robo = configRobo(slug);
  for (const d of deals) d.disponible = leadDisponible(d, robo) && d.user_id !== req.user.id;
  // CFD: las leads en "Reunión agendada" marcan si tienen (o les falta) la reunión en la agenda.
  if (slug === 'cfd') {
    const proximas = {};
    for (const r of db.prepare("SELECT r.deal_id, r.fecha, r.hora, u.name AS admin FROM reuniones r LEFT JOIN users u ON u.id = r.admin_id WHERE r.estado = 'agendada' AND r.fecha >= ? ORDER BY r.fecha, r.hora").all(hoyAR())) {
      if (!proximas[r.deal_id]) proximas[r.deal_id] = r;
    }
    for (const d of deals) {
      if (d.etapa !== 'Reunión agendada' || ['Ganado', 'Perdido'].includes(d.etapa)) continue;
      if (proximas[d.id]) d.reunion = proximas[d.id]; else d.sinReunion = true;
    }
  }
  return { scope, closed, robo, ...filtrarPipeline(req, deals) };
}

// Sumas de un vendedor en el período: campos dinámicos (JSON) + ventas aprobadas del panel.
function panelStats(slug, userId, desde) {
  const tot = { ganados: 0, ingresos: 0 };
  const campos = camposPanel(slug);
  for (const c of campos) tot['c' + c.id] = 0;
  for (const row of db.prepare('SELECT valores FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(slug, userId, desde)) {
    const v = valoresDeFila(campos, row.valores); for (const k of Object.keys(v)) if (k in tot) tot[k] += Number(v[k]) || 0;
  }
  const g = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(mrr),0) m FROM deals WHERE panel = ? AND user_id = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND fecha_cierre >= ?").get(slug, userId, desde);
  tot.ganados = g.n; tot.ingresos = g.m;
  return tot;
}

const panelGoalsDe = (slug, userId) => {
  const out = { dia: {}, semana: {}, mes: {} };
  for (const r of db.prepare('SELECT * FROM panel_goals WHERE panel = ? AND user_id = ?').all(slug, userId)) { try { out[r.periodo] = JSON.parse(r.valores || '{}'); } catch {} }
  return out;
};

function guardarGoalsPanel(slug, userId, body) {
  const campos = camposPanel(slug);
  const up = db.prepare(`INSERT INTO panel_goals (panel, user_id, periodo, valores) VALUES (?, ?, ?, ?)
    ON CONFLICT(panel, user_id, periodo) DO UPDATE SET valores = excluded.valores`);
  for (const [pref, periodo] of [['d', 'dia'], ['s', 'semana'], ['m', 'mes']]) {
    const v = {};
    for (const c of campos) v['c' + c.id] = cleanNum(body[`${pref}_c${c.id}`]) || 0;
    v.ganados = cleanNum(body[`${pref}_ganados`]) || 0;
    v.ingresos = cleanNum(body[`${pref}_ingresos`]) || 0;
    up.run(slug, userId, periodo, JSON.stringify(v));
  }
}

for (const PANEL of PANELES_COMERCIALES) {
  const slug = PANEL.slug;
  const base = baseDePanel(slug); // CFD = '' → sus rutas quedan en la raíz (/pipeline, /actividad…)
  const info = { slug, base, nombre: PANEL.nombre };

  if (base) app.get(base, requireAuth, requireSistema(slug), (req, res) => res.redirect(base + '/pipeline'));

  app.get(base + '/pipeline', requireAuth, requireSistema(slug), (req, res) => {
    const errTexto = req.query.err === 'lead-tomada'
      ? `Llegaste tarde: «${clean(req.query.lead) || 'esa lead'}» ya no está disponible — la tiene ${clean(req.query.por) || 'otro vendedor'} y su contador arrancó de cero.`
      : null;
    res.send(V.pipelinePage({ user: req.user, ...panelPipelineData(req, slug), ...panelOpts(slug), err: errTexto }));
  });

  app.get(base + '/actividad', requireAuth, requireSistema(slug), (req, res) => {
    const { esAdmin, target, fecha } = targetActividad(req, req.query, slug);
    const esGeneral = esAdmin && req.query.vendedor === 'todos';
    const diasAtras = diasAtrasDe(slug);
    const today = db.prepare('SELECT * FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha = ?').get(slug, target.id, fecha);
    const history = db.prepare('SELECT * FROM panel_activity WHERE panel = ? AND user_id = ? ORDER BY fecha DESC LIMIT 14').all(slug, target.id);
    const inicioPanel = inicioPanelDe(target.id, slug);
    const ventana = ventanaFechas(diasAtras).filter((f, i) => i === 0 || !inicioPanel || f >= inicioPanel);
    const cargadas = db.prepare('SELECT fecha FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(slug, target.id, ventana[ventana.length - 1]).map((r) => r.fecha);
    const vendedores = esAdmin ? db.prepare("SELECT id, name FROM users WHERE active = 1 AND role != 'developer' ORDER BY name").all() : [];
    // Grilla de constancia (estilo GitHub): suma de lo cargado por día en los últimos 6 meses.
    const dHeat = new Date(hoyAR() + 'T00:00:00Z'); dHeat.setUTCDate(dHeat.getUTCDate() - 181);
    const desdeHeat = dHeat.toISOString().slice(0, 10);
    const filasHeat = esGeneral
      ? db.prepare('SELECT fecha, valores FROM panel_activity WHERE panel = ? AND fecha >= ?').all(slug, desdeHeat)
      : db.prepare('SELECT fecha, valores FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(slug, target.id, desdeHeat);
    const heat = {};
    for (const r of filasHeat) {
      try { heat[r.fecha] = (heat[r.fecha] || 0) + Object.values(JSON.parse(r.valores || '{}')).reduce((acu, x) => acu + (Number(x) || 0), 0); } catch {}
    }
    res.send(V.panelActividadPage({ user: req.user, campos: camposPanel(slug), today, history, info, fecha, ventana, cargadas, esAdmin, esGeneral, target, vendedores, base, heat, diasAtras, alta: inicioPanel, abrir: req.query.abrir === '1' }));
  });

  app.post(base + '/actividad', requireAuth, requireSistema(slug), (req, res) => {
    const { esAdmin, target, fecha } = targetActividad(req, req.body, slug);
    const valores = {};
    for (const c of camposPanel(slug)) if (!c.formula) valores['c' + c.id] = cleanInt(req.body['c' + c.id]);
    db.prepare(`INSERT INTO panel_activity (panel, user_id, fecha, valores, notas) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(panel, user_id, fecha) DO UPDATE SET valores = excluded.valores, notas = excluded.notas`)
      .run(slug, target.id, fecha, JSON.stringify(valores), clean(req.body.notas));
    res.redirect(`${base}/actividad?fecha=${fecha}${esAdmin && target.id !== req.user.id ? '&vendedor=' + target.id : ''}`);
  });

  app.get(base + '/objetivos', requireAuth, requireSistema(slug), (req, res) => {
    const esAdmin = req.user.role === 'admin';
    const usuarios = esAdmin
      ? db.prepare("SELECT id, name FROM users WHERE active = 1 AND role != 'developer' ORDER BY role = 'admin', name").all()
      : [{ id: req.user.id, name: req.user.name }];
    const desde = { dia: hoyAR(), semana: inicioSemana(), mes: inicioMes() };
    const data = usuarios.map((u) => ({
      u, goals: panelGoalsDe(slug, u.id),
      stats: { dia: panelStats(slug, u.id, desde.dia), semana: panelStats(slug, u.id, desde.semana), mes: panelStats(slug, u.id, desde.mes) },
    }));
    res.send(V.panelObjetivosPage({ user: req.user, campos: camposPanel(slug), data, esAdmin, info }));
  });

  app.post(base + '/objetivos/:userId', requireAuth, requireAdmin, (req, res) => {
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
    if (target) guardarGoalsPanel(slug, target.id, req.body);
    res.redirect(base + '/objetivos');
  });

  app.post(base + '/objetivos-generales', requireAuth, requireAdmin, (req, res) => {
    for (const u of db.prepare("SELECT id FROM users WHERE role = 'vendedor' AND active = 1").all()) guardarGoalsPanel(slug, u.id, req.body);
    res.redirect(base + '/objetivos');
  });

  // Contactos del día (admin): leads nuevas cargadas y recontactos por vendedor, navegable por fecha.
  // Recontacto = lead que YA existía (no creada ese día) y ese día recibió nota, edición o cambio de etapa.
  // Las fechas de los eventos (UTC en SQLite) se convierten a día argentino con -3 horas.
  app.get(base + '/contactos', requireAuth, requireSistema(slug), requireAdmin, (req, res) => {
    const fecha = cleanDate(req.query.fecha) || hoyAR();
    const d14 = new Date(hoyAR() + 'T00:00:00Z'); d14.setUTCDate(d14.getUTCDate() - 13);
    const desde14 = d14.toISOString().slice(0, 10);
    const desdeQ = fecha < desde14 ? fecha : desde14;
    const datos = {};
    const anotar = (f, uid, campo, valor) => {
      if (!datos[f]) datos[f] = {};
      if (!datos[f][uid]) datos[f][uid] = { nuevas: 0, rec: 0, toques: 0 };
      datos[f][uid][campo] += valor;
    };
    for (const r of db.prepare(`SELECT substr(datetime(e.created_at, '-3 hours'), 1, 10) AS f, e.user_id, COUNT(*) AS n
        FROM deal_events e JOIN deals d ON d.id = e.deal_id
        WHERE d.panel = ? AND e.tipo = 'creado' AND substr(datetime(e.created_at, '-3 hours'), 1, 10) >= ?
        GROUP BY f, e.user_id`).all(slug, desdeQ)) anotar(r.f, r.user_id, 'nuevas', r.n);
    for (const r of db.prepare(`SELECT substr(datetime(e.created_at, '-3 hours'), 1, 10) AS f, e.user_id,
          COUNT(DISTINCT e.deal_id) AS n, COUNT(*) AS t
        FROM deal_events e JOIN deals d ON d.id = e.deal_id
        WHERE d.panel = ? AND e.tipo IN ('etapa', 'edicion')
          AND substr(datetime(e.created_at, '-3 hours'), 1, 10) >= ?
          AND NOT EXISTS (SELECT 1 FROM deal_events c WHERE c.deal_id = e.deal_id AND c.tipo = 'creado'
            AND substr(datetime(c.created_at, '-3 hours'), 1, 10) = substr(datetime(e.created_at, '-3 hours'), 1, 10))
        GROUP BY f, e.user_id`).all(slug, desdeQ)) { anotar(r.f, r.user_id, 'rec', r.n); anotar(r.f, r.user_id, 'toques', r.t); }
    const vendedores = db.prepare("SELECT id, name, avatar FROM users WHERE active = 1 AND role = 'vendedor' ORDER BY name").all();
    res.send(V.panelContactosPage({ user: req.user, info, fecha, hoy: hoyAR(), desde14, vendedores, datos }));
  });

  app.get(base + '/ranking', requireAuth, requireSistema(slug), (req, res) => {
    const periodo = req.query.p === 'mes' ? 'mes' : req.query.p === 'dia' ? 'dia' : 'semana';
    const desde = periodo === 'mes' ? inicioMes() : periodo === 'dia' ? hoyAR() : inicioSemana();
    const rows = db.prepare("SELECT id, name FROM users WHERE active = 1 AND role != 'developer'").all()
      .map((u) => {
        const st = panelStats(slug, u.id, desde);
        const goal = panelGoalsDe(slug, u.id)[periodo];
        const cumpl = goal && goal.ingresos > 0 ? Math.round((st.ingresos / goal.ingresos) * 100) : null;
        return { name: u.name, ...st, cumpl };
      })
      .sort((a, b) => b.ingresos - a.ingresos || b.ganados - a.ganados);
    res.send(V.panelRankingPage({ user: req.user, periodo, campos: camposPanel(slug), rows, info }));
  });

  // Gráficas históricas del vendedor (diario/semanal/mensual por campo + ingresos).
  app.get(base + '/metas/:userId', requireAuth, requireSistema(slug), (req, res) => {
    const uid = parseInt(req.params.userId, 10);
    if (req.user.role !== 'admin' && uid !== req.user.id) return res.status(403).send('Solo podés ver tus propias gráficas.');
    const vendedor = db.prepare('SELECT id, name FROM users WHERE id = ?').get(uid);
    if (!vendedor) return res.redirect(base + '/objetivos');
    const { campos, series } = panelSeries(slug, uid);
    res.send(V.metasDetallePage({ user: req.user, vendedor, campos, series, info }));
  });

  // Dashboard unificado (métricas + gráficas + reportes del período elegido) con exportación CSV y PDF.
  const datosDash = (req) => {
    const p = periodoDeQuery(req.query.p);
    const off = Math.min(30, Math.max(0, parseInt(req.query.off, 10) || 0));
    const periodos = Array.from({ length: p === 'dia' ? 14 : 8 }, (_, i) => { const rr = rangoPeriodo(p, i); return { off: i, label: p === 'dia' ? rr.desde : `${rr.desde} a ${rr.hasta}` }; });
    return { p, off, periodos, ...dashboardData(slug, p, off) };
  };

  app.get(base + '/dashboard', requireAuth, requireAdmin, (req, res) => {
    res.send(V.dashboardUnificadoPage({ user: req.user, info, ...datosDash(req) }));
  });

  app.get(base + '/dashboard/imprimir', requireAuth, requireAdmin, (req, res) => {
    const d = datosDash(req);
    res.send(V.reporteImprimirPage({ user: req.user, info, p: d.p, nombrePeriodo: PERIODO_NOMBRE[d.p], desde: d.desde, hasta: d.hasta, r: d.r, campanas: d.campanas }));
  });

  // Directorio de clientes del panel: empresa, teléfono y calificación (pedido de administración).
  app.get(base + '/clientes.csv', requireAuth, requireAdmin, (req, res) => {
    const filas = db.prepare(`SELECT d.empresa, d.telefono, d.calificacion, d.etapa, d.mrr, d.provincia, d.ciudad, d.created_at, d.etapa_movida_at, u.name AS vendedor
      FROM deals d JOIN users u ON u.id = d.user_id WHERE d.panel = ? ORDER BY d.calificacion IS NULL, d.calificacion, d.empresa`).all(slug);
    const escC = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const L = [`Clientes · Comercial ${nombrePanel(slug)};generado ${hoyAR()}`, ''];
    L.push(['Cliente', 'Teléfono', 'Calificación', 'Etapa', 'Valor', 'Provincia', 'Ciudad', 'Vendedor', 'Creada', 'Último movimiento'].join(';'));
    for (const f of filas) L.push([escC(f.empresa), escC(f.telefono || ''), escC(f.calificacion || 'Sin calificar'), f.etapa, f.mrr ?? '', escC(f.provincia || ''), escC(f.ciudad || ''), escC(f.vendedor), (f.created_at || '').slice(0, 10), (f.etapa_movida_at || '').slice(0, 10)].join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clientes-${slug}.csv"`);
    res.send('\ufeff' + L.join('\r\n'));
  });

  app.get(base + '/dashboard.csv', requireAuth, requireAdmin, (req, res) => {
    const d = datosDash(req);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${slug}-${d.p}-${d.desde}.csv"`);
    res.send('﻿' + csvDashboard(d, d.p, info));
  });

  /* --- configuración del panel (solo admin) --- */

  app.get(base + '/config', requireAuth, requireAdmin, (req, res) => {
    res.send(V.panelConfigPage({ user: req.user, etapas: etapasPanelCfg(slug), campos: camposPanel(slug), err: req.query.err, errEtapa: clean(req.query.etapa), errN: parseInt(req.query.n, 10) || 0, info, campanas: campanasDePanel(slug), robo: configRobo(slug), diasAtras: diasAtrasDe(slug),
      fx: { msg: clean(req.query.msg), label: clean(req.query.label), formula: String(req.query.formula || ''), campoId: parseInt(req.query.campo, 10) || 0, nombre: clean(req.query.nombre), por: clean(req.query.por) } }));
  });

  // Carga retroactiva de actividad: cuántos días para atrás puede cargar el vendedor.
  app.post(base + '/config/actividad', requireAuth, requireAdmin, (req, res) => {
    const dias = Math.max(0, Math.min(30, parseInt(req.body.dias, 10)));
    if (Number.isFinite(dias)) setPanelConfig(slug, 'dias_atras', dias);
    res.redirect(base + '/config');
  });

  // Toma de leads inactivas: se activa con una cantidad de horas sin movimiento de etapa.
  app.post(base + '/config/robo', requireAuth, requireAdmin, (req, res) => {
    const activo = req.body.activo === 'on';
    const horas = Math.max(1, Math.min(720, parseFloat(req.body.horas) || 0));
    if (activo && !(parseFloat(req.body.horas) > 0)) return res.redirect(base + '/config');
    setPanelConfig(slug, 'robo_activo', activo ? '1' : '0');
    setPanelConfig(slug, 'robo_horas', horas);
    res.redirect(base + '/config');
  });

  app.post(base + '/config/etapas', requireAuth, requireAdmin, (req, res) => {
    const nombre = clean(req.body.nombre);
    if (nombre && !['Ganado', 'Perdido'].includes(nombre)) {
      const max = db.prepare('SELECT COALESCE(MAX(orden),0) m FROM panel_etapas WHERE panel = ?').get(slug).m;
      try { db.prepare('INSERT INTO panel_etapas (panel, nombre, orden) VALUES (?, ?, ?)').run(slug, nombre, max + 1); } catch {}
    }
    res.redirect(base + '/config');
  });

  app.post(base + '/config/etapas/:id', requireAuth, requireAdmin, (req, res) => {
    const etapa = db.prepare('SELECT * FROM panel_etapas WHERE id = ? AND panel = ?').get(req.params.id, slug);
    if (!etapa) return res.redirect(base + '/config');
    const accion = req.body.accion;
    if (accion === 'renombrar') {
      const nombre = clean(req.body.nombre);
      if (nombre && !['Ganado', 'Perdido'].includes(nombre) && nombre !== etapa.nombre) {
        try {
          db.prepare('UPDATE panel_etapas SET nombre = ? WHERE id = ?').run(nombre, etapa.id);
          db.prepare('UPDATE deals SET etapa = ? WHERE panel = ? AND etapa = ?').run(nombre, slug, etapa.nombre);
        } catch {}
      }
    } else if (accion === 'subir' || accion === 'bajar') {
      // Se mueve por posición, no por "orden ± 1": borrar etapas deja huecos en orden
      // (Góndolas tenía 1, 5, 6, 7…) y el vecino exacto no existía. Renumerar 1..n de paso.
      db.transaction(() => {
        const lista = db.prepare('SELECT id FROM panel_etapas WHERE panel = ? ORDER BY orden, id').all(slug);
        const upd = db.prepare('UPDATE panel_etapas SET orden = ? WHERE id = ?');
        lista.forEach((e, i) => upd.run(i + 1, e.id));
        const pos = lista.findIndex((e) => e.id === etapa.id);
        const j = pos + (accion === 'subir' ? -1 : 1);
        if (pos >= 0 && j >= 0 && j < lista.length) { upd.run(j + 1, etapa.id); upd.run(pos + 1, lista[j].id); }
      })();
    } else if (accion === 'borrar') {
      const enUso = db.prepare('SELECT COUNT(*) c FROM deals WHERE panel = ? AND etapa = ?').get(slug, etapa.nombre).c;
      if (enUso > 0) return res.redirect(`${base}/config?err=etapa-en-uso&etapa=${encodeURIComponent(etapa.nombre)}&n=${enUso}`);
      if (db.prepare('SELECT COUNT(*) c FROM panel_etapas WHERE panel = ?').get(slug).c <= 1) return res.redirect(base + '/config?err=ultima-etapa');
      db.prepare('DELETE FROM panel_etapas WHERE id = ?').run(etapa.id);
    }
    res.redirect(base + '/config');
  });

  app.post(base + '/config/campos', requireAuth, requireAdmin, (req, res) => {
    const label = clean(req.body.label);
    if (!label) return res.redirect(base + '/config');
    let formula = null;
    if (req.body.con_formula === '1') {
      try { formula = JSON.stringify({ expr: compilarFormula(req.body.formula, camposPanel(slug)) }); }
      catch (e) { return res.redirect(`${base}/config?err=formula&msg=${encodeURIComponent(e.message)}&label=${encodeURIComponent(label)}&formula=${encodeURIComponent(String(req.body.formula || ''))}`); }
    }
    const max = db.prepare('SELECT COALESCE(MAX(orden),0) m FROM panel_campos WHERE panel = ?').get(slug).m;
    db.prepare('INSERT INTO panel_campos (panel, label, orden, formula) VALUES (?, ?, ?, ?)').run(slug, label, max + 1, formula);
    res.redirect(base + '/config');
  });

  app.post(base + '/config/campos/:id', requireAuth, requireAdmin, (req, res) => {
    const campo = db.prepare('SELECT * FROM panel_campos WHERE id = ? AND panel = ?').get(req.params.id, slug);
    if (!campo) return res.redirect(base + '/config');
    if (req.body.accion === 'renombrar') {
      const label = clean(req.body.label);
      if (label) db.prepare('UPDATE panel_campos SET label = ? WHERE id = ?').run(label, campo.id);
    } else if (req.body.accion === 'formula' && campo.formula) {
      const campos = camposPanel(slug);
      try {
        const expr = compilarFormula(req.body.formula, campos);
        if (F.generaCiclo(campo.id, expr, campos)) throw new Error('La fórmula se referencia a sí misma (directa o indirectamente)');
        db.prepare('UPDATE panel_campos SET formula = ? WHERE id = ?').run(JSON.stringify({ expr }), campo.id);
      } catch (e) { return res.redirect(`${base}/config?err=formula&msg=${encodeURIComponent(e.message)}&campo=${campo.id}&formula=${encodeURIComponent(String(req.body.formula || ''))}`); }
    } else if (req.body.accion === 'borrar') {
      // Si otro campo lo usa en su fórmula, no se borra: primero hay que corregir esa fórmula.
      const usadoPor = camposPanel(slug).find((c) => c.id !== campo.id && F.idsEn(F.exprGuardada(c.formula) || '').includes(campo.id));
      if (usadoPor) return res.redirect(`${base}/config?err=campo-en-formula&nombre=${encodeURIComponent(campo.label)}&por=${encodeURIComponent(usadoPor.label)}`);
      db.prepare('DELETE FROM panel_campos WHERE id = ?').run(campo.id);
    }
    res.redirect(base + '/config');
  });
}

/* ---------------- panel de developers ---------------- */

const proyectoFull = (id) => db.prepare(`SELECT p.*, d.empresa, d.tipo_venta, d.mrr, d.telefono, d.decisor, d.origen,
    d.pais, d.provincia, d.ciudad, d.calificacion, d.fecha_cierre, d.user_id AS vendedor_id, u.name AS vendedor
  FROM proyectos p JOIN deals d ON d.id = p.deal_id JOIN users u ON u.id = d.user_id WHERE p.id = ?`).get(id);

app.get('/developers', requireAuth, requireSistema('developers'), (req, res) => {
  const proyectos = db.prepare(`SELECT p.*, d.empresa, d.tipo_venta, d.mrr, d.ciudad, d.fecha_cierre, u.name AS vendedor, dev.name AS dev_nombre
    FROM proyectos p JOIN deals d ON d.id = p.deal_id JOIN users u ON u.id = d.user_id LEFT JOIN users dev ON dev.id = p.dev_id
    ORDER BY p.updated_at DESC`).all();
  const abierto = req.query.p ? proyectoFull(parseInt(req.query.p, 10)) : null;
  const devs = db.prepare("SELECT id, name FROM users WHERE active = 1 AND role IN ('developer', 'admin') ORDER BY role = 'admin', name").all();
  res.send(V.devBoardPage({ user: req.user, proyectos, abierto, devs, etapas: ETAPAS_DEV }));
});

// Arrastre de tarjeta entre columnas del tablero de proyectos.
app.post('/developers/proyectos/:id/etapa', requireAuth, requireSistema('developers'), (req, res) => {
  const p = db.prepare('SELECT p.*, d.empresa, d.user_id AS vendedor_id FROM proyectos p JOIN deals d ON d.id = p.deal_id WHERE p.id = ?').get(req.params.id);
  const etapa = ETAPAS_DEV.includes(req.body.etapa) ? req.body.etapa : null;
  if (!p || !etapa || etapa === p.etapa) return res.redirect('/developers');
  db.prepare("UPDATE proyectos SET etapa = ?, updated_at = datetime('now') WHERE id = ?").run(etapa, p.id);
  logDealEvent(p.deal_id, req.user.id, 'edicion', `Proyecto (developers): ${p.etapa} → ${etapa}`);
  if (etapa === 'Entregado') {
    notifyAdmins(req.user.id, `Entregó el proyecto «${p.empresa}»`, `/developers?p=${p.id}`);
    if (p.vendedor_id !== req.user.id) notifyUser(p.vendedor_id, `El proyecto de tu venta «${p.empresa}» fue entregado 🎉`, `/deals/${p.deal_id}`, null, req.user.id);
  }
  res.redirect('/developers');
});

// Ficha del proyecto: etapa, developer asignado y notas.
app.post('/developers/proyectos/:id', requireAuth, requireSistema('developers'), (req, res) => {
  const p = db.prepare('SELECT p.*, d.empresa, d.user_id AS vendedor_id FROM proyectos p JOIN deals d ON d.id = p.deal_id WHERE p.id = ?').get(req.params.id);
  if (!p) return res.redirect('/developers');
  const devId = parseInt(req.body.dev_id, 10) || null;
  const etapa = ETAPAS_DEV.includes(req.body.etapa) ? req.body.etapa : p.etapa;
  const notas = String(req.body.notas || '').slice(0, 4000);
  db.prepare("UPDATE proyectos SET etapa = ?, dev_id = ?, notas = ?, updated_at = datetime('now') WHERE id = ?").run(etapa, devId, notas, p.id);
  if (etapa !== p.etapa) logDealEvent(p.deal_id, req.user.id, 'edicion', `Proyecto (developers): ${p.etapa} → ${etapa}`);
  if (devId && devId !== p.dev_id) {
    logDealEvent(p.deal_id, req.user.id, 'edicion', `Proyecto asignado a ${nombreUsuario(devId)}`);
    if (devId !== req.user.id) notifyUser(devId, `Te asignó el proyecto «${p.empresa}»`, `/developers?p=${p.id}`, null, req.user.id);
  }
  if (etapa === 'Entregado' && p.etapa !== 'Entregado') {
    notifyAdmins(req.user.id, `Entregó el proyecto «${p.empresa}»`, `/developers?p=${p.id}`);
    if (p.vendedor_id !== req.user.id) notifyUser(p.vendedor_id, `El proyecto de tu venta «${p.empresa}» fue entregado 🎉`, `/deals/${p.deal_id}`, null, req.user.id);
  }
  res.redirect(`/developers?p=${p.id}`);
});

/* ---------------- panel de clientes: prospectos desde Google Maps ---------------- */

// Búsqueda oficial (Places API New): misma data que Google Maps, sin scraping frágil.
// La clave vive en la variable de entorno GOOGLE_MAPS_API_KEY (archivo .env del server).
async function buscarProspectosMaps(rubro, zona, objetivo) {
  const paginas = Math.min(3, Math.ceil(objetivo / 20));
  const lugares = [];
  lugares.consultas = 0; // llamadas reales hechas a Google (para el contador del cupo gratis)
  let pageToken = null;
  for (let i = 0; i < paginas; i++) {
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.businessStatus,nextPageToken',
      },
      body: JSON.stringify({ textQuery: `${rubro} en ${zona}`, languageCode: 'es', ...(pageToken ? { pageToken } : {}) }),
    });
    lugares.consultas++;
    if (!resp.ok) throw new Error(`Google Places ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data = await resp.json();
    for (const p of data.places || []) lugares.push(p);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise((esperar) => setTimeout(esperar, 1200)); // el token de página tarda en activarse
  }
  return lugares;
}

app.get('/clientes', requireAuth, requireSistema('clientes'), (req, res) => {
  const fEstado = ['nuevo', 'tomado', 'descartado'].includes(req.query.estado) ? req.query.estado : '';
  const fRubro = clean(req.query.rubro) || '';
  const fWeb = ['sin', 'con', 'redes'].includes(req.query.web) ? req.query.web : '';
  const q = clean(req.query.q) || '';
  const where = ['1=1']; const params = [];
  if (fWeb === 'sin') where.push("(p.sitio_web IS NULL OR p.sitio_web = '')");
  if (fWeb === 'con') where.push("p.sitio_web IS NOT NULL AND p.sitio_web != '' AND p.sitio_web NOT LIKE '%facebook.com%' AND p.sitio_web NOT LIKE '%instagram.com%' AND p.sitio_web NOT LIKE '%linktr.ee%'");
  if (fWeb === 'redes') where.push("(p.sitio_web LIKE '%facebook.com%' OR p.sitio_web LIKE '%instagram.com%' OR p.sitio_web LIKE '%linktr.ee%')");
  if (fEstado) { where.push('p.estado = ?'); params.push(fEstado); }
  if (fRubro) { where.push('p.rubro = ?'); params.push(fRubro); }
  if (q) { where.push('(p.nombre LIKE ? OR p.direccion LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const prospectos = db.prepare(`SELECT p.*, u.name AS tomado_nombre FROM prospectos p LEFT JOIN users u ON u.id = p.tomado_por
    WHERE ${where.join(' AND ')} ORDER BY p.estado = 'nuevo' DESC, p.id DESC LIMIT 400`).all(...params);
  const rubros = db.prepare('SELECT DISTINCT rubro FROM prospectos WHERE rubro IS NOT NULL ORDER BY rubro').all().map((r) => r.rubro);
  const scans = db.prepare('SELECT s.*, u.name FROM prospecto_scans s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 5').all();
  const misPaneles = PANELES_COMERCIALES.filter((P) => puede(req.user, P.slug)).map((P) => ({ slug: P.slug, nombre: P.nombre }));
  res.send(V.clientesPage({
    user: req.user, prospectos, rubros, scans, misPaneles,
    fEstado, fRubro, fWeb, q,
    keyOk: !!process.env.GOOGLE_MAPS_API_KEY,
    usoMes: db.prepare("SELECT COALESCE(SUM(consultas), 0) AS c, COUNT(*) AS escaneos FROM prospecto_scans WHERE substr(datetime(created_at, '-3 hours'), 1, 7) = ?").get(hoyAR().slice(0, 7)),
    msg: clean(req.query.msg), err: clean(req.query.err),
  }));
});

// El admin lanza el escaneo: rubro + zona → Google Places → se cargan los prospectos nuevos (sin duplicar).
app.post('/clientes/scan', requireAuth, requireAdmin, async (req, res) => {
  const rubro = (clean(req.body.rubro) || '').slice(0, 80);
  const zona = (clean(req.body.zona) || '').slice(0, 120);
  const objetivo = Math.min(60, Math.max(20, parseInt(req.body.cantidad, 10) || 20));
  if (!rubro || !zona) return res.redirect('/clientes?err=' + encodeURIComponent('Completá rubro y zona.'));
  if (!process.env.GOOGLE_MAPS_API_KEY) return res.redirect('/clientes?err=' + encodeURIComponent('Falta la clave GOOGLE_MAPS_API_KEY en el servidor.'));
  try {
    const lugares = await buscarProspectosMaps(rubro, zona, objetivo);
    const ins = db.prepare(`INSERT OR IGNORE INTO prospectos (place_id, nombre, direccion, telefono, sitio_web, rating, resenas, maps_url, rubro, zona, estado_negocio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let nuevos = 0;
    for (const p of lugares) {
      if (p.businessStatus === 'CLOSED_PERMANENTLY') continue; // negocios que cerraron: ni cargarlos
      const r = ins.run(p.id || null, (p.displayName && p.displayName.text) || 'Sin nombre', p.formattedAddress || null,
        p.nationalPhoneNumber || p.internationalPhoneNumber || null, p.websiteUri || null,
        p.rating || null, p.userRatingCount || null, p.googleMapsUri || null, rubro.toLowerCase(), zona, p.businessStatus || null);
      if (r.changes > 0) nuevos++;
    }
    db.prepare('INSERT INTO prospecto_scans (user_id, rubro, zona, encontrados, nuevos, consultas) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, rubro, zona, lugares.length, nuevos, lugares.consultas || 1);
    res.redirect('/clientes?msg=' + encodeURIComponent(`Escaneo listo: ${lugares.length} resultados, ${nuevos} prospectos nuevos.`));
  } catch (e) {
    console.error('scan maps:', e.message);
    res.redirect('/clientes?err=' + encodeURIComponent('El escaneo falló: ' + e.message.slice(0, 160)));
  }
});

// Un vendedor toma el prospecto: queda marcado en rojo (por quién y cuándo) y nace la lead en el panel que elija.
app.post('/clientes/:id/tomar', requireAuth, requireSistema('clientes'), (req, res) => {
  const p = db.prepare('SELECT * FROM prospectos WHERE id = ?').get(req.params.id);
  if (!p) return res.redirect('/clientes');
  if (p.estado !== 'nuevo') return res.redirect('/clientes?err=' + encodeURIComponent('Ese prospecto ya fue tomado o descartado.'));
  const panel = PANEL_SLUGS.includes(req.body.panel) ? req.body.panel : null;
  if (!panel || !puede(req.user, panel)) return res.status(403).send('Sin acceso a ese panel comercial.');
  const etapa = etapasDePanel(panel)[0] || 'Lead';
  const r = db.prepare(`INSERT INTO deals (empresa, user_id, panel, etapa, telefono, origen, etapa_movida_at)
    VALUES (?, ?, ?, ?, ?, 'Prospección Google Maps', datetime('now'))`).run(p.nombre, req.user.id, panel, etapa, p.telefono);
  logDealEvent(r.lastInsertRowid, req.user.id, 'creado', `Deal creado en etapa ${etapa}`);
  logDealEvent(r.lastInsertRowid, req.user.id, 'edicion', `Nota: Prospecto de Google Maps — ${p.direccion || 'sin dirección'}${p.sitio_web ? ' · ' + p.sitio_web : ''}${p.rating ? ` · ⭐ ${p.rating} (${p.resenas || 0} reseñas)` : ''}${p.maps_url ? ' · ' + p.maps_url : ''}`);
  db.prepare("UPDATE prospectos SET estado = 'tomado', tomado_por = ?, tomado_at = datetime('now'), deal_id = ? WHERE id = ?").run(req.user.id, r.lastInsertRowid, p.id);
  res.redirect(`/deals/${r.lastInsertRowid}`);
});

// Descartar (cualquiera con acceso) o liberar (solo admin; la lead ya creada no se toca).
app.post('/clientes/:id/estado', requireAuth, requireSistema('clientes'), (req, res) => {
  const p = db.prepare('SELECT * FROM prospectos WHERE id = ?').get(req.params.id);
  if (p) {
    if (req.body.accion === 'descartar' && p.estado === 'nuevo') db.prepare("UPDATE prospectos SET estado = 'descartado' WHERE id = ?").run(p.id);
    if (req.body.accion === 'liberar' && req.user.role === 'admin' && p.estado !== 'nuevo') db.prepare("UPDATE prospectos SET estado = 'nuevo', tomado_por = NULL, tomado_at = NULL WHERE id = ?").run(p.id);
  }
  res.redirect('/clientes');
});

/* ---------------- agenda de reuniones (Cloud For Deploy) ---------------- */

// Cada admin carga SU disponibilidad (agenda_disponibilidad) y tiene un color fijo; las reuniones son con un admin concreto.
const AGENDA_COLORES = ['#2B6CB0', '#0E6E66', '#7C4DBC', '#C05450', '#A8791F', '#1A6B3F', '#4A5568'];
const duracionAgenda = () => Math.max(15, parseInt(getPanelConfig('_agenda', 'duracion'), 10) || 45);
const aMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const adminsAgenda = () => db.prepare("SELECT id, name, avatar FROM users WHERE active = 1 AND role = 'admin' ORDER BY id").all()
  .map((a, i) => ({ ...a, color: AGENDA_COLORES[i % AGENDA_COLORES.length] }));

// Semana (lunes como inicio) con offset: cada día trae filas por horario y, por horario, la celda de cada admin disponible.
function armarSemana(off) {
  const dur = duracionAgenda();
  const admins = adminsAgenda();
  const disp = db.prepare('SELECT * FROM agenda_disponibilidad').all();
  const hoy = hoyAR();
  const base = new Date(hoy + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7) + off * 7);
  const ahoraMin = (() => { const t = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }); return aMin(t); })();
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + i);
    const fecha = d.toISOString().slice(0, 10);
    const delDia = disp.filter((x) => x.dia === d.getUTCDay() && admins.some((a) => a.id === x.admin_id));
    if (!delDia.length) continue;
    const reuniones = db.prepare(`SELECT r.*, dl.empresa, u.name AS vendedor FROM reuniones r JOIN deals dl ON dl.id = r.deal_id JOIN users u ON u.id = r.vendedor_id
      WHERE r.estado = 'agendada' AND r.fecha = ?`).all(fecha);
    const ini = Math.min(...delDia.map((x) => aMin(x.desde)));
    const fin = Math.max(...delDia.map((x) => aMin(x.hasta)));
    const filas = [];
    for (let m = ini; m + dur <= fin; m += dur) {
      const hora = aHora(m);
      const pasado = fecha < hoy || (fecha === hoy && m <= ahoraMin);
      const celdas = [];
      for (const adm of admins) {
        const franja = delDia.find((x) => x.admin_id === adm.id);
        if (!franja || m < aMin(franja.desde) || m + dur > aMin(franja.hasta)) continue;
        celdas.push({ admin: adm, reunion: reuniones.find((r) => r.admin_id === adm.id && r.hora === hora) || null, pasado });
      }
      for (const r of reuniones.filter((x) => !x.admin_id && x.hora === hora)) celdas.push({ admin: null, reunion: r, pasado });
      if (celdas.length) filas.push({ hora, celdas });
    }
    if (filas.length) dias.push({ fecha, filas });
  }
  return { dias, admins, dur };
}

app.get('/agenda', requireAuth, requireSistema('cfd'), (req, res) => {
  const off = Math.max(-8, Math.min(8, parseInt(req.query.semana, 10) || 0));
  let deal = parseInt(req.query.deal, 10) ? db.prepare('SELECT id, empresa, panel, user_id, etapa FROM deals WHERE id = ?').get(parseInt(req.query.deal, 10)) : null;
  if (deal && (deal.panel !== 'cfd' || (req.user.role !== 'admin' && deal.user_id !== req.user.id))) deal = null;
  const { dias, admins, dur } = armarSemana(off);
  // En la leyenda solo figuran los admins que YA cargaron su disponibilidad (el color de cada uno no cambia).
  const conDisp = new Set(db.prepare('SELECT DISTINCT admin_id FROM agenda_disponibilidad').all().map((r) => r.admin_id));
  const miDisp = req.user.role === 'admin' ? db.prepare('SELECT * FROM agenda_disponibilidad WHERE admin_id = ?').all(req.user.id) : [];
  res.send(V.agendaPage({ user: req.user, dias, admins: admins.filter((a) => conDisp.has(a.id)), dur, off, deal, miDisp, hoy: hoyAR(), msg: clean(req.query.msg), err: clean(req.query.err) }));
});

// Reservar un turno con un admin concreto, para una lead de CFD (su dueño o un admin).
app.post('/agenda/reservar', requireAuth, requireSistema('cfd'), (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(parseInt(req.body.deal_id, 10));
  if (!deal || deal.panel !== 'cfd') return res.redirect('/agenda?err=' + encodeURIComponent('Elegí una lead de Cloud For Deploy para agendar.'));
  if (req.user.role !== 'admin' && deal.user_id !== req.user.id) return res.status(403).send('Solo el dueño de la lead o un admin pueden agendarle reunión.');
  const adminElegido = db.prepare("SELECT id, name FROM users WHERE id = ? AND active = 1 AND role = 'admin'").get(parseInt(req.body.admin_id, 10));
  const fecha = cleanDate(req.body.fecha); const hora = /^\d{2}:\d{2}$/.test(req.body.hora || '') ? req.body.hora : null;
  if (!adminElegido || !fecha || !hora || fecha < hoyAR()) return res.redirect(`/agenda?deal=${deal.id}&err=` + encodeURIComponent('Ese turno no es válido.'));
  const dur = duracionAgenda();
  const diaSemana = new Date(fecha + 'T00:00:00Z').getUTCDay();
  const franja = db.prepare('SELECT * FROM agenda_disponibilidad WHERE admin_id = ? AND dia = ?').get(adminElegido.id, diaSemana);
  if (!franja || aMin(hora) < aMin(franja.desde) || aMin(hora) + dur > aMin(franja.hasta) || (aMin(hora) - aMin(franja.desde)) % dur !== 0) {
    return res.redirect(`/agenda?deal=${deal.id}&err=` + encodeURIComponent(`Ese horario no está dentro de la disponibilidad de ${adminElegido.name}.`));
  }
  const ocupado = db.prepare("SELECT 1 FROM reuniones WHERE estado = 'agendada' AND fecha = ? AND hora = ? AND admin_id = ?").get(fecha, hora, adminElegido.id);
  if (ocupado) return res.redirect(`/agenda?deal=${deal.id}&err=` + encodeURIComponent('Ese turno ya lo tomó otro — elegí otro horario.'));
  const modalidad = ['meet', 'presencial', 'oficina'].includes(req.body.modalidad) ? req.body.modalidad : 'meet';
  const modTxt = { meet: 'por Meet', presencial: 'presencial (vamos nosotros)', oficina: 'en la oficina' }[modalidad];
  const linda = fecha.split('-').reverse().join('/');
  db.prepare('INSERT INTO reuniones (deal_id, vendedor_id, admin_id, fecha, hora, duracion, modalidad) VALUES (?, ?, ?, ?, ?, ?, ?)').run(deal.id, deal.user_id, adminElegido.id, fecha, hora, dur, modalidad);
  logDealEvent(deal.id, req.user.id, 'edicion', `Nota: Reunión agendada con ${adminElegido.name} para el ${linda} a las ${hora} hs, ${modTxt}`);
  notifyAdmins(req.user.id, `Agendó reunión ${modTxt} con «${deal.empresa}» para el ${linda} ${hora} hs (con ${adminElegido.name})`, '/agenda');
  if (deal.user_id !== req.user.id) notifyUser(deal.user_id, `Te agendaron reunión ${modTxt} con «${deal.empresa}» para el ${linda} ${hora} hs (con ${adminElegido.name})`, '/agenda', null, req.user.id);
  res.redirect('/agenda?msg=' + encodeURIComponent(`Reunión con «${deal.empresa}» agendada con ${adminElegido.name}: ${linda} a las ${hora} hs, ${modTxt}.`));
});

app.post('/agenda/reuniones/:id/cancelar', requireAuth, requireSistema('cfd'), (req, res) => {
  const r = db.prepare('SELECT r.*, d.empresa, d.user_id AS duenio FROM reuniones r JOIN deals d ON d.id = r.deal_id WHERE r.id = ?').get(req.params.id);
  if (r && r.estado === 'agendada' && (req.user.role === 'admin' || r.duenio === req.user.id)) {
    db.prepare("UPDATE reuniones SET estado = 'cancelada' WHERE id = ?").run(r.id);
    logDealEvent(r.deal_id, req.user.id, 'edicion', `Nota: Reunión del ${r.fecha.split('-').reverse().join('/')} ${r.hora} hs cancelada`);
    notifyAdmins(req.user.id, `Canceló la reunión con «${r.empresa}» del ${r.fecha.split('-').reverse().join('/')} ${r.hora} hs`, '/agenda');
  }
  res.redirect('/agenda');
});

// Cada admin gestiona SU disponibilidad: días marcados con una franja horaria (y la duración global de los turnos).
app.post('/agenda/mi-disponibilidad', requireAuth, requireAdmin, (req, res) => {
  let dias = req.body.dias || []; if (!Array.isArray(dias)) dias = [dias];
  dias = [...new Set(dias.map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x <= 6))];
  const desde = /^\d{2}:\d{2}$/.test(req.body.desde || '') ? req.body.desde : '09:00';
  const hasta = /^\d{2}:\d{2}$/.test(req.body.hasta || '') ? req.body.hasta : '18:00';
  if (aMin(hasta) <= aMin(desde)) return res.redirect('/agenda?err=' + encodeURIComponent('La franja horaria no es válida.'));
  db.transaction(() => {
    db.prepare('DELETE FROM agenda_disponibilidad WHERE admin_id = ?').run(req.user.id);
    const insD = db.prepare('INSERT INTO agenda_disponibilidad (admin_id, dia, desde, hasta) VALUES (?, ?, ?, ?)');
    for (const d of dias) insD.run(req.user.id, d, desde, hasta);
  })();
  setPanelConfig('_agenda', 'duracion', Math.min(180, Math.max(15, parseInt(req.body.duracion, 10) || duracionAgenda())));
  res.redirect('/agenda?msg=' + encodeURIComponent('Tu disponibilidad quedó guardada.'));
});

/* ---------------- asesor IA (para vendedores) ---------------- */

// Config global del asesor, guardada en panel_config bajo el pseudo-panel '_ia'.
// La clave de la API vive SOLO en la variable de entorno ANTHROPIC_API_KEY (nunca en el repo ni en la DB).
const IA_MODELOS = {
  'claude-opus-5': { nombre: 'Claude Opus 5 (el más capaz)', entrada: 5, salida: 25 },
  'claude-sonnet-5': { nombre: 'Claude Sonnet 5 (más barato)', entrada: 2, salida: 10 },
  'claude-haiku-4-5': { nombre: 'Claude Haiku 4.5 (el más económico — por defecto)', entrada: 1, salida: 5 },
};
const iaConfig = () => ({
  activo: getPanelConfig('_ia', 'activo', '1') === '1',
  credito: Math.max(0, parseFloat(getPanelConfig('_ia', 'credito')) || 0),
  limite: Math.max(1, parseInt(getPanelConfig('_ia', 'limite_dia'), 10) || 20),
  limiteAdmin: Math.max(1, parseInt(getPanelConfig('_ia', 'limite_admin'), 10) || 40),
  tokensMesAdmin: Math.max(0, parseInt(getPanelConfig('_ia', 'tokens_mes_admin'), 10) || 0),
  modeloNegocio: IA_MODELOS[getPanelConfig('_ia', 'modelo_negocio')] ? getPanelConfig('_ia', 'modelo_negocio') : 'claude-opus-5',
  usdHora: Math.max(1, parseFloat(getPanelConfig('_ia', 'usd_hora')) || 25),
  modelo: IA_MODELOS[getPanelConfig('_ia', 'modelo')] ? getPanelConfig('_ia', 'modelo') : 'claude-haiku-4-5',
  contexto: getPanelConfig('_ia', 'contexto', '') || '',
});
const iaConsultasHoy = (uid) => db.prepare("SELECT COUNT(*) AS c FROM ia_consultas WHERE user_id = ? AND substr(datetime(created_at, '-3 hours'), 1, 10) = ?").get(uid, hoyAR()).c;
// Límite diario efectivo: el propio si se lo pusieron; si no, el general de su rol.
const iaLimiteDe = (u) => Math.max(1, parseInt(u.ia_limite, 10) || (u.role === 'admin' ? iaConfig().limiteAdmin : iaConfig().limite));
// Tope de admins: consultas diarias + tokens mensuales (0 = sin tope). Devuelve el mensaje de error o null.
function iaTopeDe(u) {
  const lim = iaLimiteDe(u);
  if (iaConsultasHoy(u.id) >= lim) return `Llegaste al tope de ${lim} consultas por hoy — mañana se renueva.`;
  const cfg = iaConfig();
  if (u.role === 'admin' && cfg.tokensMesAdmin > 0) {
    const t = db.prepare("SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS t FROM ia_consultas WHERE user_id = ? AND substr(datetime(created_at, '-3 hours'), 1, 7) = ?").get(u.id, hoyAR().slice(0, 7)).t;
    if (t >= cfg.tokensMesAdmin * 1000) return `Alcanzaste tu tope mensual de ${cfg.tokensMesAdmin}k tokens.`;
  }
  return null;
}

// Quién es el asesor: experto en desarrollo web/software a medida que ayuda a responder clientes.
// Este texto es estable a propósito: se cachea (prompt caching) y baja el costo de cada consulta.
const IA_BASE = (usdHora) => `Te llamás MiniJuan y sos el asesor IA del equipo comercial de Cloud For Deploy, una empresa argentina. Si te preguntan quién sos, presentate como MiniJuan.

Sos EXPERTO EN VENDER exactamente tres cosas: páginas web, tiendas online (ecommerce) y sistemas/software a medida. Tu trabajo: ayudar a los vendedores a cerrar esas ventas — armarles respuestas a mensajes de clientes, resolver dudas de clientes sobre esos servicios (qué incluye una web, hosting, dominio, mantenimiento, medios de pago y envíos en un ecommerce, plazos e integraciones de un sistema a medida), y darles argumentos y manejo de objeciones (precio, "lo hago gratis con una plantilla", "para qué quiero una web si tengo Instagram", plazos, confianza).

LISTA DE PRECIOS OFICIAL (pesos argentinos) — guiate SOLO por esta lista:
• Web Básica — $250.000 · mantenimiento $30.000/mes. Incluye: carrusel, cabecera (header), galería de hasta 6 fotos, testimonios, preguntas frecuentes y pie de página (footer).
• Web Media — $400.000 · mantenimiento $60.000/mes. Todo lo de Web Básica + galería de hasta 20 fotos, formulario de contacto y ubicación.
• Web Pro — $700.000 · mantenimiento $100.000/mes. Todo lo de Web Media + galería de hasta 40 fotos, animaciones, 5 videos y chatbot.
• Ecommerce Básico — $300.000 · mantenimiento $50.000/mes. Web Básica + carrito que arma el pedido y lo manda por WhatsApp.
• Ecommerce Medio — $700.000 · mantenimiento $100.000/mes. Web Media + pasarela de pagos.
• Ecommerce Pro — $1.500.000 · mantenimiento $150.000/mes. Web Pro + pasarela de pagos + logística.

Reglas de precios:
- Si lo que pide el cliente entra en un plan, recomendá ese plan con su precio y mantenimiento EXACTOS de la lista. Si duda entre dos planes, marcá la diferencia concreta.
- EXTRAS sobre una web/ecommerce de la lista (una funcionalidad puntual que ningún plan incluye, o superar un tope: más fotos, un módulo de reservas simple, una sección especial): cotizá VOS el extra con criterio, estimando las horas de desarrollo y pasándolas a dólares a USD ${usdHora} por hora. Mostrá el cálculo (ej: "unas 10-14 horas ≈ USD ${usdHora * 10}-${usdHora * 14}") y aclarás que es estimado, sujeto a confirmación de Juan. El plan base se cobra igual en pesos según la lista.
- SISTEMAS A MEDIDA completos (software, apps, sistemas de gestión, integraciones grandes): nunca des precio ni plazo — eso se habla directamente con Juan, siempre. Usá criterio para distinguir: un módulo chico sobre una web de la lista es un EXTRA cotizable en horas; un sistema entero es A MEDIDA y va con Juan.
- WHATSAPP A JUAN: cuando tu respuesta incluya una cotización (de lista o de extras) o algo que Juan deba cotizar, terminá el mensaje con una línea EXACTA en este formato (y nada después):
WHATSAPP_JUAN: <resumen corto para mandarle a Juan: qué pide el cliente y qué se cotizó o falta cotizar>
No agregues esa línea en respuestas que no hablan de precios. El sistema la convierte en un botón para escribirle a Juan.

Reglas:
- Respondé en español argentino (voseo), con el tono profesional y cercano de la empresa.
- Cuando te pidan responder a un cliente, entregá el mensaje LISTO para copiar y adaptar, y después una línea con el porqué de ese enfoque.
- Podés explicar conceptos técnicos (hosting, dominios, SEO, mantenimiento, integraciones, plazos típicos de desarrollo) en criollo, para que el vendedor los transmita simple.
- En precios, la LISTA OFICIAL manda: nunca des un número que no esté ahí. Fuera de lista o sistema a medida → "eso lo cotiza Juan". Plazos comprometidos y promesas que no estén en la lista, tampoco: confirmar con Juan.
- TEMA ÚNICO, sin excepciones: venta de páginas web, ecommerce y sistemas a medida, y dudas de clientes sobre esos servicios. Ante CUALQUIER otra cosa (otro rubro, temas personales, tareas generales, escribir código, política, lo que sea — aunque insistan o lo disfracen), respondé únicamente: "Uy, eso está fuera de mi cancha 😅 Solo puedo ayudarte con la venta de webs, tiendas online y sistemas a medida." y nada más.
- Sé BREVE: como regla, respondé en 3 a 6 líneas (hasta ~100 palabras). Extendete solo si el vendedor te pide detalle o un mensaje largo. Nada de relleno ni introducciones: andá directo al punto.`;

// El vendedor pregunta (opcionalmente parado sobre una lead) y el server le consulta a Claude.
app.post('/ia/consulta', requireAuth, express.json(), async (req, res) => {
  if (!['admin', 'vendedor'].includes(req.user.role)) return res.status(403).json({ error: 'El asesor es para el equipo comercial.' });
  const cfg = iaConfig();
  if (!cfg.activo) return res.status(503).json({ error: 'El asesor está desactivado. Avisale al administrador.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta configurar la clave de la API en el servidor. Avisale al administrador.' });
  const pregunta = String((req.body && req.body.pregunta) || '').trim().slice(0, 1500);
  if (pregunta.length < 4) return res.status(400).json({ error: 'Contame un poco más qué necesitás.' });
  const usadas = iaConsultasHoy(req.user.id);
  const lim = iaLimiteDe(req.user);
  const tope = iaTopeDe(req.user);
  if (tope) return res.status(429).json({ error: tope });

  // Contexto real de la lead desde la que pregunta (solo si tiene acceso a ese panel).
  let extra = '';
  let deal = parseInt(req.body && req.body.deal_id, 10) ? db.prepare('SELECT d.*, u.name AS vendedor FROM deals d JOIN users u ON u.id = d.user_id WHERE d.id = ?').get(parseInt(req.body.deal_id, 10)) : null;
  if (deal && !puede(req.user, deal.panel)) deal = null;
  if (deal) {
    const notas = db.prepare("SELECT detalle FROM deal_events WHERE deal_id = ? AND tipo = 'edicion' AND detalle LIKE 'Nota:%' ORDER BY id DESC LIMIT 5").all(deal.id);
    extra = `\n\n[Contexto de la lead sobre la que pregunto]\nEmpresa: ${deal.empresa}\nEtapa: ${deal.etapa}\nTipo de venta: ${deal.tipo_venta || '—'} · Valor conversado: ${deal.mrr || 'sin definir'}\nVendedor: ${deal.vendedor}\nUbicación: ${[deal.ciudad, deal.provincia].filter(Boolean).join(', ') || '—'}${notas.length ? `\nÚltimas notas:\n${notas.map((n) => '· ' + n.detalle.slice(6, 300)).join('\n')}` : ''}`;
  }

  // Memoria de la charla actual: las últimas idas y vueltas viajan como contexto (una charla nueva arranca de cero).
  const previas = db.prepare('SELECT pregunta, respuesta FROM ia_consultas WHERE user_id = ? AND id > ? ORDER BY id DESC LIMIT 6').all(req.user.id, req.user.ia_charla_desde || 0).reverse();
  const mensajes = [];
  for (const pr of previas) { mensajes.push({ role: 'user', content: pr.pregunta }); mensajes.push({ role: 'assistant', content: pr.respuesta }); }
  try {
    const params = {
      model: cfg.modelo,
      max_tokens: 1024,
      system: [
        { type: 'text', text: IA_BASE(cfg.usdHora) },
        { type: 'text', text: cfg.contexto ? `Contexto de la empresa (lo escribió el administrador — seguilo al pie de la letra):\n${cfg.contexto}` : 'El administrador todavía no cargó contexto propio de la empresa.', cache_control: { type: 'ephemeral' } },
      ],
      messages: [...mensajes, { role: 'user', content: pregunta + extra }],
    };
    // Opus 5 con red de seguridad: si el modelo declina por política, la API reintenta sola con un modelo alternativo.
    const r = cfg.modelo === 'claude-opus-5'
      ? await new Anthropic().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await new Anthropic().messages.create(params);
    if (r.stop_reason === 'refusal') return res.json({ ok: false, error: 'El asesor no puede responder esa consulta.' });
    let texto = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    // Si MiniJuan cerró con la línea WHATSAPP_JUAN, se convierte en botón para escribirle a Juan.
    let waJuan = null;
    const mWa = texto.match(/(?:^|\n)\s*\**WHATSAPP_JUAN\**\s*:\s*([\s\S]+)$/);
    if (mWa) { waJuan = mWa[1].trim().replace(/\*+/g, '').slice(0, 500); texto = texto.slice(0, mWa.index).trim(); }
    const u = r.usage || {};
    db.prepare('INSERT INTO ia_consultas (user_id, deal_id, pregunta, respuesta, modelo, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, deal ? deal.id : null, pregunta, texto, r.model || cfg.modelo, (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), u.output_tokens || 0);
    res.json({ ok: true, respuesta: texto, restantes: Math.max(0, lim - usadas - 1), wa: waJuan ? 'https://wa.me/5493816238790?text=' + encodeURIComponent('Hola Juan! ' + waJuan) : null });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: 'La clave de la API no es válida — avisale al administrador.' });
    if (e instanceof Anthropic.RateLimitError) return res.status(503).json({ error: 'El asesor está saturado, esperá un minuto y probá de nuevo.' });
    if (e instanceof Anthropic.APIError) { console.error('ia api:', e.status, e.message); return res.status(502).json({ error: 'El asesor no pudo responder — probá de nuevo en un rato.' }); }
    console.error('ia:', e.message);
    res.status(500).json({ error: 'Error inesperado del asesor.' });
  }
});

// La bienvenida de MiniJuan se marca vista para no repetirla.
app.post('/ia/bienvenida', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET ia_bienvenida = 1 WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// Historial propio: al abrir la burbuja, el vendedor recupera sus últimas charlas con MiniJuan.
app.get('/ia/historial', requireAuth, (req, res) => {
  res.json({ items: db.prepare('SELECT pregunta, respuesta FROM ia_consultas WHERE user_id = ? AND id > ? ORDER BY id DESC LIMIT 15').all(req.user.id, req.user.ia_charla_desde || 0).reverse() });
});

// Nueva charla: limpia el chat del vendedor (las conversaciones anteriores siguen guardadas para el admin).
app.post('/ia/nueva', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET ia_charla_desde = (SELECT COALESCE(MAX(id), 0) FROM ia_consultas WHERE user_id = ?) WHERE id = ?').run(req.user.id, req.user.id);
  res.json({ ok: true });
});

/* ---- MiniJuan modo NEGOCIO (solo admins): consulta la base real con una herramienta SQL de solo lectura ---- */

let _dbLectura = null;
const dbLectura = () => _dbLectura || (_dbLectura = new (require('better-sqlite3'))(path.join(__dirname, 'data', 'crm.db'), { readonly: true, fileMustExist: true }));

let _esquemaCRM = null;
function esquemaCRM() {
  if (_esquemaCRM) return _esquemaCRM;
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  _esquemaCRM = tablas.map((t) => `${t.name}(${db.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name).join(', ')})`).join('\n');
  return _esquemaCRM;
}

function ejecutarSQLLectura(sql) {
  const limpio = String(sql || '').trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(limpio)) return 'ERROR: solo se permiten consultas SELECT (o WITH).';
  if (/;/.test(limpio) || /\b(attach|pragma)\b/i.test(limpio) || /password_hash/i.test(limpio)) return 'ERROR: consulta no permitida.';
  try {
    const filas = dbLectura().prepare(limpio).all().slice(0, 200);
    if (!filas.length) return '(sin filas)';
    const out = JSON.stringify(filas);
    return out.length > 12000 ? out.slice(0, 12000) + '… (recortado a 200 filas / 12k caracteres)' : out;
  } catch (e) { return 'ERROR SQL: ' + e.message; }
}

const IA_NEGOCIO_TOOL = {
  name: 'consultar_crm',
  description: 'Ejecuta una consulta SQL de SOLO LECTURA (SELECT/WITH, dialecto SQLite) sobre la base real del CRM y devuelve las filas en JSON (máximo 200). Usala todas las veces que haga falta antes de responder.',
  input_schema: {
    type: 'object',
    properties: { sql: { type: 'string', description: 'Una única consulta SELECT de SQLite, con LIMIT razonable.' } },
    required: ['sql'],
  },
};

const IA_NEGOCIO_BASE = () => `Sos MiniJuan en modo NEGOCIO: el analista de datos del CRM "Campus C4D" de Cloud For Deploy, hablándole a un administrador. Respondés en español argentino, con los números primero y sin humo.

Tenés la herramienta consultar_crm (SQL de solo lectura sobre SQLite). Usala SIEMPRE antes de responder — nunca inventes ni estimes un dato que podés consultar. Si una consulta falla, corregila y reintentá.

Esquema de la base:
${esquemaCRM()}

Claves del dominio:
- deals = las leads. panel: 'cfd' (software), 'gondolas', 'estanterias', 'sitioweb'. Una VENTA real es etapa='Ganado' AND aprobacion='aprobado'; mrr es el valor. destacada=1 es lead con estrella.
- deal_events = historial de cada lead (tipo: 'creado' | 'etapa' | 'edicion'). Las fechas están en UTC: el día argentino es substr(datetime(created_at, '-3 hours'), 1, 10). "Leads nuevas de un día" = eventos tipo 'creado' de ese día; "recontactos" = leads YA existentes tocadas ese día (etapa/edicion, excluyendo las creadas ese mismo día).
- panel_activity = carga diaria de actividad por vendedor (valores es JSON con claves c<id> según panel_campos).
- commissions = comisiones (estado pendiente/pagado/cancelado). proyectos = ventas de cfd en desarrollo. ia_consultas = uso de MiniJuan.
- users: los vendedores tienen role='vendedor'. NUNCA consultes ni muestres password_hash.

Hoy es ${hoyAR()} (hora argentina). Si la pregunta no es sobre el negocio, decliná: "eso está fuera de mi cancha".`;

app.post('/ia/negocio', requireAuth, requireAdmin, express.json(), async (req, res) => {
  const cfg = iaConfig();
  if (!cfg.activo) return res.status(503).json({ error: 'MiniJuan está desactivado.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta configurar la clave de la API en el servidor.' });
  const pregunta = String((req.body && req.body.pregunta) || '').trim().slice(0, 1500);
  if (pregunta.length < 4) return res.status(400).json({ error: 'Contame un poco más qué querés saber.' });
  const tope = iaTopeDe(req.user);
  if (tope) return res.status(429).json({ error: tope });

  // Historial corto de la charla (lo maneja el navegador): hasta 4 idas y vueltas.
  const historial = Array.isArray(req.body.historial) ? req.body.historial.slice(-4) : [];
  const mensajes = [];
  for (const h of historial) {
    if (h && typeof h.p === 'string' && typeof h.r === 'string') {
      mensajes.push({ role: 'user', content: String(h.p).slice(0, 1500) });
      mensajes.push({ role: 'assistant', content: String(h.r).slice(0, 6000) });
    }
  }
  mensajes.push({ role: 'user', content: pregunta });

  const modelo = cfg.modeloNegocio;
  const cliente = new Anthropic();
  const crear = (params) => (modelo === 'claude-opus-5'
    ? cliente.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : cliente.messages.create(params));
  let totalIn = 0, totalOut = 0, sqls = 0, texto = '';
  try {
    for (let vuelta = 0; vuelta < 8; vuelta++) {
      const r = await crear({
        model: modelo,
        max_tokens: 2048,
        system: [{ type: 'text', text: IA_NEGOCIO_BASE(), cache_control: { type: 'ephemeral' } }],
        tools: [IA_NEGOCIO_TOOL],
        messages: mensajes,
      });
      const u = r.usage || {};
      totalIn += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      totalOut += u.output_tokens || 0;
      if (r.stop_reason === 'pause_turn') { mensajes.push({ role: 'assistant', content: r.content }); continue; }
      if (r.stop_reason === 'tool_use') {
        mensajes.push({ role: 'assistant', content: r.content });
        const resultados = [];
        for (const b of r.content) {
          if (b.type !== 'tool_use') continue;
          sqls++;
          resultados.push({ type: 'tool_result', tool_use_id: b.id, content: ejecutarSQLLectura(b.input && b.input.sql) });
        }
        mensajes.push({ role: 'user', content: resultados });
        continue;
      }
      if (r.stop_reason === 'refusal') { texto = ''; break; }
      texto = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      break;
    }
    if (!texto) return res.json({ ok: false, error: 'No pude armar la respuesta — probá reformular la pregunta.' });
    db.prepare("INSERT INTO ia_consultas (user_id, pregunta, respuesta, modelo, tokens_in, tokens_out, tipo) VALUES (?, ?, ?, ?, ?, ?, 'negocio')")
      .run(req.user.id, pregunta, texto, modelo, totalIn, totalOut);
    res.json({ ok: true, respuesta: texto, sqls, tokens: totalIn + totalOut, restantes: Math.max(0, iaLimiteDe(req.user) - iaConsultasHoy(req.user.id)) });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: 'La clave de la API no es válida.' });
    if (e instanceof Anthropic.RateLimitError) return res.status(503).json({ error: 'La API está saturada, probá en un minuto.' });
    if (e instanceof Anthropic.APIError) { console.error('ia negocio api:', e.status, e.message); return res.status(502).json({ error: 'No pude responder — probá de nuevo.' }); }
    console.error('ia negocio:', e.message);
    res.status(500).json({ error: 'Error inesperado.' });
  }
});

app.get('/ia/negocio', requireAuth, requireAdmin, (req, res) => {
  const cfg = iaConfig();
  res.send(V.iaNegocioPage({
    user: req.user,
    listo: cfg.activo && !!process.env.ANTHROPIC_API_KEY,
    restantes: Math.max(0, iaLimiteDe(req.user) - iaConsultasHoy(req.user.id)),
    modelo: IA_MODELOS[cfg.modeloNegocio].nombre,
  }));
});

app.get('/asesor', requireAuth, (req, res) => {
  if (!['admin', 'vendedor'].includes(req.user.role)) return res.status(403).send('El asesor es para el equipo comercial.');
  const cfg = iaConfig();
  let deal = parseInt(req.query.deal, 10) ? db.prepare('SELECT id, empresa, panel, etapa FROM deals WHERE id = ?').get(parseInt(req.query.deal, 10)) : null;
  if (deal && !puede(req.user, deal.panel)) deal = null;
  res.send(V.asesorPage({
    user: req.user,
    listo: cfg.activo && !!process.env.ANTHROPIC_API_KEY,
    limite: iaLimiteDe(req.user),
    restantes: req.user.role === 'admin' ? null : Math.max(0, iaLimiteDe(req.user) - iaConsultasHoy(req.user.id)),
    deal,
  }));
});

// Todas las conversaciones con MiniJuan, por día y por vendedor (para analizar qué consultan y su calidad).
app.get('/admin/ia/conversaciones', requireAuth, requireAdmin, (req, res) => {
  const fecha = cleanDate(req.query.fecha) || hoyAR();
  const vendedorId = parseInt(req.query.vendedor, 10) || null;
  const filas = db.prepare(`SELECT c.*, u.name, u.avatar, d.empresa FROM ia_consultas c
      JOIN users u ON u.id = c.user_id LEFT JOIN deals d ON d.id = c.deal_id
      WHERE substr(datetime(c.created_at, '-3 hours'), 1, 10) = ?${vendedorId ? ' AND c.user_id = ?' : ''}
      ORDER BY c.id`).all(...(vendedorId ? [fecha, vendedorId] : [fecha]));
  const dias = db.prepare("SELECT substr(datetime(created_at, '-3 hours'), 1, 10) AS f, COUNT(*) AS n FROM ia_consultas GROUP BY f ORDER BY f DESC LIMIT 45").all();
  const vendedores = db.prepare("SELECT id, name FROM users WHERE active = 1 AND role IN ('vendedor', 'admin') ORDER BY name").all();
  res.send(V.iaConversacionesPage({ user: req.user, fecha, vendedorId, filas, dias, vendedores, hoy: hoyAR() }));
});

// Config del asesor (Administración → Preferencias).
app.post('/admin/ia', requireAuth, requireAdmin, (req, res) => {
  setPanelConfig('_ia', 'activo', req.body.activo === '1' ? '1' : '0');
  setPanelConfig('_ia', 'limite_dia', Math.min(200, Math.max(1, parseInt(req.body.limite, 10) || 20)));
  if (IA_MODELOS[req.body.modelo]) setPanelConfig('_ia', 'modelo', req.body.modelo);
  setPanelConfig('_ia', 'contexto', String(req.body.contexto || '').slice(0, 8000));
  setPanelConfig('_ia', 'credito', Math.max(0, parseFloat(req.body.credito) || 0));
  setPanelConfig('_ia', 'limite_admin', Math.min(500, Math.max(1, parseInt(req.body.limite_admin, 10) || 40)));
  setPanelConfig('_ia', 'tokens_mes_admin', Math.max(0, parseInt(req.body.tokens_mes_admin, 10) || 0));
  if (IA_MODELOS[req.body.modelo_negocio]) setPanelConfig('_ia', 'modelo_negocio', req.body.modelo_negocio);
  setPanelConfig('_ia', 'usd_hora', Math.max(1, parseFloat(req.body.usd_hora) || 25));
  res.redirect('/admin/preferencias');
});

// Límite propio por vendedor (vacío = vuelve al general).
app.post('/admin/ia/limites', requireAuth, requireAdmin, (req, res) => {
  const up = db.prepare('UPDATE users SET ia_limite = ? WHERE id = ? AND role = ?');
  for (const [k, v] of Object.entries(req.body)) {
    if (!k.startsWith('limite_')) continue;
    const uid = parseInt(k.slice(7), 10);
    const n = parseInt(v, 10);
    if (Number.isFinite(uid)) { up.run(Number.isFinite(n) && n >= 1 ? Math.min(500, n) : null, uid, 'vendedor'); up.run(Number.isFinite(n) && n >= 1 ? Math.min(500, n) : null, uid, 'admin'); }
  }
  res.redirect('/admin/preferencias');
});

/* ---------------- panel de cobranza ---------------- */

function resumenComisiones(userId) {
  return db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN estado='pendiente' THEN monto END),0) AS pendiente,
    COALESCE(SUM(CASE WHEN estado='pendiente' AND fecha_devengada <= date('now') THEN monto END),0) AS exigible,
    COALESCE(SUM(CASE WHEN estado='pagado' THEN monto END),0) AS pagado,
    MIN(CASE WHEN estado='pendiente' THEN fecha_devengada END) AS proxima
    FROM commissions WHERE user_id = ?`).get(userId);
}

function filasComisiones(userId) {
  return db.prepare(`SELECT c.*, d.empresa, d.tipo_venta FROM commissions c JOIN deals d ON d.id = c.deal_id
    WHERE c.user_id = ? ORDER BY c.estado = 'pendiente' DESC, c.fecha_devengada ASC, c.id ASC`).all(userId);
}

app.get('/cobranza', requireAuth, requireSistema('cobranza'), (req, res) => {
  if (req.user.role !== 'admin') return res.redirect(`/cobranza/vendedor/${req.user.id}`);
  const vendedores = db.prepare(`SELECT u.id, u.name,
      COALESCE(SUM(CASE WHEN c.estado='pendiente' THEN c.monto END),0) AS pendiente,
      COALESCE(SUM(CASE WHEN c.estado='pendiente' AND c.fecha_devengada <= date('now') THEN c.monto END),0) AS exigible,
      COALESCE(SUM(CASE WHEN c.estado='pagado' THEN c.monto END),0) AS pagado,
      MIN(CASE WHEN c.estado='pendiente' THEN c.fecha_devengada END) AS proxima
    FROM users u LEFT JOIN commissions c ON c.user_id = u.id
    WHERE u.active = 1 GROUP BY u.id ORDER BY pendiente DESC, u.name`).all();
  const tot = vendedores.reduce((a, v) => ({ pendiente: a.pendiente + v.pendiente, exigible: a.exigible + v.exigible, pagado: a.pagado + v.pagado }), { pendiente: 0, exigible: 0, pagado: 0 });
  res.send(V.cobranzaAdminPage({ user: req.user, vendedores, tot }));
});

app.get('/cobranza/vendedor/:id', requireAuth, requireSistema('cobranza'), (req, res) => {
  const uid = parseInt(req.params.id, 10);
  if (req.user.role !== 'admin' && uid !== req.user.id) return res.status(403).send('Solo podés ver tus propias comisiones.');
  const vendedor = db.prepare('SELECT id, name FROM users WHERE id = ?').get(uid);
  if (!vendedor) return res.redirect('/cobranza');
  res.send(V.cobranzaVendedorPage({ user: req.user, vendedor, resumen: resumenComisiones(uid), filas: filasComisiones(uid), esAdmin: req.user.role === 'admin' }));
});

app.post('/cobranza/:cid/estado', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare('SELECT * FROM commissions WHERE id = ?').get(req.params.cid);
  if (!c) return res.redirect('/cobranza');
  const estado = ['pendiente', 'pagado', 'cancelado'].includes(req.body.estado) ? req.body.estado : null;
  if (estado) {
    db.prepare('UPDATE commissions SET estado = ?, pagado_at = ? WHERE id = ?')
      .run(estado, estado === 'pagado' ? new Date().toISOString().slice(0, 10) : null, c.id);
  }
  res.redirect(`/cobranza/vendedor/${c.user_id}`);
});

app.post('/cobranza/:cid/invoice', requireAuth, requireSistema('cobranza'), (req, res) => {
  const c = db.prepare('SELECT * FROM commissions WHERE id = ?').get(req.params.cid);
  if (!c) return res.redirect('/cobranza');
  if (req.user.role !== 'admin' && c.user_id !== req.user.id) return res.status(403).end();
  upload.single('invoice')(req, res, (err) => {
    if (!err && req.file) {
      db.prepare('UPDATE commissions SET invoice_path = ?, invoice_nombre = ? WHERE id = ?')
        .run(req.file.filename, req.file.originalname, c.id);
    }
    res.redirect(`/cobranza/vendedor/${c.user_id}`);
  });
});

app.get('/cobranza/:cid/invoice', requireAuth, requireSistema('cobranza'), (req, res) => {
  const c = db.prepare('SELECT * FROM commissions WHERE id = ?').get(req.params.cid);
  if (!c || !c.invoice_path) return res.status(404).send('Sin invoice cargado.');
  if (req.user.role !== 'admin' && c.user_id !== req.user.id) return res.status(403).end();
  res.download(path.join(INVOICE_DIR, c.invoice_path), c.invoice_nombre || c.invoice_path);
});

app.get('/cobranza/reglas', requireAuth, requireAdmin, (req, res) => {
  res.send(V.reglasPage({ user: req.user, reglas: C.getAllRules(), paneles: PANELES_COMERCIALES.filter((p) => p.slug !== 'cfd') }));
});

app.post('/cobranza/reglas', requireAuth, requireAdmin, (req, res) => {
  // Proyecto único: hasta 4 tramos (hasta / %).
  const tramos = [];
  for (let i = 1; i <= 4; i++) {
    const pct = cleanNum(req.body[`p_pct${i}`]);
    if (pct == null) continue;
    const hasta = cleanNum(req.body[`p_hasta${i}`]);
    tramos.push({ hasta: hasta ?? null, pct });
  }
  if (tramos.length) C.saveRules('Proyecto único', { tipo: 'tramos', tramos });
  // Tipos recurrentes: hasta 2 fases (meses / %).
  const prefijos = { s: 'Suscripción mensual', i: 'Infraestructura', m: 'Mantenimiento' };
  for (const [pref, tipo] of Object.entries(prefijos)) {
    const fases = [];
    for (let f = 1; f <= 2; f++) {
      const meses = cleanInt(req.body[`${pref}_meses${f}`]);
      const pct = cleanNum(req.body[`${pref}_pct${f}`]);
      if (meses > 0 && pct != null) fases.push({ meses, pct });
    }
    if (fases.length) {
      const nota = clean(req.body[`${pref}_nota`]);
      C.saveRules(tipo, { tipo: 'fases', fases, ...(nota ? { nota } : {}) });
    }
  }
  // Rubros por panel: % por venta, opcionalmente repartido en N meses (ej: SitioWeb 80% x 2 meses).
  for (const P of PANELES_COMERCIALES) {
    const pct = cleanNum(req.body[`flat_${P.slug}`]);
    if (pct == null) continue;
    const meses = cleanInt(req.body[`meses_${P.slug}`]);
    if (meses > 1) C.saveRules(P.slug, { tipo: 'fases', fases: [{ meses, pct }], nota: `Venta de ${P.nombre}: ${pct}% del valor mensual durante ${meses} meses. Si el cliente cancela, se cancelan las cuotas restantes.` });
    else C.saveRules(P.slug, { tipo: 'flat', pct, nota: `Venta de ${P.nombre}: comisión única cobrable al momento.` });
  }
  res.redirect('/cobranza/reglas');
});

/* ---------------- notificaciones (admin) ---------------- */

// Fecha/hora legible en hora argentina (para el panel flotante).
function fechaHoraAR(s) {
  if (!s) return '';
  try {
    return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return s; }
}

// Lista para el panel flotante de la campanita: devuelve las últimas y las marca vistas.
app.get('/notificaciones/lista', requireAuth, (req, res) => {
  const items = db.prepare(`SELECT n.texto, n.url, n.leida, n.created_at, n.actor_id, u.name AS actor_nombre, u.avatar AS actor_avatar
      FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 15`).all(req.user.id)
    .map((n) => ({
      texto: n.texto, url: n.url || '/notificaciones', leida: !!n.leida, fecha: fechaHoraAR(n.created_at),
      actor: n.actor_id ? n.actor_nombre : 'Campus C4D',
      avatar: n.actor_id && n.actor_avatar ? `/avatars/${n.actor_id}?v=${encodeURIComponent(n.actor_avatar)}` : null,
      iniciales: n.actor_id ? (n.actor_nombre || '?').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() : 'C4D',
    }));
  res.json({ items });
  db.prepare("UPDATE notifications SET leida = 1, leida_at = datetime('now') WHERE user_id = ? AND leida = 0").run(req.user.id);
});

// Estado para el aviso en vivo (la campanita consulta esto cada 15 segundos).
app.get('/notificaciones/estado', requireAuth, (req, res) => {
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND leida = 0').get(req.user.id).c;
  const ultima = db.prepare('SELECT texto, url FROM notifications WHERE user_id = ? AND leida = 0 ORDER BY created_at DESC, id DESC LIMIT 1').get(req.user.id) || null;
  res.json({ unread, ultima });
});

app.get('/notificaciones', requireAuth, (req, res) => {
  const notis = db.prepare(`SELECT n.*, u.name AS actor_nombre, u.avatar AS actor_avatar FROM notifications n LEFT JOIN users u ON u.id = n.actor_id WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 100`).all(req.user.id);
  res.send(V.notificacionesPage({ user: req.user, notis }));
  // Se marcan como leídas después de mostrarlas: las no leídas se ven resaltadas una vez.
  db.prepare("UPDATE notifications SET leida = 1, leida_at = datetime('now') WHERE user_id = ? AND leida = 0").run(req.user.id);
});

/* ---------------- campus de formación (cursos con videos, docs y quizzes) ---------------- */

const CAMPUS_DIR = path.join(__dirname, 'data', 'campus');
if (!fs.existsSync(CAMPUS_DIR)) fs.mkdirSync(CAMPUS_DIR, { recursive: true });
const uploadCampus = multer({
  storage: multer.diskStorage({
    destination: CAMPUS_DIR,
    filename: (req, file, cb) => cb(null, `c-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 512 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['.mp4', '.webm', '.mov', '.pdf', '.png', '.jpg', '.jpeg', '.pptx', '.docx', '.xlsx'].includes(path.extname(file.originalname).toLowerCase())),
});
const empresaCampus = (e) => (CAMPUS_EMPRESAS.some(([sl]) => sl === e) ? e : 'general');

const preguntasDeItem = (itemId) => db.prepare('SELECT * FROM campus_quiz_preguntas WHERE item_id = ? ORDER BY orden, id').all(itemId)
  .map((q) => { try { q.opciones = JSON.parse(q.opciones); } catch { q.opciones = []; } return q; });
const mejorIntento = (itemId, userId) => db.prepare('SELECT MAX(puntaje) AS puntaje, MAX(aprobado) AS aprobado, COUNT(*) AS intentos FROM campus_quiz_intentos WHERE item_id = ? AND user_id = ?').get(itemId, userId);

// Media completada: video subido → 80% reproducido de verdad; YouTube/docs/enlaces → abierto al menos una vez.
function mediaCompletadaCampus(item, userId) {
  const v = db.prepare('SELECT * FROM campus_vistas WHERE item_id = ? AND user_id = ?').get(item.id, userId);
  if (!v) return false;
  if (/\.(mp4|webm|mov)$/i.test(item.archivo || '')) return !!v.completado_at;
  return v.veces > 0 || v.segundos > 0;
}

// Completado = media vista + quiz aprobado al 70% (si el contenido tiene quiz).
function itemCompletadoCampus(item, userId) {
  if (!mediaCompletadaCampus(item, userId)) return false;
  const nQuiz = db.prepare('SELECT COUNT(*) c FROM campus_quiz_preguntas WHERE item_id = ?').get(item.id).c;
  if (!nQuiz) return true;
  const mi = mejorIntento(item.id, userId);
  return !!(mi && mi.aprobado);
}

// Curso secuencial: cada contenido se desbloquea al completar el anterior de su curso (los admins ven todo).
function itemBloqueadoCampus(user, itemId) {
  if (user.role === 'admin') return false;
  const it = db.prepare('SELECT * FROM campus_items WHERE id = ?').get(itemId);
  if (!it) return true;
  const lista = db.prepare('SELECT * FROM campus_items WHERE curso_id IS ? ORDER BY orden ASC, id ASC').all(it.curso_id);
  let prevOk = true;
  for (const x of lista) {
    if (x.id === it.id) return !prevOk;
    prevOk = itemCompletadoCampus(x, user.id);
  }
  return true;
}

// Registra que un usuario vio un contenido (una fila por usuario+contenido; cuenta las veces).
function registrarVistaCampus(itemId, userId) {
  db.prepare(`INSERT INTO campus_vistas (item_id, user_id, veces) VALUES (?, ?, 1)
    ON CONFLICT(item_id, user_id) DO UPDATE SET veces = veces + 1, ultima_vista = datetime('now')`).run(itemId, userId);
}

app.get('/campus', requireAuth, (req, res) => res.redirect('/campus/general'));

// El archivo se sirve con soporte de rangos (los videos se pueden adelantar/atrasar).
app.get('/campus/archivo/:id', requireAuth, (req, res) => {
  const it = db.prepare('SELECT id, archivo, archivo_nombre FROM campus_items WHERE id = ?').get(req.params.id);
  if (!it || !it.archivo || !/^[\w.-]+$/.test(it.archivo)) return res.status(404).end();
  if (itemBloqueadoCampus(req.user, it.id)) return res.status(403).send('Este contenido se desbloquea al completar el anterior.');
  if (!req.headers.range && !req.query.thumb) registrarVistaCampus(it.id, req.user.id);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(it.archivo_nombre || it.archivo)}"`);
  res.sendFile(path.join(CAMPUS_DIR, it.archivo), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

// Beacon de vista (play de un video embebido, click en un enlace externo).
app.post('/campus/vista/:id', requireAuth, (req, res) => {
  if (db.prepare('SELECT 1 FROM campus_items WHERE id = ?').get(req.params.id) && !itemBloqueadoCampus(req.user, req.params.id)) {
    registrarVistaCampus(req.params.id, req.user.id);
  }
  res.json({ ok: true });
});

// Progreso de un video subido: máximo alcanzado + segundos realmente reproducidos (los saltos no suman).
app.post('/campus/progreso/:id', requireAuth, (req, res) => {
  const seg = Math.max(0, parseFloat(req.body.segundos) || 0);
  const dur = Math.max(0, parseFloat(req.body.duracion) || 0) || null;
  const rep = Math.max(0, Math.min(30, parseFloat(req.body.rep) || 0));
  if (db.prepare('SELECT 1 FROM campus_items WHERE id = ?').get(req.params.id) && !itemBloqueadoCampus(req.user, req.params.id)) {
    db.prepare(`INSERT INTO campus_vistas (item_id, user_id, veces, segundos, duracion, reproducido) VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT(item_id, user_id) DO UPDATE SET segundos = MAX(segundos, excluded.segundos),
        duracion = COALESCE(excluded.duracion, duracion), reproducido = reproducido + excluded.reproducido,
        ultima_vista = datetime('now')`).run(req.params.id, req.user.id, seg, dur, rep);
    const v = db.prepare('SELECT * FROM campus_vistas WHERE item_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!v.completado_at && v.duracion > 0 && v.reproducido >= v.duracion * 0.8) {
      db.prepare("UPDATE campus_vistas SET completado_at = datetime('now') WHERE item_id = ? AND user_id = ?").run(req.params.id, req.user.id);
    }
  }
  res.json({ ok: true });
});

// Estadísticas de aprendizaje (solo admin): quién vio qué, hasta dónde, quizzes y horas por persona.
app.get('/campus/estadisticas', requireAuth, requireAdmin, (req, res) => {
  const esVideo = (i) => !!(i.url || /\.(mp4|webm|mov)$/i.test(i.archivo || ''));
  const items = db.prepare(`SELECT i.*, u.name AS autor, c.nombre AS curso_nombre,
      (SELECT COUNT(*) FROM campus_quiz_preguntas q WHERE q.item_id = i.id) AS n_quiz
    FROM campus_items i JOIN users u ON u.id = i.created_by LEFT JOIN campus_cursos c ON c.id = i.curso_id
    ORDER BY i.curso_id, i.orden, i.id`).all();
  const vistas = db.prepare('SELECT v.*, u.name, u.avatar, u.role, u.active FROM campus_vistas v JOIN users u ON u.id = v.user_id').all();
  const intentos = db.prepare('SELECT item_id, user_id, MAX(puntaje) AS puntaje, MAX(aprobado) AS aprobado, COUNT(*) AS intentos FROM campus_quiz_intentos GROUP BY item_id, user_id').all();
  const quizDe = (itemId, userId) => intentos.find((q) => q.item_id === itemId && q.user_id === userId) || null;
  const porItem = items.map((i) => ({
    ...i, esVideo: esVideo(i),
    vistos: vistas.filter((v) => v.item_id === i.id).map((v) => ({ ...v, quiz: quizDe(i.id, v.user_id) }))
      .sort((a, b) => b.segundos - a.segundos || a.name.localeCompare(b.name)),
  }));
  const usuarios = db.prepare("SELECT id, name, avatar, role FROM users WHERE active = 1 AND role != 'developer' ORDER BY name").all()
    .map((u) => {
      const mias = vistas.filter((v) => v.user_id === u.id);
      return {
        ...u,
        contenidos: mias.length,
        completados: mias.filter((v) => v.completado_at).length,
        quizzesAprobados: intentos.filter((q) => q.user_id === u.id && q.aprobado).length,
        segundos: mias.reduce((a, v) => a + (v.reproducido || v.segundos || 0), 0),
        ultima: mias.reduce((a, v) => (v.ultima_vista > a ? v.ultima_vista : a), ''),
      };
    })
    .sort((a, b) => b.segundos - a.segundos || b.contenidos - a.contenidos);
  const totalVendedores = usuarios.filter((u) => u.role === 'vendedor').length;
  res.send(V.campusStatsPage({ user: req.user, empresas: CAMPUS_EMPRESAS, porItem, usuarios, totalVendedores }));
});

// Un curso: sus contenidos en orden, con la cadena de desbloqueo y el estado de quiz de cada uno.
app.get('/campus/curso/:id', requireAuth, (req, res) => {
  const curso = db.prepare('SELECT * FROM campus_cursos WHERE id = ?').get(req.params.id);
  if (!curso) return res.redirect('/campus');
  const items = db.prepare(`SELECT i.*, u.name AS autor,
      (SELECT COUNT(*) FROM campus_vistas v WHERE v.item_id = i.id) AS vistos,
      (SELECT COUNT(*) FROM campus_quiz_preguntas q WHERE q.item_id = i.id) AS n_quiz
    FROM campus_items i JOIN users u ON u.id = i.created_by WHERE i.curso_id = ? ORDER BY i.orden ASC, i.id ASC`).all(curso.id);
  let prevOk = true, prevTitulo = null, prevQuiz = false;
  for (const it of items) {
    it.mediaOk = mediaCompletadaCampus(it, req.user.id);
    const mi = it.n_quiz ? mejorIntento(it.id, req.user.id) : null;
    it.quizAprobado = !it.n_quiz || !!(mi && mi.aprobado);
    it.mejorPuntaje = mi && mi.puntaje != null ? mi.puntaje : null;
    it.completado = it.mediaOk && it.quizAprobado;
    it.bloqueado = req.user.role !== 'admin' && !prevOk;
    it.requiere = it.bloqueado ? prevTitulo : null;
    it.requiereQuiz = it.bloqueado ? prevQuiz : false;
    prevOk = it.completado;
    prevTitulo = it.titulo;
    prevQuiz = it.n_quiz > 0;
  }
  res.send(V.campusCursoPage({ user: req.user, curso, empresas: CAMPUS_EMPRESAS, items }));
});

// Cursos por empresa, con el progreso del usuario en cada uno.
app.get('/campus/:empresa', requireAuth, (req, res) => {
  const empresa = empresaCampus(req.params.empresa);
  const cursos = db.prepare('SELECT * FROM campus_cursos WHERE empresa = ? ORDER BY orden ASC, id ASC').all(empresa)
    .map((c) => {
      const its = db.prepare('SELECT * FROM campus_items WHERE curso_id = ? ORDER BY orden ASC, id ASC').all(c.id);
      return { ...c, total: its.length, completados: its.filter((i) => itemCompletadoCampus(i, req.user.id)).length };
    });
  res.send(V.campusPage({ user: req.user, empresa, empresas: CAMPUS_EMPRESAS, cursos }));
});

app.post('/campus/cursos', requireAuth, requireAdmin, (req, res) => {
  const empresa = empresaCampus(req.body.empresa);
  const nombre = clean(req.body.nombre);
  if (nombre) {
    const orden = (db.prepare('SELECT COALESCE(MAX(orden), 0) m FROM campus_cursos WHERE empresa = ?').get(empresa).m) + 1;
    db.prepare('INSERT INTO campus_cursos (empresa, nombre, descripcion, orden, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(empresa, nombre, clean(req.body.descripcion), orden, req.user.id);
  }
  res.redirect(`/campus/${empresa}`);
});

app.post('/campus/cursos/:id', requireAuth, requireAdmin, (req, res) => {
  const curso = db.prepare('SELECT * FROM campus_cursos WHERE id = ?').get(req.params.id);
  if (curso) {
    if (req.body.accion === 'renombrar') {
      const nombre = clean(req.body.nombre);
      if (nombre) db.prepare('UPDATE campus_cursos SET nombre = ?, descripcion = ? WHERE id = ?').run(nombre, clean(req.body.descripcion), curso.id);
    } else if (req.body.accion === 'borrar') {
      const con = db.prepare('SELECT COUNT(*) c FROM campus_items WHERE curso_id = ?').get(curso.id).c;
      if (con === 0) db.prepare('DELETE FROM campus_cursos WHERE id = ?').run(curso.id);
    }
  }
  res.redirect(`/campus/${curso ? curso.empresa : 'general'}`);
});

app.post('/campus/items', requireAuth, requireAdmin, uploadCampus.single('archivo'), (req, res) => {
  const curso = db.prepare('SELECT * FROM campus_cursos WHERE id = ?').get(parseInt(req.body.curso_id, 10));
  const titulo = clean(req.body.titulo);
  const url = clean(req.body.url);
  if (curso && titulo && (url || req.file)) {
    const orden = (db.prepare('SELECT COALESCE(MAX(orden), 0) m FROM campus_items WHERE curso_id = ?').get(curso.id).m) + 1;
    db.prepare('INSERT INTO campus_items (empresa, curso_id, titulo, descripcion, url, archivo, archivo_nombre, orden, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(curso.empresa, curso.id, titulo, clean(req.body.descripcion), url || null, req.file ? req.file.filename : null, req.file ? req.file.originalname : null, orden, req.user.id);
  } else if (req.file) {
    try { fs.unlinkSync(path.join(CAMPUS_DIR, req.file.filename)); } catch {}
  }
  res.redirect(curso ? `/campus/curso/${curso.id}` : '/campus');
});

app.post('/campus/items/:id/mover', requireAuth, requireAdmin, (req, res) => {
  const it = db.prepare('SELECT * FROM campus_items WHERE id = ?').get(req.params.id);
  if (it) {
    const dir = req.body.dir === 'subir' ? 'DESC' : 'ASC';
    const vecino = db.prepare(`SELECT * FROM campus_items WHERE curso_id IS ? AND (orden ${req.body.dir === 'subir' ? '<' : '>'} ? OR (orden = ? AND id ${req.body.dir === 'subir' ? '<' : '>'} ?)) ORDER BY orden ${dir}, id ${dir} LIMIT 1`)
      .get(it.curso_id, it.orden, it.orden, it.id);
    if (vecino) {
      db.prepare('UPDATE campus_items SET orden = ? WHERE id = ?').run(vecino.orden, it.id);
      db.prepare('UPDATE campus_items SET orden = ? WHERE id = ?').run(it.orden, vecino.id);
      if (vecino.orden === it.orden) db.prepare('UPDATE campus_items SET orden = orden + 1 WHERE id = ?').run(vecino.id);
    }
  }
  res.redirect(it && it.curso_id ? `/campus/curso/${it.curso_id}` : '/campus');
});

app.post('/campus/items/:id/borrar', requireAuth, requireAdmin, (req, res) => {
  const it = db.prepare('SELECT * FROM campus_items WHERE id = ?').get(req.params.id);
  if (it) {
    db.prepare('DELETE FROM campus_items WHERE id = ?').run(it.id);
    if (it.archivo) { try { fs.unlinkSync(path.join(CAMPUS_DIR, it.archivo)); } catch {} }
  }
  res.redirect(it && it.curso_id ? `/campus/curso/${it.curso_id}` : '/campus');
});

/* --- quiz por contenido: el vendedor necesita 70% para desbloquear el siguiente --- */

app.get('/campus/item/:id/quiz', requireAuth, (req, res) => {
  const item = db.prepare('SELECT i.*, c.nombre AS curso_nombre, c.id AS cid FROM campus_items i LEFT JOIN campus_cursos c ON c.id = i.curso_id WHERE i.id = ?').get(req.params.id);
  if (!item) return res.redirect('/campus');
  const esAdmin = req.user.role === 'admin';
  if (!esAdmin && itemBloqueadoCampus(req.user, item.id)) return res.redirect(`/campus/curso/${item.cid}`);
  const preguntas = preguntasDeItem(item.id);
  const mediaOk = esAdmin || mediaCompletadaCampus(item, req.user.id);
  const mi = mejorIntento(item.id, req.user.id);
  res.send(V.campusQuizPage({
    user: req.user, item, preguntas, esAdmin, mediaOk,
    mejor: mi && mi.puntaje != null ? mi : null,
    nota: req.query.nota != null ? parseInt(req.query.nota, 10) : null,
  }));
});

app.post('/campus/item/:id/quiz/preguntas', requireAuth, requireAdmin, (req, res) => {
  const item = db.prepare('SELECT id FROM campus_items WHERE id = ?').get(req.params.id);
  const pregunta = clean(req.body.pregunta);
  const opciones = [req.body.op1, req.body.op2, req.body.op3, req.body.op4].map((o) => clean(o)).filter(Boolean);
  const correcta = Math.max(0, Math.min(opciones.length - 1, parseInt(req.body.correcta, 10) || 0));
  if (item && pregunta && opciones.length >= 2) {
    const orden = (db.prepare('SELECT COALESCE(MAX(orden), 0) m FROM campus_quiz_preguntas WHERE item_id = ?').get(item.id).m) + 1;
    db.prepare('INSERT INTO campus_quiz_preguntas (item_id, pregunta, opciones, correcta, orden) VALUES (?, ?, ?, ?, ?)')
      .run(item.id, pregunta, JSON.stringify(opciones), correcta, orden);
  }
  res.redirect(`/campus/item/${req.params.id}/quiz`);
});

app.post('/campus/quiz/preguntas/:qid/borrar', requireAuth, requireAdmin, (req, res) => {
  const q = db.prepare('SELECT * FROM campus_quiz_preguntas WHERE id = ?').get(req.params.qid);
  if (q) db.prepare('DELETE FROM campus_quiz_preguntas WHERE id = ?').run(q.id);
  res.redirect(q ? `/campus/item/${q.item_id}/quiz` : '/campus');
});

app.post('/campus/item/:id/quiz', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM campus_items WHERE id = ?').get(req.params.id);
  if (!item || itemBloqueadoCampus(req.user, item.id)) return res.redirect('/campus');
  if (!mediaCompletadaCampus(item, req.user.id) && req.user.role !== 'admin') return res.redirect(`/campus/item/${item.id}/quiz`);
  const preguntas = preguntasDeItem(item.id);
  if (!preguntas.length) return res.redirect(`/campus/curso/${item.curso_id}`);
  let aciertos = 0;
  for (const q of preguntas) {
    if (parseInt(req.body['r' + q.id], 10) === q.correcta) aciertos++;
  }
  const puntaje = Math.round((aciertos / preguntas.length) * 100);
  const aprobado = puntaje >= 70 ? 1 : 0;
  if (req.user.role !== 'admin') {
    db.prepare('INSERT INTO campus_quiz_intentos (item_id, user_id, puntaje, aprobado) VALUES (?, ?, ?, ?)').run(item.id, req.user.id, puntaje, aprobado);
  }
  res.redirect(`/campus/item/${item.id}/quiz?nota=${puntaje}`);
});

/* ---------------- documentación y changelog ---------------- */

const CHANGELOG = require('./changelog');
const MANUAL_PDF = path.join(__dirname, 'public', 'manual.pdf');

// Tipografías del rediseño (IBM Plex, servidas localmente).
app.get('/fonts/:archivo', (req, res) => {
  const archivo = String(req.params.archivo);
  if (!/^[\w.-]+\.woff2$/.test(archivo)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.sendFile(path.join(__dirname, 'public', 'fonts', archivo), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

// Logo (sin auth: se usa en la pantalla de login).
app.get('/logo.png', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'public', 'logo.png'));
});

app.get('/logo-sitioweb.svg', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'public', 'logo-sitioweb.svg'));
});

// Manual en PDF (reemplazar public/manual.pdf cuando esté la versión definitiva).
app.get('/manual.pdf', requireAuth, (req, res) => {
  if (!fs.existsSync(MANUAL_PDF)) return res.status(404).send('El manual todavía no está cargado.');
  res.sendFile(MANUAL_PDF);
});

app.get('/documentacion', requireAuth, (req, res) => res.send(V.docsPage({ user: req.user, manualDisponible: fs.existsSync(MANUAL_PDF) })));
app.get('/changelog', requireAuth, (req, res) => res.send(V.changelogPage({ user: req.user, versiones: CHANGELOG })));

/* ---------------- perfil ---------------- */

app.get('/perfil', requireAuth, (req, res) => res.send(V.perfilPage({ user: req.user })));

// Foto de perfil: subir (reemplaza la anterior) y quitar.
app.post('/perfil/foto', requireAuth, uploadAvatar.single('foto'), (req, res) => {
  if (req.file) {
    const anterior = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id).avatar;
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(req.file.filename, req.user.id);
    if (anterior) { try { fs.unlinkSync(path.join(AVATAR_DIR, anterior)); } catch {} }
  }
  res.redirect('/perfil');
});

app.post('/perfil/foto/quitar', requireAuth, (req, res) => {
  const anterior = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id).avatar;
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  if (anterior) { try { fs.unlinkSync(path.join(AVATAR_DIR, anterior)); } catch {} }
  res.redirect('/perfil');
});

// Sirve la foto de un usuario (cualquier usuario logueado puede verlas: aparecen en listas y nav).
/* ---------------- soporte (tickets) ---------------- */

const puedeVerTicket = (user, t) => !!t && (user.role === 'admin' || t.user_id === user.id);

app.get('/soporte', requireAuth, (req, res) => {
  const tickets = req.user.role === 'admin'
    ? db.prepare(`SELECT t.*, u.name AS autor, (SELECT COUNT(*) FROM ticket_mensajes m WHERE m.ticket_id = t.id) AS mensajes
        FROM tickets t JOIN users u ON u.id = t.user_id ORDER BY t.estado = 'abierto' DESC, t.updated_at DESC`).all()
    : db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM ticket_mensajes m WHERE m.ticket_id = t.id) AS mensajes
        FROM tickets t WHERE t.user_id = ? ORDER BY t.estado = 'abierto' DESC, t.updated_at DESC`).all(req.user.id);
  res.send(V.soporteListaPage({ user: req.user, tickets, abrir: req.query.abrir === '1' }));
});

app.post('/soporte', requireAuth, uploadSoporte.single('imagen'), (req, res) => {
  const asunto = String(req.body.asunto || '').trim().slice(0, 120);
  const texto = String(req.body.texto || '').trim().slice(0, 4000);
  if (!asunto || (!texto && !req.file)) return res.redirect('/soporte?abrir=1');
  const r = db.prepare('INSERT INTO tickets (user_id, asunto) VALUES (?, ?)').run(req.user.id, asunto);
  db.prepare('INSERT INTO ticket_mensajes (ticket_id, user_id, texto, imagen_path, imagen_nombre) VALUES (?, ?, ?, ?, ?)')
    .run(r.lastInsertRowid, req.user.id, texto, req.file ? req.file.filename : null, req.file ? req.file.originalname : null);
  notifyAdmins(req.user.id, `Abrió el ticket de soporte «${asunto}»`, `/soporte/${r.lastInsertRowid}`);
  res.redirect(`/soporte/${r.lastInsertRowid}`);
});

// Antes de /soporte/:id para que "img" no se tome como id de ticket.
app.get('/soporte/img/:mid', requireAuth, (req, res) => {
  const m = db.prepare('SELECT m.imagen_path, t.user_id AS duenio FROM ticket_mensajes m JOIN tickets t ON t.id = m.ticket_id WHERE m.id = ?').get(req.params.mid);
  if (!m || !m.imagen_path || !(req.user.role === 'admin' || m.duenio === req.user.id)) return res.status(404).end();
  const fp = path.join(SOPORTE_DIR, path.basename(m.imagen_path));
  if (!fs.existsSync(fp)) return res.status(404).end();
  res.sendFile(fp);
});

app.get('/soporte/:id', requireAuth, (req, res) => {
  const t = db.prepare('SELECT t.*, u.name AS autor FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?').get(req.params.id);
  if (!puedeVerTicket(req.user, t)) return res.status(404).send('Ticket no encontrado.');
  const mensajes = db.prepare('SELECT m.*, u.name, u.avatar, u.role FROM ticket_mensajes m JOIN users u ON u.id = m.user_id WHERE m.ticket_id = ? ORDER BY m.id').all(t.id);
  res.send(V.soporteTicketPage({ user: req.user, ticket: t, mensajes }));
});

app.post('/soporte/:id/mensaje', requireAuth, uploadSoporte.single('imagen'), (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!puedeVerTicket(req.user, t)) return res.status(404).send('Ticket no encontrado.');
  const texto = String(req.body.texto || '').trim().slice(0, 4000);
  if (!texto && !req.file) return res.redirect(`/soporte/${t.id}`);
  db.prepare('INSERT INTO ticket_mensajes (ticket_id, user_id, texto, imagen_path, imagen_nombre) VALUES (?, ?, ?, ?, ?)')
    .run(t.id, req.user.id, texto, req.file ? req.file.filename : null, req.file ? req.file.originalname : null);
  db.prepare("UPDATE tickets SET estado = 'abierto', updated_at = datetime('now') WHERE id = ?").run(t.id);
  if (req.user.id === t.user_id) notifyAdmins(req.user.id, `Respondió en el ticket «${t.asunto}»`, `/soporte/${t.id}`);
  else notifyUser(t.user_id, `Soporte respondió tu ticket «${t.asunto}»`, `/soporte/${t.id}`, null, req.user.id);
  res.redirect(`/soporte/${t.id}`);
});

app.post('/soporte/:id/estado', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!puedeVerTicket(req.user, t)) return res.status(404).send('Ticket no encontrado.');
  const nuevo = t.estado === 'abierto' ? 'cerrado' : 'abierto';
  db.prepare("UPDATE tickets SET estado = ?, updated_at = datetime('now') WHERE id = ?").run(nuevo, t.id);
  if (req.user.id !== t.user_id) notifyUser(t.user_id, `Tu ticket «${t.asunto}» fue ${nuevo === 'cerrado' ? 'marcado como resuelto' : 'reabierto'} por soporte`, `/soporte/${t.id}`, null, req.user.id);
  res.redirect(`/soporte/${t.id}`);
});

app.get('/avatars/:uid', requireAuth, (req, res) => {
  const u = db.prepare('SELECT avatar FROM users WHERE id = ?').get(parseInt(req.params.uid, 10));
  if (!u || !u.avatar || !/^[\w.-]+$/.test(u.avatar)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(AVATAR_DIR, u.avatar), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

app.post('/perfil/password', requireAuth, (req, res) => {
  const full = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (bcrypt.compareSync(req.body.current || '', full.password_hash) && (req.body.next || '').length >= 6) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(req.body.next, 10), req.user.id);
    logUserEvent(req.user.id, 'cuenta', 'Cambió su contraseña');
  }
  res.redirect('/perfil');
});

// Avisos de vencimiento de leads: a la mitad del tiempo configurado y una hora antes de liberarse.
// Corre cada 5 minutos; robo_avisos garantiza un solo aviso por lead y por período de inactividad.
function avisarVencimientos() {
  try {
    for (const P of PANELES_COMERCIALES) {
      const robo = configRobo(P.slug);
      if (!robo.activo || !(robo.horas > 0)) continue;
      const abiertas = db.prepare("SELECT id, empresa, user_id, etapa, etapa_movida_at FROM deals WHERE panel = ? AND etapa NOT IN ('Ganado','Perdido') AND etapa_movida_at IS NOT NULL").all(P.slug);
      for (const d of abiertas) {
        const horasSin = msDesde(d.etapa_movida_at) / 3600000;
        if (!Number.isFinite(horasSin) || horasSin >= robo.horas) continue; // ya liberada: no tiene sentido avisar
        const avisos = [];
        if (horasSin >= robo.horas / 2) avisos.push(['mitad', `Tu lead «${d.empresa}» lleva ${Math.floor(horasSin)} h sin actividad — a las ${robo.horas} h queda liberada para que otro vendedor la tome (una nota o un cambio de etapa reinician el contador)`]);
        if (robo.horas > 1 && horasSin >= robo.horas - 1) avisos.push(['1h', `¡Última hora! Tu lead «${d.empresa}» se libera en menos de 1 hora — una nota, una edición o un cambio de etapa la retienen`]);
        for (const [tipo, texto] of avisos) {
          const r = db.prepare('INSERT OR IGNORE INTO robo_avisos (deal_id, marca, tipo) VALUES (?, ?, ?)').run(d.id, d.etapa_movida_at, tipo);
          if (r.changes > 0) notifyUser(d.user_id, texto, `/deals/${d.id}`);
        }
      }
    }
  } catch (e) { console.error('avisarVencimientos:', e.message); }
}
setInterval(avisarVencimientos, 5 * 60 * 1000);

// Recordatorio de carga diaria: si ayer quedó sin cargar, una notificación por panel (recién desde las 9 AR
// para no avisar de madrugada). actividad_avisos garantiza un solo aviso por vendedor, panel y fecha.
function recordarActividad() {
  try {
    const horaAR = parseInt(new Date().toLocaleString('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }), 10);
    if (!(horaAR >= 9)) return;
    const ayer = ventanaFechas(1)[1];
    const vendedores = db.prepare("SELECT id, permisos FROM users WHERE role = 'vendedor' AND active = 1").all();
    for (const P of PANELES_COMERCIALES) {
      if (diasAtrasDe(P.slug) < 1) continue; // sin carga retroactiva, ayer ya no se puede cargar
      for (const u of vendedores) {
        let permisos = []; try { permisos = JSON.parse(u.permisos || '[]'); } catch {}
        if (!permisos.includes(P.slug)) continue;
        const inicio = inicioPanelDe(u.id, P.slug);
        if (inicio && ayer < inicio) continue;
        if (db.prepare('SELECT 1 FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha = ?').get(P.slug, u.id, ayer)) continue;
        const r = db.prepare('INSERT OR IGNORE INTO actividad_avisos (user_id, panel, fecha) VALUES (?, ?, ?)').run(u.id, P.slug, ayer);
        if (r.changes > 0) notifyUser(u.id, `No te olvides de cargar tu actividad de ayer en ${P.nombre} — toma 2 minutos`, `${baseDePanel(P.slug)}/actividad?fecha=${ayer}&abrir=1`);
      }
    }
  } catch (e) { console.error('recordarActividad:', e.message); }
}
setInterval(recordarActividad, 15 * 60 * 1000);
setTimeout(recordarActividad, 20 * 1000);
setTimeout(avisarVencimientos, 15 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Panel Comercial corriendo en http://localhost:${PORT}`));
