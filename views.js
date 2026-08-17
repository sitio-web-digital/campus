const { ETAPAS, ETAPAS_ACTIVAS, ORIGENES, MOTIVOS, TIPOS_VENTA } = require('./db');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => n == null ? '—' : '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const fecha = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
};
const hoyISO = () => new Date().toISOString().slice(0, 10);
// created_at viene de SQLite en UTC ("YYYY-MM-DD HH:MM:SS"); se muestra en hora argentina.
const fechaHora = (s) => {
  if (!s) return '—';
  try {
    return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return s; }
};

const ETAPA_COLOR = {
  'Lead': '#8494A6', 'Contactado': '#4A90C8', 'Reunión agendada': '#2E7BB8',
  'Discovery hecha': '#1D6FB8', 'Propuesta enviada': '#14538C', 'Negociación': '#0F3459',
  'Ganado': '#3E9B57', 'Perdido': '#C05450',
};

// Íconos de navegación (C4D): SVG inline, trazo en currentColor.
const IC = (paths) => `<svg class="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  pipeline: IC('<path d="M3 4h14M5 10h10M8 16h4"/>'),
  actividad: IC('<path d="M3 10.5l3.5 3.5L17 5"/>'),
  dashboard: IC('<path d="M4 16V9M10 16V4M16 16v-5"/>'),
  equipo: IC('<circle cx="8" cy="7.5" r="2.6"/><path d="M3.5 16c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6"/><path d="M14 6.2a2.4 2.4 0 010 4.6M15 12.6c1.4.5 2.3 1.7 2.6 3.4"/>'),
  perfil: IC('<path d="M4 6h12M4 14h12"/><circle cx="8" cy="6" r="1.9"/><circle cx="13" cy="14" r="1.9"/>'),
  docs: IC('<path d="M10 4.5C8.6 3.4 6.7 3 4 3v12.5c2.7 0 4.6.4 6 1.5 1.4-1.1 3.3-1.5 6-1.5V3c-2.7 0-4.6.4-6 1.5z"/><path d="M10 4.5V17"/>'),
  bell: IC('<path d="M10 3a4.5 4.5 0 00-4.5 4.5c0 3.2-1 4.3-1.8 5.1h12.6c-.8-.8-1.8-1.9-1.8-5.1A4.5 4.5 0 0010 3z"/><path d="M8.3 15.5a1.8 1.8 0 003.4 0"/>'),
  metas: IC('<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.8"/>'),
  cobranza: IC('<rect x="3" y="5.5" width="14" height="9.5" rx="1.8"/><circle cx="10" cy="10.2" r="2.2"/><path d="M5.5 5.5V4.2h9v1.3"/>'),
};
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230F3459'/%3E%3Ctext x='16' y='21' font-size='12' font-family='Helvetica,Arial' font-weight='bold' fill='white' text-anchor='middle'%3EC4D%3C/text%3E%3C/svg%3E";

const SISTEMA_NOMBRE = { comercial: 'Comercial Cloud For Deploy', gondolas: 'Comercial Góndolas', estanterias: 'Comercial Estanterías Reforzadas', sitioweb: 'Comercial SitioWeb Digital', cobranza: 'Panel de Cobranza', admin: 'Panel Administración', hub: 'Campus C4D' };
const tieneSistema = (user, s) => user && (user.role === 'admin' || (user.permisos || []).includes(s));

// Ícono hoja para PuntoCO2 (plataforma de huella de carbono).
const ICON_PCO2 = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 3.5C9 4 4.5 8 4.5 13.5c0 1.6.5 2.6 1 3 .5-4.5 3-8 7-10-3 2.5-5.5 6-5.7 10.2 1 .5 2.2.8 3.2.8 5 0 7-5.5 6.5-14z"/></svg>`;

// Selector de sistemas (arriba a la izquierda): permite saltar entre paneles y sitios.
function sysSwitch(sistema, user) {
  return `
  <details class="sys">
    <summary><span class="brand-txt">${SISTEMA_NOMBRE[sistema] || 'Panel Comercial'}<span class="sub">Cloud For Deploy ▾</span></span></summary>
    <div class="sys-menu">
      <a href="/hub">Campus (inicio)</a>
      ${tieneSistema(user, 'cfd') ? `<a href="/pipeline">Comercial Cloud For Deploy</a>` : ''}
      ${tieneSistema(user, 'gondolas') ? `<a href="/gondolas/pipeline">Comercial Góndolas</a>` : ''}
      ${tieneSistema(user, 'estanterias') ? `<a href="/estanterias/pipeline">Comercial Estanterías Reforzadas</a>` : ''}
      ${tieneSistema(user, 'sitioweb') ? `<a href="/sitioweb/pipeline">Comercial SitioWeb Digital</a>` : ''}
      ${tieneSistema(user, 'cobranza') ? `<a href="/cobranza">Panel de Cobranza</a>` : ''}
      ${user && user.role === 'admin' ? `<a href="/admin">Panel Administración</a>` : ''}
      <span class="soon"><span>Panel de Developers</span><span class="soon-chip">Próximamente</span></span>
      <span class="soon"><span>Panel de Cursos</span><span class="soon-chip">Próximamente</span></span>
      <div class="sys-sep"></div>
      <a class="sys-ext sys-est" href="https://estanteriasreforzadas.com/" target="_blank" rel="noopener">
        <span class="se-ic"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/></svg></span>
        <span class="se-txt">Estanterías Reforzadas<small>Estanterías y góndolas ↗</small></span>
      </a>
      <a class="sys-ext sys-sw" href="https://app.sitioweb.digital/" target="_blank" rel="noopener">
        <img src="/logo-sitioweb.svg" alt="" width="30" height="30" style="border-radius:8px">
        <span class="se-txt">SitioWeb Digital<small>Tu página propia en minutos ↗</small></span>
      </a>
      <a class="sys-ext sys-gon" href="https://gondola.com.ar/" target="_blank" rel="noopener">
        <span class="se-ic"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/><path d="M6 8V5.5h3V8"/></svg></span>
        <span class="se-txt">Gondola<small>gondola.com.ar ↗</small></span>
      </a>
      <a class="sys-ext sys-eol" href="https://estanterias.online/" target="_blank" rel="noopener">
        <span class="se-ic"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h2l1.6 8.5a1.5 1.5 0 001.5 1.2h6.3a1.5 1.5 0 001.5-1.2L17.5 7H6"/><circle cx="8.5" cy="17" r="1.1"/><circle cx="14.5" cy="17" r="1.1"/></svg></span>
        <span class="se-txt">Estanterías Online<small>estanterias.online ↗</small></span>
      </a>
      <a class="sys-ext sys-pco2" href="https://puntoco2.com/home" target="_blank" rel="noopener">
        <span class="se-ic">${ICON_PCO2}</span>
        <span class="se-txt">PuntoCO2<small>Plataforma de huella de carbono ↗</small></span>
      </a>
      <a class="sys-ext sys-cfd" href="https://cloudfordeploy.com/" target="_blank" rel="noopener">
        <span class="se-ic"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15.5a3.5 3.5 0 01-.4-7A4.8 4.8 0 0115 7.6a3.2 3.2 0 01-.6 7.9z"/></svg></span>
        <span class="se-txt">Cloud For Deploy<small>Sitio web de la empresa ↗</small></span>
      </a>
    </div>
  </details>`;
}

function layout({ title, user, active, body, msg, err, bodyClass, sistema = 'comercial' }) {
  const bell = user ? `
      <a class="bell ${active === 'notis' ? 'on' : ''}" href="/notificaciones" aria-label="Notificaciones">${ICONS.bell}${user.unread > 0 ? `<span class="bell-badge">${user.unread > 99 ? '99+' : user.unread}</span>` : ''}</a>` : '';
  const perfilLink = `
        <a href="/perfil" class="${active === 'perfil' ? 'on' : ''}">${ICONS.perfil}<span>${user ? esc(user.name.split(' ')[0]) : ''}</span></a>`;
  let links = '';
  if (sistema === 'cobranza') {
    links = `
        <a href="/cobranza" class="${active === 'cobranza' ? 'on' : ''}">${ICONS.cobranza}<span>Comisiones</span></a>
        ${user && user.role === 'admin' ? `<a href="/cobranza/reglas" class="${active === 'reglas' ? 'on' : ''}">${ICONS.docs}<span>Reglas</span></a>` : ''}${perfilLink}`;
  } else if (sistema === 'hub') {
    links = perfilLink;
  } else if (sistema === 'admin') {
    links = `
        <a href="/admin" class="${active === 'admin' ? 'on' : ''}">${ICONS.equipo}<span>Usuarios</span></a>${perfilLink}`;
  } else if (sistema === 'gondolas' || sistema === 'estanterias' || sistema === 'sitioweb') {
    const b = '/' + sistema;
    links = `
        <a href="${b}/pipeline" class="${active === 'pipeline' ? 'on' : ''}">${ICONS.pipeline}<span>Pipeline</span></a>
        <a href="${b}/actividad" class="${active === 'actividad' ? 'on' : ''}">${ICONS.actividad}<span>Actividad</span></a>
        <a href="${b}/objetivos" class="${active === 'metas' ? 'on' : ''}">${ICONS.metas}<span>Metas</span></a>
        ${user && user.role === 'admin' ? `<a href="${b}/dashboard" class="${active === 'dashboard' ? 'on' : ''}">${ICONS.dashboard}<span>Dashboard</span></a>
        <a href="${b}/config" class="${active === 'config' ? 'on' : ''}">${ICONS.docs}<span>Config</span></a>` : ''}${perfilLink}`;
  } else {
    links = `
        <a href="/pipeline" class="${active === 'pipeline' ? 'on' : ''}">${ICONS.pipeline}<span>Pipeline</span></a>
        <a href="/actividad" class="${active === 'actividad' ? 'on' : ''}">${ICONS.actividad}<span>Actividad</span></a>
        <a href="/objetivos" class="${active === 'metas' ? 'on' : ''}">${ICONS.metas}<span>Metas</span></a>
        ${user && user.role === 'admin' ? `<a href="/dashboard" class="${active === 'dashboard' ? 'on' : ''}">${ICONS.dashboard}<span>Dashboard</span></a>
        <a href="/admin" class="${active === 'equipo' ? 'on' : ''}">${ICONS.equipo}<span>Equipo</span></a>` : ''}
        <a href="/documentacion" class="${active === 'docs' ? 'on' : ''}">${ICONS.docs}<span>Docs</span></a>${perfilLink}`;
  }
  const nav = user ? `
  <nav class="nav">
    <div class="nav-inner">
      <span class="brand-row">${sysSwitch(sistema, user)}${bell}</span>
      <div class="nav-links">${links}
      </div>
    </div>
  </nav>` : '';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · Campus C4D</title>
<link rel="icon" href="${FAVICON}">
<style>${CSS}</style>
</head>
<body class="${bodyClass || ''}">
${nav}
<main class="wrap">
${msg ? `<div class="flash ok">${esc(msg)}</div>` : ''}
${err ? `<div class="flash bad">${esc(err)}</div>` : ''}
${body}
</main>
${user ? `
<script>
(function () {
  var last = ${user.unread || 0}, first = true;
  function ding() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.15);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      o.start(); o.stop(ctx.currentTime + 0.6);
    } catch (e) {}
  }
  function toast(texto, url) {
    var t = document.createElement('a');
    t.className = 'toast'; t.href = url || '/notificaciones'; t.textContent = texto;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 30);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 8000);
  }
  function pintarBadge(n) {
    var bell = document.querySelector('.bell'); if (!bell) return;
    var b = bell.querySelector('.bell-badge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'bell-badge'; bell.appendChild(b); }
      b.textContent = n > 99 ? '99+' : n;
    } else if (b) { b.remove(); }
  }
  function check() {
    fetch('/notificaciones/estado').then(function (r) { return r.json(); }).then(function (d) {
      if (!first && d.unread > last) { ding(); if (d.ultima) toast(d.ultima.texto, d.ultima.url); }
      pintarBadge(d.unread); last = d.unread; first = false;
    }).catch(function () {});
  }
  setInterval(check, 15000);
  first = false;

  // Panel flotante de notificaciones anclado a la campanita.
  var bellEl = document.querySelector('.bell');
  if (bellEl) {
    var pop = document.createElement('div');
    pop.className = 'noti-pop'; pop.hidden = true;
    bellEl.parentNode.appendChild(pop);
    function escHtml(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
    bellEl.addEventListener('click', function (e) {
      e.preventDefault();
      if (!pop.hidden) { pop.hidden = true; return; }
      pop.hidden = false;
      pop.innerHTML = '<div class="np-empty">Cargando…</div>';
      fetch('/notificaciones/lista').then(function (r) { return r.json(); }).then(function (d) {
        pintarBadge(0); last = 0;
        var html = d.items.length
          ? d.items.map(function (n) {
              return '<a class="np-item' + (n.leida ? '' : ' unread') + '" href="' + escHtml(n.url) + '">' + escHtml(n.texto) + '<span>' + escHtml(n.fecha) + '</span></a>';
            }).join('')
          : '<div class="np-empty">Sin notificaciones todavía.</div>';
        pop.innerHTML = html + '<a class="np-all" href="/notificaciones">Ver historial completo</a>';
      }).catch(function () { pop.innerHTML = '<div class="np-empty">No se pudo cargar.</div>'; });
    });
    document.addEventListener('click', function (e) {
      if (!pop.hidden && !pop.contains(e.target) && !bellEl.contains(e.target)) pop.hidden = true;
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') pop.hidden = true; });
  }
})();
</script>` : ''}
</body>
</html>`;
}

const CSS = `
:root {
  --bg:#F4F7FA; --surface:#FFFFFF; --surface2:#E9EEF4; --ink:#0F1D2E; --muted:#54657A;
  --faint:#8494A6; --accent:#0F3459; --accent-ink:#0A2540; --accent-soft:#E3ECF6;
  --role:#1D6FB8; --line:#DCE4EE; --line2:#C2CEDD; --bad:#C0453F; --bad-soft:#F7E3E2; --ok-soft:#E1F0E6;
}
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
.wrap { max-width:64rem; margin:0 auto; padding:1.25rem 1rem 5.5rem; }
h1 { font-size:1.5rem; letter-spacing:-.01em; margin:.5rem 0 1rem; }
h2 { font-size:1.1rem; margin:1.75rem 0 .6rem; }
a { color:var(--accent-ink); }
.nav { background:var(--surface); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:10; }
.nav-inner { max-width:64rem; margin:0 auto; padding:.6rem 1rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
.brand { font-weight:700; }
.nav-links { display:flex; gap:.25rem; flex-wrap:wrap; }
.nav-links a { text-decoration:none; color:var(--muted); font-weight:600; font-size:.9rem; padding:.4rem .6rem; border-radius:8px; }
.nav-links a.on { background:var(--accent-soft); color:var(--accent-ink); }
@media (max-width:640px) {
  .nav-inner { justify-content:center; }
  .nav-links { position:fixed; bottom:0; left:0; right:0; background:var(--surface); border-top:1px solid var(--line); justify-content:space-around; padding:.4rem .25rem calc(.4rem + env(safe-area-inset-bottom)); z-index:10; }
  .nav-links a { font-size:.78rem; text-align:center; }
}
.flash { padding:.7rem 1rem; border-radius:10px; margin-bottom:1rem; font-weight:600; }
.flash.ok { background:var(--ok-soft); color:#1F6B45; }
.flash.bad { background:var(--bad-soft); color:#8F3532; }
.card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:1rem 1.1rem; margin-bottom:.75rem; }
.btn { display:inline-block; background:var(--accent); color:#fff; border:none; border-radius:10px; padding:.65rem 1.2rem; font-size:1rem; font-weight:700; cursor:pointer; text-decoration:none; }
.btn.secondary { background:var(--surface); color:var(--accent-ink); border:1px solid var(--line2); }
.btn.danger { background:var(--bad); }
.btn.small { padding:.35rem .7rem; font-size:.85rem; }
label { display:block; font-size:.8rem; font-weight:700; color:var(--muted); margin:.9rem 0 .25rem; text-transform:uppercase; letter-spacing:.05em; }
input, select, textarea { width:100%; padding:.6rem .7rem; font-size:1rem; border:1px solid var(--line2); border-radius:10px; background:var(--surface); color:var(--ink); font-family:inherit; }
input:focus, select:focus, textarea:focus { outline:2px solid var(--accent); outline-offset:1px; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:0 1rem; }
@media (max-width:520px) { .grid2 { grid-template-columns:1fr; } }
.chip { display:inline-block; font-size:.72rem; font-weight:700; letter-spacing:.04em; padding:.12rem .55rem; border-radius:999px; color:#fff; white-space:nowrap; }
.deal-card { display:block; text-decoration:none; color:inherit; }
.deal-card:hover { border-color:var(--accent); }
.deal-top { display:flex; justify-content:space-between; align-items:baseline; gap:.5rem; }
.deal-name { font-weight:700; }
.deal-mrr { font-weight:700; color:var(--accent-ink); white-space:nowrap; }
.deal-meta { font-size:.85rem; color:var(--muted); margin-top:.25rem; }
.deal-next { font-size:.85rem; margin-top:.35rem; }
.warn { color:var(--bad); font-weight:600; }
.stage-h { display:flex; align-items:center; gap:.5rem; margin:1.5rem 0 .5rem; }
.stage-h .dot { width:.7rem; height:.7rem; border-radius:50%; }
.stage-h h2 { margin:0; font-size:1rem; }
.stage-h .n { color:var(--faint); font-size:.85rem; }
.toolbar { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:1rem; }
.toolbar .sp { flex:1; }
.seg { display:inline-flex; border:1px solid var(--line2); border-radius:10px; overflow:hidden; }
.seg a { padding:.4rem .8rem; text-decoration:none; font-size:.88rem; font-weight:600; color:var(--muted); }
.seg a.on { background:var(--accent-soft); color:var(--accent-ink); }
table { border-collapse:collapse; width:100%; font-size:.9rem; background:var(--surface); }
th { text-align:left; font-size:.7rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); padding:.55rem .7rem; border-bottom:1px solid var(--line2); background:var(--surface2); }
td { padding:.55rem .7rem; border-bottom:1px solid var(--line); vertical-align:top; }
tr:last-child td { border-bottom:none; }
.tablewrap { overflow-x:auto; border:1px solid var(--line); border-radius:12px; margin-bottom:1rem; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:.75rem; margin-bottom:1rem; }
.tile { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:.9rem 1rem; }
.tile .v { font-size:1.55rem; font-weight:700; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
.tile .l { font-size:.78rem; color:var(--muted); font-weight:600; }
.bar-row { display:flex; align-items:center; gap:.6rem; margin:.35rem 0; }
.bar-label { width:9.5rem; font-size:.82rem; font-weight:600; color:var(--muted); text-align:right; flex-shrink:0; }
.bar-track { flex:1; background:var(--surface2); border-radius:6px; height:1.4rem; position:relative; }
.bar-fill { height:100%; border-radius:6px; min-width:2px; }
.bar-val { position:absolute; right:.5rem; top:0; line-height:1.4rem; font-size:.8rem; font-weight:700; font-variant-numeric:tabular-nums; }
.charts { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:.75rem; }
.charts .card { margin-bottom:0; }
.caption { font-size:.78rem; color:var(--faint); margin-top:.5rem; }
.login-box { max-width:22rem; margin:12vh auto 0; }
.muted { color:var(--muted); }
.small { font-size:.85rem; }

/* --- C4D · capa profesional --- */
body { font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
h1,h2,h3 { font-weight:700; letter-spacing:-.015em; }
.nav { background:var(--accent); border-bottom:none; box-shadow:0 1px 0 rgba(255,255,255,.06), 0 2px 10px rgba(15,52,89,.18); }
.nav-inner { padding:.7rem 1rem; }
.brand { display:flex; align-items:center; gap:.6rem; color:#fff; }
.logo { width:2.15rem; height:2.15rem; border-radius:8px; background:#fff; color:var(--accent); display:grid; place-items:center; font-size:.8rem; font-weight:800; letter-spacing:.01em; flex-shrink:0; }
.brand-txt { display:flex; flex-direction:column; line-height:1.15; font-size:.98rem; }
.brand-txt .sub { font-size:.63rem; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:rgba(255,255,255,.6); }
.nav-links a { color:rgba(255,255,255,.75); transition:background .15s, color .15s; }
.nav-links a:hover { background:rgba(255,255,255,.1); color:#fff; }
.nav-links a.on { background:rgba(255,255,255,.15); color:#fff; }
@media (max-width:640px) {
  .nav-links { background:var(--surface); border-top:1px solid var(--line); box-shadow:0 -2px 10px rgba(15,29,46,.08); }
  .nav-links a { color:var(--muted); }
  .nav-links a:hover { background:transparent; color:var(--accent); }
  .nav-links a.on { background:var(--accent-soft); color:var(--accent); }
}
.card, .tile, .tablewrap { border-radius:14px; box-shadow:0 1px 2px rgba(15,29,46,.05); }
.card { transition:box-shadow .15s, border-color .15s; }
.deal-card:hover { box-shadow:0 4px 14px rgba(15,52,89,.1); border-color:var(--line2); }
.tile { border-top:3px solid var(--accent); }
.tile .l { color:var(--muted); }
.btn { transition:background .15s, box-shadow .15s; box-shadow:0 1px 2px rgba(15,52,89,.2); }
.btn:hover { background:var(--accent-ink); }
.btn.secondary:hover { background:var(--accent-soft); }
.btn.danger:hover { background:#a63a35; }
th { letter-spacing:.08em; }
tr:hover td { background:#F8FAFC; }
input:hover, select:hover, textarea:hover { border-color:var(--accent); }
.chip { box-shadow:inset 0 -1px 0 rgba(0,0,0,.08); }
.login-box { box-shadow:0 12px 40px rgba(15,52,89,.12); border-radius:16px; padding:1.6rem 1.5rem 1.8rem; }
.login-mark { display:flex; flex-direction:column; align-items:center; gap:.55rem; margin-bottom:1.2rem; }
.login-mark .logo { width:3.1rem; height:3.1rem; border-radius:12px; background:var(--accent); color:#fff; font-size:1.05rem; }

.bar-track { overflow:hidden; }
.bar-fill { display:flex; align-items:center; justify-content:flex-end; padding-right:.5rem; }
.bar-val { position:absolute; right:auto; top:0; line-height:1.4rem; color:var(--ink); }
.bar-fill .bar-val { position:static; color:#fff; }

.nav-links a { display:inline-flex; align-items:center; gap:.32rem; letter-spacing:.005em; font-size:.8rem; padding:.35rem .5rem; }
.nav-links { gap:.1rem; flex-wrap:nowrap; }
.nav-inner { flex-wrap:nowrap; }
.brand-txt { font-size:.9rem; }
.brand-txt .sub { font-size:.58rem; }
.nav-links .ic { width:.95rem; height:.95rem; flex-shrink:0; opacity:.85; }
.nav-links a.on .ic { opacity:1; }
.nav-inner { padding:.6rem 1rem; }
@media (max-width:640px) { .nav-inner { flex-wrap:wrap; } .nav-links { flex-wrap:wrap; } }
h1 { font-size:1.4rem; margin:1.1rem 0 1.1rem; }
h2 { font-size:1rem; letter-spacing:.005em; }
.wrap { padding-top:.5rem; }
.tile .v { font-size:1.7rem; }
.tile .l { font-size:.74rem; letter-spacing:.02em; }
.caption { line-height:1.55; }
@media (max-width:640px) {
  .nav-links a { flex-direction:column; gap:.15rem; }
  .nav-links .ic { width:1.15rem; height:1.15rem; }
}

/* --- notificaciones e historial --- */
.brand-row { display:flex; align-items:center; gap:.9rem; position:relative; }
.noti-pop { position:absolute; top:calc(100% + .55rem); right:-.5rem; z-index:90; width:23rem; max-width:calc(100vw - 1.5rem); max-height:62vh; overflow:auto;
  background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:0 18px 50px rgba(10,20,35,.3); padding:.4rem; }
.np-item { display:block; padding:.6rem .75rem; border-radius:9px; text-decoration:none; color:var(--ink); font-size:.85rem; line-height:1.45; font-weight:500; }
.np-item span { display:block; font-size:.7rem; color:var(--faint); margin-top:.2rem; }
.np-item:hover { background:var(--surface2); }
.np-item.unread { background:var(--accent-soft); border-left:3px solid var(--role); }
.np-empty { padding:.9rem .75rem; color:var(--muted); font-size:.85rem; }
.np-all { display:block; text-align:center; padding:.6rem; font-size:.78rem; font-weight:700; color:var(--accent-ink); text-decoration:none; border-top:1px solid var(--line); margin-top:.25rem; }
.np-all:hover { background:var(--accent-soft); border-radius:0 0 10px 10px; }
@media (max-width:640px) { .noti-pop { position:fixed; top:3.6rem; left:.5rem; right:.5rem; width:auto; max-height:70vh; } }
.bell { position:relative; display:inline-flex; align-items:center; justify-content:center; width:2.15rem; height:2.15rem; border-radius:8px; color:rgba(255,255,255,.75); transition:background .15s, color .15s; }
.bell:hover, .bell.on { background:rgba(255,255,255,.12); color:#fff; }
.bell .ic { width:1.2rem; height:1.2rem; }
.bell-badge { position:absolute; top:-.2rem; right:-.3rem; background:#C0453F; color:#fff; font-size:.62rem; font-weight:800; line-height:1; padding:.2rem .32rem; border-radius:999px; border:2px solid var(--accent); }
.noti { display:block; text-decoration:none; color:inherit; }
.noti.unread { border-left:3px solid var(--role); background:var(--accent-soft); }
.noti .t { font-weight:600; }
.noti .f { font-size:.78rem; color:var(--faint); margin-top:.2rem; }
.hist { margin-top:.5rem; }
.hist-item { display:flex; gap:.7rem; padding:.55rem 0; border-bottom:1px solid var(--line); font-size:.88rem; align-items:baseline; }
.hist-item:last-child { border-bottom:none; }
.hist-item .cuando { color:var(--faint); font-size:.78rem; white-space:nowrap; }
.hist-item .chip { flex-shrink:0; }

/* --- objetivos y ranking --- */
.prog-row { display:grid; grid-template-columns:minmax(5.5rem,7.5rem) 1fr max-content; gap:.5rem; align-items:center; margin:.45rem 0; }
@media (max-width:520px) { .prog-row { grid-template-columns:5.5rem 1fr max-content; } }
.prog-row .pl { font-size:.76rem; font-weight:600; color:var(--muted); text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.prog { height:.6rem; background:var(--surface2); border-radius:999px; overflow:hidden; }
.prog i { display:block; height:100%; border-radius:999px; background:var(--role); }
.prog i.full { background:#3E9B57; }
.prog-row .pv { font-size:.74rem; font-variant-numeric:tabular-nums; white-space:nowrap; }
.prog-row .pv strong { color:var(--accent-ink); }
.metas-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(235px,1fr)); gap:1.1rem; }
.goal-cols { display:grid; gap:1rem; margin-top:.5rem; }
.goal-inputs { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:.5rem .7rem; }
.goal-inputs label { margin:.4rem 0 .2rem; font-size:.66rem; }
.pos { display:inline-flex; align-items:center; justify-content:center; width:1.8rem; height:1.8rem; border-radius:50%; font-weight:800; font-size:.85rem; background:var(--surface2); color:var(--muted); }
.pos.p1 { background:#C08A2E; color:#fff; }
.pos.p2 { background:#8494A6; color:#fff; }
.pos.p3 { background:#A9714B; color:#fff; }
tr.yo td { background:var(--accent-soft); }

/* --- tablero kanban --- */
body { overflow-x:hidden; }
.board { display:grid; grid-template-columns:repeat(var(--ncols,8),minmax(0,1fr)); gap:.5rem; align-items:start;
  width:calc(100vw - 2.5rem); max-width:110rem; margin-left:calc(50% - 50vw + 1.25rem); padding-bottom:1rem; }
.col { background:var(--surface2); border-radius:10px; padding:.4rem; min-height:8rem; min-width:0; }
.col.over { outline:2px dashed var(--role); outline-offset:-2px; }
.col-h { display:flex; align-items:center; gap:.3rem; padding:.1rem .2rem .35rem; font-size:.62rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; flex-wrap:wrap; }
.col-h .dot { width:.45rem; height:.45rem; border-radius:50%; flex-shrink:0; }
.col-h .sub { font-size:.56rem; color:var(--faint); text-transform:none; font-weight:600; }
.col-h .n { margin-left:auto; font-weight:700; color:var(--faint); }
.col-sum { font-size:.63rem; color:var(--faint); padding:0 .2rem .35rem; font-variant-numeric:tabular-nums; }
.kcard { background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:.4rem .5rem; margin-bottom:.4rem; box-shadow:0 1px 2px rgba(15,29,46,.05); }
.kcard[draggable=true] { cursor:grab; }
.kcard.drag { opacity:.45; }
.kcard-t { font-weight:700; font-size:.74rem; color:inherit; text-decoration:none; display:block; line-height:1.3; overflow-wrap:anywhere; }
.kcard-t:hover { color:var(--accent-ink); text-decoration:underline; }
.kcard-m { display:flex; justify-content:space-between; gap:.3rem; font-size:.66rem; color:var(--muted); margin-top:.2rem; flex-wrap:wrap; }
.kcard-m .mrr { font-weight:700; color:var(--accent-ink); font-variant-numeric:tabular-nums; }
.kcard-w { font-size:.63rem; margin-top:.2rem; line-height:1.35; overflow-wrap:anywhere; }
.kcard-w.ok { color:var(--faint); }
.kcard-w.aprob { color:#8A5A0B; font-weight:700; }
.aprob-box { background:#FBF3E2; border:1px solid #E3C98F; border-radius:12px; padding:.9rem 1.1rem; margin-bottom:.9rem; }
.aprob-box p { margin:0 0 .6rem; font-size:.88rem; }
@media (max-width:980px) {
  .board { display:flex; overflow-x:auto; width:auto; max-width:none; margin-left:0; }
  .col { flex:0 0 215px; }
}

/* --- selector de sistemas --- */
.sys { position:relative; }
.sys summary { display:flex; align-items:center; gap:.5rem; color:#fff; cursor:pointer; list-style:none; border-radius:8px; padding:.25rem .5rem; }
.sys summary::-webkit-details-marker { display:none; }
.sys summary:hover { background:rgba(255,255,255,.1); }
.sys[open] summary { background:rgba(255,255,255,.12); }
.sys-menu { position:absolute; top:calc(100% + .4rem); left:0; z-index:80; background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:0 14px 40px rgba(10,20,35,.25); min-width:16.5rem; padding:.4rem; display:grid; gap:.15rem; }
.sys-menu > a { text-decoration:none; color:var(--ink); font-size:.88rem; font-weight:600; padding:.5rem .7rem; border-radius:8px; }
.sys-menu > a:hover { background:var(--accent-soft); color:var(--accent-ink); }
.sys-sep { border-top:1px solid var(--line); margin:.25rem .3rem; }
.sys-menu .soon { display:flex; align-items:center; justify-content:space-between; gap:.6rem; font-size:.88rem; font-weight:600; padding:.5rem .7rem; border-radius:8px; color:var(--faint); cursor:default; }
.soon-chip { font-size:.56rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; background:var(--surface2); color:var(--muted); border:1px solid var(--line2); border-radius:999px; padding:.14rem .45rem; white-space:nowrap; }
.sys-menu a.sys-ext { display:flex; align-items:center; gap:.65rem; padding:.55rem .7rem; color:#fff; }
.sys-menu a.sys-ext:hover { filter:brightness(1.08); }
.sys-ext .se-ic { display:grid; place-items:center; width:1.9rem; height:1.9rem; border-radius:8px; background:rgba(255,255,255,.18); flex-shrink:0; }
.sys-ext .se-ic svg { width:1.15rem; height:1.15rem; }
.sys-ext img { flex-shrink:0; }
.sys-ext .se-txt { display:flex; flex-direction:column; line-height:1.25; font-size:.88rem; font-weight:700; }
.sys-ext .se-txt small { font-size:.68rem; font-weight:500; opacity:.8; }
.sys-pco2 { background:linear-gradient(135deg, #D8352A, #C0241A); }
.sys-cfd { background:linear-gradient(135deg, #16406E, #0F3459); }
.sys-est { background:linear-gradient(135deg, #E8781F, #C75E10); }
.sys-sw { background:linear-gradient(135deg, #131C33, #0B1120); }
.sys-gon { background:linear-gradient(135deg, #22854F, #1A6B3F); }
.sys-eol { background:linear-gradient(135deg, #6B4FA3, #563F87); }
.hub-card.hub-gon { background:linear-gradient(150deg, #22854F, #1A6B3F); border-color:#1A6B3F; }
.hub-card.hub-gon h3, .hub-card.hub-eol h3 { color:#fff; }
.hub-card.hub-gon p, .hub-card.hub-eol p { color:rgba(255,255,255,.85); }
.hub-card.hub-gon .hc-ext, .hub-card.hub-eol .hc-ext { color:rgba(255,255,255,.72); }
.hub-card.hub-gon .hc-ic, .hub-card.hub-eol .hc-ic { background:rgba(255,255,255,.2); color:#fff; }
.hub-card.hub-eol { background:linear-gradient(150deg, #6B4FA3, #563F87); border-color:#563F87; }
.sys-sw .se-txt small { color:#FFC107; opacity:1; }
.hub-card.hub-sw { background:linear-gradient(150deg, #131C33, #0B1120); border-color:#0B1120; }
.hub-card.hub-sw h3 { color:#fff; }
.hub-card.hub-sw p { color:rgba(255,255,255,.82); }
.hub-card.hub-sw .hc-ext { color:#FFC107; }
.hub-card.hub-sw .hc-logo { border-radius:10px; height:44px; }
.hub-card.hub-est { background:linear-gradient(150deg, #E8781F, #C75E10); border-color:#C75E10; }
.hub-card.hub-est h3 { color:#fff; }
.hub-card.hub-est p { color:rgba(255,255,255,.87); }
.hub-card.hub-est .hc-ext { color:rgba(255,255,255,.72); }
.hub-card.hub-est .hc-ic { background:rgba(255,255,255,.2); color:#fff; }

/* --- campus / hub --- */
.hub-wrap { max-width:52rem; margin:0 auto; padding:2.5rem 0 2rem; }
.hub-head { text-align:center; margin-bottom:2rem; }
.hub-head img { width:150px; height:auto; }
.hub-head h1 { margin:.8rem 0 .2rem; }
.hub-head p { color:var(--muted); margin:0; }
.hub-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:1rem; }
.hub-card { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:1.3rem 1.3rem 1.2rem; text-decoration:none; color:inherit; box-shadow:0 1px 2px rgba(15,29,46,.05); transition:box-shadow .15s, border-color .15s, transform .15s; display:block; }
.hub-card:hover { box-shadow:0 8px 24px rgba(15,52,89,.14); border-color:var(--line2); transform:translateY(-2px); }
.hub-card .hc-ic { width:2.6rem; height:2.6rem; border-radius:10px; background:var(--accent-soft); color:var(--accent-ink); display:grid; place-items:center; margin-bottom:.8rem; }
.hub-card .hc-ic svg { width:1.4rem; height:1.4rem; }
.hub-card h3 { margin:0 0 .25rem; font-size:1.02rem; }
.hub-card p { margin:0; font-size:.84rem; color:var(--muted); line-height:1.5; }
.hub-card .hc-ext { font-size:.72rem; color:var(--faint); font-weight:700; letter-spacing:.06em; text-transform:uppercase; margin-top:.6rem; display:block; }
.hub-card.hub-pco2 { background:linear-gradient(150deg, #D8352A, #C0241A); border-color:#C0241A; }
.hub-card.hub-pco2 h3 { color:#fff; }
.hub-card.hub-pco2 p { color:rgba(255,255,255,.85); }
.hub-card.hub-pco2 .hc-ext { color:rgba(255,255,255,.7); }
.hub-card.hub-pco2 .hc-ic { background:rgba(255,255,255,.2); color:#fff; }
.hub-card.hub-cfd { background:linear-gradient(150deg, #16406E, #0F3459); border-color:#0F3459; }
.hub-card.hub-cfd h3 { color:#fff; }
.hub-card.hub-cfd p { color:rgba(255,255,255,.85); }
.hub-card.hub-cfd .hc-ext { color:rgba(255,255,255,.7); }
.hub-card .hc-logo { height:51px; width:auto; margin-bottom:.6rem; display:block; }
.perm { display:inline-flex; align-items:center; gap:.35rem; font-size:.82rem; font-weight:600; color:var(--muted); text-transform:none; letter-spacing:0; margin:0; }
.perm input { width:auto; }
.perm-row { display:flex; flex-wrap:wrap; gap:.6rem 1rem; align-items:center; margin-top:.7rem; }
.cfg-row { display:flex; flex-wrap:wrap; gap:.4rem; align-items:center; padding:.35rem 0; border-bottom:1px solid var(--line); }
.cfg-row:last-child { border-bottom:none; }
.cfg-inline { display:inline-flex; gap:.4rem; align-items:center; flex:1; min-width:14rem; }
.cfg-inline input { max-width:20rem; }
.hub-card.hub-soon { position:relative; opacity:.72; cursor:default; }
.hub-card.hub-soon:hover { box-shadow:0 1px 2px rgba(15,29,46,.05); transform:none; border-color:var(--line); }
.hc-soon { position:absolute; top:.8rem; right:.8rem; }

/* --- cobranza --- */
.chip--estado-pendiente { background:#C08A2E; }
.chip--estado-pagado { background:#3E9B57; }
.chip--estado-cancelado { background:#8494A6; }
.vencida td { background:var(--bad-soft); }
.inv-form { display:inline-flex; align-items:center; gap:.3rem; }
.inv-form input[type=file] { width:11rem; font-size:.72rem; padding:.2rem; }

/* --- toast de notificación en vivo --- */
.toast { position:fixed; right:1rem; bottom:1rem; z-index:100; display:block; background:var(--accent); color:#fff; text-decoration:none;
  padding:.8rem 1.05rem; border-radius:12px; font-size:.88rem; font-weight:600; line-height:1.4; max-width:22rem;
  box-shadow:0 12px 32px rgba(10,20,35,.35); opacity:0; transform:translateY(10px); transition:opacity .3s, transform .3s; }
.toast.show { opacity:1; transform:none; }
.toast:hover { background:var(--accent-ink); }
@media (max-width:640px) { .toast { bottom:4.6rem; left:1rem; max-width:none; } }
@media (prefers-reduced-motion: reduce) { .toast { transition:none; } }

/* --- login corporativo (split-screen) --- */
body.login-bg { background:var(--bg); }
body.login-bg .wrap { max-width:none; padding:0; }
.split { display:grid; grid-template-columns:minmax(0,44%) 1fr; min-height:100vh; }
.split-brand { background:linear-gradient(200deg, #16406E 0%, #0F3459 55%, #081D33 100%); color:#fff; display:flex; flex-direction:column; justify-content:center; padding:3rem 3.2rem; }
.split-brand img { width:140px; height:auto; margin-bottom:1.5rem; }
.sb-title { font-size:1.55rem; font-weight:700; letter-spacing:-.01em; }
.sb-sub { font-size:.64rem; letter-spacing:.2em; text-transform:uppercase; color:rgba(255,255,255,.55); font-weight:700; margin:.15rem 0 1.6rem; }
.sb-line { color:rgba(255,255,255,.78); font-size:.92rem; max-width:26rem; line-height:1.6; }
.sb-list { margin:1.5rem 0 0; padding:0; list-style:none; display:grid; gap:.6rem; color:rgba(255,255,255,.62); font-size:.85rem; }
.sb-list li { display:flex; gap:.6rem; align-items:baseline; }
.sb-list li::before { content:""; width:.42rem; height:.42rem; border-radius:2px; background:#4A90C8; flex-shrink:0; }
.split-form { display:flex; align-items:center; justify-content:center; padding:2.5rem 1.5rem; }
.sf-inner { width:100%; max-width:22.5rem; }
.sf-inner h1 { font-size:1.3rem; margin:0 0 .25rem; }
.sf-hint { color:var(--muted); font-size:.88rem; margin-bottom:1.2rem; }
.sf-foot { color:var(--faint); font-size:.78rem; margin-top:1.5rem; line-height:1.5; }
@media (max-width:860px) {
  .split { grid-template-columns:1fr; }
  .split-brand { padding:2.2rem 1.5rem 1.9rem; align-items:center; text-align:center; }
  .split-brand img { width:110px; margin-bottom:1rem; }
  .sb-line, .sb-list { display:none; }
  .split-form { align-items:flex-start; padding-top:2rem; }
}

/* --- modal de deal --- */
.modal-back { position:fixed; inset:0; background:rgba(10,20,35,.5); z-index:60; overflow:auto; padding:2.5rem 1rem; }
.modal { background:var(--bg); border-radius:16px; max-width:46rem; margin:0 auto; padding:1.1rem 1.3rem 1.3rem; box-shadow:0 24px 60px rgba(10,20,35,.35); }
.modal-h { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:.5rem; }
.modal-h h2 { margin:0; font-size:1.15rem; }
.modal-x { font-size:1.6rem; line-height:1; text-decoration:none; color:var(--muted); padding:.15rem .5rem; border-radius:8px; }
.modal-x:hover { background:var(--surface2); color:var(--ink); }
@media (max-width:640px) { .modal-back { padding:0; } .modal { border-radius:0; min-height:100vh; } }
`;

/* ---------------- páginas ---------------- */

function loginPage({ err, seeded }) {
  return layout({
    title: 'Iniciar sesión', user: null, bodyClass: 'login-bg',
    body: `
  <div class="split">
    <div class="split-brand">
      <img src="/logo.png" alt="Cloud For Deploy" width="204" height="113">
      <div class="sb-title">Campus C4D</div>
      <div class="sb-sub">Cloud For Deploy</div>
      <p class="sb-line">Toda la oficina en un solo lugar: los paneles de trabajo del equipo y los accesos a nuestras plataformas.</p>
      <ul class="sb-list">
        <li>Paneles comerciales: software y góndolas</li>
        <li>Cobranza y comisiones</li>
        <li>Administración, metas y reportes</li>
        <li>Accesos directos a nuestras plataformas</li>
      </ul>
    </div>
    <div class="split-form">
      <div class="sf-inner">
        <h1>Iniciar sesión</h1>
        <p class="sf-hint">Ingresá con tu cuenta de la empresa.</p>
        ${err ? `<div class="flash bad">${esc(err)}</div>` : ''}
        ${seeded ? `<div class="flash ok">Primer arranque: revisá la consola del servidor para ver el usuario y la clave del administrador.</div>` : ''}
        <form method="post" action="/login" class="card">
          <label style="margin-top:.2rem">Email</label>
          <input type="email" name="email" required autocomplete="username" autofocus placeholder="nombre@empresa.com">
          <label>Contraseña</label>
          <input type="password" name="password" required autocomplete="current-password" placeholder="••••••••">
          <div style="margin-top:1.3rem"><button class="btn" style="width:100%">Ingresar</button></div>
        </form>
        <p class="sf-foot">Acceso exclusivo del equipo de Cloud For Deploy. Si olvidaste tu clave, pedile al administrador que la resetee.</p>
      </div>
    </div>
  </div>`
  });
}

function pipelinePage({ user, deals, scope, closed, modal, etapasActivas = ETAPAS_ACTIVAS, colores = ETAPA_COLOR, base = '', nuevoHref = '/deals/new', sistema = 'comercial' }) {
  const colorDe = (etapa) => colores[etapa] || '#8494A6';
  const puedeMover = (d) => user.role === 'admin' || d.user_id === user.id;
  const kcard = (d) => {
    const cerrado = ['Ganado', 'Perdido'].includes(d.etapa);
    const sinPaso = !d.fecha_proximo_paso && !cerrado;
    const vencido = d.fecha_proximo_paso && d.fecha_proximo_paso < hoyISO() && !cerrado;
    const pie = d.etapa === 'Perdido' && d.motivo_perdida ? `<div class="kcard-w warn">${esc(d.motivo_perdida)}</div>`
      : d.etapa === 'Ganado' && d.aprobacion !== 'aprobado' ? `<div class="kcard-w aprob">Por aprobar</div>`
      : d.etapa === 'Ganado' && d.fecha_cierre ? `<div class="kcard-w ok">Cerrado ${fecha(d.fecha_cierre)}</div>`
      : sinPaso ? `<div class="kcard-w warn">Sin próximo paso</div>`
      : vencido ? `<div class="kcard-w warn">Vencido ${fecha(d.fecha_proximo_paso)}</div>`
      : d.fecha_proximo_paso ? `<div class="kcard-w ok">→ ${fecha(d.fecha_proximo_paso)}${d.proximo_paso ? ' · ' + esc(d.proximo_paso) : ''}</div>` : '';
    return `
    <div class="kcard" ${puedeMover(d) ? 'draggable="true"' : ''} data-id="${d.id}">
      <a class="kcard-t" href="/deals/${d.id}">${esc(d.empresa)}</a>
      <div class="kcard-m"><span class="mrr">${money(d.mrr)}${d.tipo_venta === 'Suscripción mensual' ? '<span style="font-weight:400">/mes</span>' : ''}</span><span>${d.ciudad ? esc(d.ciudad) + ' · ' : ''}${esc(d.vendedor_name.split(' ')[0])}</span></div>
      ${pie}
    </div>`;
  };
  const col = (etapa, sub) => {
    const rows = deals.filter((d) => d.etapa === etapa);
    const mrrSum = rows.reduce((a, d) => a + (d.mrr || 0), 0);
    return `
    <div class="col" data-etapa="${esc(etapa)}">
      <div class="col-h"><span class="dot" style="background:${colorDe(etapa)}"></span>${esc(etapa)}${sub ? `<span class="sub">${sub}</span>` : ''}<span class="n">${rows.length}</span></div>
      ${rows.length ? `<div class="col-sum">${money(mrrSum)}</div>` : ''}
      ${rows.map(kcard).join('')}
    </div>`;
  };
  const columnas = closed
    ? ['Ganado', 'Perdido'].map((e) => col(e)).join('')
    : [...etapasActivas.map((e) => col(e)), col('Ganado', 'mes'), col('Perdido', 'mes')].join('');
  const nCols = closed ? 2 : etapasActivas.length + 2;
  const pipeUrl = `${base}/pipeline`;
  return layout({
    title: 'Pipeline', user, active: 'pipeline', sistema,
    body: `
  <div class="toolbar">
    <div class="seg">
      <a href="${pipeUrl}?scope=mios${closed ? '&cerrados=1' : ''}" class="${scope === 'mios' ? 'on' : ''}">Míos</a>
      <a href="${pipeUrl}?scope=todos${closed ? '&cerrados=1' : ''}" class="${scope === 'todos' ? 'on' : ''}">Todos</a>
    </div>
    <div class="seg">
      <a href="${pipeUrl}?scope=${scope}" class="${!closed ? 'on' : ''}">Tablero</a>
      <a href="${pipeUrl}?scope=${scope}&cerrados=1" class="${closed ? 'on' : ''}">Cerrados</a>
    </div>
    <div class="sp"></div>
    <a class="btn" href="${nuevoHref}">+ Nuevo deal</a>
  </div>
  ${deals.length ? '' : `<div class="card"><p class="muted" style="margin:0">No hay deals acá todavía. Cargá el primero con “+ Nuevo deal” — la regla del equipo: apenas se agenda la primera reunión, el deal se carga.</p></div>`}
  <div class="board" style="--ncols:${nCols}">${columnas}</div>
  <p class="caption">Arrastrá una tarjeta a otra columna para cambiarla de etapa (al soltar en Perdido se abre la ficha para cargar el motivo). Las columnas Ganado y Perdido del tablero muestran solo los cierres del mes; el historial completo está en "Cerrados".</p>
  ${modal || ''}
  <script>
  (function () {
    var drag = null;
    document.querySelectorAll('.kcard[draggable=true]').forEach(function (c) {
      c.addEventListener('dragstart', function (e) { drag = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); });
      c.addEventListener('dragend', function () { c.classList.remove('drag'); });
    });
    document.querySelectorAll('.col').forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', function () { col.classList.remove('over'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault(); col.classList.remove('over');
        if (!drag) return;
        var id = drag, etapa = col.dataset.etapa; drag = null;
        fetch('/deals/' + id + '/etapa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'etapa=' + encodeURIComponent(etapa)
        }).then(function () { if (etapa === 'Perdido') { location = '/deals/' + id; } else { location.reload(); } });
        return;
      });
    });
  })();
  </script>`
  });
}

const EVENTO_TIPO = { creado: ['Creado', '#3E9B57'], etapa: ['Etapa', '#14538C'], edicion: ['Edición', '#8494A6'] };

const PROVINCIAS_AR = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];

function dealFormModal({ user, deal, vendedores, isAdmin, eventos = [], errAprob, panel = 'cfd', etapas = ETAPAS, backHref = '/pipeline', campanas = [] }) {
  const d = deal || {};
  const isNew = !deal;
  const opt = (list, sel) => list.map((o) => `<option value="${esc(o)}" ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
  return `
  <div class="modal-back" id="modalBack">
  <div class="modal">
  <div class="modal-h"><h2>${isNew ? 'Nuevo deal' : esc(d.empresa)}</h2><a class="modal-x" href="${backHref}" aria-label="Cerrar">&times;</a></div>
  ${errAprob ? `<div class="flash bad">No se pudo aprobar: falta cargar el <strong>valor del deal</strong>, que es la base para calcular la comisión del vendedor. Completalo, guardá y volvé a aprobar.</div>` : ''}
  ${!isNew && d.etapa === 'Ganado' && d.aprobacion !== 'aprobado' ? (isAdmin ? `
  <div class="aprob-box">
    ${d.mrr > 0 ? `
    <p><strong>Esta venta espera tu aprobación.</strong> Validá los datos antes de aprobar (corregilos abajo y guardá si algo está mal):</p>
    <p class="small" style="margin:.2rem 0 .7rem"><strong>Vendedor:</strong> ${esc((vendedores.find((v) => v.id === d.user_id) || {}).name || '—')} · <strong>Tipo:</strong> ${esc(panel === 'cfd' ? d.tipo_venta || '—' : 'Venta ' + panel)} · <strong>Valor:</strong> ${money(d.mrr)} · <strong>Cierre:</strong> ${fecha(d.fecha_cierre) || 'se estampa al aprobar'}</p>
    <form method="post" action="/deals/${d.id}/aprobar"><button class="btn">Aprobar venta</button></form>` : `
    <p style="margin:0"><strong>Faltan datos para aprobar: el valor del deal.</strong> Cargalo abajo y guardá — sin ese dato no se puede calcular la comisión del vendedor.</p>`}
  </div>` : `
  <div class="aprob-box">
    <p style="margin:0"><strong>Esperando aprobación del administrador.</strong> La venta va a impactar en métricas y comisiones cuando sea aprobada.</p>
  </div>`) : ''}
  <form method="post" action="${isNew ? '/deals' : `/deals/${d.id}`}" class="card">
    <input type="hidden" name="panel" value="${esc(panel)}">
    <div class="grid2">
      <div>
        <label>Empresa *</label>
        <input name="empresa" required value="${esc(d.empresa)}" placeholder="Nombre de la empresa">
      </div>
      <div>
        <label>Etapa</label>
        <select name="etapa">${opt(etapas, d.etapa || etapas[0])}</select>
      </div>
      ${panel === 'gondolas' ? `
      <div>
        <label>Valor de la venta ($)</label>
        <input name="mrr" type="number" step="any" min="0" inputmode="decimal" value="${d.mrr ?? ''}" placeholder="Total de la venta">
      </div>` : `
      <div>
        <label>Tipo de venta</label>
        <select name="tipo_venta">${opt(TIPOS_VENTA, d.tipo_venta || 'Proyecto único')}</select>
      </div>
      <div>
        <label>Valor ($)</label>
        <input name="mrr" type="number" step="any" min="0" inputmode="decimal" value="${d.mrr ?? ''}" placeholder="Proyecto: total · Suscripción: por mes">
      </div>`}
      <div>
        <label>Origen</label>
        <select name="origen"><option value="">—</option>${opt(ORIGENES, d.origen)}</select>
      </div>
      <div>
        <label>Contacto decisor</label>
        <input name="decisor" value="${esc(d.decisor)}" placeholder="Nombre y cargo de quien decide">
      </div>
      <div>
        <label>Campaña de origen</label>
        <select name="campana_id"><option value="">— Sin campaña —</option>${campanas.map((c) => `<option value="${c.id}" ${c.id === d.campana_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
      </div>
      <div>
        <label>País</label>
        <input name="pais" value="${esc(d.pais || 'Argentina')}" placeholder="Argentina">
      </div>
      <div>
        <label>Provincia</label>
        <input name="provincia" list="provincias-ar" value="${esc(d.provincia)}" placeholder="Ej: Tucumán">
        <datalist id="provincias-ar">${PROVINCIAS_AR.map((p) => `<option value="${p}">`).join('')}</datalist>
      </div>
      <div>
        <label>Ciudad</label>
        <input name="ciudad" value="${esc(d.ciudad)}" placeholder="Ej: San Miguel de Tucumán">
      </div>
      ${isAdmin ? `
      <div>
        <label>Vendedor</label>
        <select name="user_id">${vendedores.map((v) => `<option value="${v.id}" ${v.id === (d.user_id || user.id) ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
      </div>` : ''}
      <div>
        <label>Próximo paso</label>
        <input name="proximo_paso" value="${esc(d.proximo_paso)}" placeholder="Ej: enviar propuesta, llamada con decisor">
      </div>
      <div>
        <label>Fecha próximo paso</label>
        <input name="fecha_proximo_paso" type="date" value="${esc(d.fecha_proximo_paso)}">
      </div>
      <div>
        <label>Fecha primera reunión</label>
        <input name="fecha_primera_reunion" type="date" value="${esc(d.fecha_primera_reunion)}">
      </div>
      <div>
        <label>Fecha de cierre (ganado/perdido)</label>
        <input name="fecha_cierre" type="date" value="${esc(d.fecha_cierre)}">
      </div>
      <div>
        <label>Motivo de pérdida (si se perdió)</label>
        <select name="motivo_perdida"><option value="">—</option>${opt(MOTIVOS, d.motivo_perdida)}</select>
      </div>
    </div>
    <label>Agregar nota al historial</label>
    <textarea name="notas" rows="3" placeholder="Contexto, objeciones, acuerdos… Al guardar, la nota queda registrada en el historial con tu nombre y fecha, y este campo vuelve a quedar libre."></textarea>
    <div style="margin-top:1.2rem; display:flex; gap:.6rem; flex-wrap:wrap">
      <button class="btn">${isNew ? 'Crear deal' : 'Guardar cambios'}</button>
      <a class="btn secondary" href="${backHref}">Cancelar</a>
    </div>
  </form>
  ${!isNew ? `
  <h2 style="margin-top:1.25rem">Historial del deal</h2>
  <div class="card hist">
    ${eventos.length ? eventos.map((e) => {
      const [label, color] = EVENTO_TIPO[e.tipo] || ['Cambio', '#54657A'];
      return `<div class="hist-item"><span class="chip" style="background:${color}">${label}</span><span>${esc(e.detalle || '')} <span class="muted">— ${esc(e.user_name)}</span></span><span class="cuando" style="margin-left:auto">${fechaHora(e.created_at)}</span></div>`;
    }).join('') : '<p class="muted small" style="margin:0">Sin movimientos registrados todavía. Desde ahora, cada creación, cambio de etapa o edición queda registrado acá.</p>'}
  </div>` : ''}
  ${!isNew && isAdmin ? `
  <form method="post" action="/deals/${d.id}/delete" onsubmit="return confirm('¿Eliminar este deal definitivamente?')" style="margin-top:1rem">
    <button class="btn danger small">Eliminar deal</button>
  </form>` : ''}
  </div>
  </div>
  <script>document.getElementById('modalBack').addEventListener('click', function (e) { if (e.target === this) location = '${backHref}'; });</script>`;
}

function actividadPage({ user, today, history }) {
  const t = today || {};
  return layout({
    title: 'Actividad diaria', user, active: 'actividad',
    body: `
  <h1>Mi actividad de hoy</h1>
  <p class="muted small">Cargala al final de cada día — toma 2 minutos. Si volvés a guardar, se actualiza la de hoy.</p>
  <form method="post" action="/actividad" class="card">
    <input type="hidden" name="fecha" value="${hoyISO()}">
    <div class="grid2">
      <div><label>Contactos nuevos agregados</label><input name="contactos" type="number" min="0" inputmode="numeric" value="${t.contactos ?? ''}" placeholder="0"></div>
      <div><label>Toques (llamadas + mensajes + emails)</label><input name="toques" type="number" min="0" inputmode="numeric" value="${t.toques ?? ''}" placeholder="0"></div>
      <div><label>Reuniones agendadas</label><input name="reuniones_agendadas" type="number" min="0" inputmode="numeric" value="${t.reuniones_agendadas ?? ''}" placeholder="0"></div>
      <div><label>Reuniones realizadas</label><input name="reuniones_realizadas" type="number" min="0" inputmode="numeric" value="${t.reuniones_realizadas ?? ''}" placeholder="0"></div>
    </div>
    <label>Notas del día</label>
    <input name="notas" value="${esc(t.notas)}" placeholder="Opcional">
    <div style="margin-top:1.2rem"><button class="btn" style="width:100%">Guardar mi día</button></div>
  </form>
  <h2>Mis últimos 14 días</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Fecha</th><th>Contactos</th><th>Toques</th><th>Reu. agend.</th><th>Reu. hechas</th><th>Notas</th></tr></thead>
    <tbody>${history.length ? history.map((r) => `<tr><td>${fecha(r.fecha)}</td><td>${r.contactos}</td><td>${r.toques}</td><td>${r.reuniones_agendadas}</td><td>${r.reuniones_realizadas}</td><td class="muted">${esc(r.notas || '')}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">Todavía no cargaste ningún día.</td></tr>'}</tbody>
  </table></div>`
  });
}

/* --------- dashboard (gráficos SVG sin dependencias) --------- */

function funnelBars(counts) {
  const max = Math.max(1, ...ETAPAS_ACTIVAS.map((e) => counts[e] || 0));
  return ETAPAS_ACTIVAS.map((e) => {
    const v = counts[e] || 0;
    const pct = (v / max) * 100;
    // C4D: el valor va dentro de la barra si hay lugar; si no, afuera a la derecha.
    const val = pct >= 60
      ? `<div class="bar-fill" style="width:${pct}%;background:${ETAPA_COLOR[e]}"><span class="bar-val">${v}</span></div>`
      : `<div class="bar-fill" style="width:${pct}%;background:${ETAPA_COLOR[e]}"></div><span class="bar-val" style="left:calc(${pct}% + .5rem)">${v}</span>`;
    return `<div class="bar-row"><span class="bar-label">${esc(e)}</span><div class="bar-track">${val}</div></div>`;
  }).join('');
}

function donut(items) {
  const total = items.reduce((a, i) => a + i.n, 0);
  if (!total) return '<p class="muted small">Sin deals perdidos todavía.</p>';
  const palette = ['#C05450', '#C08A2E', '#1D6FB8', '#8494A6', '#54657A', '#7A5AB5', '#3E9B57'];
  let acc = 0;
  const C = 2 * Math.PI * 40;
  const segs = items.map((it, i) => {
    const frac = it.n / total;
    const seg = `<circle r="40" cx="50" cy="50" fill="none" stroke="${palette[i % palette.length]}" stroke-width="18" stroke-dasharray="${frac * C} ${C}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 50 50)"/>`;
    acc += frac;
    return seg;
  }).join('');
  const legend = items.map((it, i) => `<div class="small" style="display:flex;align-items:center;gap:.4rem"><span style="width:.7rem;height:.7rem;border-radius:3px;background:${palette[i % palette.length]};flex-shrink:0"></span>${esc(it.label)} <strong style="margin-left:auto">${it.n}</strong></div>`).join('');
  return `<div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap">
    <svg viewBox="0 0 100 100" width="130" height="130" role="img" aria-label="Motivos de pérdida">${segs}</svg>
    <div style="flex:1;min-width:150px;display:grid;gap:.3rem">${legend}</div>
  </div>`;
}

function lineChart(points) {
  if (!points.length) return '<p class="muted small">Sin actividad cargada todavía.</p>';
  const W = 560, H = 150, P = 28;
  const max = Math.max(1, ...points.map((p) => p.v));
  const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const poly = points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ');
  const area = `${P},${H - P} ${poly} ${x(points.length - 1)},${H - P}`;
  const labels = points.map((p, i) => (points.length <= 8 || i % Math.ceil(points.length / 8) === 0)
    ? `<text x="${x(i)}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#8494A6">${p.label}</text>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Toques por día">
    <polygon points="${area}" fill="#0F3459" opacity=".12"/>
    <polyline points="${poly}" fill="none" stroke="#0F3459" stroke-width="2.5" stroke-linejoin="round"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3" fill="#0F3459"/><text x="${x(i)}" y="${y(p.v) - 7}" font-size="9" text-anchor="middle" fill="#54657A">${p.v}</text>`).join('')}
    ${labels}
  </svg>`;
}

function dashboardPage({ user, k }) {
  return layout({
    title: 'Dashboard', user, active: 'dashboard',
    body: `
  <h1>Dashboard global</h1>
  ${dashHeader('dashboard')}
  <div class="tiles">
    <div class="tile"><div class="v">${k.activos}</div><div class="l">Deals activos</div></div>
    <div class="tile"><div class="v">${money(k.mrrJuego)}</div><div class="l">En juego (propuesta + negociación)</div></div>
    <div class="tile"><div class="v">${money(k.proyectosMes)}</div><div class="l">Proyectos ganados este mes</div></div>
    <div class="tile"><div class="v">${money(k.mrrNuevoMes)}</div><div class="l">MRR nuevo este mes (suscripciones)</div></div>
    <div class="tile"><div class="v">${k.winRate == null ? '—' : k.winRate + '%'}</div><div class="l">Win rate (90 días)</div></div>
  </div>

  <div class="charts">
    <div class="card">
      <h2 style="margin-top:0">Funnel: deals activos por etapa</h2>
      ${funnelBars(k.funnel)}
      <p class="caption">Donde se acumulan deals está el cuello de botella: Contactado→Reunión = pitch/lista · Discovery→Propuesta = diagnóstico · Propuesta→Cierre = objeciones/urgencia.</p>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Por qué perdemos deals</h2>
      ${donut(k.motivos)}
      <p class="caption">Si un motivo domina, es una decisión de pricing/producto/segmento — no un problema del vendedor.</p>
    </div>
  </div>

  <div class="card" style="margin-top:.75rem">
    <h2 style="margin-top:0">Actividad del equipo: toques por día (14 días)</h2>
    ${lineChart(k.actividad)}
    <p class="caption">El indicador adelantado: la actividad de hoy son las ventas de dentro de 1-2 meses. Si esta línea cae, el pipeline se seca.</p>
  </div>

  ${tablaCampanas(k.campanas)}

  <h2>Deals sin próximo paso definido</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Empresa</th><th>Vendedor</th><th>Etapa</th><th>Última actualización</th></tr></thead>
    <tbody>${k.sinPaso.length ? k.sinPaso.map((d) => `<tr><td><a href="/deals/${d.id}">${esc(d.empresa)}</a></td><td>${esc(d.vendedor_name)}</td><td><span class="chip" style="background:${ETAPA_COLOR[d.etapa]}">${esc(d.etapa)}</span></td><td>${fecha(d.updated_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">Ninguno — todo el pipeline tiene próximo paso.</td></tr>'}</tbody>
  </table></div>

  <h2>Deals estancados (sin cambios hace +14 días)</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Empresa</th><th>Vendedor</th><th>Etapa</th><th>Última actualización</th></tr></thead>
    <tbody>${k.estancados.length ? k.estancados.map((d) => `<tr><td><a href="/deals/${d.id}">${esc(d.empresa)}</a></td><td>${esc(d.vendedor_name)}</td><td><span class="chip" style="background:${ETAPA_COLOR[d.etapa]}">${esc(d.etapa)}</span></td><td>${fecha(d.updated_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">Ninguno.</td></tr>'}</tbody>
  </table></div>

  <h2>Por vendedor — este mes</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Vendedor</th><th>Contactos</th><th>Toques</th><th>Reu. agend.</th><th>Reu. hechas</th><th>Deals activos</th><th>Ganados</th><th>Ingresos ganados</th></tr></thead>
    <tbody>${k.porVendedor.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td><td>${v.contactos}</td><td>${v.toques}</td><td>${v.agendadas}</td><td>${v.realizadas}</td><td>${v.activos}</td><td>${v.ganados}</td><td>${money(v.mrr_ganado)}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="caption">Tasas a revisar a fin de mes: reuniones agendadas ÷ contactos (pitch/lista) · propuestas ÷ reuniones hechas (diagnóstico) · ganados ÷ propuestas (cierre).</p>`
  });
}

const ROL_LABEL = { admin: 'Administrador', vendedor: 'Vendedor', developer: 'Developer' };

function adminPage({ user, users, sistemas, resetInfo }) {
  const rolOpts = (sel) => Object.entries(ROL_LABEL).map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
  const permChecks = (u) => sistemas.map(([slug, nombre]) => `
    <label class="perm"><input type="checkbox" name="permisos" value="${slug}" ${u && u.permisos.includes(slug) ? 'checked' : ''}> ${esc(nombre)}</label>`).join('');
  return layout({
    title: 'Administración', user, active: 'admin', sistema: 'admin',
    msg: resetInfo ? `Nueva clave temporal para ${resetInfo.name}: ${resetInfo.password} — pasásela por un canal seguro y pedile que la cambie en Perfil.` : null,
    body: `
  <h1>Usuarios y permisos</h1>

  <div class="card card--accent">
    <h3 style="margin-top:0">Enviar aviso al equipo</h3>
    <p class="small muted">Le llega como notificación (campanita, sonido y cartel en vivo) a quien elijas.</p>
    <form method="post" action="/admin/notificar">
      <div class="grid2">
        <div>
          <label>Destinatario</label>
          <select name="destino">
            <option value="todos">Todos los empleados</option>
            <option value="vendedor">Solo vendedores</option>
            <option value="developer">Solo developers</option>
            <option value="admin">Solo administradores</option>
            <optgroup label="Usuario puntual">
              ${users.filter((u) => u.active && u.id !== user.id).map((u) => `<option value="u:${u.id}">${esc(u.name)}</option>`).join('')}
            </optgroup>
          </select>
        </div>
        <div>
          <label>Mensaje</label>
          <input name="texto" required maxlength="200" placeholder="Ej: mañana reunión de equipo 9:00">
        </div>
      </div>
      <div style="margin-top:.9rem"><button class="btn">Enviar aviso</button></div>
    </form>
  </div>

  <p class="small muted">Los administradores tienen acceso total a todos los sistemas (los permisos no les aplican). A vendedores y developers habilitales solo los sistemas que necesiten.</p>
  ${users.map((u) => `
  <div class="card">
    <div class="deal-top">
      <div><strong>${esc(u.name)}</strong> <span class="muted small">· ${esc(u.email)}</span> ${u.active ? '' : '<span class="chip chip--estado-cancelado">Inactivo</span>'}</div>
      <div style="white-space:nowrap">
        ${u.id !== user.id ? `
        <form method="post" action="/admin/usuarios/${u.id}/toggle" style="display:inline"><button class="btn secondary small">${u.active ? 'Desactivar' : 'Activar'}</button></form>
        <form method="post" action="/admin/usuarios/${u.id}/reset" style="display:inline" onsubmit="return confirm('¿Generar una clave nueva para ${esc(u.name)}?')"><button class="btn secondary small">Resetear clave</button></form>` : '<span class="muted small">(vos)</span>'}
      </div>
    </div>
    ${u.id !== user.id ? `
    <form method="post" action="/admin/usuarios/${u.id}" class="perm-row">
      <select name="role" style="width:auto">${rolOpts(u.role)}</select>
      ${permChecks(u)}
      <button class="btn small">Guardar</button>
    </form>` : ''}
  </div>`).join('')}

  <h2>Crear usuario</h2>
  <form method="post" action="/admin/usuarios" class="card">
    <div class="grid2">
      <div><label>Nombre</label><input name="name" required placeholder="Nombre y apellido"></div>
      <div><label>Email (será su usuario)</label><input name="email" type="email" required></div>
      <div><label>Contraseña inicial</label><input name="password" required minlength="6" placeholder="Mínimo 6 caracteres"></div>
      <div><label>Rol</label><select name="role">${rolOpts('vendedor')}</select></div>
    </div>
    <label>Permisos por sistema</label>
    <div class="perm-row">${permChecks({ permisos: ['cfd', 'cobranza'] })}</div>
    <div style="margin-top:1rem"><button class="btn">Crear usuario</button></div>
  </form>`
  });
}

function perfilPage({ user }) {
  return layout({
    title: 'Perfil', user, active: 'perfil',
    body: `
  <h1>Mi perfil</h1>
  <div class="card">
    <p><strong>${esc(user.name)}</strong> · ${esc(user.email)} · rol: ${user.role}</p>
  </div>
  <h2>Cambiar mi contraseña</h2>
  <form method="post" action="/perfil/password" class="card">
    <label>Contraseña actual</label>
    <input type="password" name="current" required autocomplete="current-password">
    <label>Contraseña nueva (mínimo 6)</label>
    <input type="password" name="next" required minlength="6" autocomplete="new-password">
    <div style="margin-top:1rem"><button class="btn">Cambiar contraseña</button></div>
  </form>
  <form method="post" action="/logout"><button class="btn secondary">Cerrar sesión</button></form>`
  });
}

function notificacionesPage({ user, notis }) {
  return layout({
    title: 'Notificaciones', user, active: 'notis',
    body: `
  <h1>Notificaciones</h1>
  <p class="small muted">${user.role === 'admin' ? 'Deals nuevos y cambios de etapa de tu equipo.' : 'Avisos del administrador, como la aprobación de tus ventas.'} Las resaltadas son las que no habías visto.</p>
  ${notis.length ? notis.map((n) => `
  <a class="card noti ${n.leida ? '' : 'unread'}" href="${esc(n.url || '/pipeline')}">
    <div class="t">${esc(n.texto)}</div>
    <div class="f">${fechaHora(n.created_at)}</div>
  </a>`).join('') : `<div class="card"><p class="muted" style="margin:0">Todavía no hay notificaciones. ${user.role === 'admin' ? 'Cuando un vendedor cree un deal o lo mueva de etapa, lo vas a ver acá.' : 'Cuando el administrador apruebe una de tus ventas, lo vas a ver acá.'}</p></div>`}`
  });
}

/* --------- objetivos y ranking --------- */

const METRICAS = [
  ['toques', 'Toques', (v) => v],
  ['reuniones', 'Reuniones', (v) => v],
  ['ganados', 'Deals ganados', (v) => v],
  ['mrr', 'Ingresos ($)', money],
];

function metasHeader(active) {
  return `
  <div class="toolbar">
    <div class="seg">
      <a href="/objetivos" class="${active === 'objetivos' ? 'on' : ''}">Objetivos</a>
      <a href="/ranking" class="${active === 'ranking' ? 'on' : ''}">Ranking</a>
    </div>
  </div>`;
}

function progreso(goal, stats) {
  return METRICAS.map(([campo, label, fmt]) => {
    const obj = goal ? goal[campo] : 0;
    const real = stats[campo];
    if (!obj) return `<div class="prog-row"><span class="pl">${label}</span><div class="prog"></div><span class="pv muted">${fmt(real)} / sin objetivo</span></div>`;
    const pct = Math.min(100, Math.round((real / obj) * 100));
    return `<div class="prog-row"><span class="pl">${label}</span><div class="prog"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i></div><span class="pv"><strong>${fmt(real)}</strong> / ${fmt(obj)}</span></div>`;
  }).join('');
}

function objetivosPage({ user, data, esAdmin }) {
  const inputsPeriodo = (prefijo, goal) => METRICAS.map(([campo, label]) => `
    <div><label>${label}</label><input name="${prefijo}_${campo}" type="number" min="0" step="any" inputmode="numeric" value="${goal ? goal[campo] || '' : ''}" placeholder="0"></div>`).join('');
  return layout({
    title: 'Objetivos', user, active: 'metas',
    body: `
  <h1>Objetivos</h1>
  ${metasHeader('objetivos')}
  <p class="small muted">${esAdmin
    ? 'Progreso de cada vendedor contra sus objetivos. La semana arranca el lunes; el mes, el día 1. Definí los objetivos abajo de cada tarjeta — quedan fijos hasta que los cambies.'
    : 'Tu progreso contra los objetivos que definió administración. La semana arranca el lunes; el mes, el día 1.'}</p>
  ${esAdmin ? `
  <div class="card card--accent">
    <h3 style="margin-top:0">Objetivos generales del equipo</h3>
    <p class="small muted">Aplica los mismos objetivos a todos los vendedores activos de una sola vez (pisa los individuales). Después podés ajustar cada uno en su tarjeta.</p>
    <form method="post" action="/objetivos-generales">
      <div class="goal-cols">
        <div><strong class="small">Diario</strong><div class="goal-inputs">${METRICAS.map(([campo, label]) => `<div><label>${label}</label><input name="d_${campo}" type="number" min="0" step="any" inputmode="numeric" placeholder="0"></div>`).join('')}</div></div>
        <div><strong class="small">Semanal</strong><div class="goal-inputs">${METRICAS.map(([campo, label]) => `<div><label>${label}</label><input name="s_${campo}" type="number" min="0" step="any" inputmode="numeric" placeholder="0"></div>`).join('')}</div></div>
        <div><strong class="small">Mensual</strong><div class="goal-inputs">${METRICAS.map(([campo, label]) => `<div><label>${label}</label><input name="m_${campo}" type="number" min="0" step="any" inputmode="numeric" placeholder="0"></div>`).join('')}</div></div>
      </div>
      <div style="margin-top:.8rem"><button class="btn small" onclick="return confirm('¿Aplicar estos objetivos a TODOS los vendedores activos?')">Aplicar a todo el equipo</button></div>
    </form>
  </div>` : ''}
  ${data.map(({ u, goals, stats }) => `
  <div class="card">
    <div class="deal-top">
      <h3 style="margin:0">${esc(u.name)}</h3>
      <a class="btn secondary small" href="/metas/${u.id}">Ver gráficas</a>
    </div>
    <div class="metas-grid">
      <div>
        <h4 style="margin:.2rem 0 .4rem">Hoy</h4>
        ${progreso(goals.dia, stats.dia)}
      </div>
      <div>
        <h4 style="margin:.2rem 0 .4rem">Esta semana</h4>
        ${progreso(goals.semana, stats.semana)}
      </div>
      <div>
        <h4 style="margin:.2rem 0 .4rem">Este mes</h4>
        ${progreso(goals.mes, stats.mes)}
      </div>
    </div>
    ${esAdmin ? `
    <details style="margin-top:.8rem">
      <summary class="small" style="cursor:pointer;color:var(--accent-ink);font-weight:600">Definir objetivos de ${esc(u.name.split(' ')[0])}</summary>
      <form method="post" action="/objetivos/${u.id}">
        <div class="goal-cols">
          <div><strong class="small">Diario</strong><div class="goal-inputs">${inputsPeriodo('d', goals.dia)}</div></div>
          <div><strong class="small">Semanal</strong><div class="goal-inputs">${inputsPeriodo('s', goals.semana)}</div></div>
          <div><strong class="small">Mensual</strong><div class="goal-inputs">${inputsPeriodo('m', goals.mes)}</div></div>
        </div>
        <div style="margin-top:.8rem"><button class="btn small">Guardar objetivos</button></div>
      </form>
    </details>` : ''}
  </div>`).join('')}`
  });
}

function rankingPage({ user, periodo, rows }) {
  return layout({
    title: 'Ranking', user, active: 'metas',
    body: `
  <h1>Ranking</h1>
  ${metasHeader('ranking')}
  <div class="toolbar">
    <div class="seg">
      <a href="/ranking?p=dia" class="${periodo === 'dia' ? 'on' : ''}">Hoy</a>
      <a href="/ranking?p=semana" class="${periodo === 'semana' ? 'on' : ''}">Esta semana</a>
      <a href="/ranking?p=mes" class="${periodo === 'mes' ? 'on' : ''}">Este mes</a>
    </div>
  </div>
  <div class="tablewrap"><table>
    <thead><tr><th></th><th>Vendedor</th><th>Ingresos ganados</th><th>Deals ganados</th><th>Reuniones</th><th>Toques</th><th>Objetivo de ingresos</th></tr></thead>
    <tbody>${rows.map((r, i) => `
      <tr class="${r.name === user.name ? 'yo' : ''}">
        <td><span class="pos ${i < 3 ? 'p' + (i + 1) : ''}">${i + 1}</span></td>
        <td><strong>${esc(r.name)}</strong></td>
        <td><strong>${money(r.mrr)}</strong></td>
        <td>${r.ganados}</td>
        <td>${r.reuniones}</td>
        <td>${r.toques}</td>
        <td>${r.cumpl == null ? '<span class="muted">—</span>' : `<strong>${r.cumpl}%</strong>`}</td>
      </tr>`).join('')}</tbody>
  </table></div>
  <p class="caption">Ordenado por ingresos ganados en el período — proyectos y suscripciones sumados (desempata: deals ganados, reuniones, toques). El porcentaje es el cumplimiento del objetivo de ingresos ${periodo === 'mes' ? 'mensual' : 'semanal'}.</p>`
  });
}

/* --------- gráficas por vendedor --------- */

const fmtK = (v) => (v >= 1000 ? '$' + Math.round(v / 100) / 10 + 'k' : '$' + Math.round(v));

function barChart(points, isMoney = false) {
  const W = 320, H = 150, P = 14, PB = 26;
  const max = Math.max(1, ...points.map((p) => p.v));
  const n = points.length, paso = (W - 2 * P) / n, gap = Math.min(6, paso * 0.25), bw = paso - gap;
  const bars = points.map((p, i) => {
    const x = P + i * paso + gap / 2;
    const h = (p.v / max) * (H - PB - 16);
    const y = H - PB - h;
    const lbl = (n <= 8 || i % Math.ceil(n / 8) === 0) ? `<text x="${x + bw / 2}" y="${H - 8}" font-size="8.5" text-anchor="middle" fill="#8494A6">${p.label}</text>` : '';
    const val = p.v > 0 ? `<text x="${x + bw / 2}" y="${y - 4}" font-size="8.5" text-anchor="middle" fill="#54657A">${isMoney ? fmtK(p.v) : p.v}</text>` : '';
    return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(1.5, h)}" rx="2" fill="#0F3459" opacity="${p.v > 0 ? '.9' : '.22'}"/>${val}${lbl}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${bars}</svg>`;
}

function metasDetallePage({ user, vendedor, series }) {
  const bloque = (titulo, sub, pts) => `
  <h2>${titulo} <span class="muted small" style="font-weight:400">· ${sub}</span></h2>
  <div class="charts">
    <div class="card"><h4 style="margin:0 0 .4rem">Toques</h4>${barChart(pts.map((p) => ({ label: p.label, v: p.toques })))}</div>
    <div class="card"><h4 style="margin:0 0 .4rem">Reuniones realizadas</h4>${barChart(pts.map((p) => ({ label: p.label, v: p.reuniones })))}</div>
    <div class="card"><h4 style="margin:0 0 .4rem">Ingresos ganados</h4>${barChart(pts.map((p) => ({ label: p.label, v: p.mrr })), true)}</div>
  </div>`;
  return layout({
    title: `Métricas · ${vendedor.name}`, user, active: 'metas',
    body: `
  <div class="toolbar">
    <a class="btn secondary small" href="/objetivos">← Objetivos</a>
  </div>
  <h1>Métricas de ${esc(vendedor.name)}</h1>
  ${bloque('Diario', 'últimos 14 días', series.diario)}
  ${bloque('Semanal', 'últimas 8 semanas (desde el lunes)', series.semanal)}
  ${bloque('Mensual', 'últimos 6 meses', series.mensual)}`
  });
}

/* --------- reportes --------- */

function dashHeader(active) {
  return `
  <div class="toolbar">
    <div class="seg">
      <a href="/dashboard" class="${active === 'dashboard' ? 'on' : ''}">Dashboard</a>
      <a href="/reportes" class="${active === 'reportes' ? 'on' : ''}">Reportes</a>
      <a href="/campanas" class="${active === 'campanas' ? 'on' : ''}">Campañas</a>
    </div>
  </div>`;
}

function reportesPage({ user, p, off, desde, hasta, periodos, r }) {
  return layout({
    title: 'Reportes', user, active: 'dashboard',
    body: `
  <h1>Reportes</h1>
  ${dashHeader('reportes')}
  <div class="toolbar">
    <div class="seg">
      <a href="/reportes?p=dia" class="${p === 'dia' ? 'on' : ''}">Diario</a>
      <a href="/reportes?p=semana" class="${p === 'semana' ? 'on' : ''}">Semanal</a>
      <a href="/reportes?p=mes" class="${p === 'mes' ? 'on' : ''}">Mensual</a>
    </div>
    <form method="get" action="/reportes" style="display:inline">
      <input type="hidden" name="p" value="${p}">
      <select name="off" onchange="this.form.submit()" style="width:auto">
        ${periodos.map((per) => `<option value="${per.off}" ${per.off === off ? 'selected' : ''}>${per.off === 0 ? (p === 'mes' ? 'Mes actual' : p === 'dia' ? 'Hoy' : 'Semana actual') : per.label}</option>`).join('')}
      </select>
    </form>
    <div class="sp"></div>
    <a class="btn secondary" href="/reportes.csv?p=${p}&off=${off}">Descargar CSV</a>
    <a class="btn" href="/reportes/imprimir?p=${p}&off=${off}" target="_blank" rel="noopener">Exportar PDF</a>
  </div>
  <p class="small muted">Período: <strong>${fecha(desde)} a ${fecha(hasta)}</strong></p>

  <div class="tiles">
    <div class="tile"><div class="v">${money(r.tot.mrr)}</div><div class="l">Ingresos ganados (total)</div></div>
    <div class="tile"><div class="v">${money(r.ingresosProyectos)}</div><div class="l">Por proyectos únicos</div></div>
    <div class="tile"><div class="v">${money(r.mrrNuevo)}</div><div class="l">MRR nuevo (suscripciones)</div></div>
    <div class="tile"><div class="v">${r.tot.ganados} / ${r.tot.perdidos}</div><div class="l">Ganados / perdidos</div></div>
    <div class="tile"><div class="v">${r.winRate == null ? '—' : r.winRate + '%'}</div><div class="l">Win rate del período</div></div>
    <div class="tile"><div class="v">${r.tot.toques}</div><div class="l">Toques del equipo</div></div>
  </div>

  <h2>Por vendedor</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Vendedor</th><th>Contactos</th><th>Toques</th><th>Reu. agend.</th><th>Reu. hechas</th><th>Deals creados</th><th>Ganados</th><th>Perdidos</th><th>Ingresos ganados</th></tr></thead>
    <tbody>
      ${r.porVendedor.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td><td>${v.contactos}</td><td>${v.toques}</td><td>${v.agendadas}</td><td>${v.realizadas}</td><td>${v.creados}</td><td>${v.ganados}</td><td>${v.perdidos}</td><td>${money(v.mrr)}</td></tr>`).join('')}
      <tr><td><strong>TOTAL</strong></td><td><strong>${r.tot.contactos}</strong></td><td><strong>${r.tot.toques}</strong></td><td><strong>${r.tot.agendadas}</strong></td><td><strong>${r.tot.realizadas}</strong></td><td><strong>${r.tot.creados}</strong></td><td><strong>${r.tot.ganados}</strong></td><td><strong>${r.tot.perdidos}</strong></td><td><strong>${money(r.tot.mrr)}</strong></td></tr>
    </tbody>
  </table></div>

  <h2>Deals cerrados en el período</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Empresa</th><th>Resultado</th><th>Tipo</th><th>Valor</th><th>Fecha</th><th>Motivo</th><th>Vendedor</th></tr></thead>
    <tbody>${r.cerrados.length ? r.cerrados.map((d) => `<tr><td><strong>${esc(d.empresa)}</strong></td><td><span class="chip" style="background:${ETAPA_COLOR[d.etapa]}">${d.etapa}</span></td><td class="small">${d.tipo_venta === 'Suscripción mensual' ? 'Suscripción' : 'Proyecto'}</td><td>${money(d.mrr)}${d.tipo_venta === 'Suscripción mensual' ? '<span class="muted small">/mes</span>' : ''}</td><td>${fecha(d.fecha_cierre)}</td><td>${esc(d.motivo_perdida || '—')}</td><td>${esc(d.vendedor)}</td></tr>`).join('') : '<tr><td colspan="7" class="muted">Sin cierres en este período.</td></tr>'}</tbody>
  </table></div>

  <h2>Motivos de pérdida del período</h2>
  <div class="card">
    ${r.motivos.length ? r.motivos.map((m) => `<div class="prog-row"><span class="pl">${esc(m.label)}</span><div class="prog"><i style="width:${Math.round((m.n / Math.max(1, r.tot.perdidos)) * 100)}%;background:#C05450"></i></div><span class="pv">${m.n}</span></div>`).join('') : '<p class="muted small" style="margin:0">Sin deals perdidos en este período.</p>'}
  </div>`
  });
}

// Tabla de campañas ganadoras (compartida por los dashboards).
function tablaCampanas(campanas) {
  return `
  <h2>Campañas: de dónde vienen las leads</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Campaña</th><th>Leads</th><th>Ganadas</th><th>Perdidas</th><th>Ingresos</th><th>Conversión</th></tr></thead>
    <tbody>${campanas.length ? campanas.map((c) => `
      <tr>
        <td><strong>${esc(c.nombre)}</strong></td>
        <td>${c.leads}</td>
        <td>${c.ganadas}</td>
        <td>${c.perdidas}</td>
        <td><strong>${money(c.ingresos)}</strong></td>
        <td>${c.leads > 0 ? Math.round((c.ganadas / c.leads) * 100) + '%' : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="muted">Sin leads con campaña todavía. Creá campañas en Administración → Campañas y elegilas al cargar la lead.</td></tr>'}</tbody>
  </table></div>
  <p class="caption">Ordenadas por ganadas e ingresos: las de arriba son tus ángulos ganadores. "Conversión" = ganadas ÷ leads de la campaña.</p>`;
}

// Sección de gestión de campañas de un panel (reutilizada por CFD y las Config de cada empresa).
function campanasSection(campanas, base) {
  return `
  <div class="card">
    <p class="small muted">Los vendedores eligen la campaña al cargar la lead; el dashboard muestra cuáles ganan. Desactivar una campaña la saca del selector pero conserva sus estadísticas.</p>
    ${campanas.length ? campanas.map((c) => `
    <div class="cfg-row">
      <form method="post" action="${base}/${c.id}" class="cfg-inline">
        <input type="hidden" name="accion" value="renombrar">
        <input name="nombre" value="${esc(c.nombre)}">
        <button class="btn secondary small">Renombrar</button>
      </form>
      <span class="muted small">${c.leads} lead${c.leads === 1 ? '' : 's'}</span>
      ${c.activa ? '' : '<span class="chip chip--estado-cancelado">Inactiva</span>'}
      <form method="post" action="${base}/${c.id}" style="display:inline"><input type="hidden" name="accion" value="toggle"><button class="btn secondary small">${c.activa ? 'Desactivar' : 'Activar'}</button></form>
    </div>`).join('') : '<p class="muted small" style="margin:0">Todavía no hay campañas de esta empresa. Creá la primera abajo — ej: "Meta Ads agosto", "Google leads", "Referidos".</p>'}
    <form method="post" action="${base}" class="cfg-inline" style="margin-top:.6rem">
      <input name="nombre" placeholder="Nueva campaña (ej: Meta Ads agosto)" required>
      <button class="btn small">Crear campaña</button>
    </form>
  </div>`;
}

function campanasPage({ user, campanas }) {
  return layout({
    title: 'Campañas', user, active: 'dashboard',
    body: `
  <h1>Campañas</h1>
  ${dashHeader('campanas')}
  ${campanasSection(campanas, '/campanas')}`
  });
}

/* --------- campus / hub --------- */

function hubPage({ user }) {
  return layout({
    title: 'Campus', user, active: '', sistema: 'hub',
    body: `
  <div class="hub-wrap">
    <div class="hub-head">
      <h1>Hola, ${esc(user.name.split(' ')[0])}</h1>
      <p>¿A dónde vas hoy?</p>
    </div>
    <div class="hub-grid">
      ${tieneSistema(user, 'cfd') ? `
      <a class="hub-card" href="/pipeline">
        <span class="hc-ic">${ICONS.pipeline}</span>
        <h3>Comercial Cloud For Deploy</h3>
        <p>Ventas de software: pipeline, actividad diaria, metas, ranking${user.role === 'admin' ? ', dashboard y reportes' : ''}.</p>
      </a>` : ''}
      ${tieneSistema(user, 'gondolas') ? `
      <a class="hub-card" href="/gondolas/pipeline">
        <span class="hc-ic">${IC('<path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/>')}</span>
        <h3>Comercial Góndolas</h3>
        <p>Ventas de góndolas: pipeline con etapas propias y carga diaria a medida.</p>
      </a>` : ''}
      ${tieneSistema(user, 'estanterias') ? `
      <a class="hub-card" href="/estanterias/pipeline">
        <span class="hc-ic">${IC('<path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/>')}</span>
        <h3>Comercial Estanterías Reforzadas</h3>
        <p>Ventas de la nueva empresa: pipeline, actividad y metas propias.</p>
      </a>` : ''}
      ${tieneSistema(user, 'sitioweb') ? `
      <a class="hub-card" href="/sitioweb/pipeline">
        <span class="hc-ic">${IC('<path d="M10 3a7 7 0 100 14 7 7 0 000-14z"/><path d="M3 10h14M10 3c-2 2.2-2 11.8 0 14M10 3c2 2.2 2 11.8 0 14"/>')}</span>
        <h3>Comercial SitioWeb Digital</h3>
        <p>Ventas de sitios web: pipeline, actividad y metas propias.</p>
      </a>` : ''}
      ${tieneSistema(user, 'cobranza') ? `
      <a class="hub-card" href="/cobranza">
        <span class="hc-ic">${ICONS.cobranza}</span>
        <h3>Panel de Cobranza</h3>
        <p>${user.role === 'admin' ? 'Comisiones del equipo: cuánto, a quién y cuándo pagar.' : 'Tus comisiones: cuánto ganaste, qué está pendiente y cuándo cobrás.'}</p>
      </a>` : ''}
      ${user.role === 'admin' ? `
      <a class="hub-card" href="/admin">
        <span class="hc-ic">${ICONS.equipo}</span>
        <h3>Panel Administración</h3>
        <p>Usuarios, roles (vendedor, developer, admin) y permisos por sistema.</p>
      </a>` : ''}
      <div class="hub-card hub-soon">
        <span class="soon-chip hc-soon">Próximamente</span>
        <span class="hc-ic">${IC('<path d="M7 6.5L3.5 10 7 13.5M13 6.5l3.5 3.5-3.5 3.5M11.2 4.5l-2.4 11"/>')}</span>
        <h3>Panel de Developers</h3>
        <p>Proyectos, entregas y documentación técnica del equipo de desarrollo.</p>
      </div>
      <div class="hub-card hub-soon">
        <span class="soon-chip hc-soon">Próximamente</span>
        <span class="hc-ic">${IC('<path d="M10 4L2.5 7.5 10 11l7.5-3.5L10 4z"/><path d="M5 9v4c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5V9"/>')}</span>
        <h3>Panel de Cursos</h3>
        <p>Capacitaciones y formación comercial del equipo.</p>
      </div>
      <a class="hub-card hub-pco2" href="https://puntoco2.com/home" target="_blank" rel="noopener">
        <span class="hc-ic">${ICON_PCO2}</span>
        <h3>PuntoCO2</h3>
        <p>Nuestra plataforma SaaS de huella de carbono.</p>
        <span class="hc-ext">puntoco2.com ↗</span>
      </a>
      <a class="hub-card hub-cfd" href="https://cloudfordeploy.com/" target="_blank" rel="noopener">
        <img class="hc-logo" src="/logo.png" alt="Cloud For Deploy" width="92" height="51">
        <h3>Cloud For Deploy</h3>
        <p>El sitio web de la empresa.</p>
        <span class="hc-ext">cloudfordeploy.com ↗</span>
      </a>
      <a class="hub-card hub-est" href="https://estanteriasreforzadas.com/" target="_blank" rel="noopener">
        <span class="hc-ic">${IC('<path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/>')}</span>
        <h3>Estanterías Reforzadas</h3>
        <p>La tienda de estanterías y góndolas.</p>
        <span class="hc-ext">estanteriasreforzadas.com ↗</span>
      </a>
      <a class="hub-card hub-sw" href="https://app.sitioweb.digital/" target="_blank" rel="noopener">
        <img class="hc-logo" src="/logo-sitioweb.svg" alt="SitioWeb Digital" width="44" height="44">
        <h3>SitioWeb Digital</h3>
        <p>Tu página propia en minutos.</p>
        <span class="hc-ext">app.sitioweb.digital ↗</span>
      </a>
      <a class="hub-card hub-gon" href="https://gondola.com.ar/" target="_blank" rel="noopener">
        <span class="hc-ic">${IC('<path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/><path d="M6 8V5.5h3V8"/>')}</span>
        <h3>Gondola</h3>
        <p>La tienda online de góndolas.</p>
        <span class="hc-ext">gondola.com.ar ↗</span>
      </a>
      <a class="hub-card hub-eol" href="https://estanterias.online/" target="_blank" rel="noopener">
        <span class="hc-ic">${IC('<path d="M3 5h2l1.6 8.5a1.5 1.5 0 001.5 1.2h6.3a1.5 1.5 0 001.5-1.2L17.5 7H6"/><circle cx="8.5" cy="17" r="1.1"/><circle cx="14.5" cy="17" r="1.1"/>')}</span>
        <h3>Estanterías Online</h3>
        <p>La tienda online de estanterías.</p>
        <span class="hc-ext">estanterias.online ↗</span>
      </a>
    </div>
  </div>`
  });
}

/* --------- panel de cobranza --------- */

const ESTADO_LABEL = { pendiente: 'Pendiente', pagado: 'Pagado', cancelado: 'Cancelado' };
const chipEstado = (e) => `<span class="chip chip--estado-${e}">${ESTADO_LABEL[e] || e}</span>`;

function cobranzaAdminPage({ user, vendedores, tot }) {
  return layout({
    title: 'Cobranza', user, active: 'cobranza', sistema: 'cobranza',
    body: `
  <h1>Comisiones del equipo</h1>
  <div class="tiles">
    <div class="tile"><div class="v">${money(tot.exigible)}</div><div class="l">Exigible hoy (cuotas vencidas o del día)</div></div>
    <div class="tile"><div class="v">${money(tot.pendiente)}</div><div class="l">Pendiente total (incluye cuotas futuras)</div></div>
    <div class="tile"><div class="v">${money(tot.pagado)}</div><div class="l">Pagado histórico</div></div>
  </div>
  <div class="tablewrap"><table>
    <thead><tr><th>Vendedor</th><th>Exigible hoy</th><th>Pendiente total</th><th>Pagado</th><th>Próxima cuota</th><th></th></tr></thead>
    <tbody>${vendedores.map((v) => `
      <tr>
        <td><strong>${esc(v.name)}</strong></td>
        <td>${v.exigible > 0 ? `<strong class="warn">${money(v.exigible)}</strong>` : money(v.exigible)}</td>
        <td>${money(v.pendiente)}</td>
        <td>${money(v.pagado)}</td>
        <td>${fecha(v.proxima)}</td>
        <td><a class="btn secondary small" href="/cobranza/vendedor/${v.id}">Ver detalle</a></td>
      </tr>`).join('')}</tbody>
  </table></div>
  <p class="caption">Las cuotas se generan solas cuando un deal pasa a Ganado, según las <a href="/cobranza/reglas">reglas de comisión</a>. "Exigible hoy" son cuotas cuya fecha ya llegó y siguen sin pagarse.</p>`
  });
}

function cobranzaVendedorPage({ user, vendedor, resumen, filas, esAdmin }) {
  const hoy = hoyISO();
  return layout({
    title: `Cobranza · ${vendedor.name}`, user, active: 'cobranza', sistema: 'cobranza',
    body: `
  ${esAdmin ? `<div class="toolbar"><a class="btn secondary small" href="/cobranza">← Equipo</a></div>` : ''}
  <h1>${esAdmin ? `Comisiones de ${esc(vendedor.name)}` : 'Mis comisiones'}</h1>
  <div class="tiles">
    <div class="tile"><div class="v">${money(resumen.exigible)}</div><div class="l">${esAdmin ? 'Exigible hoy' : 'Para cobrar ya'}</div></div>
    <div class="tile"><div class="v">${money(resumen.pendiente)}</div><div class="l">Pendiente total</div></div>
    <div class="tile"><div class="v">${money(resumen.pagado)}</div><div class="l">Pagado</div></div>
    <div class="tile"><div class="v">${fecha(resumen.proxima)}</div><div class="l">Próxima cuota</div></div>
  </div>
  <div class="tablewrap"><table>
    <thead><tr><th>Fecha</th><th>Deal</th><th>Concepto</th><th>Monto</th><th>Estado</th><th>Invoice</th>${esAdmin ? '<th>Acciones</th>' : ''}</tr></thead>
    <tbody>${filas.length ? filas.map((c) => {
      const vencida = c.estado === 'pendiente' && c.fecha_devengada <= hoy;
      return `
      <tr class="${vencida ? 'vencida' : ''}">
        <td>${fecha(c.fecha_devengada)}</td>
        <td><a href="/deals/${c.deal_id}">${esc(c.empresa)}</a><div class="small muted">${esc(c.tipo_venta)}</div></td>
        <td class="small">${esc(c.concepto)}</td>
        <td><strong>${money(c.monto)}</strong></td>
        <td>${chipEstado(c.estado)}${c.pagado_at ? `<div class="small muted">${fecha(c.pagado_at)}</div>` : ''}</td>
        <td>${c.invoice_path
          ? `<a class="small" href="/cobranza/${c.id}/invoice">${esc((c.invoice_nombre || 'archivo').slice(0, 22))}</a>`
          : `<form class="inv-form" method="post" action="/cobranza/${c.id}/invoice" enctype="multipart/form-data"><input type="file" name="invoice" accept=".pdf,.png,.jpg,.jpeg" required><button class="btn secondary small">Subir</button></form>`}</td>
        ${esAdmin ? `<td style="white-space:nowrap">
          ${c.estado !== 'pagado' ? `<form method="post" action="/cobranza/${c.id}/estado" style="display:inline"><input type="hidden" name="estado" value="pagado"><button class="btn small">Pagar</button></form>` : ''}
          ${c.estado === 'pendiente' ? `<form method="post" action="/cobranza/${c.id}/estado" style="display:inline" onsubmit="return confirm('¿Cancelar esta cuota? (ej: el cliente no retuvo el servicio)')"><input type="hidden" name="estado" value="cancelado"><button class="btn secondary small">Cancelar</button></form>` : ''}
          ${c.estado !== 'pendiente' ? `<form method="post" action="/cobranza/${c.id}/estado" style="display:inline"><input type="hidden" name="estado" value="pendiente"><button class="btn secondary small">Reabrir</button></form>` : ''}
        </td>` : ''}
      </tr>`;
    }).join('') : `<tr><td colspan="${esAdmin ? 7 : 6}" class="muted">Sin comisiones todavía. Se generan solas cuando ${esAdmin ? 'sus' : 'tus'} deals pasan a Ganado.</td></tr>`}</tbody>
  </table></div>
  <p class="caption">Las filas resaltadas son cuotas exigibles (la fecha ya llegó). ${esAdmin ? 'Cancelá las cuotas restantes si el cliente no retiene el servicio (infraestructura, mantenimiento o suscripción).' : 'Subí tu factura (invoice) en cada cuota para agilizar el pago.'}</p>`
  });
}

function reglasPage({ user, reglas, paneles }) {
  const p = reglas['Proyecto único'] || { tramos: [] };
  const fila = (pref, tipo) => {
    const r = reglas[tipo] || { fases: [] };
    const f1 = r.fases[0] || {}, f2 = r.fases[1] || {};
    return `
    <div class="card">
      <h3 style="margin-top:0">${tipo}</h3>
      <div class="grid2">
        <div><label>Fase 1: meses</label><input name="${pref}_meses1" type="number" min="0" value="${f1.meses ?? ''}"></div>
        <div><label>Fase 1: % del valor mensual</label><input name="${pref}_pct1" type="number" min="0" step="any" value="${f1.pct ?? ''}"></div>
        <div><label>Fase 2: meses (vacío = sin fase 2)</label><input name="${pref}_meses2" type="number" min="0" value="${f2.meses ?? ''}"></div>
        <div><label>Fase 2: %</label><input name="${pref}_pct2" type="number" min="0" step="any" value="${f2.pct ?? ''}"></div>
      </div>
      <label>Condición / nota</label>
      <input name="${pref}_nota" value="${esc(r.nota || '')}" placeholder="Ej: solo si el cliente retiene el servicio">
    </div>`;
  };
  return layout({
    title: 'Reglas de comisión', user, active: 'reglas', sistema: 'cobranza',
    body: `
  <h1>Reglas de comisión</h1>
  <p class="small muted">Estas reglas definen cuánto cobra el vendedor cuando un deal pasa a Ganado. Los cambios aplican a los <strong>cierres futuros</strong>: las cuotas ya generadas no se recalculan.</p>
  <form method="post" action="/cobranza/reglas">
    <div class="card">
      <h3 style="margin-top:0">Proyecto único (a medida) — % según el ticket</h3>
      <div class="tablewrap"><table>
        <thead><tr><th>Tramo</th><th>Ticket hasta ($)</th><th>Comisión (%)</th></tr></thead>
        <tbody>
          ${[0, 1, 2, 3].map((i) => {
            const t = p.tramos[i] || {};
            return `<tr><td class="muted">${i + 1}${i === 3 ? ' (resto)' : ''}</td>
              <td><input name="p_hasta${i + 1}" type="number" min="0" step="any" value="${t.hasta ?? ''}" ${i === 3 ? 'placeholder="vacío = sin límite"' : ''}></td>
              <td><input name="p_pct${i + 1}" type="number" min="0" step="any" value="${t.pct ?? ''}"></td></tr>`;
          }).join('')}
        </tbody>
      </table></div>
      <p class="caption">Se aplica el primer tramo cuyo "hasta" alcanza el ticket. El último tramo con "hasta" vacío cubre el resto.</p>
    </div>
    ${fila('s', 'Suscripción mensual')}
    ${fila('i', 'Infraestructura')}
    ${fila('m', 'Mantenimiento')}
    ${(paneles || []).map((P) => `
    <div class="card">
      <h3 style="margin-top:0">Rubro ${esc(P.nombre)} — % por venta</h3>
      <p class="small muted">Las ventas del panel Comercial ${esc(P.nombre)} usan esta regla (no la de tipo de venta): comisión única con fecha del día del cierre, <strong>cobrable al momento</strong>.</p>
      <div class="grid2">
        <div><label>Comisión (% del valor de la venta)</label><input name="flat_${P.slug}" type="number" min="0" step="any" value="${reglas[P.slug] ? reglas[P.slug].pct : 5}"></div>
      </div>
    </div>`).join('')}
    <button class="btn">Guardar reglas</button>
  </form>`
  });
}

// Vista imprimible del reporte: el navegador la exporta a PDF (se abre el diálogo de impresión solo).
function reporteImprimirPage({ user, p, nombrePeriodo, desde, hasta, r }) {
  const filaV = (v, strong = false) => {
    const t = strong ? 'strong' : 'span';
    return `<tr><td><${t}>${esc(v.name)}</${t}></td><td>${v.contactos}</td><td>${v.toques}</td><td>${v.agendadas}</td><td>${v.realizadas}</td><td>${v.creados}</td><td>${v.ganados}</td><td>${v.perdidos}</td><td>${money(v.mrr)}</td></tr>`;
  };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Reporte ${esc(nombrePeriodo)} · ${esc(desde)}${desde !== hasta ? ' a ' + esc(hasta) : ''}</title>
<style>
  * { box-sizing:border-box; }
  body { font:12px/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif; color:#0F1D2E; margin:2rem; }
  .cab { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #0F3459; padding-bottom:.8rem; margin-bottom:1.2rem; }
  .cab img { height:52px; }
  .cab h1 { font-size:1.25rem; margin:0; color:#0F3459; }
  .cab .sub { color:#54657A; font-size:.8rem; }
  h2 { font-size:.95rem; color:#0F3459; margin:1.4rem 0 .5rem; }
  table { border-collapse:collapse; width:100%; font-size:11px; }
  th { text-align:left; background:#E9EEF4; color:#54657A; text-transform:uppercase; font-size:9px; letter-spacing:.05em; padding:.4rem .5rem; border:1px solid #DCE4EE; }
  td { padding:.4rem .5rem; border:1px solid #DCE4EE; }
  .tiles { display:flex; gap:.6rem; flex-wrap:wrap; margin-bottom:.4rem; }
  .tile { border:1px solid #DCE4EE; border-top:3px solid #0F3459; border-radius:6px; padding:.5rem .8rem; min-width:8.5rem; }
  .tile .v { font-size:1.1rem; font-weight:700; }
  .tile .l { font-size:.68rem; color:#54657A; }
  .pie { margin-top:1.5rem; padding-top:.6rem; border-top:1px solid #DCE4EE; color:#8494A6; font-size:.7rem; display:flex; justify-content:space-between; }
  @media print { body { margin:.5rem; } .no-print { display:none; } }
  .no-print { position:fixed; top:1rem; right:1rem; background:#0F3459; color:#fff; border:none; border-radius:8px; padding:.6rem 1rem; font-weight:700; cursor:pointer; }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()">Imprimir / Guardar PDF</button>
<div class="cab">
  <div>
    <h1>Reporte comercial ${esc(nombrePeriodo)}</h1>
    <div class="sub">Período: ${fecha(desde)}${desde !== hasta ? ' a ' + fecha(hasta) : ''} · Comercial Cloud For Deploy</div>
  </div>
  <img src="/logo.png" alt="Cloud For Deploy">
</div>

<div class="tiles">
  <div class="tile"><div class="v">${money(r.tot.mrr)}</div><div class="l">Ingresos ganados</div></div>
  <div class="tile"><div class="v">${money(r.ingresosProyectos)}</div><div class="l">Por proyectos</div></div>
  <div class="tile"><div class="v">${money(r.mrrNuevo)}</div><div class="l">MRR nuevo</div></div>
  <div class="tile"><div class="v">${r.tot.ganados} / ${r.tot.perdidos}</div><div class="l">Ganados / perdidos</div></div>
  <div class="tile"><div class="v">${r.winRate == null ? '—' : r.winRate + '%'}</div><div class="l">Win rate</div></div>
  <div class="tile"><div class="v">${r.tot.toques}</div><div class="l">Toques</div></div>
</div>

<h2>Por vendedor</h2>
<table>
  <thead><tr><th>Vendedor</th><th>Contactos</th><th>Toques</th><th>Reu. agend.</th><th>Reu. hechas</th><th>Deals creados</th><th>Ganados</th><th>Perdidos</th><th>Ingresos</th></tr></thead>
  <tbody>
    ${r.porVendedor.map((v) => filaV(v)).join('')}
    ${filaV({ ...r.tot, name: 'TOTAL' }, true)}
  </tbody>
</table>

<h2>Deals cerrados en el período</h2>
<table>
  <thead><tr><th>Empresa</th><th>Resultado</th><th>Tipo</th><th>Valor</th><th>Fecha</th><th>Motivo</th><th>Vendedor</th></tr></thead>
  <tbody>${r.cerrados.length ? r.cerrados.map((d) => `<tr><td>${esc(d.empresa)}</td><td>${d.etapa}</td><td>${d.tipo_venta === 'Suscripción mensual' ? 'Suscripción' : esc(d.tipo_venta)}</td><td>${money(d.mrr)}</td><td>${fecha(d.fecha_cierre)}</td><td>${esc(d.motivo_perdida || '—')}</td><td>${esc(d.vendedor)}</td></tr>`).join('') : '<tr><td colspan="7">Sin cierres en este período.</td></tr>'}</tbody>
</table>

<h2>Motivos de pérdida</h2>
<table>
  <thead><tr><th>Motivo</th><th>Cantidad</th></tr></thead>
  <tbody>${r.motivos.length ? r.motivos.map((m) => `<tr><td>${esc(m.label)}</td><td>${m.n}</td></tr>`).join('') : '<tr><td colspan="2">Sin deals perdidos en el período.</td></tr>'}</tbody>
</table>

<div class="pie">
  <span>Generado por ${esc(user.name)} · Campus C4D</span>
  <span>${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</span>
</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });</script>
</body>
</html>`;
}

/* --------- paneles comerciales configurables --------- */

function panelActividadPage({ user, campos, today, history, info }) {
  const vals = today ? (() => { try { return JSON.parse(today.valores || '{}'); } catch { return {}; } })() : {};
  return layout({
    title: `Actividad · ${info.nombre}`, user, active: 'actividad', sistema: info.slug,
    body: `
  <h1>Mi actividad de hoy</h1>
  <p class="muted small">Los campos los define administración (Config). Si volvés a guardar, se actualiza el día.</p>
  <form method="post" action="${info.base}/actividad" class="card">
    <input type="hidden" name="fecha" value="${hoyISO()}">
    <div class="grid2">
      ${campos.map((c) => `<div><label>${esc(c.label)}</label><input name="c${c.id}" type="number" min="0" inputmode="numeric" value="${vals['c' + c.id] ?? ''}" placeholder="0"></div>`).join('')}
    </div>
    <label>Notas del día</label>
    <input name="notas" value="${esc(today?.notas)}" placeholder="Opcional">
    <div style="margin-top:1.2rem"><button class="btn" style="width:100%">Guardar mi día</button></div>
  </form>
  <h2>Mis últimos 14 días</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Fecha</th>${campos.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>Notas</th></tr></thead>
    <tbody>${history.length ? history.map((r) => {
      let v = {}; try { v = JSON.parse(r.valores || '{}'); } catch {}
      return `<tr><td>${fecha(r.fecha)}</td>${campos.map((c) => `<td>${v['c' + c.id] ?? 0}</td>`).join('')}<td class="muted">${esc(r.notas || '')}</td></tr>`;
    }).join('') : `<tr><td colspan="${campos.length + 2}" class="muted">Todavía no cargaste ningún día.</td></tr>`}</tbody>
  </table></div>`
  });
}

// Métricas de objetivos de góndolas: campos dinámicos + fijas de venta.
const panelMetricas = (campos) => [
  ...campos.map((c) => ({ key: 'c' + c.id, label: c.label, fmt: (v) => v })),
  { key: 'ganados', label: 'Ventas ganadas', fmt: (v) => v },
  { key: 'ingresos', label: 'Ingresos ($)', fmt: money },
];

function panelProgreso(metricas, goal, stats) {
  return metricas.map((m) => {
    const obj = goal ? Number(goal[m.key]) || 0 : 0;
    const real = stats[m.key] || 0;
    if (!obj) return `<div class="prog-row"><span class="pl">${esc(m.label)}</span><div class="prog"></div><span class="pv muted">${m.fmt(real)} / sin objetivo</span></div>`;
    const pct = Math.min(100, Math.round((real / obj) * 100));
    return `<div class="prog-row"><span class="pl">${esc(m.label)}</span><div class="prog"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i></div><span class="pv"><strong>${m.fmt(real)}</strong> / ${m.fmt(obj)}</span></div>`;
  }).join('');
}

function panelObjetivosPage({ user, campos, data, esAdmin, info }) {
  const metricas = panelMetricas(campos);
  const inputs = (pref, goal) => metricas.map((m) => `
    <div><label>${esc(m.label)}</label><input name="${pref}_${m.key}" type="number" min="0" step="any" inputmode="numeric" value="${goal && goal[m.key] ? goal[m.key] : ''}" placeholder="0"></div>`).join('');
  return layout({
    title: `Objetivos · ${info.nombre}`, user, active: 'metas', sistema: info.slug,
    body: `
  <h1>Objetivos</h1>
  <div class="toolbar">
    <div class="seg">
      <a href="${info.base}/objetivos" class="on">Objetivos</a>
      <a href="${info.base}/ranking">Ranking</a>
    </div>
  </div>
  <p class="small muted">${esAdmin ? 'Las métricas salen de los campos de actividad que definiste en Config, más las fijas de venta.' : 'Tu progreso contra los objetivos que definió administración.'} La semana arranca el lunes; el mes, el día 1.</p>
  ${esAdmin ? `
  <div class="card card--accent">
    <h3 style="margin-top:0">Objetivos generales del equipo</h3>
    <form method="post" action="${info.base}/objetivos-generales">
      <div class="goal-cols">
        <div><strong class="small">Diario</strong><div class="goal-inputs">${inputs('d', null)}</div></div>
        <div><strong class="small">Semanal</strong><div class="goal-inputs">${inputs('s', null)}</div></div>
        <div><strong class="small">Mensual</strong><div class="goal-inputs">${inputs('m', null)}</div></div>
      </div>
      <div style="margin-top:.8rem"><button class="btn small" onclick="return confirm('¿Aplicar a TODOS los vendedores activos?')">Aplicar a todo el equipo</button></div>
    </form>
  </div>` : ''}
  ${data.map(({ u, goals, stats }) => `
  <div class="card">
    <h3 style="margin-top:0">${esc(u.name)}</h3>
    <div class="metas-grid">
      <div><h4 style="margin:.2rem 0 .4rem">Hoy</h4>${panelProgreso(metricas, goals.dia, stats.dia)}</div>
      <div><h4 style="margin:.2rem 0 .4rem">Esta semana</h4>${panelProgreso(metricas, goals.semana, stats.semana)}</div>
      <div><h4 style="margin:.2rem 0 .4rem">Este mes</h4>${panelProgreso(metricas, goals.mes, stats.mes)}</div>
    </div>
    ${esAdmin ? `
    <details style="margin-top:.8rem">
      <summary class="small" style="cursor:pointer;color:var(--accent-ink);font-weight:600">Definir objetivos de ${esc(u.name.split(' ')[0])}</summary>
      <form method="post" action="${info.base}/objetivos/${u.id}">
        <div class="goal-cols">
          <div><strong class="small">Diario</strong><div class="goal-inputs">${inputs('d', goals.dia)}</div></div>
          <div><strong class="small">Semanal</strong><div class="goal-inputs">${inputs('s', goals.semana)}</div></div>
          <div><strong class="small">Mensual</strong><div class="goal-inputs">${inputs('m', goals.mes)}</div></div>
        </div>
        <div style="margin-top:.8rem"><button class="btn small">Guardar objetivos</button></div>
      </form>
    </details>` : ''}
  </div>`).join('')}`
  });
}

function panelRankingPage({ user, periodo, campos, rows, info }) {
  return layout({
    title: `Ranking · ${info.nombre}`, user, active: 'metas', sistema: info.slug,
    body: `
  <h1>Ranking</h1>
  <div class="toolbar">
    <div class="seg">
      <a href="${info.base}/objetivos">Objetivos</a>
      <a href="${info.base}/ranking" class="on">Ranking</a>
    </div>
    <div class="seg">
      <a href="${info.base}/ranking?p=dia" class="${periodo === 'dia' ? 'on' : ''}">Hoy</a>
      <a href="${info.base}/ranking?p=semana" class="${periodo === 'semana' ? 'on' : ''}">Esta semana</a>
      <a href="${info.base}/ranking?p=mes" class="${periodo === 'mes' ? 'on' : ''}">Este mes</a>
    </div>
  </div>
  <div class="tablewrap"><table>
    <thead><tr><th></th><th>Vendedor</th><th>Ingresos ganados</th><th>Ventas</th>${campos.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>Objetivo ingresos</th></tr></thead>
    <tbody>${rows.map((r, i) => `
      <tr class="${r.name === user.name ? 'yo' : ''}">
        <td><span class="pos ${i < 3 ? 'p' + (i + 1) : ''}">${i + 1}</span></td>
        <td><strong>${esc(r.name)}</strong></td>
        <td><strong>${money(r.ingresos)}</strong></td>
        <td>${r.ganados}</td>
        ${campos.map((c) => `<td>${r['c' + c.id] || 0}</td>`).join('')}
        <td>${r.cumpl == null ? '<span class="muted">—</span>' : `<strong>${r.cumpl}%</strong>`}</td>
      </tr>`).join('')}</tbody>
  </table></div>
  <p class="caption">Ordenado por ingresos ganados aprobados en el período (desempata: ventas ganadas).</p>`
  });
}

function panelDashboardPage({ user, k, campos, colores, etapas, info }) {
  const max = Math.max(1, ...etapas.map((e) => k.funnel[e] || 0));
  const funnelHtml = etapas.map((e) => {
    const v = k.funnel[e] || 0;
    const pct = (v / max) * 100;
    const val = pct >= 60
      ? `<div class="bar-fill" style="width:${pct}%;background:${colores[e] || '#8494A6'}"><span class="bar-val">${v}</span></div>`
      : `<div class="bar-fill" style="width:${pct}%;background:${colores[e] || '#8494A6'}"></div><span class="bar-val" style="left:calc(${pct}% + .5rem)">${v}</span>`;
    return `<div class="prog-row" style="grid-template-columns:10rem 1fr"><span class="pl">${esc(e)}</span><div class="bar-track">${val}</div></div>`;
  }).join('');
  return layout({
    title: `Dashboard · ${info.nombre}`, user, active: 'dashboard', sistema: info.slug,
    body: `
  <h1>Dashboard ${esc(info.nombre)}</h1>
  <div class="tiles">
    <div class="tile"><div class="v">${k.activos}</div><div class="l">Deals activos</div></div>
    <div class="tile"><div class="v">${money(k.ingresosMes)}</div><div class="l">Ingresos ganados este mes</div></div>
    <div class="tile"><div class="v">${k.ganadosMes}</div><div class="l">Ventas ganadas este mes</div></div>
    <div class="tile"><div class="v">${k.winRate == null ? '—' : k.winRate + '%'}</div><div class="l">Win rate (90 días)</div></div>
  </div>
  <div class="card">
    <h2 style="margin-top:0">Funnel por etapa</h2>
    ${funnelHtml}
  </div>
  ${tablaCampanas(k.campanas)}
  <h2>Deals sin próximo paso</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Empresa</th><th>Vendedor</th><th>Etapa</th><th>Última actualización</th></tr></thead>
    <tbody>${k.sinPaso.length ? k.sinPaso.map((d) => `<tr><td><a href="/deals/${d.id}">${esc(d.empresa)}</a></td><td>${esc(d.vendedor_name)}</td><td><span class="chip" style="background:${colores[d.etapa] || '#8494A6'}">${esc(d.etapa)}</span></td><td>${fecha(d.updated_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">Ninguno — todo el pipeline tiene próximo paso.</td></tr>'}</tbody>
  </table></div>
  <h2>Por vendedor — este mes</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Vendedor</th>${campos.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>Ventas</th><th>Ingresos</th></tr></thead>
    <tbody>${k.porVendedor.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td>${campos.map((c) => `<td>${v['c' + c.id] || 0}</td>`).join('')}<td>${v.ganados}</td><td>${money(v.ingresos)}</td></tr>`).join('')}</tbody>
  </table></div>`
  });
}

function panelConfigPage({ user, etapas, campos, err, info, campanas = [] }) {
  const ERRS = { 'etapa-en-uso': 'No se puede borrar esa etapa: tiene deals adentro. Movelos a otra etapa primero.', 'ultima-etapa': 'Tiene que quedar al menos una etapa activa.' };
  return layout({
    title: `Config · ${info.nombre}`, user, active: 'config', sistema: info.slug, err: ERRS[err],
    body: `
  <h1>Configuración del panel</h1>
  <p class="small muted">Acá moldeás el panel de ${esc(info.nombre)}: las etapas del pipeline y los campos de la carga diaria (que también definen las métricas de los objetivos). <strong>Ganado y Perdido son fijas</strong>: sostienen la lógica de aprobación y comisiones.</p>

  <h2>Etapas del pipeline</h2>
  <div class="card">
    ${etapas.map((e, i) => `
    <div class="cfg-row">
      <form method="post" action="${info.base}/config/etapas/${e.id}" class="cfg-inline">
        <input type="hidden" name="accion" value="renombrar">
        <input name="nombre" value="${esc(e.nombre)}">
        <button class="btn secondary small">Renombrar</button>
      </form>
      <form method="post" action="${info.base}/config/etapas/${e.id}" style="display:inline"><input type="hidden" name="accion" value="subir"><button class="btn secondary small" ${i === 0 ? 'disabled' : ''}>↑</button></form>
      <form method="post" action="${info.base}/config/etapas/${e.id}" style="display:inline"><input type="hidden" name="accion" value="bajar"><button class="btn secondary small" ${i === etapas.length - 1 ? 'disabled' : ''}>↓</button></form>
      <form method="post" action="${info.base}/config/etapas/${e.id}" style="display:inline" onsubmit="return confirm('¿Borrar la etapa ${esc(e.nombre)}?')"><input type="hidden" name="accion" value="borrar"><button class="btn danger small">Borrar</button></form>
    </div>`).join('')}
    <div class="cfg-row"><span class="chip" style="background:#3E9B57">Ganado</span><span class="chip" style="background:#C05450">Perdido</span><span class="muted small">— fijas (lógica de aprobación)</span></div>
    <form method="post" action="${info.base}/config/etapas" class="cfg-inline" style="margin-top:.6rem">
      <input name="nombre" placeholder="Nueva etapa (ej: Instalación coordinada)" required>
      <button class="btn small">Agregar etapa</button>
    </form>
  </div>

  <h2>Campos de la carga diaria</h2>
  <div class="card">
    <p class="small muted">Cada campo aparece en la actividad diaria del vendedor y como métrica disponible en los objetivos.</p>
    ${campos.map((c) => `
    <div class="cfg-row">
      <form method="post" action="${info.base}/config/campos/${c.id}" class="cfg-inline">
        <input type="hidden" name="accion" value="renombrar">
        <input name="label" value="${esc(c.label)}">
        <button class="btn secondary small">Renombrar</button>
      </form>
      <form method="post" action="${info.base}/config/campos/${c.id}" style="display:inline" onsubmit="return confirm('¿Borrar el campo ${esc(c.label)}? Los datos históricos dejan de mostrarse.')"><input type="hidden" name="accion" value="borrar"><button class="btn danger small">Borrar</button></form>
    </div>`).join('')}
    <form method="post" action="${info.base}/config/campos" class="cfg-inline" style="margin-top:.6rem">
      <input name="label" placeholder="Nuevo campo (ej: Presupuestos entregados)" required>
      <button class="btn small">Agregar campo</button>
    </form>
  </div>

  <h2>Campañas de ${esc(info.nombre)}</h2>
  ${campanasSection(campanas, info.base + '/campanas')}`
  });
}

/* --------- documentación y changelog --------- */

function docsHeader(active) {
  return `
  <div class="toolbar">
    <div class="seg">
      <a href="/documentacion" class="${active === 'documentacion' ? 'on' : ''}">Documentación</a>
      <a href="/changelog" class="${active === 'changelog' ? 'on' : ''}">Changelog</a>
    </div>
  </div>`;
}

function docsPage({ user, manualDisponible }) {
  const esAdmin = user.role === 'admin';
  const etapaFila = (etapa, cuando) => `<tr><td><span class="chip" style="background:${ETAPA_COLOR[etapa]}">${esc(etapa)}</span></td><td>${cuando}</td></tr>`;
  return layout({
    title: 'Documentación', user, active: 'docs',
    body: `
  <h1>Documentación del sistema</h1>
  ${docsHeader('documentacion')}

  ${manualDisponible ? `
  <div class="card">
    <div class="deal-top">
      <h3 style="margin:0">Manual en PDF</h3>
      <a class="btn" href="/manual.pdf" download="Manual-Panel-Comercial.pdf">Descargar PDF</a>
    </div>
    <p class="small muted" style="margin:.4rem 0 .8rem">Manual oficial del sistema: todas las pantallas explicadas paso a paso. Ideal para el onboarding de vendedores nuevos.</p>
    <iframe src="/manual.pdf" title="Vista previa del manual" style="width:100%;height:32rem;border:1px solid var(--line);border-radius:10px;background:var(--surface2)"></iframe>
    <p class="caption">Si la vista previa no carga en tu navegador (algunos celulares no muestran PDF embebido), usá el botón Descargar.</p>
  </div>` : ''}

  <div class="card">
    <h3 style="margin-top:0">Qué es este sistema</h3>
    <p class="small">El Panel Comercial tiene tres piezas: el <strong>Pipeline</strong> (cada oportunidad de venta es una tarjeta que avanza por etapas), la <strong>Actividad diaria</strong> (el registro del esfuerzo de cada vendedor) y el <strong>Dashboard</strong> (los indicadores globales para tomar decisiones). La regla número uno del equipo: <strong>si no está cargado acá, no existe</strong> — un deal que no está en el sistema no cuenta para comisiones ni evaluación.</p>
  </div>

  <h2>Roles y permisos</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Acción</th><th>Vendedor</th><th>Admin</th></tr></thead>
    <tbody>
      <tr><td>Cargar y editar sus deals / su actividad</td><td>Sí</td><td>Sí</td></tr>
      <tr><td>Ver deals de otros vendedores (filtro "Todos")</td><td>Sí (solo lectura de contexto)</td><td>Sí</td></tr>
      <tr><td>Reasignar o eliminar deals</td><td>No</td><td>Sí</td></tr>
      <tr><td>Ver Dashboard global y gestionar Equipo</td><td>No</td><td>Sí</td></tr>
    </tbody>
  </table></div>

  <h2>El Pipeline: etapas y cuándo usar cada una</h2>
  <p class="small muted">El deal se carga <strong>apenas se agenda la primera reunión</strong> (antes de eso, el esfuerzo se registra solo en Actividad). Se mueve de etapa apenas cambia la realidad, no a fin de semana. El tablero es tipo kanban: <strong>arrastrá la tarjeta a la columna nueva</strong> para cambiarla de etapa (en el celular, entrá a la tarjeta y cambiala desde el formulario). Al soltar en Perdido se abre la ficha para cargar el motivo.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Etapa</th><th>Cuándo corresponde</th></tr></thead>
    <tbody>
      ${etapaFila('Lead', 'Empresa identificada que calza con el cliente ideal; todavía sin respuesta.')}
      ${etapaFila('Contactado', 'Hubo al menos un toque (mensaje, llamada, email) con una persona real de la empresa.')}
      ${etapaFila('Reunión agendada', 'Hay día y hora confirmados para la primera reunión. Acá se carga el deal si no existía.')}
      ${etapaFila('Discovery hecha', 'Se hizo la reunión de diagnóstico: entendimos situación, problema y calificamos (decisor, presupuesto, timing).')}
      ${etapaFila('Propuesta enviada', 'El cliente tiene la propuesta con precio y alcance en la mano.')}
      ${etapaFila('Negociación', 'Se discuten objeciones, condiciones o contrato. Hay intención de compra.')}
      ${etapaFila('Ganado', 'Contrato firmado o pago acordado. Todo deal arrastrado a Ganado queda <strong>pendiente de aprobación</strong> (también si lo arrastra el admin): se abre la ficha, se validan vendedor, tipo, valor y fecha, y se toca "Aprobar venta" — recién ahí impacta en métricas y comisiones. Sin valor cargado no se puede aprobar.')}
      ${etapaFila('Perdido', 'No avanza (o pasaron 4-5 reuniones sin cierre). Cargar SIEMPRE el motivo de pérdida: esa información define pricing y cliente ideal.')}
    </tbody>
  </table></div>

  <h2>Cómo cargar un deal bien</h2>
  <div class="card">
    <ul class="small" style="margin-bottom:0">
      <li><strong>Empresa</strong> y <strong>Contacto decisor</strong> (nombre y cargo de quien firma — si no hablás con esa persona, la venta se estanca).</li>
      <li><strong>Tipo de venta y valor</strong>: si es un <strong>proyecto único</strong> (desarrollo a medida), cargá el valor total del proyecto; si es una <strong>suscripción mensual</strong> (SaaS), cargá lo que pagaría por mes. El dashboard separa los dos: ingresos por proyectos y MRR nuevo.</li>
      <li><strong>Origen</strong>: de dónde salió el lead. Sirve para saber qué canal trae mejores clientes.</li>
      <li><strong>Próximo paso + fecha</strong>: obligatorio en todo deal abierto. Un deal sin próximo paso aparece en rojo y en las alertas del dashboard — es un deal que se está muriendo.</li>
      <li><strong>Notas</strong>: objeciones, acuerdos, contexto. Tu yo de dentro de dos semanas te lo agradece.</li>
    </ul>
  </div>
  <p class="small muted">Cada deal tiene un <strong>historial</strong> al pie de su ficha: creación, cambios de etapa y ediciones quedan registrados con quién lo hizo y cuándo. Nada se pierde ni se puede "acomodar" después.</p>

  <h2>Actividad diaria</h2>
  <div class="card">
    <p class="small">Una fila por día, cargada <strong>al final de cada jornada</strong> (toma 2 minutos; si guardás de nuevo el mismo día, se actualiza). Qué cuenta cada campo:</p>
    <ul class="small" style="margin-bottom:0">
      <li><strong>Contactos nuevos</strong>: prospectos agregados a tu lista que calzan con el cliente ideal.</li>
      <li><strong>Toques</strong>: cada llamada, mensaje o email de prospección enviado (a la misma persona o distintas).</li>
      <li><strong>Reuniones agendadas / realizadas</strong>: las que conseguiste hoy y las que efectivamente tuviste hoy.</li>
    </ul>
  </div>
  <p class="small muted">¿Por qué importa? La actividad de hoy son las ventas de dentro de 1-2 meses. Es el único indicador que el vendedor controla al 100%.</p>

  <h2>Metas: objetivos y ranking</h2>
  <div class="card">
    <ul class="small" style="margin-bottom:0">
      <li><strong>Objetivos</strong>: administración define metas semanales y mensuales por vendedor (toques, reuniones, deals ganados y MRR), o <strong>generales para todo el equipo</strong> de una sola vez. Cada uno ve su progreso con barras: azul en camino, verde al llegar al 100%. El progreso diario se reinicia cada día; la semana arranca el lunes y el mes el día 1.</li>
      <li><strong>Gráficas por vendedor</strong>: desde "Ver gráficas" en Objetivos se abre la evolución de toques, reuniones y MRR ganado en tres cortes: diario (14 días), semanal (8 semanas) y mensual (6 meses).</li>
      <li><strong>Ranking</strong>: tabla de posiciones del equipo por semana o mes, ordenada por MRR ganado (desempata: deals, reuniones, toques). Tu fila aparece resaltada. Es visible para todo el equipo.</li>
    </ul>
  </div>

  ${esAdmin ? `
  <h2>Dashboard: cómo leer cada indicador</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Indicador</th><th>Qué significa y qué decidir</th></tr></thead>
    <tbody>
      <tr><td><strong>Deals activos</strong></td><td>Tamaño del pipeline. Si baja sostenido, falta prospección arriba del embudo.</td></tr>
      <tr><td><strong>En juego</strong></td><td>Suma del valor en Propuesta enviada + Negociación: tu forecast de corto plazo.</td></tr>
      <tr><td><strong>Proyectos ganados / MRR nuevo</strong></td><td>Los cierres del mes separados por tipo: ingresos únicos por proyectos a medida, e ingresos recurrentes nuevos por suscripciones (SaaS).</td></tr>
      <tr><td><strong>Win rate (90 días)</strong></td><td>Ganados ÷ (ganados + perdidos). Si es bajo, el problema está en objeciones, urgencia o pricing.</td></tr>
      <tr><td><strong>Funnel por etapa</strong></td><td>Dónde se acumulan deals está el cuello de botella: Contactado→Reunión = pitch/lista · Discovery→Propuesta = diagnóstico · Propuesta→Cierre = cierre.</td></tr>
      <tr><td><strong>Por qué perdemos</strong></td><td>Si un motivo domina (ej. precio), es una decisión de producto/pricing/segmento, no un problema del vendedor.</td></tr>
      <tr><td><strong>Toques por día</strong></td><td>El indicador adelantado. Si la línea cae, el pipeline se seca en unas semanas.</td></tr>
      <tr><td><strong>Alertas</strong></td><td>Deals sin próximo paso o estancados +14 días: son ventas cayéndose ahora. Pedir al vendedor que agende el siguiente paso hoy.</td></tr>
      <tr><td><strong>Por vendedor</strong></td><td>Comparar contra el promedio del equipo dice a quién entrenar y en qué etapa exacta.</td></tr>
    </tbody>
  </table></div>
  <div class="card">
    <h3 style="margin-top:0">Reportes</h3>
    <p class="small" style="margin-bottom:0">En Dashboard → Reportes elegís <strong>semana o mes</strong> (actual o anteriores) y obtenés el corte completo del período: totales, tabla por vendedor, deals cerrados y motivos de pérdida. El botón <strong>Descargar CSV</strong> exporta todo para Excel o para compartir.</p>
  </div>
  <div class="card">
    <h3 style="margin-top:0">Notificaciones</h3>
    <p class="small" style="margin-bottom:0">La campanita de la barra funciona para todos, <strong>en vivo</strong> (se revisa cada 15 segundos): suena un aviso y aparece un cartel abajo a la derecha con el detalle. Al admin le avisa cuando un vendedor <strong>crea un deal</strong> o lo <strong>mueve de etapa</strong>; al vendedor le avisa cuando el administrador <strong>aprueba una de sus ventas</strong> (con link directo a su comisión en Cobranza). El contador muestra las no leídas; al abrir la lista quedan marcadas como vistas. Tus propias acciones no te generan notificaciones.</p>
  </div>
  <p class="small muted">Rutina sugerida: 15 minutos cada lunes — alertas primero, funnel después, actividad al final. A fin de mes, calcular las tasas: reuniones ÷ contactos (pitch/lista), propuestas ÷ reuniones (diagnóstico), ganados ÷ propuestas (cierre).</p>

  <h2>Equipo y administración</h2>
  <div class="card">
    <ul class="small" style="margin-bottom:0">
      <li><strong>Alta</strong>: en Equipo se crea el usuario con clave inicial; el vendedor la cambia en Perfil.</li>
      <li><strong>Baja</strong>: desactivar (no borrar) — sus deals e historial quedan en el sistema y se pueden reasignar.</li>
      <li><strong>Clave olvidada</strong>: "Resetear clave" genera una temporal para pasarle por un canal seguro.</li>
      <li><strong>Respaldo</strong>: todos los datos viven en la carpeta <code>data/</code> del servidor; backup = copiar esa carpeta.</li>
    </ul>
  </div>` : ''}

  <h2>Panel de Cobranza</h2>
  <div class="card">
    <ul class="small" style="margin-bottom:0">
      <li><strong>Cómo se generan</strong>: cuando una venta ganada queda <strong>aprobada</strong> (automático si la ganó el admin; con revisión y botón "Aprobar venta" si la ganó un vendedor), el sistema crea las cuotas de comisión según las reglas por tipo de venta (proyecto por tramos de ticket; suscripciones, infraestructura y mantenimiento por meses con porcentaje).</li>
      <li><strong>Vendedor</strong>: en el Panel de Cobranza ves tus cuotas, fechas y estados, y podés subir tu factura (invoice) en cada cuota para agilizar el pago.</li>
      ${esAdmin ? `<li><strong>Admin</strong>: ves el consolidado por vendedor ("exigible hoy" = cuotas cuya fecha ya llegó), marcás Pagado, cancelás cuotas si el cliente no retiene el servicio, y editás las reglas en Cobranza → Reglas (aplican a cierres futuros).</li>` : ''}
      <li><strong>Campus</strong>: desde el selector de arriba a la izquierda saltás entre Panel Comercial, Panel de Cobranza y los sitios de la empresa.</li>
    </ul>
  </div>

  <h2>Perfil</h2>
  <p class="small">Desde Perfil cada usuario cambia su contraseña y cierra sesión. Si te olvidaste la clave, pedile al administrador que te la resetee.</p>`
  });
}

function changelogPage({ user, versiones }) {
  const TIPO = { nuevo: ['Nuevo', '#3E9B57'], mejora: ['Mejora', '#1D6FB8'], fix: ['Fix', '#C08A2E'] };
  return layout({
    title: 'Changelog', user, active: 'docs',
    body: `
  <h1>Changelog</h1>
  ${docsHeader('changelog')}
  <p class="small muted">Historial de versiones del sistema. Versión actual: <strong>${esc(versiones[0]?.version || '—')}</strong>.</p>
  ${versiones.map((v) => `
  <div class="card">
    <div class="deal-top"><span class="deal-name">Versión ${esc(v.version)}</span><span class="muted small">${fecha(v.fecha)}</span></div>
    <ul class="small" style="margin:.6rem 0 0">
      ${v.cambios.map((c) => {
        const [label, color] = TIPO[c.tipo] || ['Cambio', '#54657A'];
        return `<li style="margin-bottom:.45rem"><span class="chip" style="background:${color}">${label}</span> ${esc(c.texto)}</li>`;
      }).join('')}
    </ul>
  </div>`).join('')}`
  });
}

module.exports = {
  loginPage, pipelinePage, dealFormModal, actividadPage, dashboardPage, adminPage, perfilPage, docsPage, changelogPage,
  notificacionesPage, objetivosPage, rankingPage, metasDetallePage, reportesPage, hubPage,
  cobranzaAdminPage, cobranzaVendedorPage, reglasPage,
  panelActividadPage, panelObjetivosPage, panelRankingPage, panelDashboardPage, panelConfigPage, reporteImprimirPage, campanasPage,
};
