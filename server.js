const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { db, seedAdmin, getSessionSecret, ETAPAS, ETAPAS_ACTIVAS, ORIGENES, MOTIVOS, TIPOS_VENTA, SISTEMAS, PANELES_COMERCIALES, CAMPUS_EMPRESAS } = require('./db');
const PANEL_SLUGS = PANELES_COMERCIALES.map((p) => p.slug);
const V = require('./views');
const C = require('./comisiones');
const multer = require('multer');

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
  const u = db.prepare('SELECT id, name, email, role, active, permisos, last_seen_at, last_version_vista, avatar FROM users WHERE id = ? AND active = 1').get(req.session.uid) || null;
  if (u) { try { u.permisos = JSON.parse(u.permisos || '[]'); } catch { u.permisos = []; } }
  return u;
}

// Permisos por sistema: el admin siempre puede todo.
const puede = (user, sistema) => user.role === 'admin' || (user.permisos || []).includes(sistema);
const requireSistema = (sistema) => (req, res, next) => (puede(req.user, sistema) ? next() : res.status(403).send('No tenés acceso a este sistema. Pedile al administrador que te lo habilite.'));

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.redirect('/login');
  user.unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND leida = 0').get(user.id).c;
  // Última interacción: se estampa como mucho una vez por minuto para no escribir en cada request.
  const haceUnMin = new Date(Date.now() - 60000).toISOString().replace('T', ' ').slice(0, 19);
  if (!user.last_seen_at || user.last_seen_at < haceUnMin) {
    db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(user.id);
  }
  // Ventana modal pendiente: primero una alerta del admin no vista; si no hay, el changelog de la versión nueva.
  user.modalBanner = db.prepare(`SELECT b.* FROM banners b WHERE b.activo = 1
    AND NOT EXISTS (SELECT 1 FROM banner_vistos v WHERE v.banner_id = b.id AND v.user_id = ?)
    ORDER BY b.id DESC LIMIT 1`).get(user.id) || null;
  if (!user.modalBanner && user.last_version_vista !== CHANGELOG[0].version) user.modalChangelog = CHANGELOG[0];
  req.user = user;
  next();
}

const logUserEvent = (userId, tipo, detalle) =>
  db.prepare('INSERT INTO user_events (user_id, tipo, detalle) VALUES (?, ?, ?)').run(userId, tipo, detalle);

/* --- historial de deals y notificaciones --- */

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
  empresa: 'Empresa', tipo_venta: 'Tipo de venta', mrr: 'Valor', decisor: 'Decisor', origen: 'Origen',
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
    const ventana = ventanaFechas().slice(1); // ayer, -2, -3
    const ddmm = (f) => `${+f.slice(8, 10)}/${+f.slice(5, 7)}`;
    const avisos = [];
    for (const P of PANELES_COMERCIALES) {
      if (!permisos.includes(P.slug)) continue;
      const cargadas = db.prepare('SELECT fecha FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(P.slug, user.id, ventana[2]).map((r) => r.fecha);
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
  if (ql) deals = deals.filter((d) => [d.empresa, d.decisor, d.ciudad, d.provincia, d.origen, d.vendedor_name].some((v) => v && v.toLowerCase().includes(ql)));
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
    user: req.user, deal: null, vendedores, isAdmin: req.user.role === 'admin',
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
  d.aprobacion = d.etapa === 'Ganado' ? (req.user.role === 'admin' && d.mrr > 0 ? 'aprobado' : 'pendiente') : null;
  const { nota: _n1, ...dInsert } = d;
  const r = db.prepare(`INSERT INTO deals (empresa, user_id, panel, etapa, tipo_venta, mrr, decisor, origen, proximo_paso, fecha_proximo_paso, fecha_primera_reunion, fecha_cierre, motivo_perdida, campana_id, pais, provincia, ciudad, notas, aprobacion)
    VALUES (@empresa, @user_id, @panel, @etapa, @tipo_venta, @mrr, @decisor, @origen, @proximo_paso, @fecha_proximo_paso, @fecha_primera_reunion, @fecha_cierre, @motivo_perdida, @campana_id, @pais, @provincia, @ciudad, @notas, @aprobacion)`).run(dInsert);
  logDealEvent(r.lastInsertRowid, req.user.id, 'creado', `Deal creado en etapa ${d.etapa}`);
  if (d.nota) logDealEvent(r.lastInsertRowid, req.user.id, 'edicion', `Nota: ${d.nota}`);
  notifyAdmins(req.user.id, `Creó el deal «${d.empresa}» en ${d.etapa}${d.aprobacion === 'pendiente' ? ' — requiere tu aprobación' : ''}`, `/deals/${r.lastInsertRowid}`, d.etapa === 'Ganado' ? 'ganado' : 'deal_nuevo');
  if (d.aprobacion === 'aprobado') C.generarComisiones({ ...d, id: r.lastInsertRowid, fecha_cierre: d.fecha_cierre || new Date().toISOString().slice(0, 10) });
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
    user: req.user, deal, vendedores, isAdmin: req.user.role === 'admin', eventos, ultimaEd, errAprob: req.query.err === 'valor',
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
  // Si pasa a Ganado/Perdido sin fecha de cierre, se estampa hoy.
  if (['Ganado', 'Perdido'].includes(d.etapa) && !d.fecha_cierre) d.fecha_cierre = new Date().toISOString().slice(0, 10);
  const cambioEtapa = d.etapa !== deal.etapa;
  // Aprobación: si entra a Ganado depende de quién lo hace Y de que el valor esté cargado; si sale, se limpia; si no cambió, se conserva.
  d.aprobacion = d.etapa !== 'Ganado' ? null
    : cambioEtapa ? (req.user.role === 'admin' && d.mrr > 0 ? 'aprobado' : 'pendiente')
    : deal.aprobacion;
  const { nota: _n2, ...dUpdate } = d;
  db.prepare(`UPDATE deals SET empresa=@empresa, user_id=@user_id, panel=@panel, etapa=@etapa, tipo_venta=@tipo_venta, mrr=@mrr, decisor=@decisor, origen=@origen,
    proximo_paso=@proximo_paso, fecha_proximo_paso=@fecha_proximo_paso, fecha_primera_reunion=@fecha_primera_reunion,
    fecha_cierre=@fecha_cierre, motivo_perdida=@motivo_perdida, campana_id=@campana_id, pais=@pais, provincia=@provincia, ciudad=@ciudad, notas=@notas, aprobacion=@aprobacion, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...dUpdate, id: deal.id });

  // Historial: cambio de etapa es un evento propio; el resto va como edición.
  const otros = diffDeal(deal, d);
  if (cambioEtapa) {
    const det = [`${deal.etapa} → ${d.etapa}`, ...otros].join(' · ');
    logDealEvent(deal.id, req.user.id, 'etapa', det);
    notifyAdmins(req.user.id, `Movió «${d.empresa}» de ${deal.etapa} a ${d.etapa}${d.aprobacion === 'pendiente' ? ' — requiere tu aprobación' : ''}`, `/deals/${deal.id}`, d.etapa === 'Ganado' ? 'ganado' : 'cambio_etapa');
    if (d.etapa === 'Ganado' && d.aprobacion === 'aprobado') C.generarComisiones({ ...d, id: deal.id });
    if (deal.etapa === 'Ganado' && d.etapa !== 'Ganado') C.cancelarPendientes(deal.id);
  } else if (otros.length) {
    logDealEvent(deal.id, req.user.id, 'edicion', otros.join(' · '));
  }
  if (d.nota) logDealEvent(deal.id, req.user.id, 'edicion', `Nota: ${d.nota}`);
  // Si la lead la modificó otra persona (típicamente el admin), el vendedor dueño se entera.
  if (req.user.id !== d.user_id && (cambioEtapa || otros.length || d.nota)) {
    const resumen = cambioEtapa ? `${deal.etapa} → ${d.etapa}` : (otros.length ? otros.slice(0, 2).join(' · ') : 'nueva nota');
    notifyUser(d.user_id, `Modificó tu lead «${d.empresa}»: ${resumen}`, `/deals/${deal.id}`, null, req.user.id);
  }
  res.redirect(home);
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
  db.prepare("UPDATE deals SET etapa = ?, fecha_cierre = ?, aprobacion = ?, updated_at = datetime('now') WHERE id = ?").run(etapa, fechaCierre, aprobacion, deal.id);
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
    db.prepare("UPDATE deals SET aprobacion = 'aprobado', updated_at = datetime('now') WHERE id = ?").run(deal.id);
    logDealEvent(deal.id, req.user.id, 'etapa', 'Venta aprobada — impacta en métricas y cobranza');
    C.generarComisiones({ ...deal, aprobacion: 'aprobado' });
    if (deal.user_id !== req.user.id) {
      notifyUser(deal.user_id, `Aprobó tu venta «${deal.empresa}» (${money2(deal.mrr)}) — tu comisión ya está en Cobranza`, `/cobranza/vendedor/${deal.user_id}`, null, req.user.id);
    }
  }
  res.redirect(`/deals/${req.params.id}`);
});

const money2 = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

app.post('/deals/:id/delete', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
  res.redirect('/pipeline');
});

/* ---------------- actividad ---------------- */

// Ventana de carga: hoy y hasta 3 días atrás (el admin no tiene límite).
function ventanaFechas() {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(hoyAR() + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Resuelve a quién y qué fecha se carga (vendedor: solo él, ventana de 3 días; admin: cualquiera, fecha libre).
function targetActividad(req, fuente) {
  const esAdmin = req.user.role === 'admin';
  let target = { id: req.user.id, name: req.user.name };
  const vendedorId = parseInt(fuente.vendedor || fuente.user_id, 10);
  if (esAdmin && Number.isFinite(vendedorId)) {
    const t = db.prepare('SELECT id, name FROM users WHERE id = ? AND active = 1').get(vendedorId);
    if (t) target = t;
  }
  let fecha = cleanDate(fuente.fecha) || hoyAR();
  if (!esAdmin && !ventanaFechas().includes(fecha)) fecha = hoyAR();
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
  res.send(V.adminPage({ user: req.user, users: usuariosAdmin(), sistemas: SISTEMAS }));
});

// Sección Comunicación: avisos (con quién los vio) y alertas modales.
app.get('/admin/comunicacion', requireAuth, requireAdmin, (req, res) => {
  const avisos = db.prepare(`SELECT lote, MIN(texto) texto, MIN(created_at) created_at, COUNT(*) total, SUM(leida) vistos
    FROM notifications WHERE lote IS NOT NULL GROUP BY lote ORDER BY MIN(created_at) DESC LIMIT 10`).all()
    .map((a) => ({ ...a, destinatarios: db.prepare('SELECT u.name, n.leida, n.leida_at FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.lote = ? ORDER BY n.leida DESC, u.name').all(a.lote) }));
  const totalUsuarios = db.prepare('SELECT COUNT(*) c FROM users WHERE active = 1').get().c;
  const banners = db.prepare('SELECT b.*, (SELECT COUNT(*) FROM banner_vistos v WHERE v.banner_id = b.id) vistos FROM banners b ORDER BY b.id DESC LIMIT 10').all()
    .map((b) => ({ ...b, quienes: db.prepare('SELECT u.name, v.visto_at FROM banner_vistos v JOIN users u ON u.id = v.user_id WHERE v.banner_id = ? ORDER BY v.visto_at').all(b.id) }));
  res.send(V.adminComunicacionPage({ user: req.user, users: usuariosAdmin(), avisos, banners, totalUsuarios }));
});

// Sección Preferencias: notificaciones del propio admin.
app.get('/admin/preferencias', requireAuth, requireAdmin, (req, res) => {
  let prefs = {}; try { prefs = JSON.parse(db.prepare('SELECT notif_prefs FROM users WHERE id = ?').get(req.user.id).notif_prefs || '{}'); } catch {}
  res.send(V.adminPreferenciasPage({ user: req.user, prefs }));
});

// Ficha del usuario: datos, permisos y su historial de acciones.
app.get('/admin/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const target = usuariosAdmin().find((u) => u.id === parseInt(req.params.id, 10));
  if (!target) return res.redirect('/admin');
  res.send(V.adminUserPage({ user: req.user, target, sistemas: SISTEMAS, historial: historialUsuario(target.id) }));
});

app.post('/admin/usuarios', requireAuth, requireAdmin, (req, res) => {
  const name = clean(req.body.name); const email = clean(req.body.email)?.toLowerCase();
  const password = req.body.password || '';
  const role = ROLES.includes(req.body.role) ? req.body.role : 'vendedor';
  if (name && email && password.length >= 6) {
    try {
      const r = db.prepare('INSERT INTO users (name, email, password_hash, role, permisos) VALUES (?, ?, ?, ?, ?)')
        .run(name, email, bcrypt.hashSync(password, 10), role, permisosDeBody(req.body));
      logUserEvent(r.lastInsertRowid, 'cuenta', `Cuenta creada por ${req.user.name}`);
    } catch (e) { /* email duplicado: ignorar y volver a la lista */ }
  }
  res.redirect('/admin');
});

// Cambiar rol (promocionar/degradar) y permisos por sistema.
app.post('/admin/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (target && target.id !== req.user.id) {
    const role = ROLES.includes(req.body.role) ? req.body.role : 'vendedor';
    db.prepare('UPDATE users SET role = ?, permisos = ? WHERE id = ?').run(role, permisosDeBody(req.body), target.id);
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
    try { const v = JSON.parse(r.valores || '{}'); for (const c of campos) add(r.fecha, 'c' + c.id, v['c' + c.id]); } catch {}
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
      try { const v = JSON.parse(r.valores || '{}'); for (const k of keys) act[k] += Number(v[k]) || 0; } catch {}
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
  const sinPaso = db.prepare(`SELECT d.id, d.empresa, d.etapa, d.updated_at, u.name vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE d.panel = ? AND d.etapa NOT IN ('Ganado','Perdido') AND d.fecha_proximo_paso IS NULL ORDER BY d.updated_at ASC`).all(slug);
  const estancados = db.prepare(`SELECT d.id, d.empresa, d.etapa, d.updated_at, u.name vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE d.panel = ? AND d.etapa NOT IN ('Ganado','Perdido') AND d.updated_at < datetime('now','-14 days') ORDER BY d.updated_at ASC`).all(slug);
  const provincias = db.prepare(`SELECT COALESCE(NULLIF(provincia,''),'Sin provincia') label, COUNT(*) n FROM deals
    WHERE panel = ? AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY label ORDER BY n DESC LIMIT 12`).all(slug, desde, hasta);
  const campanas = statsCampanas(slug, desde, hasta);
  return { desde, hasta, r, etapas, colores, funnel, activos, enJuego, curva, curvaLabel: campoCurva ? campoCurva.label : '', sinPaso, estancados, provincias, campanas, esCfd: slug === 'cfd' };
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
    WHERE ${where.join(' AND ')} ORDER BY d.fecha_proximo_paso IS NULL DESC, d.fecha_proximo_paso ASC, d.updated_at DESC`).all(...params);
  return { scope, closed, ...filtrarPipeline(req, deals) };
}

// Sumas de un vendedor en el período: campos dinámicos (JSON) + ventas aprobadas del panel.
function panelStats(slug, userId, desde) {
  const tot = { ganados: 0, ingresos: 0 };
  for (const c of camposPanel(slug)) tot['c' + c.id] = 0;
  for (const row of db.prepare('SELECT valores FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(slug, userId, desde)) {
    try { const v = JSON.parse(row.valores || '{}'); for (const k of Object.keys(v)) if (k in tot) tot[k] += Number(v[k]) || 0; } catch {}
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
    res.send(V.pipelinePage({ user: req.user, ...panelPipelineData(req, slug), ...panelOpts(slug) }));
  });

  app.get(base + '/actividad', requireAuth, requireSistema(slug), (req, res) => {
    const { esAdmin, target, fecha } = targetActividad(req, req.query);
    const today = db.prepare('SELECT * FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha = ?').get(slug, target.id, fecha);
    const history = db.prepare('SELECT * FROM panel_activity WHERE panel = ? AND user_id = ? ORDER BY fecha DESC LIMIT 14').all(slug, target.id);
    const ventana = ventanaFechas();
    const cargadas = db.prepare('SELECT fecha FROM panel_activity WHERE panel = ? AND user_id = ? AND fecha >= ?').all(slug, target.id, ventana[3]).map((r) => r.fecha);
    const vendedores = esAdmin ? db.prepare("SELECT id, name FROM users WHERE active = 1 AND role != 'developer' ORDER BY name").all() : [];
    res.send(V.panelActividadPage({ user: req.user, campos: camposPanel(slug), today, history, info, fecha, ventana, cargadas, esAdmin, target, vendedores, base }));
  });

  app.post(base + '/actividad', requireAuth, requireSistema(slug), (req, res) => {
    const { esAdmin, target, fecha } = targetActividad(req, req.body);
    const valores = {};
    for (const c of camposPanel(slug)) valores['c' + c.id] = cleanInt(req.body['c' + c.id]);
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

  app.get(base + '/dashboard.csv', requireAuth, requireAdmin, (req, res) => {
    const d = datosDash(req);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${slug}-${d.p}-${d.desde}.csv"`);
    res.send('﻿' + csvDashboard(d, d.p, info));
  });

  /* --- configuración del panel (solo admin) --- */

  app.get(base + '/config', requireAuth, requireAdmin, (req, res) => {
    res.send(V.panelConfigPage({ user: req.user, etapas: etapasPanelCfg(slug), campos: camposPanel(slug), err: req.query.err, errEtapa: clean(req.query.etapa), errN: parseInt(req.query.n, 10) || 0, info, campanas: campanasDePanel(slug) }));
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
      const dir = accion === 'subir' ? -1 : 1;
      const vecino = db.prepare('SELECT * FROM panel_etapas WHERE panel = ? AND orden = ?').get(slug, etapa.orden + dir);
      if (vecino) {
        db.prepare('UPDATE panel_etapas SET orden = ? WHERE id = ?').run(vecino.orden, etapa.id);
        db.prepare('UPDATE panel_etapas SET orden = ? WHERE id = ?').run(etapa.orden, vecino.id);
      }
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
    if (label) {
      const max = db.prepare('SELECT COALESCE(MAX(orden),0) m FROM panel_campos WHERE panel = ?').get(slug).m;
      db.prepare('INSERT INTO panel_campos (panel, label, orden) VALUES (?, ?, ?)').run(slug, label, max + 1);
    }
    res.redirect(base + '/config');
  });

  app.post(base + '/config/campos/:id', requireAuth, requireAdmin, (req, res) => {
    const campo = db.prepare('SELECT * FROM panel_campos WHERE id = ? AND panel = ?').get(req.params.id, slug);
    if (!campo) return res.redirect(base + '/config');
    if (req.body.accion === 'renombrar') {
      const label = clean(req.body.label);
      if (label) db.prepare('UPDATE panel_campos SET label = ? WHERE id = ?').run(label, campo.id);
    } else if (req.body.accion === 'borrar') {
      db.prepare('DELETE FROM panel_campos WHERE id = ?').run(campo.id);
    }
    res.redirect(base + '/config');
  });
}

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

/* ---------------- campus de formación (docs y videos por empresa) ---------------- */

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
const empresaCampus = (e) => (CAMPUS_EMPRESAS.some(([s]) => s === e) ? e : 'general');

// Un contenido está "completado" para el usuario: video subido → 80% real reproducido;
// YouTube/Vimeo, documentos y enlaces → lo reprodujo/abrió al menos una vez.
function itemCompletadoCampus(item, userId) {
  const v = db.prepare('SELECT * FROM campus_vistas WHERE item_id = ? AND user_id = ?').get(item.id, userId);
  if (!v) return false;
  if (/\.(mp4|webm|mov)$/i.test(item.archivo || '')) return !!v.completado_at;
  return v.veces > 0 || v.segundos > 0;
}

// Curso secuencial: cada contenido se desbloquea al completar el anterior de su empresa (los admins ven todo).
function itemBloqueadoCampus(user, itemId) {
  if (user.role === 'admin') return false;
  const it = db.prepare('SELECT * FROM campus_items WHERE id = ?').get(itemId);
  if (!it) return true;
  const lista = db.prepare('SELECT * FROM campus_items WHERE empresa = ? ORDER BY orden ASC, id ASC').all(it.empresa);
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
// Abrir un documento cuenta como vista (los navegadores piden el video por rangos: solo cuenta el primer pedido).
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

// Progreso de un video subido: hasta dónde llegó (máximo histórico) + segundos realmente
// reproducidos (el cliente manda el delta de reproducción real, no cuenta los saltos de barra).
// "Completado" = reprodujo de verdad al menos el 80% del video (saltar la barra no suma).
app.post('/campus/progreso/:id', requireAuth, (req, res) => {
  const seg = Math.max(0, parseFloat(req.body.segundos) || 0);
  const dur = Math.max(0, parseFloat(req.body.duracion) || 0) || null;
  const rep = Math.max(0, Math.min(30, parseFloat(req.body.rep) || 0)); // delta acotado (se manda cada ~10s)
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

// Estadísticas de aprendizaje (solo admin): quién vio qué, hasta dónde, y horas por persona.
app.get('/campus/estadisticas', requireAuth, requireAdmin, (req, res) => {
  const esVideo = (i) => !!(i.url || /\.(mp4|webm|mov)$/i.test(i.archivo || ''));
  const items = db.prepare('SELECT i.*, u.name AS autor FROM campus_items i JOIN users u ON u.id = i.created_by ORDER BY i.id DESC').all();
  const vistas = db.prepare(`SELECT v.*, u.name, u.avatar, u.role, u.active FROM campus_vistas v JOIN users u ON u.id = v.user_id`).all();
  const porItem = items.map((i) => ({
    ...i, esVideo: esVideo(i),
    vistos: vistas.filter((v) => v.item_id === i.id).sort((a, b) => b.segundos - a.segundos || a.name.localeCompare(b.name)),
  }));
  const usuarios = db.prepare("SELECT id, name, avatar, role FROM users WHERE active = 1 AND role != 'developer' ORDER BY name").all()
    .map((u) => {
      const mias = vistas.filter((v) => v.user_id === u.id);
      return {
        ...u,
        contenidos: mias.length,
        completados: mias.filter((v) => v.completado_at).length,
        segundos: mias.reduce((a, v) => a + (v.reproducido || v.segundos || 0), 0),
        ultima: mias.reduce((a, v) => (v.ultima_vista > a ? v.ultima_vista : a), ''),
      };
    })
    .sort((a, b) => b.segundos - a.segundos || b.contenidos - a.contenidos);
  const totalVendedores = usuarios.filter((u) => u.role === 'vendedor').length;
  res.send(V.campusStatsPage({ user: req.user, empresas: CAMPUS_EMPRESAS, porItem, usuarios, totalVendedores }));
});

app.get('/campus/:empresa', requireAuth, (req, res) => {
  const empresa = empresaCampus(req.params.empresa);
  const items = db.prepare(`SELECT i.*, u.name AS autor,
      (SELECT COUNT(*) FROM campus_vistas v WHERE v.item_id = i.id) AS vistos
    FROM campus_items i JOIN users u ON u.id = i.created_by WHERE i.empresa = ? ORDER BY i.orden ASC, i.id ASC`).all(empresa);
  // Cadena de desbloqueo: un contenido se abre cuando el anterior está completado.
  let prevOk = true, prevTitulo = null;
  for (const it of items) {
    it.completado = itemCompletadoCampus(it, req.user.id);
    it.bloqueado = req.user.role !== 'admin' && !prevOk;
    it.requiere = it.bloqueado ? prevTitulo : null;
    prevOk = it.completado;
    prevTitulo = it.titulo;
  }
  res.send(V.campusPage({ user: req.user, empresa, empresas: CAMPUS_EMPRESAS, items }));
});

app.post('/campus/items', requireAuth, requireAdmin, uploadCampus.single('archivo'), (req, res) => {
  const empresa = empresaCampus(req.body.empresa);
  const titulo = clean(req.body.titulo);
  const url = clean(req.body.url);
  if (titulo && (url || req.file)) {
    const orden = (db.prepare('SELECT COALESCE(MAX(orden), 0) m FROM campus_items WHERE empresa = ?').get(empresa).m) + 1;
    db.prepare('INSERT INTO campus_items (empresa, titulo, descripcion, url, archivo, archivo_nombre, orden, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(empresa, titulo, clean(req.body.descripcion), url || null, req.file ? req.file.filename : null, req.file ? req.file.originalname : null, orden, req.user.id);
  } else if (req.file) {
    try { fs.unlinkSync(path.join(CAMPUS_DIR, req.file.filename)); } catch {}
  }
  res.redirect(`/campus/${empresa}`);
});

app.post('/campus/items/:id/mover', requireAuth, requireAdmin, (req, res) => {
  const it = db.prepare('SELECT * FROM campus_items WHERE id = ?').get(req.params.id);
  if (it) {
    const dir = req.body.dir === 'subir' ? 'DESC' : 'ASC';
    const vecino = db.prepare(`SELECT * FROM campus_items WHERE empresa = ? AND (orden ${req.body.dir === 'subir' ? '<' : '>'} ? OR (orden = ? AND id ${req.body.dir === 'subir' ? '<' : '>'} ?)) ORDER BY orden ${dir}, id ${dir} LIMIT 1`)
      .get(it.empresa, it.orden, it.orden, it.id);
    if (vecino) {
      db.prepare('UPDATE campus_items SET orden = ? WHERE id = ?').run(vecino.orden, it.id);
      db.prepare('UPDATE campus_items SET orden = ? WHERE id = ?').run(it.orden, vecino.id);
      // si compartían el mismo orden (datos viejos), se separan para que el swap sea real
      if (vecino.orden === it.orden) db.prepare('UPDATE campus_items SET orden = orden + 1 WHERE id = ?').run(vecino.id);
    }
  }
  res.redirect(`/campus/${it ? it.empresa : 'general'}`);
});

app.post('/campus/items/:id/borrar', requireAuth, requireAdmin, (req, res) => {
  const it = db.prepare('SELECT * FROM campus_items WHERE id = ?').get(req.params.id);
  if (it) {
    db.prepare('DELETE FROM campus_items WHERE id = ?').run(it.id);
    if (it.archivo) { try { fs.unlinkSync(path.join(CAMPUS_DIR, it.archivo)); } catch {} }
  }
  res.redirect(`/campus/${it ? it.empresa : 'general'}`);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Panel Comercial corriendo en http://localhost:${PORT}`));
