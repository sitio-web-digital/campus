const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { db, seedAdmin, getSessionSecret, ETAPAS, ETAPAS_ACTIVAS, ORIGENES, MOTIVOS, TIPOS_VENTA, SISTEMAS } = require('./db');
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
  const u = db.prepare('SELECT id, name, email, role, active, permisos FROM users WHERE id = ? AND active = 1').get(req.session.uid) || null;
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
  req.user = user;
  next();
}

/* --- historial de deals y notificaciones --- */

function logDealEvent(dealId, userId, tipo, detalle) {
  db.prepare('INSERT INTO deal_events (deal_id, user_id, tipo, detalle) VALUES (?, ?, ?, ?)').run(dealId, userId, tipo, detalle);
}

// Notifica a todos los admins activos menos al que hizo la acción.
function notifyAdmins(actorId, texto, url) {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 AND id != ?").all(actorId);
  const ins = db.prepare('INSERT INTO notifications (user_id, texto, url) VALUES (?, ?, ?)');
  for (const a of admins) ins.run(a.id, texto, url);
}

// Notifica a un usuario puntual (ej: al vendedor cuando le aprueban una venta).
function notifyUser(userId, texto, url) {
  db.prepare('INSERT INTO notifications (user_id, texto, url) VALUES (?, ?, ?)').run(userId, texto, url);
}

const CAMPOS_DEAL = {
  empresa: 'Empresa', tipo_venta: 'Tipo de venta', mrr: 'Valor', decisor: 'Decisor', origen: 'Origen',
  proximo_paso: 'Próximo paso', fecha_proximo_paso: 'Fecha próximo paso',
  fecha_primera_reunion: 'Fecha primera reunión', fecha_cierre: 'Fecha de cierre',
  motivo_perdida: 'Motivo de pérdida', notas: 'Notas', user_id: 'Vendedor',
};

function diffDeal(antes, despues) {
  const cambios = [];
  for (const [campo, label] of Object.entries(CAMPOS_DEAL)) {
    const a = antes[campo] ?? null, b = despues[campo] ?? null;
    if (String(a ?? '') === String(b ?? '')) continue;
    if (campo === 'user_id') {
      const nombre = (id) => db.prepare('SELECT name FROM users WHERE id = ?').get(id)?.name || '—';
      cambios.push(`${label}: ${nombre(a)} → ${nombre(b)}`);
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

// Etapas válidas según el panel: CFD fijas; Góndolas dinámicas + Ganado/Perdido (fijas por la lógica de aprobación).
function etapasDePanel(panel) {
  if (panel === 'gondolas') {
    const din = db.prepare('SELECT nombre FROM gondolas_etapas ORDER BY orden').all().map((r) => r.nombre);
    return [...din, 'Ganado', 'Perdido'];
  }
  return ETAPAS;
}

// Paleta para etapas dinámicas de Góndolas (por orden) + fijas.
function coloresDePanel(panel) {
  if (panel !== 'gondolas') return null;
  const paleta = ['#8494A6', '#4A90C8', '#2E7BB8', '#1D6FB8', '#14538C', '#0F3459', '#5A7CA6', '#3E6B96', '#6B8CAE', '#48627E'];
  const map = {};
  db.prepare('SELECT nombre FROM gondolas_etapas ORDER BY orden').all().forEach((r, i) => { map[r.nombre] = paleta[i % paleta.length]; });
  map['Ganado'] = '#3E9B57'; map['Perdido'] = '#C05450';
  return map;
}

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
    origen: cleanEnum(body.origen, ORIGENES),
    proximo_paso: clean(body.proximo_paso),
    fecha_proximo_paso: cleanDate(body.fecha_proximo_paso),
    fecha_primera_reunion: cleanDate(body.fecha_primera_reunion),
    fecha_cierre: cleanDate(body.fecha_cierre),
    motivo_perdida: cleanEnum(body.motivo_perdida, MOTIVOS),
    notas: clean(body.notas),
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
  res.redirect('/');
});

app.post('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

app.get('/', requireAuth, (req, res) => res.redirect('/hub'));

app.get('/hub', requireAuth, (req, res) => res.send(V.hubPage({ user: req.user })));

/* ---------------- pipeline / deals ---------------- */

function pipelineData(req) {
  const scope = req.query.scope === 'todos' ? 'todos' : 'mios';
  const closed = req.query.cerrados === '1';
  const params = [];
  const where = [];
  if (closed) {
    where.push("d.etapa IN ('Ganado','Perdido')");
  } else {
    // Tablero activo: etapas abiertas + cerrados del mes actual (columnas Ganado/Perdido).
    where.push("(d.etapa NOT IN ('Ganado','Perdido') OR d.fecha_cierre >= ?)");
    params.push(inicioMes());
  }
  where.push("d.panel = 'cfd'");
  if (scope === 'mios') { where.push('d.user_id = ?'); params.push(req.user.id); }
  const deals = db.prepare(`
    SELECT d.*, u.name AS vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE ${where.join(' AND ')}
    ORDER BY d.fecha_proximo_paso IS NULL DESC, d.fecha_proximo_paso ASC, d.updated_at DESC
  `).all(...params);
  return { deals, scope, closed };
}

app.get('/pipeline', requireAuth, requireSistema('cfd'), (req, res) => {
  res.send(V.pipelinePage({ user: req.user, ...pipelineData(req) }));
});

// Fondo de tablero + modal según el panel del deal.
function renderModalSobrePipeline(req, res, modal, panel) {
  if (panel === 'gondolas') {
    const data = gondolasPipelineData(req);
    return res.send(V.pipelinePage({ user: req.user, ...data, modal, ...gondolasOpts() }));
  }
  res.send(V.pipelinePage({ user: req.user, ...pipelineData(req), modal }));
}

app.get('/deals/new', requireAuth, (req, res) => {
  const panel = req.query.panel === 'gondolas' ? 'gondolas' : 'cfd';
  if (!puede(req.user, panel)) return res.status(403).send('Sin acceso a este panel.');
  const vendedores = db.prepare('SELECT id, name FROM users WHERE active = 1 ORDER BY name').all();
  const modal = V.dealFormModal({
    user: req.user, deal: null, vendedores, isAdmin: req.user.role === 'admin',
    panel, etapas: etapasDePanel(panel), backHref: panel === 'gondolas' ? '/gondolas/pipeline' : '/pipeline',
  });
  renderModalSobrePipeline(req, res, modal, panel);
});

app.post('/deals', requireAuth, (req, res) => {
  const panel = req.body.panel === 'gondolas' ? 'gondolas' : 'cfd';
  if (!puede(req.user, panel)) return res.status(403).send('Sin acceso a este panel.');
  const home = panel === 'gondolas' ? '/gondolas/pipeline' : '/pipeline';
  const d = dealFromBody(req.body, req.user, panel);
  if (!d.empresa) return res.redirect(home);
  // Ganado por admin CON valor cargado: aprobado directo. Sin valor o ganado por vendedor: pendiente.
  d.aprobacion = d.etapa === 'Ganado' ? (req.user.role === 'admin' && d.mrr > 0 ? 'aprobado' : 'pendiente') : null;
  const r = db.prepare(`INSERT INTO deals (empresa, user_id, panel, etapa, tipo_venta, mrr, decisor, origen, proximo_paso, fecha_proximo_paso, fecha_primera_reunion, fecha_cierre, motivo_perdida, notas, aprobacion)
    VALUES (@empresa, @user_id, @panel, @etapa, @tipo_venta, @mrr, @decisor, @origen, @proximo_paso, @fecha_proximo_paso, @fecha_primera_reunion, @fecha_cierre, @motivo_perdida, @notas, @aprobacion)`).run(d);
  logDealEvent(r.lastInsertRowid, req.user.id, 'creado', `Deal creado en etapa ${d.etapa}`);
  notifyAdmins(req.user.id, `Deal nuevo: «${d.empresa}» (${d.etapa}) — ${req.user.name}${d.aprobacion === 'pendiente' ? ' — requiere aprobación' : ''}`, `/deals/${r.lastInsertRowid}`);
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
  const modal = V.dealFormModal({
    user: req.user, deal, vendedores, isAdmin: req.user.role === 'admin', eventos, errAprob: req.query.err === 'valor',
    panel: deal.panel, etapas: etapasDePanel(deal.panel), backHref: deal.panel === 'gondolas' ? '/gondolas/pipeline' : '/pipeline',
  });
  renderModalSobrePipeline(req, res, modal, deal.panel);
});

app.post('/deals/:id', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.redirect('/hub');
  if (!puede(req.user, deal.panel)) return res.status(403).send('Sin acceso a este panel.');
  const home = deal.panel === 'gondolas' ? '/gondolas/pipeline' : '/pipeline';
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
  db.prepare(`UPDATE deals SET empresa=@empresa, user_id=@user_id, panel=@panel, etapa=@etapa, tipo_venta=@tipo_venta, mrr=@mrr, decisor=@decisor, origen=@origen,
    proximo_paso=@proximo_paso, fecha_proximo_paso=@fecha_proximo_paso, fecha_primera_reunion=@fecha_primera_reunion,
    fecha_cierre=@fecha_cierre, motivo_perdida=@motivo_perdida, notas=@notas, aprobacion=@aprobacion, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...d, id: deal.id });

  // Historial: cambio de etapa es un evento propio; el resto va como edición.
  const otros = diffDeal(deal, d);
  if (cambioEtapa) {
    const det = [`${deal.etapa} → ${d.etapa}`, ...otros].join(' · ');
    logDealEvent(deal.id, req.user.id, 'etapa', det);
    notifyAdmins(req.user.id, `«${d.empresa}»: ${deal.etapa} → ${d.etapa} — ${req.user.name}${d.aprobacion === 'pendiente' ? ' — requiere aprobación' : ''}`, `/deals/${deal.id}`);
    if (d.etapa === 'Ganado' && d.aprobacion === 'aprobado') C.generarComisiones({ ...d, id: deal.id });
    if (deal.etapa === 'Ganado' && d.etapa !== 'Ganado') C.cancelarPendientes(deal.id);
  } else if (otros.length) {
    logDealEvent(deal.id, req.user.id, 'edicion', otros.join(' · '));
  }
  res.redirect(home);
});

// Cambio de etapa desde el tablero (drag & drop).
app.post('/deals/:id/etapa', requireAuth, (req, res) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!deal) return res.status(404).end();
  if (!puede(req.user, deal.panel)) return res.status(403).end();
  if (req.user.role !== 'admin' && deal.user_id !== req.user.id) return res.status(403).end();
  const home = deal.panel === 'gondolas' ? '/gondolas/pipeline' : '/pipeline';
  const etapa = cleanEnum(req.body.etapa, etapasDePanel(deal.panel));
  if (!etapa || etapa === deal.etapa) return res.redirect(home);
  let fechaCierre = deal.fecha_cierre;
  if (['Ganado', 'Perdido'].includes(etapa) && !fechaCierre) fechaCierre = hoyAR();
  if (!['Ganado', 'Perdido'].includes(etapa)) fechaCierre = null; // se reabre
  const aprobacion = etapa === 'Ganado' ? (req.user.role === 'admin' && deal.mrr > 0 ? 'aprobado' : 'pendiente') : null;
  db.prepare("UPDATE deals SET etapa = ?, fecha_cierre = ?, aprobacion = ?, updated_at = datetime('now') WHERE id = ?").run(etapa, fechaCierre, aprobacion, deal.id);
  logDealEvent(deal.id, req.user.id, 'etapa', `${deal.etapa} → ${etapa}`);
  notifyAdmins(req.user.id, `«${deal.empresa}»: ${deal.etapa} → ${etapa} — ${req.user.name}${aprobacion === 'pendiente' ? ' — requiere aprobación' : ''}`, `/deals/${deal.id}`);
  if (etapa === 'Ganado' && aprobacion === 'aprobado') C.generarComisiones({ ...deal, etapa, fecha_cierre: fechaCierre });
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
      notifyUser(deal.user_id, `¡Venta aprobada! «${deal.empresa}» (${money2(deal.mrr)}) — tu comisión ya está en Cobranza`, `/cobranza/vendedor/${deal.user_id}`);
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

app.get('/actividad', requireAuth, requireSistema('cfd'), (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const today = db.prepare('SELECT * FROM activity WHERE user_id = ? AND fecha = ?').get(req.user.id, hoy);
  const history = db.prepare('SELECT * FROM activity WHERE user_id = ? ORDER BY fecha DESC LIMIT 14').all(req.user.id);
  res.send(V.actividadPage({ user: req.user, today, history }));
});

app.post('/actividad', requireAuth, requireSistema('cfd'), (req, res) => {
  const fecha = cleanDate(req.body.fecha) || new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO activity (user_id, fecha, contactos, toques, reuniones_agendadas, reuniones_realizadas, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, fecha) DO UPDATE SET contactos=excluded.contactos, toques=excluded.toques,
      reuniones_agendadas=excluded.reuniones_agendadas, reuniones_realizadas=excluded.reuniones_realizadas, notas=excluded.notas`)
    .run(req.user.id, fecha, cleanInt(req.body.contactos), cleanInt(req.body.toques),
      cleanInt(req.body.reuniones_agendadas), cleanInt(req.body.reuniones_realizadas), clean(req.body.notas));
  res.redirect('/actividad');
});

/* ---------------- dashboard ---------------- */

app.get('/dashboard', requireAuth, requireAdmin, (req, res) => {
  const mesInicio = new Date().toISOString().slice(0, 8) + '01';

  const funnel = {};
  for (const row of db.prepare("SELECT etapa, COUNT(*) AS n FROM deals WHERE panel = 'cfd' AND etapa NOT IN ('Ganado','Perdido') GROUP BY etapa").all()) {
    funnel[row.etapa] = row.n;
  }
  const activos = Object.values(funnel).reduce((a, b) => a + b, 0);
  const mrrJuego = db.prepare("SELECT COALESCE(SUM(mrr),0) AS s FROM deals WHERE panel = 'cfd' AND etapa IN ('Propuesta enviada','Negociación')").get().s;
  const mrrNuevoMes = db.prepare("SELECT COALESCE(SUM(mrr),0) AS s FROM deals WHERE panel = 'cfd' AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND tipo_venta != 'Proyecto único' AND fecha_cierre >= ?").get(mesInicio).s;
  const proyectosMes = db.prepare("SELECT COALESCE(SUM(mrr),0) AS s FROM deals WHERE panel = 'cfd' AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND tipo_venta = 'Proyecto único' AND fecha_cierre >= ?").get(mesInicio).s;

  const cerrados90 = db.prepare("SELECT etapa, COUNT(*) AS n FROM deals WHERE panel = 'cfd' AND (etapa = 'Perdido' OR (etapa = 'Ganado' AND aprobacion = 'aprobado')) AND fecha_cierre >= date('now','-90 days') GROUP BY etapa").all();
  const g = cerrados90.find((r) => r.etapa === 'Ganado')?.n || 0;
  const p = cerrados90.find((r) => r.etapa === 'Perdido')?.n || 0;
  const winRate = g + p > 0 ? Math.round((g / (g + p)) * 100) : null;

  const motivos = db.prepare("SELECT COALESCE(motivo_perdida,'Sin motivo cargado') AS label, COUNT(*) AS n FROM deals WHERE panel = 'cfd' AND etapa = 'Perdido' GROUP BY label ORDER BY n DESC").all();

  const actividad = db.prepare(`SELECT fecha, SUM(toques) AS v FROM activity WHERE fecha >= date('now','-13 days') GROUP BY fecha ORDER BY fecha`).all()
    .map((r) => ({ label: r.fecha.slice(8, 10) + '/' + r.fecha.slice(5, 7), v: r.v }));

  const sinPaso = db.prepare(`SELECT d.id, d.empresa, d.etapa, d.updated_at, u.name AS vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE d.panel = 'cfd' AND d.etapa NOT IN ('Ganado','Perdido') AND d.fecha_proximo_paso IS NULL ORDER BY d.updated_at ASC`).all();

  const estancados = db.prepare(`SELECT d.id, d.empresa, d.etapa, d.updated_at, u.name AS vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE d.panel = 'cfd' AND d.etapa NOT IN ('Ganado','Perdido') AND d.updated_at < datetime('now','-14 days') ORDER BY d.updated_at ASC`).all();

  const porVendedor = db.prepare(`
    SELECT u.id, u.name,
      COALESCE((SELECT SUM(a.contactos) FROM activity a WHERE a.user_id = u.id AND a.fecha >= ?), 0) AS contactos,
      COALESCE((SELECT SUM(a.toques) FROM activity a WHERE a.user_id = u.id AND a.fecha >= ?), 0) AS toques,
      COALESCE((SELECT SUM(a.reuniones_agendadas) FROM activity a WHERE a.user_id = u.id AND a.fecha >= ?), 0) AS agendadas,
      COALESCE((SELECT SUM(a.reuniones_realizadas) FROM activity a WHERE a.user_id = u.id AND a.fecha >= ?), 0) AS realizadas,
      (SELECT COUNT(*) FROM deals d WHERE d.panel = 'cfd' AND d.user_id = u.id AND d.etapa NOT IN ('Ganado','Perdido')) AS activos,
      (SELECT COUNT(*) FROM deals d WHERE d.panel = 'cfd' AND d.user_id = u.id AND d.etapa = 'Ganado' AND d.aprobacion = 'aprobado' AND d.fecha_cierre >= ?) AS ganados,
      COALESCE((SELECT SUM(d.mrr) FROM deals d WHERE d.panel = 'cfd' AND d.user_id = u.id AND d.etapa = 'Ganado' AND d.aprobacion = 'aprobado' AND d.fecha_cierre >= ?), 0) AS mrr_ganado
    FROM users u WHERE u.active = 1 ORDER BY u.name
  `).all(mesInicio, mesInicio, mesInicio, mesInicio, mesInicio, mesInicio);

  res.send(V.dashboardPage({ user: req.user, k: { funnel, activos, mrrJuego, mrrNuevoMes, proyectosMes, winRate, motivos, actividad, sinPaso, estancados, porVendedor } }));
});

/* ---------------- equipo ---------------- */

/* ---------------- panel administración (usuarios, roles y permisos) ---------------- */

const ROLES = ['admin', 'vendedor', 'developer'];

function usuariosAdmin() {
  return db.prepare('SELECT id, name, email, role, active, permisos FROM users ORDER BY role, name').all()
    .map((u) => { try { u.permisos = JSON.parse(u.permisos || '[]'); } catch { u.permisos = []; } return u; });
}

function permisosDeBody(body) {
  const validos = SISTEMAS.map(([slug]) => slug);
  let elegidos = body.permisos || [];
  if (!Array.isArray(elegidos)) elegidos = [elegidos];
  return JSON.stringify(elegidos.filter((p) => validos.includes(p)));
}

// El viejo /equipo redirige al panel nuevo.
app.get('/equipo', requireAuth, requireAdmin, (req, res) => res.redirect('/admin'));

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.send(V.adminPage({ user: req.user, users: usuariosAdmin(), sistemas: SISTEMAS }));
});

app.post('/admin/usuarios', requireAuth, requireAdmin, (req, res) => {
  const name = clean(req.body.name); const email = clean(req.body.email)?.toLowerCase();
  const password = req.body.password || '';
  const role = ROLES.includes(req.body.role) ? req.body.role : 'vendedor';
  if (name && email && password.length >= 6) {
    try {
      db.prepare('INSERT INTO users (name, email, password_hash, role, permisos) VALUES (?, ?, ?, ?, ?)')
        .run(name, email, bcrypt.hashSync(password, 10), role, permisosDeBody(req.body));
    } catch (e) { /* email duplicado: ignorar y volver a la lista */ }
  }
  res.redirect('/admin');
});

// Cambiar rol (promocionar/degradar) y permisos por sistema.
app.post('/admin/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (target && target.id !== req.user.id) {
    const role = ROLES.includes(req.body.role) ? req.body.role : 'vendedor';
    db.prepare('UPDATE users SET role = ?, permisos = ? WHERE id = ?').run(role, permisosDeBody(req.body), target.id);
  }
  res.redirect('/admin');
});

app.post('/admin/usuarios/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  if (parseInt(req.params.id, 10) !== req.user.id) {
    db.prepare('UPDATE users SET active = 1 - active WHERE id = ?').run(req.params.id);
  }
  res.redirect('/admin');
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
    const msg = `Aviso de ${req.user.name}: ${texto}`;
    for (const u of usuarios) if (u.id !== req.user.id) notifyUser(u.id, msg, '/notificaciones');
  }
  res.redirect('/admin');
});

app.post('/admin/usuarios/:id/reset', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.params.id);
  if (!target || target.id === req.user.id) return res.redirect('/admin');
  const password = require('crypto').randomBytes(4).toString('hex');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), target.id);
  res.send(V.adminPage({ user: req.user, users: usuariosAdmin(), sistemas: SISTEMAS, resetInfo: { name: target.name, password } }));
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

function statsPeriodo(userId, desde) {
  const a = db.prepare('SELECT COALESCE(SUM(toques),0) AS toques, COALESCE(SUM(reuniones_realizadas),0) AS reuniones FROM activity WHERE user_id = ? AND fecha >= ?').get(userId, desde);
  const g = db.prepare("SELECT COUNT(*) AS ganados, COALESCE(SUM(mrr),0) AS mrr FROM deals WHERE panel = 'cfd' AND user_id = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND fecha_cierre >= ?").get(userId, desde);
  return { toques: a.toques, reuniones: a.reuniones, ganados: g.ganados, mrr: g.mrr };
}

function getGoals(userId) {
  const out = { semana: null, mes: null };
  for (const row of db.prepare('SELECT * FROM goals WHERE user_id = ?').all(userId)) out[row.periodo] = row;
  return out;
}

app.get('/objetivos', requireAuth, requireSistema('cfd'), (req, res) => {
  const usuarios = req.user.role === 'admin'
    ? db.prepare("SELECT id, name FROM users WHERE active = 1 ORDER BY role = 'admin', name").all()
    : [{ id: req.user.id, name: req.user.name }];
  const desde = { semana: inicioSemana(), mes: inicioMes() };
  const data = usuarios.map((u) => ({
    u,
    goals: getGoals(u.id),
    stats: { semana: statsPeriodo(u.id, desde.semana), mes: statsPeriodo(u.id, desde.mes) },
  }));
  res.send(V.objetivosPage({ user: req.user, data, esAdmin: req.user.role === 'admin' }));
});

app.post('/objetivos/:userId', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (target) {
    const up = db.prepare(`INSERT INTO goals (user_id, periodo, toques, reuniones, ganados, mrr) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, periodo) DO UPDATE SET toques=excluded.toques, reuniones=excluded.reuniones, ganados=excluded.ganados, mrr=excluded.mrr`);
    up.run(target.id, 'semana', cleanInt(req.body.s_toques), cleanInt(req.body.s_reuniones), cleanInt(req.body.s_ganados), cleanNum(req.body.s_mrr) || 0);
    up.run(target.id, 'mes', cleanInt(req.body.m_toques), cleanInt(req.body.m_reuniones), cleanInt(req.body.m_ganados), cleanNum(req.body.m_mrr) || 0);
  }
  res.redirect('/objetivos');
});

// Objetivos generales: aplica los mismos valores a todos los vendedores activos.
app.post('/objetivos-generales', requireAuth, requireAdmin, (req, res) => {
  const up = db.prepare(`INSERT INTO goals (user_id, periodo, toques, reuniones, ganados, mrr) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, periodo) DO UPDATE SET toques=excluded.toques, reuniones=excluded.reuniones, ganados=excluded.ganados, mrr=excluded.mrr`);
  for (const u of db.prepare("SELECT id FROM users WHERE role = 'vendedor' AND active = 1").all()) {
    up.run(u.id, 'semana', cleanInt(req.body.s_toques), cleanInt(req.body.s_reuniones), cleanInt(req.body.s_ganados), cleanNum(req.body.s_mrr) || 0);
    up.run(u.id, 'mes', cleanInt(req.body.m_toques), cleanInt(req.body.m_reuniones), cleanInt(req.body.m_ganados), cleanNum(req.body.m_mrr) || 0);
  }
  res.redirect('/objetivos');
});

// Series históricas de un vendedor (diario 14d, semanal 8 sem, mensual 6 meses).
function buildSeries(act, won) {
  const sum = {};
  const add = (k, campo, v) => { (sum[k] = sum[k] || { toques: 0, reuniones: 0, mrr: 0 })[campo] += v || 0; };
  for (const a of act) { add(a.fecha, 'toques', a.toques); add(a.fecha, 'reuniones', a.reuniones); }
  for (const w of won) if (w.fecha) add(w.fecha, 'mrr', w.mrr);
  const get = (k) => sum[k] || { toques: 0, reuniones: 0, mrr: 0 };
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
    const t = { toques: 0, reuniones: 0, mrr: 0 };
    for (let j = 0; j < 7; j++) {
      const d = new Date(s); d.setUTCDate(d.getUTCDate() + j);
      const g = get(d.toISOString().slice(0, 10));
      t.toques += g.toques; t.reuniones += g.reuniones; t.mrr += g.mrr;
    }
    const k = s.toISOString().slice(0, 10);
    semanal.push({ label: `${+k.slice(8, 10)}/${+k.slice(5, 7)}`, ...t });
  }
  const MES_N = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mensual = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(hoy.slice(0, 8) + '01T00:00:00Z'); m.setUTCMonth(m.getUTCMonth() - i);
    const clave = m.toISOString().slice(0, 7);
    const t = { toques: 0, reuniones: 0, mrr: 0 };
    for (const k of Object.keys(sum)) if (k.slice(0, 7) === clave) { const g = sum[k]; t.toques += g.toques; t.reuniones += g.reuniones; t.mrr += g.mrr; }
    mensual.push({ label: MES_N[+clave.slice(5, 7) - 1], ...t });
  }
  return { diario, semanal, mensual };
}

app.get('/metas/:userId', requireAuth, requireSistema('cfd'), (req, res) => {
  const uid = parseInt(req.params.userId, 10);
  if (req.user.role !== 'admin' && uid !== req.user.id) return res.status(403).send('Solo podés ver tus propias gráficas.');
  const vendedor = db.prepare('SELECT id, name FROM users WHERE id = ?').get(uid);
  if (!vendedor) return res.redirect('/objetivos');
  const desde = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const act = db.prepare('SELECT fecha, toques, reuniones_realizadas AS reuniones FROM activity WHERE user_id = ? AND fecha >= ?').all(uid, desde);
  const won = db.prepare("SELECT fecha_cierre AS fecha, mrr FROM deals WHERE panel = 'cfd' AND user_id = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND fecha_cierre >= ?").all(uid, desde);
  res.send(V.metasDetallePage({ user: req.user, vendedor, series: buildSeries(act, won) }));
});

/* ---------------- reportes (admin) ---------------- */

function rangoPeriodo(p, off) {
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

function reporteData(desde, hasta) {
  const usuarios = db.prepare('SELECT id, name FROM users WHERE active = 1 ORDER BY name').all();
  const porVendedor = usuarios.map((u) => {
    const a = db.prepare('SELECT COALESCE(SUM(contactos),0) c, COALESCE(SUM(toques),0) t, COALESCE(SUM(reuniones_agendadas),0) ra, COALESCE(SUM(reuniones_realizadas),0) rr FROM activity WHERE user_id = ? AND fecha BETWEEN ? AND ?').get(u.id, desde, hasta);
    const creados = db.prepare("SELECT COUNT(*) n FROM deals WHERE panel = 'cfd' AND user_id = ? AND substr(created_at,1,10) BETWEEN ? AND ?").get(u.id, desde, hasta).n;
    const g = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(mrr),0) m FROM deals WHERE panel = 'cfd' AND user_id = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND fecha_cierre BETWEEN ? AND ?").get(u.id, desde, hasta);
    const perdidos = db.prepare("SELECT COUNT(*) n FROM deals WHERE panel = 'cfd' AND user_id = ? AND etapa = 'Perdido' AND fecha_cierre BETWEEN ? AND ?").get(u.id, desde, hasta).n;
    return { name: u.name, contactos: a.c, toques: a.t, agendadas: a.ra, realizadas: a.rr, creados, ganados: g.n, perdidos, mrr: g.m };
  });
  const tot = porVendedor.reduce((acc, v) => {
    for (const k of ['contactos', 'toques', 'agendadas', 'realizadas', 'creados', 'ganados', 'perdidos', 'mrr']) acc[k] = (acc[k] || 0) + v[k];
    return acc;
  }, {});
  const motivos = db.prepare("SELECT COALESCE(motivo_perdida,'Sin motivo') label, COUNT(*) n FROM deals WHERE panel = 'cfd' AND etapa = 'Perdido' AND fecha_cierre BETWEEN ? AND ? GROUP BY label ORDER BY n DESC").all(desde, hasta);
  const cerrados = db.prepare(`SELECT d.empresa, d.etapa, d.tipo_venta, d.mrr, d.fecha_cierre, d.motivo_perdida, u.name vendedor FROM deals d JOIN users u ON u.id = d.user_id
    WHERE d.panel = 'cfd' AND (d.etapa = 'Perdido' OR (d.etapa = 'Ganado' AND d.aprobacion = 'aprobado')) AND d.fecha_cierre BETWEEN ? AND ? ORDER BY d.fecha_cierre`).all(desde, hasta);
  const mrrNuevo = db.prepare("SELECT COALESCE(SUM(mrr),0) s FROM deals WHERE panel = 'cfd' AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND tipo_venta != 'Proyecto único' AND fecha_cierre BETWEEN ? AND ?").get(desde, hasta).s;
  const ingresosProyectos = db.prepare("SELECT COALESCE(SUM(mrr),0) s FROM deals WHERE panel = 'cfd' AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND tipo_venta = 'Proyecto único' AND fecha_cierre BETWEEN ? AND ?").get(desde, hasta).s;
  const winRate = tot.ganados + tot.perdidos > 0 ? Math.round((tot.ganados / (tot.ganados + tot.perdidos)) * 100) : null;
  return { porVendedor, tot, motivos, cerrados, winRate, mrrNuevo, ingresosProyectos };
}

app.get('/reportes', requireAuth, requireAdmin, (req, res) => {
  const p = req.query.p === 'mes' ? 'mes' : 'semana';
  const off = Math.min(11, Math.max(0, parseInt(req.query.off, 10) || 0));
  const { desde, hasta } = rangoPeriodo(p, off);
  const periodos = Array.from({ length: 8 }, (_, i) => { const r = rangoPeriodo(p, i); return { off: i, label: `${r.desde} a ${r.hasta}` }; });
  res.send(V.reportesPage({ user: req.user, p, off, desde, hasta, periodos, r: reporteData(desde, hasta) }));
});

app.get('/reportes.csv', requireAuth, requireAdmin, (req, res) => {
  const p = req.query.p === 'mes' ? 'mes' : 'semana';
  const off = Math.min(11, Math.max(0, parseInt(req.query.off, 10) || 0));
  const { desde, hasta } = rangoPeriodo(p, off);
  const r = reporteData(desde, hasta);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  lines.push(`Reporte ${p === 'mes' ? 'mensual' : 'semanal'};${desde} a ${hasta}`);
  lines.push('');
  lines.push(['Vendedor', 'Contactos', 'Toques', 'Reuniones agendadas', 'Reuniones realizadas', 'Deals creados', 'Ganados', 'Perdidos', 'Ingresos ganados'].join(';'));
  for (const v of r.porVendedor) lines.push([esc(v.name), v.contactos, v.toques, v.agendadas, v.realizadas, v.creados, v.ganados, v.perdidos, v.mrr].join(';'));
  lines.push([esc('TOTAL'), r.tot.contactos, r.tot.toques, r.tot.agendadas, r.tot.realizadas, r.tot.creados, r.tot.ganados, r.tot.perdidos, r.tot.mrr].join(';'));
  lines.push('');
  lines.push(['Deal cerrado', 'Resultado', 'Tipo de venta', 'Valor', 'Fecha cierre', 'Motivo de pérdida', 'Vendedor'].join(';'));
  for (const d of r.cerrados) lines.push([esc(d.empresa), d.etapa, esc(d.tipo_venta), d.mrr ?? '', d.fecha_cierre, esc(d.motivo_perdida || ''), esc(d.vendedor)].join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reporte-${p}-${desde}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

app.get('/ranking', requireAuth, requireSistema('cfd'), (req, res) => {
  const periodo = req.query.p === 'mes' ? 'mes' : 'semana';
  const desde = periodo === 'mes' ? inicioMes() : inicioSemana();
  const usuarios = db.prepare('SELECT id, name FROM users WHERE active = 1').all();
  const rows = usuarios.map((u) => {
    const s = statsPeriodo(u.id, desde);
    const goal = getGoals(u.id)[periodo];
    const cumpl = goal && goal.mrr > 0 ? Math.round((s.mrr / goal.mrr) * 100) : null;
    return { name: u.name, ...s, cumpl };
  }).sort((a, b) => b.mrr - a.mrr || b.ganados - a.ganados || b.reuniones - a.reuniones || b.toques - a.toques);
  res.send(V.rankingPage({ user: req.user, periodo, rows }));
});

/* ---------------- comercial góndolas (etapas y actividad configurables) ---------------- */

const camposGondolas = () => db.prepare('SELECT * FROM gondolas_campos ORDER BY orden').all();
const etapasGondolas = () => db.prepare('SELECT * FROM gondolas_etapas ORDER BY orden').all();

// Opciones de vista compartidas por todas las pantallas de góndolas.
function gondolasOpts() {
  return {
    etapasActivas: etapasGondolas().map((e) => e.nombre),
    colores: coloresDePanel('gondolas'),
    base: '/gondolas',
    nuevoHref: '/deals/new?panel=gondolas',
    sistema: 'gondolas',
  };
}

function gondolasPipelineData(req) {
  const scope = req.query.scope === 'todos' ? 'todos' : 'mios';
  const closed = req.query.cerrados === '1';
  const params = [];
  const where = ["d.panel = 'gondolas'"];
  if (closed) where.push("d.etapa IN ('Ganado','Perdido')");
  else { where.push("(d.etapa NOT IN ('Ganado','Perdido') OR d.fecha_cierre >= ?)"); params.push(inicioMes()); }
  if (scope === 'mios') { where.push('d.user_id = ?'); params.push(req.user.id); }
  const deals = db.prepare(`SELECT d.*, u.name AS vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE ${where.join(' AND ')} ORDER BY d.fecha_proximo_paso IS NULL DESC, d.fecha_proximo_paso ASC, d.updated_at DESC`).all(...params);
  return { deals, scope, closed };
}

// Sumas de un vendedor en el período: campos dinámicos (JSON) + ventas aprobadas.
function gondolasStats(userId, desde) {
  const tot = { ganados: 0, ingresos: 0 };
  for (const c of camposGondolas()) tot['c' + c.id] = 0;
  for (const row of db.prepare('SELECT valores FROM gondolas_activity WHERE user_id = ? AND fecha >= ?').all(userId, desde)) {
    try { const v = JSON.parse(row.valores || '{}'); for (const k of Object.keys(v)) if (k in tot) tot[k] += Number(v[k]) || 0; } catch {}
  }
  const g = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(mrr),0) m FROM deals WHERE panel = 'gondolas' AND user_id = ? AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND fecha_cierre >= ?").get(userId, desde);
  tot.ganados = g.n; tot.ingresos = g.m;
  return tot;
}

const gondolasGoals = (userId) => {
  const out = { semana: {}, mes: {} };
  for (const r of db.prepare('SELECT * FROM gondolas_goals WHERE user_id = ?').all(userId)) { try { out[r.periodo] = JSON.parse(r.valores || '{}'); } catch {} }
  return out;
};

app.get('/gondolas', requireAuth, requireSistema('gondolas'), (req, res) => res.redirect('/gondolas/pipeline'));

app.get('/gondolas/pipeline', requireAuth, requireSistema('gondolas'), (req, res) => {
  res.send(V.pipelinePage({ user: req.user, ...gondolasPipelineData(req), ...gondolasOpts() }));
});

app.get('/gondolas/actividad', requireAuth, requireSistema('gondolas'), (req, res) => {
  const hoy = hoyAR();
  const campos = camposGondolas();
  const today = db.prepare('SELECT * FROM gondolas_activity WHERE user_id = ? AND fecha = ?').get(req.user.id, hoy);
  const history = db.prepare('SELECT * FROM gondolas_activity WHERE user_id = ? ORDER BY fecha DESC LIMIT 14').all(req.user.id);
  res.send(V.gondolasActividadPage({ user: req.user, campos, today, history }));
});

app.post('/gondolas/actividad', requireAuth, requireSistema('gondolas'), (req, res) => {
  const fecha = cleanDate(req.body.fecha) || hoyAR();
  const valores = {};
  for (const c of camposGondolas()) valores['c' + c.id] = cleanInt(req.body['c' + c.id]);
  db.prepare(`INSERT INTO gondolas_activity (user_id, fecha, valores, notas) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, fecha) DO UPDATE SET valores = excluded.valores, notas = excluded.notas`)
    .run(req.user.id, fecha, JSON.stringify(valores), clean(req.body.notas));
  res.redirect('/gondolas/actividad');
});

app.get('/gondolas/objetivos', requireAuth, requireSistema('gondolas'), (req, res) => {
  const esAdmin = req.user.role === 'admin';
  const usuarios = esAdmin
    ? db.prepare("SELECT id, name FROM users WHERE active = 1 AND role != 'developer' ORDER BY role = 'admin', name").all()
    : [{ id: req.user.id, name: req.user.name }];
  const desde = { semana: inicioSemana(), mes: inicioMes() };
  const data = usuarios.map((u) => ({
    u, goals: gondolasGoals(u.id),
    stats: { semana: gondolasStats(u.id, desde.semana), mes: gondolasStats(u.id, desde.mes) },
  }));
  res.send(V.gondolasObjetivosPage({ user: req.user, campos: camposGondolas(), data, esAdmin }));
});

function guardarGoalsGondolas(userId, body) {
  const campos = camposGondolas();
  const up = db.prepare(`INSERT INTO gondolas_goals (user_id, periodo, valores) VALUES (?, ?, ?)
    ON CONFLICT(user_id, periodo) DO UPDATE SET valores = excluded.valores`);
  for (const [pref, periodo] of [['s', 'semana'], ['m', 'mes']]) {
    const v = {};
    for (const c of campos) v['c' + c.id] = cleanNum(body[`${pref}_c${c.id}`]) || 0;
    v.ganados = cleanNum(body[`${pref}_ganados`]) || 0;
    v.ingresos = cleanNum(body[`${pref}_ingresos`]) || 0;
    up.run(userId, periodo, JSON.stringify(v));
  }
}

app.post('/gondolas/objetivos/:userId', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (target) guardarGoalsGondolas(target.id, req.body);
  res.redirect('/gondolas/objetivos');
});

app.post('/gondolas/objetivos-generales', requireAuth, requireAdmin, (req, res) => {
  for (const u of db.prepare("SELECT id FROM users WHERE role = 'vendedor' AND active = 1").all()) guardarGoalsGondolas(u.id, req.body);
  res.redirect('/gondolas/objetivos');
});

app.get('/gondolas/ranking', requireAuth, requireSistema('gondolas'), (req, res) => {
  const periodo = req.query.p === 'mes' ? 'mes' : 'semana';
  const desde = periodo === 'mes' ? inicioMes() : inicioSemana();
  const campos = camposGondolas();
  const rows = db.prepare("SELECT id, name FROM users WHERE active = 1 AND role != 'developer'").all()
    .map((u) => {
      const s = gondolasStats(u.id, desde);
      const goal = gondolasGoals(u.id)[periodo];
      const cumpl = goal && goal.ingresos > 0 ? Math.round((s.ingresos / goal.ingresos) * 100) : null;
      return { name: u.name, ...s, cumpl };
    })
    .sort((a, b) => b.ingresos - a.ingresos || b.ganados - a.ganados);
  res.send(V.gondolasRankingPage({ user: req.user, periodo, campos, rows }));
});

app.get('/gondolas/dashboard', requireAuth, requireAdmin, (req, res) => {
  const mesInicio = inicioMes();
  const colores = coloresDePanel('gondolas');
  const funnel = {};
  for (const r of db.prepare("SELECT etapa, COUNT(*) n FROM deals WHERE panel = 'gondolas' AND etapa NOT IN ('Ganado','Perdido') GROUP BY etapa").all()) funnel[r.etapa] = r.n;
  const activos = Object.values(funnel).reduce((a, b) => a + b, 0);
  const g = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(mrr),0) m FROM deals WHERE panel = 'gondolas' AND etapa = 'Ganado' AND aprobacion = 'aprobado' AND fecha_cierre >= ?").get(mesInicio);
  const c90 = db.prepare("SELECT etapa, COUNT(*) n FROM deals WHERE panel = 'gondolas' AND (etapa = 'Perdido' OR (etapa = 'Ganado' AND aprobacion = 'aprobado')) AND fecha_cierre >= date('now','-90 days') GROUP BY etapa").all();
  const gg = c90.find((r) => r.etapa === 'Ganado')?.n || 0, pp = c90.find((r) => r.etapa === 'Perdido')?.n || 0;
  const winRate = gg + pp > 0 ? Math.round((gg / (gg + pp)) * 100) : null;
  const sinPaso = db.prepare(`SELECT d.id, d.empresa, d.etapa, d.updated_at, u.name vendedor_name FROM deals d JOIN users u ON u.id = d.user_id
    WHERE d.panel = 'gondolas' AND d.etapa NOT IN ('Ganado','Perdido') AND d.fecha_proximo_paso IS NULL ORDER BY d.updated_at ASC`).all();
  const campos = camposGondolas();
  const porVendedor = db.prepare("SELECT id, name FROM users WHERE active = 1 AND role != 'developer' ORDER BY name").all()
    .map((u) => ({ name: u.name, ...gondolasStats(u.id, mesInicio) }));
  res.send(V.gondolasDashboardPage({
    user: req.user,
    k: { funnel, activos, ingresosMes: g.m, ganadosMes: g.n, winRate, sinPaso, porVendedor },
    campos, colores, etapas: etapasGondolas().map((e) => e.nombre),
  }));
});

/* --- configuración del panel góndolas (solo admin) --- */

app.get('/gondolas/config', requireAuth, requireAdmin, (req, res) => {
  res.send(V.gondolasConfigPage({ user: req.user, etapas: etapasGondolas(), campos: camposGondolas(), err: req.query.err }));
});

app.post('/gondolas/config/etapas', requireAuth, requireAdmin, (req, res) => {
  const nombre = clean(req.body.nombre);
  if (nombre && !['Ganado', 'Perdido'].includes(nombre)) {
    const max = db.prepare('SELECT COALESCE(MAX(orden),0) m FROM gondolas_etapas').get().m;
    try { db.prepare('INSERT INTO gondolas_etapas (nombre, orden) VALUES (?, ?)').run(nombre, max + 1); } catch {}
  }
  res.redirect('/gondolas/config');
});

app.post('/gondolas/config/etapas/:id', requireAuth, requireAdmin, (req, res) => {
  const etapa = db.prepare('SELECT * FROM gondolas_etapas WHERE id = ?').get(req.params.id);
  if (!etapa) return res.redirect('/gondolas/config');
  const accion = req.body.accion;
  if (accion === 'renombrar') {
    const nombre = clean(req.body.nombre);
    if (nombre && !['Ganado', 'Perdido'].includes(nombre) && nombre !== etapa.nombre) {
      try {
        db.prepare('UPDATE gondolas_etapas SET nombre = ? WHERE id = ?').run(nombre, etapa.id);
        db.prepare("UPDATE deals SET etapa = ? WHERE panel = 'gondolas' AND etapa = ?").run(nombre, etapa.nombre);
      } catch {}
    }
  } else if (accion === 'subir' || accion === 'bajar') {
    const dir = accion === 'subir' ? -1 : 1;
    const vecino = db.prepare('SELECT * FROM gondolas_etapas WHERE orden = ?').get(etapa.orden + dir);
    if (vecino) {
      db.prepare('UPDATE gondolas_etapas SET orden = ? WHERE id = ?').run(vecino.orden, etapa.id);
      db.prepare('UPDATE gondolas_etapas SET orden = ? WHERE id = ?').run(etapa.orden, vecino.id);
    }
  } else if (accion === 'borrar') {
    const enUso = db.prepare("SELECT COUNT(*) c FROM deals WHERE panel = 'gondolas' AND etapa = ?").get(etapa.nombre).c;
    if (enUso > 0) return res.redirect('/gondolas/config?err=etapa-en-uso');
    if (db.prepare('SELECT COUNT(*) c FROM gondolas_etapas').get().c <= 1) return res.redirect('/gondolas/config?err=ultima-etapa');
    db.prepare('DELETE FROM gondolas_etapas WHERE id = ?').run(etapa.id);
  }
  res.redirect('/gondolas/config');
});

app.post('/gondolas/config/campos', requireAuth, requireAdmin, (req, res) => {
  const label = clean(req.body.label);
  if (label) {
    const max = db.prepare('SELECT COALESCE(MAX(orden),0) m FROM gondolas_campos').get().m;
    db.prepare('INSERT INTO gondolas_campos (label, orden) VALUES (?, ?)').run(label, max + 1);
  }
  res.redirect('/gondolas/config');
});

app.post('/gondolas/config/campos/:id', requireAuth, requireAdmin, (req, res) => {
  const campo = db.prepare('SELECT * FROM gondolas_campos WHERE id = ?').get(req.params.id);
  if (!campo) return res.redirect('/gondolas/config');
  if (req.body.accion === 'renombrar') {
    const label = clean(req.body.label);
    if (label) db.prepare('UPDATE gondolas_campos SET label = ? WHERE id = ?').run(label, campo.id);
  } else if (req.body.accion === 'borrar') {
    db.prepare('DELETE FROM gondolas_campos WHERE id = ?').run(campo.id);
  }
  res.redirect('/gondolas/config');
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
  res.send(V.reglasPage({ user: req.user, reglas: C.getAllRules() }));
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
  // Rubro Góndolas: % plano cobrable al momento.
  const gPct = cleanNum(req.body.g_pct);
  if (gPct != null) C.saveRules('gondolas', { tipo: 'flat', pct: gPct, nota: 'Venta de góndolas: comisión única cobrable al momento.' });
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
  const items = db.prepare('SELECT texto, url, leida, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 15').all(req.user.id)
    .map((n) => ({ texto: n.texto, url: n.url || '/notificaciones', leida: !!n.leida, fecha: fechaHoraAR(n.created_at) }));
  res.json({ items });
  db.prepare('UPDATE notifications SET leida = 1 WHERE user_id = ? AND leida = 0').run(req.user.id);
});

// Estado para el aviso en vivo (la campanita consulta esto cada 15 segundos).
app.get('/notificaciones/estado', requireAuth, (req, res) => {
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND leida = 0').get(req.user.id).c;
  const ultima = db.prepare('SELECT texto, url FROM notifications WHERE user_id = ? AND leida = 0 ORDER BY created_at DESC, id DESC LIMIT 1').get(req.user.id) || null;
  res.json({ unread, ultima });
});

app.get('/notificaciones', requireAuth, (req, res) => {
  const notis = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(req.user.id);
  res.send(V.notificacionesPage({ user: req.user, notis }));
  // Se marcan como leídas después de mostrarlas: las no leídas se ven resaltadas una vez.
  db.prepare('UPDATE notifications SET leida = 1 WHERE user_id = ? AND leida = 0').run(req.user.id);
});

/* ---------------- documentación y changelog ---------------- */

const CHANGELOG = require('./changelog');
const MANUAL_PDF = path.join(__dirname, 'public', 'manual.pdf');

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

app.post('/perfil/password', requireAuth, (req, res) => {
  const full = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (bcrypt.compareSync(req.body.current || '', full.password_hash) && (req.body.next || '').length >= 6) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(req.body.next, 10), req.user.id);
  }
  res.redirect('/perfil');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Panel Comercial corriendo en http://localhost:${PORT}`));
