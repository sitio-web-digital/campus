const { ETAPAS, ETAPAS_ACTIVAS, ORIGENES, MOTIVOS, TIPOS_VENTA, CALIFICACIONES, PANELES_COMERCIALES } = require('./db');
const F = require('./formulas');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => n == null ? '—' : '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const fecha = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y.slice(2)}`;
};
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
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

const SISTEMA_NOMBRE = { comercial: 'Comercial Cloud For Deploy', cfd: 'Comercial Cloud For Deploy', gondolas: 'Comercial Góndolas', estanterias: 'Comercial Estanterías Reforzadas', sitioweb: 'Comercial SitioWeb Digital', campus: 'Campus de formación', cobranza: 'Panel de Cobranza', admin: 'Panel Administración', hub: 'Campus C4D' };
const tieneSistema = (user, s) => user && (user.role === 'admin' || (user.permisos || []).includes(s));

// Ícono hoja para PuntoCO2 (plataforma de huella de carbono).
const ICON_PCO2 = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 3.5C9 4 4.5 8 4.5 13.5c0 1.6.5 2.6 1 3 .5-4.5 3-8 7-10-3 2.5-5.5 6-5.7 10.2 1 .5 2.2.8 3.2.8 5 0 7-5.5 6.5-14z"/></svg>`;

// Sitios y sistemas externos del grupo: una sola lista alimenta el inicio (cards) y el menú de sistemas.
// Agregar un sistema nuevo = una entrada acá con su fecha de alta; el cartel "Nuevo" sale solo por 30 días.
const SITIOS_EXTERNOS = [
  { slug: 'stock', nombre: 'Stock', url: 'https://stock.cloudfordeploy.com/', host: 'stock.cloudfordeploy.com', desc: 'Nuestro sistema de gestión de stock.', corto: 'Gestión de stock', nuevoDesde: '2026-08-25',
    icon: IC('<path d="M3 6.5L10 3l7 3.5v7L10 17l-7-3.5z"/><path d="M3 6.5l7 3.5 7-3.5M10 10v7"/>') },
  { slug: 'pco2', nombre: 'PuntoCO2', url: 'https://puntoco2.com/home', host: 'puntoco2.com', desc: 'Nuestra plataforma SaaS de huella de carbono.', corto: 'Plataforma de huella de carbono', icon: ICON_PCO2 },
  { slug: 'cfd', nombre: 'Cloud For Deploy', url: 'https://cloudfordeploy.com/', host: 'cloudfordeploy.com', desc: 'El sitio web de la empresa.', corto: 'Sitio web de la empresa',
    icon: IC('<path d="M6 15.5a3.5 3.5 0 01-.4-7A4.8 4.8 0 0115 7.6a3.2 3.2 0 01-.6 7.9z"/>'),
    logoHub: '<img class="hc-logo" src="/logo.png" alt="Cloud For Deploy" width="92" height="51">' },
  { slug: 'est', nombre: 'Estanterías Reforzadas', url: 'https://estanteriasreforzadas.com/', host: 'estanteriasreforzadas.com', desc: 'La tienda de estanterías y góndolas.', corto: 'Estanterías y góndolas', icon: IC('<path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/>') },
  { slug: 'sw', nombre: 'SitioWeb Digital', url: 'https://app.sitioweb.digital/', host: 'app.sitioweb.digital', desc: 'Tu página propia en minutos.', corto: 'Tu página propia en minutos',
    logoHub: '<img class="hc-logo" src="/logo-sitioweb.svg" alt="SitioWeb Digital" width="44" height="44">',
    logoMenu: '<img src="/logo-sitioweb.svg" alt="" width="30" height="30" style="border-radius:8px">' },
  { slug: 'gon', nombre: 'Gondola', url: 'https://gondola.com.ar/', host: 'gondola.com.ar', desc: 'La tienda online de góndolas.', corto: 'gondola.com.ar', icon: IC('<path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/><path d="M6 8V5.5h3V8"/>') },
  { slug: 'eol', nombre: 'Estanterías Online', url: 'https://estanterias.online/', host: 'estanterias.online', desc: 'La tienda online de estanterías.', corto: 'estanterias.online',
    icon: IC('<path d="M3 5h2l1.6 8.5a1.5 1.5 0 001.5 1.2h6.3a1.5 1.5 0 001.5-1.2L17.5 7H6"/><circle cx="8.5" cy="17" r="1.1"/><circle cx="14.5" cy="17" r="1.1"/>') },
];
const esNuevo = (st) => !!st.nuevoDesde && Date.now() - new Date(st.nuevoDesde + 'T00:00:00Z').getTime() < 30 * 864e5;
const sitiosOrdenados = () => [...SITIOS_EXTERNOS].sort((a, b) => (esNuevo(b) ? 1 : 0) - (esNuevo(a) ? 1 : 0));
const sitiosMenu = () => sitiosOrdenados().map((st) => `
      <a class="sys-ext sys-${st.slug}" href="${st.url}" target="_blank" rel="noopener">
        ${st.logoMenu || `<span class="se-ic">${st.icon}</span>`}
        <span class="se-txt"><span>${st.nombre}${esNuevo(st) ? ' <span class="nuevo-chip">Nuevo</span>' : ''}</span><small>${st.corto} ↗</small></span>
      </a>`).join('');
const sitiosHub = () => sitiosOrdenados().map((st) => `
      <a class="hub-card hub-ext hub-${st.slug}" href="${st.url}" target="_blank" rel="noopener">
        ${esNuevo(st) ? '<span class="soon-chip hc-soon hc-nuevo">Nuevo</span>' : ''}
        ${st.logoHub || `<span class="hc-ic">${st.icon}</span>`}
        <h3>${st.nombre}</h3>
        <p>${st.desc}</p>
        <span class="hc-ext">${st.host} ↗</span>
      </a>`).join('');

// Selector de sistemas (arriba a la izquierda): permite saltar entre paneles y sitios.
function sysSwitch(sistema, user) {
  const R = (user && user.resumen) || {};
  const infoPanel = (slug) => {
    const i = R[slug]; if (!i) return '';
    const extra = i.liberadas > 0 ? ` · ${i.liberadas} lib.` : '';
    const deuda = i.actividad || i.pipeline;
    return `<span class="sys-info">${i.abiertas} abierta${i.abiertas === 1 ? '' : 's'}${extra}</span>${deuda ? '<span class="sys-dot" title="Tenés deudas en este panel"></span>' : ''}`;
  };
  const infoCobranza = () => {
    const i = R.cobranza;
    return i && i.pendiente > 0 ? `<span class="sys-info">${money(i.pendiente)} pend.</span>` : '';
  };
  return `
  <details class="sys">
    <summary><span class="brand-txt">${SISTEMA_NOMBRE[sistema] || 'Panel Comercial'}<span class="sub">Cloud For Deploy ▾</span></span></summary>
    <div class="sys-menu">
      <a href="/hub">Campus (inicio)</a>
      ${tieneSistema(user, 'cfd') ? `<a href="/pipeline"><span>Comercial Cloud For Deploy</span>${infoPanel('cfd')}</a>` : ''}
      ${tieneSistema(user, 'gondolas') ? `<a href="/gondolas/pipeline"><span>Comercial Góndolas</span>${infoPanel('gondolas')}</a>` : ''}
      ${tieneSistema(user, 'estanterias') ? `<a href="/estanterias/pipeline"><span>Comercial Estanterías Reforzadas</span>${infoPanel('estanterias')}</a>` : ''}
      ${tieneSistema(user, 'sitioweb') ? `<a href="/sitioweb/pipeline"><span>Comercial SitioWeb Digital</span>${infoPanel('sitioweb')}</a>` : ''}
      ${tieneSistema(user, 'cobranza') ? `<a href="/cobranza"><span>Panel de Cobranza</span>${infoCobranza()}</a>` : ''}
      ${user && user.role === 'admin' ? `<a href="/admin">Panel Administración</a>` : ''}
      <span class="soon"><span>Panel de Developers</span><span class="soon-chip">Próximamente</span></span>
      <a href="/campus">Campus de formación</a>
      <div class="sys-sep"></div>
      ${sitiosMenu()}
    </div>
  </details>`;
}

// Foto de perfil: imagen subida o iniciales sobre fondo de acento.
const avatar = (u, cls = '') => (u && u.avatar
  ? `<img class="avatar ${cls}" src="/avatars/${u.id}?v=${encodeURIComponent(u.avatar)}" alt="">`
  : `<span class="avatar avatar-ini ${cls}">${esc(((u && u.name) || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase())}</span>`);

function layout({ title, user, active, body, msg, err, bodyClass, sistema = 'comercial' }) {
  const bell = user ? `
      <a class="bell ${active === 'notis' ? 'on' : ''}" href="/notificaciones" aria-label="Notificaciones">${ICONS.bell}${user.unread > 0 ? `<span class="bell-badge">${user.unread > 99 ? '99+' : user.unread}</span>` : ''}</a>` : '';
  const themeBtn = user ? `
      <button class="theme-btn" type="button" aria-label="Cambiar tema" title="Tema claro / oscuro">
        <svg class="ic-sol" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="3.6"/><path d="M10 2.2v1.9M10 15.9v1.9M2.2 10h1.9M15.9 10h1.9M4.5 4.5l1.35 1.35M14.15 14.15l1.35 1.35M15.5 4.5l-1.35 1.35M5.85 14.15L4.5 15.5"/></svg>
        <svg class="ic-luna" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a6.8 6.8 0 1 0 8.7 8.7z"/></svg>
      </button>` : '';
  const perfilLink = user ? `
        <details class="umenu">
          <summary class="nav-user ${['perfil', 'soporte'].includes(active) ? 'on' : ''}">${avatar(user)}<span>${esc(user.name.split(' ')[0])}</span></summary>
          <div class="umenu-pop">
            <div class="umenu-head">${avatar(user)}<div class="uh-t"><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small></div></div>
            <a href="/perfil">${ICONS.perfil}<span>Configuración</span></a>
            <a href="/soporte">${IC('<circle cx="10" cy="10" r="6.8"/><circle cx="10" cy="10" r="2.8"/><path d="M4.9 4.9l3 3M12.1 12.1l3 3M15.1 4.9l-3 3M7.9 12.1l-3 3"/>')}<span>Soporte</span></a>
            <form method="post" action="/logout"><button type="submit">${IC('<path d="M8 3.5H4.5v13H8M12.5 6.5L16 10l-3.5 3.5M16 10H7.5"/>')}<span>Cerrar sesión</span></button></form>
          </div>
        </details>` : '';
  let links = '';
  if (sistema === 'cobranza') {
    links = `
        <a href="/cobranza" class="${active === 'cobranza' ? 'on' : ''}">${ICONS.cobranza}<span>Comisiones</span></a>
        ${user && user.role === 'admin' ? `<a href="/cobranza/reglas" class="${active === 'reglas' ? 'on' : ''}">${ICONS.docs}<span>Reglas</span></a>` : ''}`;
  } else if (sistema === 'hub') {
    links = '';
  } else if (sistema === 'campus') {
    links = `
        <a href="/campus" class="${active === 'campus' ? 'on' : ''}">${ICONS.docs}<span>Contenido</span></a>
        ${user && user.role === 'admin' ? `<a href="/campus/estadisticas" class="${active === 'stats' ? 'on' : ''}">${ICONS.dashboard}<span>Estadísticas</span></a>` : ''}
        <a href="/documentacion" class="${active === 'docs' ? 'on' : ''}">${ICONS.metas}<span>Sistema</span></a>`;
  } else if (sistema === 'admin') {
    links = `
        <a href="/admin" class="${active === 'admin' ? 'on' : ''}">${ICONS.equipo}<span>Usuarios</span></a>
        <a href="/admin/comunicacion" class="${active === 'comunicacion' ? 'on' : ''}">${ICONS.bell}<span>Comunicación</span></a>
        <a href="/admin/preferencias" class="${active === 'preferencias' ? 'on' : ''}">${ICONS.docs}<span>Preferencias</span></a>`;
  } else if (sistema === 'gondolas' || sistema === 'estanterias' || sistema === 'sitioweb') {
    const b = '/' + sistema;
    const dd = (user && user.deudas) || {};
    links = `
        <a href="${b}/pipeline" class="${active === 'pipeline' ? 'on' : ''}${dd.pipeline ? ' deuda' : ''}">${ICONS.pipeline}<span>Pipeline</span></a>
        <a href="${b}/actividad" class="${active === 'actividad' ? 'on' : ''}${dd.actividad ? ' deuda' : ''}">${ICONS.actividad}<span>Actividad</span></a>
        <a href="${b}/objetivos" class="${active === 'metas' ? 'on' : ''}">${ICONS.metas}<span>Metas</span></a>
        ${user && user.role === 'admin' ? `<a href="${b}/dashboard" class="${active === 'dashboard' ? 'on' : ''}">${ICONS.dashboard}<span>Dashboard</span></a>
        <a href="${b}/config" class="${active === 'config' ? 'on' : ''}">${ICONS.docs}<span>Config</span></a>` : ''}`;
  } else {
    const dd = (user && user.deudas) || {};
    links = `
        <a href="/pipeline" class="${active === 'pipeline' ? 'on' : ''}${dd.pipeline ? ' deuda' : ''}">${ICONS.pipeline}<span>Pipeline</span></a>
        <a href="/actividad" class="${active === 'actividad' ? 'on' : ''}${dd.actividad ? ' deuda' : ''}">${ICONS.actividad}<span>Actividad</span></a>
        <a href="/objetivos" class="${active === 'metas' ? 'on' : ''}">${ICONS.metas}<span>Metas</span></a>
        ${user && user.role === 'admin' ? `<a href="/dashboard" class="${active === 'dashboard' ? 'on' : ''}">${ICONS.dashboard}<span>Dashboard</span></a>
        <a href="/config" class="${active === 'config' ? 'on' : ''}">${ICONS.docs}<span>Config</span></a>
        <a href="/admin" class="${active === 'equipo' ? 'on' : ''}">${ICONS.equipo}<span>Equipo</span></a>` : ''}`;
  }
  const nav = user ? `
  <nav class="nav">
    <div class="nav-inner">
      <span class="brand-row">${sysSwitch(sistema, user)}${bell}${themeBtn}</span>
      <div class="nav-links">${links}
      </div>
      ${perfilLink}
    </div>
  </nav>` : '';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>try{if((localStorage.getItem('c4d-theme-v2')||'dark')==='dark')document.documentElement.classList.add('dark')}catch(e){}</script>
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
${user && user.modalBanner ? `
<div class="modal-back anuncio" id="anuncioModal">
  <div class="modal anuncio-box">
    <span class="anuncio-tag">Aviso de administración</span>
    <h2>${esc(user.modalBanner.titulo)}</h2>
    <p style="margin:.4rem 0 1.1rem; line-height:1.6">${esc(user.modalBanner.texto)}</p>
    <button class="btn" onclick="cerrarAnuncio('/banners/${user.modalBanner.id}/visto')">Entendido</button>
  </div>
</div>` : user && user.modalEncuesta ? `
<div class="modal-back anuncio" id="anuncioModal" data-encuesta="${user.modalEncuesta.id}">
  <div class="modal anuncio-box">
    <span class="anuncio-tag">Encuesta del equipo</span>
    <h2>${esc(user.modalEncuesta.pregunta)}</h2>
    <form method="post" action="/encuestas/${user.modalEncuesta.id}/votar" style="margin-top:.6rem">
      ${user.modalEncuesta.opciones.map((op, i) => `<label class="quiz-op"><input type="radio" name="opcion" value="${i}" required> ${esc(op)}</label>`).join('')}
      <div style="display:flex; gap:.6rem; align-items:center; margin-top:1rem">
        <button class="btn">Votar</button>
        <button type="button" class="btn secondary" onclick="posponerEncuesta()">Más tarde</button>
      </div>
    </form>
    <p class="caption" style="margin-top:.7rem">Tu voto es visible para administración. Se responde una sola vez.</p>
  </div>
</div>
<script>
function posponerEncuesta() {
  var m = document.getElementById('anuncioModal');
  try { sessionStorage.setItem('enc-later-' + m.dataset.encuesta, '1'); } catch (e) {}
  m.remove();
}
(function () {
  var m = document.getElementById('anuncioModal');
  try { if (m && m.dataset.encuesta && sessionStorage.getItem('enc-later-' + m.dataset.encuesta)) m.remove(); } catch (e) {}
})();
</script>` : user && user.modalChangelog ? `
<div class="modal-back anuncio" id="anuncioModal">
  <div class="modal anuncio-box">
    <span class="anuncio-tag">Actualización del sistema</span>
    <h2>Novedades de la versión ${esc(user.modalChangelog.version)}</h2>
    <p class="small muted" style="margin:.2rem 0 .8rem">${esc(user.modalChangelog.fecha)}</p>
    <ul class="cl-lista">
      ${user.modalChangelog.cambios.map((c) => `<li><span class="chip cl-${c.tipo}">${c.tipo === 'nuevo' ? 'Nuevo' : c.tipo === 'fix' ? 'Arreglo' : 'Mejora'}</span><span>${esc(c.texto)}</span></li>`).join('')}
    </ul>
    <div style="display:flex; gap:.6rem; align-items:center; margin-top:1.1rem">
      <button class="btn" onclick="cerrarAnuncio('/changelog/visto')">Entendido</button>
      <a class="small" href="/changelog" onclick="fetch('/changelog/visto',{method:'POST'})">Ver historial completo</a>
    </div>
  </div>
</div>` : ''}
${user ? `
<script>
document.addEventListener('click', function (e) {
  if (e.target.classList && e.target.classList.contains('modal-carga')) e.target.classList.remove('abierto');
  document.querySelectorAll('details.sys[open], details.umenu[open]').forEach(function (d) {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});
function cerrarAnuncio(url) {
  fetch(url, { method: 'POST' }).finally(function () {
    var m = document.getElementById('anuncioModal'); if (m) m.remove();
  });
}
// Interruptor de tema en la barra (persistido en el navegador; ya se aplicó antes de pintar).
(function () {
  var root = document.documentElement, K = 'c4d-theme-v2';
  document.querySelectorAll('.theme-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = root.classList.contains('dark') ? 'light' : 'dark';
      root.classList.toggle('dark', t === 'dark');
      try { localStorage.setItem(K, t); } catch (e) {}
    });
  });
})();
</script>` : ''}
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
              var av = n.avatar
                ? '<img class="np-av" src="' + escHtml(n.avatar) + '" alt="">'
                : '<span class="np-av np-av-ini">' + escHtml(n.iniciales) + '</span>';
              return '<a class="np-item' + (n.leida ? '' : ' unread') + '" href="' + escHtml(n.url) + '">' + av +
                '<span class="np-c"><span class="np-head"><strong>' + escHtml(n.actor) + '</strong><time>' + escHtml(n.fecha) + '</time></span>' +
                '<span class="np-txt">' + escHtml(n.texto) + '</span></span></a>';
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
/* Tipografías IBM Plex (servidas localmente desde /fonts) */
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(/fonts/ibm-plex-mono-500-latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(/fonts/ibm-plex-mono-500-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(/fonts/ibm-plex-mono-600-latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(/fonts/ibm-plex-mono-600-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 400;
  font-stretch: 100%;
  font-display: swap;
  src: url(/fonts/ibm-plex-sans-400-latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 400;
  font-stretch: 100%;
  font-display: swap;
  src: url(/fonts/ibm-plex-sans-400-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 500;
  font-stretch: 100%;
  font-display: swap;
  src: url(/fonts/ibm-plex-sans-500-latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 500;
  font-stretch: 100%;
  font-display: swap;
  src: url(/fonts/ibm-plex-sans-500-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 600;
  font-stretch: 100%;
  font-display: swap;
  src: url(/fonts/ibm-plex-sans-600-latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 600;
  font-stretch: 100%;
  font-display: swap;
  src: url(/fonts/ibm-plex-sans-600-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 700;
  font-stretch: 100%;
  font-display: swap;
  src: url(/fonts/ibm-plex-sans-700-latin-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 700;
  font-stretch: 100%;
  font-display: swap;
  src: url(/fonts/ibm-plex-sans-700-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

/* ==========================================================================
   Campus C4D — hoja de estilos v3 (drop-in)
   Reemplaza la hoja anterior. No cambia clases ni estructura del HTML.
   Paleta corporativa: navy #0F3459 / #0A2540 · acento #1D6FB8 · fondo #F4F7FA
   ========================================================================== */

:root {
  /* superficies: grafito frío */
  --bg:#F2F4F7; --surface:#FFFFFF; --surface2:#EBEFF4; --surface3:#F7F9FB;
  --ink:#131A22; --muted:#5B6773; --faint:#8A95A1;
  /* cromo (barra superior) y acento verde petróleo */
  --chrome:#1B2430; --chrome-line:#111922;
  --accent:#0E6E66; --accent-ink:#0A554F; --accent-soft:#E0F0EE;
  --role:#0E6E66; --role-soft:#D9EDEA;
  --line:#E4E8ED; --line2:#C8D0D9;
  --ok:#2F7D4F; --ok-soft:#E3F1E8;
  --bad:#B3403C; --bad-soft:#FAE9E8;
  --warn:#A8791F; --warn-soft:#F9F1DF;
  /* login: paleta corporativa navy, no cambia */
  --login:#0F3459; --login-ink:#0A2540;
  --r:8px; --r-lg:10px;
  --sh:0 1px 2px rgba(15,29,46,.06);
  --sh-md:0 4px 12px rgba(15,52,89,.09);
  --sh-lg:0 18px 44px rgba(10,20,35,.22);
  --fs:15px;
}

* { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body {
  margin:0; background:var(--bg); color:var(--ink); overflow-x:hidden;
  font:var(--fs)/1.5 "IBM Plex Sans","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}
.wrap { max-width:76rem; margin:0 auto; padding:1.1rem 1.25rem 5.5rem; }

h1 { font-size:1.28rem; font-weight:600; letter-spacing:-.012em; margin:.9rem 0 1rem; }
h2 { font-size:.95rem; font-weight:600; letter-spacing:-.005em; margin:1.5rem 0 .55rem; }
h3 { font-size:.9rem; font-weight:600; letter-spacing:-.005em; }
p { text-wrap:pretty; }
a { color:var(--role); text-decoration:none; }
a:hover { color:var(--accent-ink); text-decoration:underline; }
.muted { color:var(--muted); }
.small { font-size:.82rem; }
.warn { color:var(--bad); font-weight:600; }
.caption { font-size:.75rem; color:var(--faint); margin-top:.5rem; line-height:1.55; }

/* ---------- barra superior ---------- */
.nav { background:var(--chrome); border-bottom:1px solid var(--chrome-line); position:sticky; top:0; z-index:10; }
.nav-inner { max-width:76rem; margin:0 auto; padding:.42rem 1.25rem; display:flex; align-items:center; justify-content:space-between; gap:1.1rem; flex-wrap:nowrap; }
.brand { display:flex; align-items:center; gap:.55rem; color:#fff; font-weight:600; }
.brand-row { display:flex; align-items:center; gap:.75rem; position:relative; }
.logo { width:1.85rem; height:1.85rem; border-radius:6px; background:#fff; color:var(--chrome); display:grid; place-items:center; font-size:.7rem; font-weight:700; flex-shrink:0; }
.brand-txt { display:flex; flex-direction:column; line-height:1.15; font-size:.85rem; font-weight:600; overflow:hidden; }
.brand-txt, .brand-txt .sub { white-space:nowrap; }
.brand-txt .sub { font-size:.55rem; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:rgba(255,255,255,.5); }

.nav-links { display:flex; gap:.05rem; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; max-width:100%; }
.nav-links::-webkit-scrollbar { display:none; }
.nav-links a { display:inline-flex; align-items:center; gap:.34rem; flex-shrink:0; text-decoration:none;
  color:rgba(255,255,255,.72); font-weight:500; font-size:.79rem; letter-spacing:.005em;
  padding:.36rem .55rem; border-radius:6px; transition:background .12s, color .12s; }
.nav-links a:hover { background:rgba(255,255,255,.09); color:#fff; text-decoration:none; }
.nav-links a.on { background:rgba(255,255,255,.14); color:#fff; font-weight:600; }
.nav-links .ic { width:.92rem; height:.92rem; flex-shrink:0; opacity:.8; }
.nav-links a.on .ic { opacity:1; }

.bell { position:relative; display:inline-flex; align-items:center; justify-content:center; width:1.95rem; height:1.95rem; border-radius:6px; color:rgba(255,255,255,.72); transition:background .12s, color .12s; }
.bell:hover, .bell.on { background:rgba(255,255,255,.12); color:#fff; }
.bell .ic { width:1.1rem; height:1.1rem; }
.bell-badge { position:absolute; top:-.15rem; right:-.25rem; background:var(--bad); color:#fff; font-size:.6rem; font-weight:700; line-height:1; padding:.18rem .3rem; border-radius:999px; border:2px solid var(--chrome); font-variant-numeric:tabular-nums; }

/* selector de sistemas */
.sys { position:relative; }
.sys summary { display:flex; align-items:center; gap:.45rem; color:#fff; cursor:pointer; list-style:none; border-radius:6px; padding:.22rem .45rem; min-width:0; }
.sys summary::-webkit-details-marker { display:none; }
.sys summary:hover { background:rgba(255,255,255,.09); }
.sys[open] summary { background:rgba(255,255,255,.12); }
.sys-menu { position:absolute; top:calc(100% + .45rem); left:0; z-index:80; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--sh-lg); min-width:17rem; padding:.3rem; display:grid; gap:.1rem; }
.sys-menu > a { text-decoration:none; color:var(--ink); font-size:.84rem; font-weight:500; padding:.45rem .6rem; border-radius:6px; }
.sys-menu > a:hover { background:var(--surface2); color:var(--accent-ink); text-decoration:none; }
.sys-sep { border-top:1px solid var(--line); margin:.25rem .3rem; }
.sys-menu .soon { display:flex; align-items:center; justify-content:space-between; gap:.6rem; font-size:.84rem; font-weight:500; padding:.45rem .6rem; border-radius:6px; color:var(--faint); cursor:default; }
.soon-chip { font-size:.55rem; font-weight:700; letter-spacing:.09em; text-transform:uppercase; background:var(--surface2); color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:.14rem .4rem; white-space:nowrap; }
.sys-menu a.sys-ext { display:flex; align-items:center; gap:.6rem; padding:.5rem .6rem; color:#fff; border-radius:6px; }
.sys-menu a.sys-ext:hover { filter:brightness(1.07); text-decoration:none; }
.sys-ext .se-ic { display:grid; place-items:center; width:1.75rem; height:1.75rem; border-radius:6px; background:rgba(255,255,255,.18); flex-shrink:0; }
.sys-ext .se-ic svg { width:1.05rem; height:1.05rem; }
.sys-ext img { flex-shrink:0; }
.sys-ext .se-txt { display:flex; flex-direction:column; line-height:1.25; font-size:.84rem; font-weight:600; }
.sys-ext .se-txt small { font-size:.66rem; font-weight:400; opacity:.82; }
.sys-pco2 { background:#C0241A; } .sys-cfd { background:#0F3459; } .sys-est { background:#C75E10; }
.sys-sw { background:#0B1120; } .sys-gon { background:#1A6B3F; } .sys-eol { background:#563F87; }
.sys-sw .se-txt small { color:#FFC107; opacity:1; }

/* ---------- avisos ---------- */
.flash { padding:.6rem .85rem; border-radius:var(--r); margin-bottom:1rem; font-weight:500; font-size:.87rem; border:1px solid transparent; }
.flash.ok { background:var(--ok-soft); color:#1F6B45; border-color:#BFE0CC; }
.flash.bad { background:var(--bad-soft); color:#8F3532; border-color:#EFC9C7; }

/* ---------- superficies ---------- */
.card { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:.85rem .95rem; margin-bottom:.7rem; box-shadow:var(--sh); }
.card--accent { border-left:3px solid var(--role); }
.tile { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:.7rem .85rem; box-shadow:var(--sh); }
.tile .v { font-size:1.45rem; font-weight:600; letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1.2; }
.tile .l { font-size:.7rem; color:var(--muted); font-weight:500; letter-spacing:.01em; margin-top:.15rem; line-height:1.35; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(158px,1fr)); gap:.6rem; margin-bottom:1rem; }

/* ---------- controles ---------- */
.btn { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; background:var(--accent); color:#fff; border:1px solid var(--accent);
  border-radius:var(--r); padding:.44rem .9rem; font:600 .85rem/1.35 inherit; cursor:pointer; text-decoration:none; white-space:nowrap;
  transition:background .12s, border-color .12s, box-shadow .12s; }
.btn:hover { background:var(--accent-ink); border-color:var(--accent-ink); color:#fff; text-decoration:none; }
.btn:active { box-shadow:inset 0 1px 2px rgba(0,0,0,.2); }
.btn.secondary { background:var(--surface); color:var(--ink); border-color:var(--line2); }
.btn.secondary:hover { background:var(--surface2); color:var(--accent-ink); border-color:var(--line2); }
.btn.danger { background:var(--bad); border-color:var(--bad); }
.btn.danger:hover { background:#A63F3B; border-color:#A63F3B; }
.btn.small { padding:.28rem .6rem; font-size:.78rem; }

label { display:block; font-size:.68rem; font-weight:600; color:var(--muted); margin:.75rem 0 .22rem; text-transform:uppercase; letter-spacing:.07em; }
input, select, textarea {
  width:100%; padding:.42rem .55rem; font:400 .88rem/1.4 inherit; color:var(--ink);
  border:1px solid var(--line2); border-radius:var(--r); background:var(--surface);
  transition:border-color .12s, box-shadow .12s; }
input:hover, select:hover, textarea:hover { border-color:#A9B8C9; }
input:focus, select:focus, textarea:focus { outline:none; border-color:var(--role); box-shadow:0 0 0 3px var(--role-soft); }
select { appearance:none; padding-right:1.6rem;
  background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 8l3-3.5' fill='none' stroke='%235A6B80' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right .45rem center; background-size:.7rem; }
input[type=checkbox], input[type=radio] { width:auto; accent-color:var(--role); }
input[type=file] { padding:.28rem; font-size:.78rem; }

.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:0 .9rem; }
@media (max-width:520px) { .grid2 { grid-template-columns:1fr; } }

.toolbar { display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; margin-bottom:.9rem; }
.toolbar .sp { flex:1; }
.toolbar .seg { max-width:100%; overflow-x:auto; scrollbar-width:none; }
.toolbar .seg::-webkit-scrollbar { display:none; }
.row-actions { display:flex; gap:.35rem; flex-wrap:wrap; justify-content:flex-end; }

.seg { display:inline-flex; background:var(--surface2); border:1px solid var(--line); border-radius:var(--r); padding:2px; gap:2px; }
.seg a { padding:.28rem .65rem; text-decoration:none; font-size:.8rem; font-weight:500; color:var(--muted); border-radius:6px; white-space:nowrap; flex-shrink:0; transition:background .12s, color .12s; }
.seg a:hover { color:var(--accent-ink); text-decoration:none; }
.seg a.on { background:var(--surface); color:var(--accent-ink); font-weight:600; box-shadow:var(--sh); }

.chip { display:inline-block; font-size:.66rem; font-weight:600; letter-spacing:.03em; padding:.15rem .45rem; border-radius:4px; color:#fff; white-space:nowrap; line-height:1.35; }
.chip--estado-pendiente { background:var(--warn); }
.chip--estado-pagado { background:var(--ok); }
.chip--estado-cancelado { background:#8494A6; }
.chip.cl-nuevo { background:var(--ok); } .chip.cl-mejora { background:var(--role); } .chip.cl-fix { background:var(--warn); }

/* ---------- tablas ---------- */
.tablewrap { overflow-x:auto; border:1px solid var(--line); border-radius:var(--r-lg); margin-bottom:1rem; background:var(--surface); box-shadow:var(--sh); }
table { border-collapse:separate; border-spacing:0; width:100%; font-size:.84rem; background:var(--surface); }
th { position:sticky; top:0; z-index:1; text-align:left; font-size:.65rem; font-weight:600; text-transform:uppercase; letter-spacing:.08em;
  color:var(--muted); padding:.5rem .65rem; background:var(--surface3); border-bottom:1px solid var(--line2); white-space:nowrap; }
td { padding:.45rem .65rem; border-bottom:1px solid var(--line); vertical-align:top; }
tr:last-child td { border-bottom:none; }
tbody tr:hover td { background:var(--surface3); }
tr.yo td { background:var(--accent-soft); }
tr.yo:hover td { background:#DDE9F6; }
tr.vencida td { background:var(--bad-soft); }
tr.inactivo td { opacity:.5; }
.rowlink { cursor:pointer; }
.rowlink a { text-decoration:none; color:var(--accent-ink); font-weight:600; }
.rowlink:hover td { background:var(--accent-soft); }
.users-tbl td { vertical-align:middle; }

/* ---------- barras y progreso ---------- */
.bar-row { display:flex; align-items:center; gap:.55rem; margin:.3rem 0; }
.bar-label { width:9rem; font-size:.78rem; font-weight:500; color:var(--muted); text-align:right; flex-shrink:0; }
.bar-track { flex:1; background:var(--surface2); border-radius:4px; height:1.25rem; position:relative; overflow:hidden; }
.bar-fill { height:100%; border-radius:4px; min-width:2px; display:flex; align-items:center; justify-content:flex-end; padding-right:.45rem; }
.bar-val { position:absolute; right:auto; top:0; line-height:1.25rem; font-size:.76rem; font-weight:600; font-variant-numeric:tabular-nums; color:var(--ink); }
.bar-fill .bar-val { position:static; color:#fff; }
.charts { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:.7rem; }
.charts .card { margin-bottom:0; }

.prog-row { display:grid; grid-template-columns:minmax(5.5rem,7rem) 1fr max-content; gap:.5rem; align-items:center; margin:.35rem 0; }
.prog-row .pl { font-size:.74rem; font-weight:500; color:var(--muted); text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.prog { height:.45rem; background:var(--surface2); border-radius:999px; overflow:hidden; }
.prog i { display:block; height:100%; border-radius:999px; background:var(--role); }
.prog i.full { background:var(--ok); }
.prog-row .pv { font-size:.72rem; font-variant-numeric:tabular-nums; white-space:nowrap; color:var(--muted); }
.prog-row .pv strong { color:var(--ink); font-weight:600; }
.metas-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(235px,1fr)); gap:.8rem; }
.goal-cols { display:grid; gap:.8rem; margin-top:.4rem; }
.goal-inputs { display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:.4rem .6rem; }
.goal-inputs label { margin:.3rem 0 .15rem; font-size:.62rem; }
.pos { display:inline-flex; align-items:center; justify-content:center; width:1.6rem; height:1.6rem; border-radius:6px; font-weight:700; font-size:.8rem; background:var(--surface2); color:var(--muted); font-variant-numeric:tabular-nums; }
.pos.p1 { background:var(--warn); color:#fff; } .pos.p2 { background:#8494A6; color:#fff; } .pos.p3 { background:#A9714B; color:#fff; }

.stage-h { display:flex; align-items:center; gap:.45rem; margin:1.3rem 0 .45rem; }
.stage-h .dot { width:.55rem; height:.55rem; border-radius:2px; }
.stage-h h2 { margin:0; font-size:.9rem; }
.stage-h .n { color:var(--faint); font-size:.8rem; font-variant-numeric:tabular-nums; }

/* ---------- deals (lista) ---------- */
.deal-card { display:block; text-decoration:none; color:inherit; }
.deal-card:hover { border-color:var(--line2); box-shadow:var(--sh-md); text-decoration:none; }
.deal-top { display:flex; justify-content:space-between; align-items:baseline; gap:.5rem; }
.deal-name { font-weight:600; }
.deal-mrr { font-weight:600; color:var(--accent-ink); white-space:nowrap; font-variant-numeric:tabular-nums; }
.deal-meta { font-size:.8rem; color:var(--muted); margin-top:.2rem; }
.deal-next { font-size:.8rem; margin-top:.3rem; }

/* ---------- kanban ---------- */
.pipebar { display:flex; gap:.35rem; flex-wrap:nowrap; align-items:center; margin:0 0 .8rem; overflow-x:auto; scrollbar-width:none; }
.pipebar::-webkit-scrollbar { display:none; }
.pipebar .seg { flex-shrink:0; }
.pipebar .seg a { padding:.24rem .5rem; font-size:.76rem; }
.pipebar input[name=q] { flex:1 1 auto; min-width:8rem; max-width:15rem; padding:.28rem .5rem; font-size:.79rem; }
.pipebar select { width:auto; flex-shrink:0; padding:.28rem 1.5rem .28rem .45rem; font-size:.76rem; color:var(--muted); font-weight:500; }
.pipebar .btn.small { flex-shrink:0; }
.pipebar .btn.nuevo { margin-left:auto; }
.fresultado { flex-shrink:0; font-size:.73rem; }

.board { display:grid; grid-template-columns:repeat(var(--ncols,8),minmax(0,1fr)); gap:.45rem; align-items:start;
  width:calc(100vw - 2.5rem); max-width:110rem; margin-left:calc(50% - 50vw + 1.25rem); padding-bottom:1rem; }
.col { background:var(--surface2); border:1px solid var(--line); border-radius:var(--r); padding:.35rem; min-height:8rem; min-width:0; }
.col.over { outline:2px dashed var(--role); outline-offset:-2px; background:var(--role-soft); }
.col-h { display:flex; align-items:center; gap:.28rem; padding:.15rem .25rem .3rem; font-size:.6rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; flex-wrap:wrap; }
.col-h .dot { width:.4rem; height:.4rem; border-radius:2px; flex-shrink:0; }
.col-h .sub { font-size:.55rem; color:var(--faint); text-transform:none; font-weight:500; }
.col-h .n { margin-left:auto; font-weight:600; color:var(--faint); font-variant-numeric:tabular-nums; }
.col-sum { font-size:.62rem; color:var(--faint); padding:0 .25rem .3rem; font-variant-numeric:tabular-nums; }
.kcard { background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:.38rem .45rem; margin-bottom:.35rem; box-shadow:var(--sh); transition:box-shadow .12s, border-color .12s; }
.kcard:hover { border-color:var(--line2); box-shadow:var(--sh-md); }
.kcard[draggable=true] { cursor:grab; }
.kcard.drag { opacity:.4; }
.kcard-t { font-weight:600; font-size:.73rem; color:inherit; text-decoration:none; display:block; line-height:1.3; overflow-wrap:anywhere; }
.kcard-t:hover { color:var(--accent-ink); text-decoration:underline; }
.kcard-m { display:flex; justify-content:space-between; gap:.3rem; font-size:.65rem; color:var(--muted); margin-top:.18rem; flex-wrap:wrap; }
.kcard-m .mrr { font-weight:600; color:var(--accent-ink); font-variant-numeric:tabular-nums; }
.kcard-w { font-size:.62rem; margin-top:.18rem; line-height:1.35; overflow-wrap:anywhere; }
.kcard-w.ok { color:var(--faint); }
.kcard-w.aprob { color:#8A5A0B; font-weight:600; }
.aprob-box { background:var(--warn-soft); border:1px solid #E8D4A6; border-radius:var(--r-lg); padding:.8rem .95rem; margin-bottom:.8rem; }
.aprob-box p { margin:0 0 .55rem; font-size:.85rem; }

/* ---------- campus / hub ---------- */
.hub-wrap { max-width:56rem; margin:0 auto; padding:2.2rem 0 2rem; }
.hub-head { text-align:center; margin-bottom:1.8rem; }
.hub-head img { width:140px; height:auto; }
.hub-head h1 { margin:.7rem 0 .15rem; font-size:1.35rem; }
.hub-head p { color:var(--muted); margin:0; font-size:.9rem; }
.hub-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:.75rem; }
.hub-card { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:1.05rem 1.05rem 1rem; text-decoration:none; color:inherit;
  box-shadow:var(--sh); transition:box-shadow .14s, border-color .14s, transform .14s; display:block; }
.hub-card:hover { box-shadow:var(--sh-md); border-color:var(--line2); transform:translateY(-1px); text-decoration:none; }
.hub-card .hc-ic { width:2.2rem; height:2.2rem; border-radius:7px; background:var(--accent-soft); color:var(--accent-ink); display:grid; place-items:center; margin-bottom:.7rem; }
.hub-card .hc-ic svg { width:1.2rem; height:1.2rem; }
.hub-card h3 { margin:0 0 .2rem; font-size:.96rem; }
.hub-card p { margin:0; font-size:.81rem; color:var(--muted); line-height:1.5; }
.hub-card .hc-ext { font-size:.65rem; color:var(--faint); font-weight:600; letter-spacing:.09em; text-transform:uppercase; margin-top:.55rem; display:block; }
.hub-card .hc-logo { height:44px; width:auto; margin-bottom:.55rem; display:block; }
.hub-card.hub-soon { position:relative; opacity:.68; cursor:default; }
.hub-card.hub-soon:hover { box-shadow:var(--sh); transform:none; border-color:var(--line); }
.hc-soon { position:absolute; top:.7rem; right:.7rem; }
.hub-card.hub-pco2 { background:#C0241A; border-color:#A81E15; }
.hub-card.hub-cfd { background:#0F3459; border-color:#0A2540; }
.hub-card.hub-est { background:#C75E10; border-color:#AB500B; }
.hub-card.hub-sw { background:#0B1120; border-color:#060A14; }
.hub-card.hub-gon { background:#1A6B3F; border-color:#145532; }
.hub-card.hub-eol { background:#563F87; border-color:#46326E; }
.hub-card.hub-stock { background:#1E4E8C; border-color:#173E70; }
.sys-stock { background:#1E4E8C; }
.hub-card.hub-ext { position:relative; }
.hub-card.hub-ext h3 { color:#fff; }
.hub-card.hub-ext p { color:rgba(255,255,255,.82); }
.hub-card.hub-ext .hc-ext { color:rgba(255,255,255,.65); }
.hub-card.hub-ext .hc-ic { background:rgba(255,255,255,.18); color:#fff; }
.hc-nuevo, .nuevo-chip { background:#F5B82E; color:#1B2430; border-color:transparent; }
.nuevo-chip { font-size:.55rem; font-weight:800; letter-spacing:.09em; text-transform:uppercase; border-radius:4px; padding:.1rem .35rem; vertical-align:middle; margin-left:.15rem; }
@keyframes nuevo-pop { 0%, 100% { box-shadow:0 0 0 0 rgba(245,184,46,.55); } 50% { box-shadow:0 0 0 5px rgba(245,184,46,0); } }
.hc-nuevo { animation: nuevo-pop 2.2s ease-out infinite; }
@media (prefers-reduced-motion: reduce) { .hc-nuevo { animation:none; } }
.hub-card.hub-pco2 h3, .hub-card.hub-cfd h3, .hub-card.hub-est h3, .hub-card.hub-sw h3, .hub-card.hub-gon h3, .hub-card.hub-eol h3 { color:#fff; }
.hub-card.hub-pco2 p, .hub-card.hub-cfd p, .hub-card.hub-est p, .hub-card.hub-sw p, .hub-card.hub-gon p, .hub-card.hub-eol p { color:rgba(255,255,255,.82); }
.hub-card.hub-pco2 .hc-ext, .hub-card.hub-cfd .hc-ext, .hub-card.hub-est .hc-ext, .hub-card.hub-gon .hc-ext, .hub-card.hub-eol .hc-ext { color:rgba(255,255,255,.65); }
.hub-card.hub-sw .hc-ext { color:#FFC107; }
.hub-card.hub-sw .hc-logo { border-radius:8px; height:44px; }
.hub-card.hub-pco2 .hc-ic, .hub-card.hub-cfd .hc-ic, .hub-card.hub-est .hc-ic, .hub-card.hub-sw .hc-ic, .hub-card.hub-gon .hc-ic, .hub-card.hub-eol .hc-ic { background:rgba(255,255,255,.18); color:#fff; }

/* ---------- info y alertas en las cards del inicio y en el menú de paneles ---------- */
.hc-info { display:flex; flex-wrap:wrap; gap:.3rem; margin-top:.6rem; }
.hc-chip { font-size:.66rem; font-weight:600; color:var(--muted); background:var(--surface2); border:1px solid var(--line); border-radius:99px; padding:.16rem .5rem; }
.hc-chip.mal { color:#E05550; border-color:rgba(192,84,80,.45); background:transparent; animation: lead-late 2.6s ease-in-out infinite; }
.hc-chip.bien { color:#2E7D4F; border-color:rgba(46,125,79,.4); background:transparent; }
html.dark .hc-chip.bien { color:#6FBF8F; }
.hub-card .hc-ic.deuda { color:#E05550; background:rgba(224,85,80,.12); animation: icono-deuda 1.8s ease-in-out infinite; }
.sys-menu > a { display:flex; align-items:center; gap:.5rem; }
.sys-info { margin-left:auto; font-size:.66rem; font-weight:600; color:var(--faint); white-space:nowrap; }
.sys-dot { width:.45rem; height:.45rem; border-radius:50%; background:#E05550; flex-shrink:0; animation: punto-late 2.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .hc-chip.mal, .hub-card .hc-ic.deuda, .sys-dot { animation:none; } }

/* ---------- campos calculados: editor de fórmulas ---------- */
.fx-edit { display:flex; align-items:flex-start; gap:.5rem; margin:-.25rem 0 .75rem; flex-wrap:wrap; }
.fx-wrap { position:relative; flex:1; min-width:16rem; }
.fx-input { font-family:'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace; font-size:.84rem; }
.fx-msg { font-size:.7rem; margin-top:.25rem; min-height:.9rem; font-weight:600; }
.fx-msg.ok { color:#2E7D4F; } html.dark .fx-msg.ok { color:#6FBF8F; }
.fx-msg.bad { color:#E05550; }
.fx-sug { position:absolute; left:0; right:0; top:calc(100% - .9rem); z-index:30; background:var(--surface); border:1px solid var(--line); border-radius:8px; box-shadow:var(--sh-md); padding:.2rem; max-height:12rem; overflow:auto; }
.fx-op { padding:.35rem .55rem; border-radius:5px; font-size:.82rem; cursor:pointer; }
.fx-op.on, .fx-op:hover { background:var(--accent-soft); color:var(--accent-ink); }
.fx-box { margin-top:.6rem; padding:.7rem .8rem; border:1px dashed var(--line2); border-radius:10px; }
.fx-vars { display:flex; flex-wrap:wrap; gap:.3rem; margin-top:.5rem; }
.fx-var { font:inherit; font-size:.7rem; font-weight:600; background:var(--surface2); color:var(--ink); border:1px solid var(--line); border-radius:99px; padding:.18rem .55rem; cursor:pointer; }
.fx-var:hover { border-color:var(--accent); color:var(--accent-ink); }
code { font-family:'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace; font-size:.9em; background:var(--surface2); border-radius:4px; padding:.05rem .3rem; }
.calc-mark { font-size:.62rem; font-weight:700; color:var(--accent-ink); background:var(--accent-soft); border-radius:4px; padding:.05rem .3rem; vertical-align:middle; }
.td-calc { font-weight:600; color:var(--accent-ink); }
.chip-calc { background:var(--accent-soft); color:var(--accent-ink); font-weight:600; max-width:22rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ---------- burbuja de usuario (foto arriba a la derecha) ---------- */
.umenu { position:relative; }
.umenu summary { list-style:none; cursor:pointer; }
.umenu summary::-webkit-details-marker { display:none; }
.umenu-pop { position:absolute; top:calc(100% + .5rem); right:0; z-index:80; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--sh-lg); min-width:15rem; padding:.3rem; display:grid; gap:.1rem; }
.umenu-head { display:flex; align-items:center; gap:.6rem; padding:.5rem .6rem .65rem; border-bottom:1px solid var(--line); margin-bottom:.2rem; }
.umenu-head .avatar { width:2.1rem; height:2.1rem; }
.umenu-head .uh-t { display:flex; flex-direction:column; line-height:1.3; min-width:0; }
.umenu-head strong { font-size:.85rem; color:var(--ink); }
.umenu-head small { font-size:.68rem; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.umenu-pop a, .umenu-pop button { display:flex; align-items:center; gap:.55rem; width:100%; text-align:left; background:none; border:none; font:inherit; font-size:.84rem; font-weight:500; color:var(--ink); padding:.48rem .6rem; border-radius:6px; cursor:pointer; text-decoration:none; }
.umenu-pop a:hover, .umenu-pop button:hover { background:var(--surface2); color:var(--accent-ink); text-decoration:none; }
.umenu-pop svg { width:1rem; height:1rem; color:var(--muted); flex-shrink:0; }
.umenu-pop form { display:contents; }
@media (max-width:640px) { .umenu-pop { position:fixed; top:3.3rem; right:.5rem; } }

/* ---------- soporte (tickets) ---------- */
.tk-row { display:flex; align-items:center; gap:.8rem; text-decoration:none; color:inherit; padding:.8rem 1rem; }
.tk-row:hover { text-decoration:none; border-color:var(--line2); }
.tk-c { display:flex; flex-direction:column; gap:.1rem; min-width:0; flex:1; }
.tk-flecha { color:var(--faint); font-size:1.2rem; }
.tk-estado { font-size:.62rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; border-radius:99px; padding:.16rem .55rem; flex-shrink:0; white-space:nowrap; }
.tk-estado.abierto { color:#2E7D4F; border:1px solid rgba(46,125,79,.4); }
html.dark .tk-estado.abierto { color:#6FBF8F; }
.tk-estado.cerrado { color:var(--muted); border:1px solid var(--line); }
.tk-hilo { display:flex; flex-direction:column; gap:.7rem; margin-bottom:1rem; }
.tk-msg { display:flex; gap:.55rem; align-items:flex-start; max-width:46rem; }
.tk-msg .avatar { width:1.8rem; height:1.8rem; flex-shrink:0; margin-top:.15rem; }
.tk-burbuja { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:.6rem .85rem; min-width:0; }
.tk-msg.mio .tk-burbuja { background:var(--accent-soft); border-color:transparent; }
.tk-mh { display:flex; align-items:center; gap:.45rem; margin-bottom:.15rem; flex-wrap:wrap; }
.tk-mh strong { font-size:.8rem; }
.tk-mh .f { font-size:.66rem; color:var(--faint); }
.tk-chip-sop { font-size:.55rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--accent-ink); background:var(--accent-soft); border-radius:4px; padding:.1rem .35rem; }
html.dark .tk-msg.mio .tk-burbuja .tk-chip-sop { background:rgba(255,255,255,.14); }
.tk-burbuja p { margin:.1rem 0; font-size:.86rem; line-height:1.5; }
.tk-img { max-width:min(22rem,100%); border-radius:8px; border:1px solid var(--line); display:block; margin-top:.35rem; }

/* ---------- notificaciones e historial ---------- */
.noti-pop { position:absolute; top:calc(100% + .5rem); right:-.4rem; z-index:90; width:23rem; max-width:calc(100vw - 1.5rem); max-height:62vh; overflow:auto;
  background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--sh-lg); padding:.3rem; }
.np-item { display:block; padding:.55rem .65rem; border-radius:6px; text-decoration:none; color:var(--ink); font-size:.83rem; line-height:1.45; font-weight:400; }
.np-item span { display:block; font-size:.68rem; color:var(--faint); margin-top:.15rem; }
.np-item:hover { background:var(--surface3); text-decoration:none; }
.np-item.unread { background:var(--accent-soft); border-left:2px solid var(--role); font-weight:500; }
.np-empty { padding:.85rem .7rem; color:var(--muted); font-size:.83rem; }
.np-all { display:block; text-align:center; padding:.55rem; font-size:.75rem; font-weight:600; color:var(--accent-ink); text-decoration:none; border-top:1px solid var(--line); margin-top:.2rem; }
.np-all:hover { background:var(--surface2); text-decoration:none; }
.noti { display:block; text-decoration:none; color:inherit; }
.noti.unread { border-left:3px solid var(--role); background:var(--accent-soft); }
.noti .t { font-weight:600; }
.noti .f { font-size:.75rem; color:var(--faint); margin-top:.15rem; }
.hist { margin-top:.4rem; }
.hist-item { display:flex; gap:.6rem; padding:.45rem 0; border-bottom:1px solid var(--line); font-size:.84rem; align-items:baseline; }
.hist-item:last-child { border-bottom:none; }
.hist-item .cuando { color:var(--faint); font-size:.74rem; white-space:nowrap; font-variant-numeric:tabular-nums; }
.hist-item .chip { flex-shrink:0; }

/* ---------- config / permisos ---------- */
.perm { display:inline-flex; align-items:center; gap:.35rem; font-size:.8rem; font-weight:500; color:var(--muted); text-transform:none; letter-spacing:0; margin:0; }
.perm input { width:auto; }
.perm-row { display:flex; flex-wrap:wrap; gap:.5rem .9rem; align-items:center; margin-top:.6rem; }
.cfg-row { display:flex; flex-wrap:wrap; gap:.35rem; align-items:center; padding:.3rem 0; border-bottom:1px solid var(--line); }
.cfg-row:last-child { border-bottom:none; }
.cfg-inline { display:inline-flex; gap:.35rem; align-items:center; flex:1; min-width:14rem; }
.cfg-inline input { max-width:20rem; }
.udata { display:grid; grid-template-columns:repeat(auto-fit,minmax(11rem,1fr)); gap:.8rem; }
.udata .l { font-size:.63rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:600; }
.udata .v { font-weight:500; margin-top:.15rem; line-height:1.35; }
.inv-form { display:inline-flex; align-items:center; gap:.3rem; }
.inv-form input[type=file] { width:10.5rem; }

/* ---------- login (split-screen) — paleta corporativa navy, aislada del tema ----------
   Sirve tanto si la clase está en el <body> (sistema real) como en un contenedor. */
.login-bg { background:#F4F7FA; color:#0F1D2E; }
.login-bg .btn { background:var(--login); border-color:var(--login); color:#fff; }
.login-bg .btn:hover { background:var(--login-ink); border-color:var(--login-ink); }
.login-bg .btn.secondary { background:#fff; color:var(--login-ink); border-color:#CBD5E1; }
.login-bg a { color:var(--login-ink); }
.login-bg label { color:#54657A; }
.login-bg input, .login-bg select, .login-bg textarea { background-color:#fff; color:#0F1D2E; border-color:#CBD5E1; }
.login-bg input::placeholder { color:#8A99AB; }
.login-bg input:focus, .login-bg select:focus, .login-bg textarea:focus { border-color:#1D6FB8; box-shadow:0 0 0 3px #E3EDF8; }
.login-bg .card, .login-bg .split-form { background:#fff; }
.login-bg .flash.ok { background:#E1F0E6; color:#1F6B45; border-color:#BFE0CC; }
.login-bg .flash.bad { background:#F7E3E2; color:#8F3532; border-color:#EFC9C7; }
body.login-bg .wrap { max-width:none; padding:0; }
.split { display:grid; grid-template-columns:minmax(0,46%) 1fr; min-height:100vh; }
.split-brand { background:#0F3459; color:#fff; display:flex; flex-direction:column; justify-content:center; padding:3rem 3.2rem; position:relative; overflow:hidden; }
.split-brand::after { content:""; position:absolute; inset:auto auto 0 0; width:100%; height:1px; background:rgba(255,255,255,.08); }
.split-brand img { width:132px; height:auto; margin-bottom:1.4rem; }
.sb-title { font-size:1.45rem; font-weight:600; letter-spacing:-.015em; }
.sb-sub { font-size:.6rem; letter-spacing:.22em; text-transform:uppercase; color:rgba(255,255,255,.5); font-weight:600; margin:.2rem 0 1.5rem; }
.sb-line { color:rgba(255,255,255,.72); font-size:.9rem; max-width:26rem; line-height:1.65; }
.sb-list { margin:1.4rem 0 0; padding:0; list-style:none; display:grid; gap:.5rem; color:rgba(255,255,255,.58); font-size:.83rem; }
.sb-list li { display:flex; gap:.6rem; align-items:baseline; }
.sb-list li::before { content:""; width:.32rem; height:.32rem; border-radius:1px; background:#4A90C8; flex-shrink:0; }
.split-form { display:flex; align-items:center; justify-content:center; padding:2.5rem 1.5rem; }
.sf-inner { width:100%; max-width:21.5rem; }
.sf-inner h1 { font-size:1.22rem; margin:0 0 .2rem; }
.sf-hint { color:var(--muted); font-size:.86rem; margin-bottom:1.1rem; }
.sf-foot { color:var(--faint); font-size:.75rem; margin-top:1.4rem; line-height:1.5; }
.login-box { max-width:22rem; margin:12vh auto 0; box-shadow:var(--sh-lg); border-radius:var(--r-lg); padding:1.5rem 1.4rem 1.6rem; }
.login-mark { display:flex; flex-direction:column; align-items:center; gap:.5rem; margin-bottom:1.1rem; }
.login-mark .logo { width:2.8rem; height:2.8rem; border-radius:9px; background:var(--accent); color:#fff; font-size:1rem; }

/* ---------- modales ---------- */
.modal-back { position:fixed; inset:0; background:rgba(10,20,35,.45); z-index:60; overflow:auto; padding:2.5rem 1rem; backdrop-filter:blur(1.5px); }
.modal { background:var(--bg); border-radius:12px; max-width:48rem; margin:0 auto; padding:1rem 1.15rem 1.15rem; box-shadow:var(--sh-lg); }
.modal-h { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:.5rem; }
.modal-h h2 { margin:0; font-size:1.05rem; }
.modal-x { font-size:1.5rem; line-height:1; text-decoration:none; color:var(--muted); padding:.1rem .45rem; border-radius:6px; }
.modal-x:hover { background:var(--surface2); color:var(--ink); text-decoration:none; }
.anuncio { z-index:120; display:grid; place-items:center; }
.anuncio-box { max-width:34rem; width:calc(100% - 2rem); margin:0; padding:1.25rem 1.35rem 1.35rem; border-radius:12px; background:var(--surface); }
.anuncio-box h2 { margin:.3rem 0 .2rem; font-size:1.1rem; }
.anuncio-tag { font-size:.6rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--role); }
.cl-lista { list-style:none; margin:.35rem 0 0; padding:0; display:grid; gap:.5rem; }
.cl-lista li { display:flex; gap:.5rem; align-items:baseline; font-size:.85rem; line-height:1.5; }
.cl-lista .chip { flex-shrink:0; }

/* ---------- toast ---------- */
.toast { position:fixed; right:1rem; bottom:1rem; z-index:100; display:block; background:var(--accent-ink); color:#fff; text-decoration:none;
  padding:.7rem .95rem; border-radius:var(--r-lg); font-size:.85rem; font-weight:500; line-height:1.4; max-width:22rem;
  box-shadow:var(--sh-lg); opacity:0; transform:translateY(8px); transition:opacity .25s, transform .25s; }
.toast.show { opacity:1; transform:none; }
.toast:hover { background:#061A2E; text-decoration:none; color:#fff; }
@media (prefers-reduced-motion: reduce) { .toast { transition:none; } }

.login-bg .login-mark .logo { background:var(--login); color:#fff; }
.login-bg .sf-inner h1, .login-bg .sb-title { color:#0F1D2E; }
.login-bg .split-brand .sb-title { color:#fff; }
.login-bg .sf-hint { color:#54657A; }
.login-bg .sf-foot { color:#8A99AB; }

/* ==========================================================================
   MODO OSCURO — clase .dark en <html>
   Criterio: nada de negro puro ni de blanco puro. Base gris azulada suave
   (#12171D), texto a ~80% de contraste (#D6DEE6) y bordes de bajo contraste;
   la jerarquía la dan las superficies, no las sombras. El login se aísla y
   queda claro en navy corporativo.
   ========================================================================== */
html.dark {
  --bg:#12171D; --surface:#181F27; --surface2:#212A33; --surface3:#151B22;
  --ink:#D6DEE6; --muted:#98A4B0; --faint:#76828E;
  --chrome:#0F151B; --chrome-line:#0A0F14;
  --accent:#17786F; --accent-ink:#1E8E82; --accent-soft:#16302D;
  --role:#57B8AB; --role-soft:#16302D;
  --line:#242D37; --line2:#33404C;
  --ok:#5AA97A; --ok-soft:#182A20;
  --bad:#D6706B; --bad-soft:#2E1C1B;
  --warn:#C6A45A; --warn-soft:#2A2416;
  --sh:none;
  --sh-md:0 2px 10px rgba(0,0,0,.35);
  --sh-lg:0 16px 40px rgba(0,0,0,.5);
  color-scheme:dark;
}
html.dark body { background:var(--bg); color:var(--ink); }
/* el texto fino brilla menos en oscuro: se afina medio grado */
html.dark h1, html.dark h2, html.dark h3 { color:#E3EAF1; font-weight:600; }
html.dark strong { color:#E3EAF1; font-weight:600; }

html.dark .card, html.dark .tile, html.dark .tablewrap, html.dark .kcard, html.dark .hub-card { background:var(--surface); border-color:var(--line); }
html.dark .tile .v { color:#E8EFF5; }
html.dark .card--accent { border-left-color:var(--role); }

html.dark .btn { color:#EAF4F2; border-color:transparent; }
html.dark .btn:hover { background:var(--accent-ink); }
html.dark .btn.secondary { background:var(--surface2); color:var(--ink); border-color:var(--line2); }
html.dark .btn.secondary:hover { background:#2A343F; color:#E3EAF1; }
html.dark .btn.danger { background:#8E3B38; border-color:transparent; color:#F6E3E2; }
html.dark .btn.danger:hover { background:#A34541; }

html.dark input, html.dark select, html.dark textarea { background-color:var(--surface3); color:var(--ink); border-color:var(--line2); }
html.dark input:hover, html.dark select:hover, html.dark textarea:hover { border-color:#41505E; }
html.dark input:focus, html.dark select:focus, html.dark textarea:focus { border-color:var(--role); box-shadow:0 0 0 3px rgba(87,184,171,.18); }
html.dark input::placeholder, html.dark textarea::placeholder { color:var(--faint); }
select, html.dark select { background-repeat:no-repeat; background-position:right .45rem center; background-size:.7rem; }
html.dark select { background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 8l3-3.5' fill='none' stroke='%2398A4B0' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E"); }
html.dark input[type=checkbox], html.dark input[type=radio] { accent-color:var(--role); }

html.dark th { background:#131A21; color:var(--faint); border-bottom-color:var(--line2); }
html.dark td { border-bottom-color:var(--line); }
html.dark tbody tr:hover td { background:#1C242D; }
html.dark tr.yo td { background:#17302D; }
html.dark tr.yo:hover td { background:#1C3B37; }
html.dark tr.vencida td { background:#2A1B1A; }
html.dark .rowlink:hover td { background:#17302D; }
html.dark .rowlink a { color:var(--role); }

html.dark .seg { background:var(--surface3); border-color:var(--line); }
html.dark .seg a.on { background:var(--surface2); color:#E3EAF1; box-shadow:none; }
html.dark .col { background:#141B22; border-color:var(--line); }
html.dark .col.over { background:var(--accent-soft); }
html.dark .kcard:hover { border-color:#3A4855; }
html.dark .kcard-m .mrr, html.dark .deal-mrr, html.dark .kcard-t:hover { color:var(--role); }
html.dark .aprob-box { background:#26200F; border-color:#4A3F1E; }
html.dark .kcard-w.aprob { color:#D3AE60; }

html.dark .modal { background:var(--bg); }
html.dark .modal-back { background:rgba(0,0,0,.62); }
html.dark .anuncio-box { background:var(--surface); }
html.dark .noti-pop, html.dark .sys-menu { background:var(--surface); border-color:var(--line2); }
html.dark .sys-menu > a, html.dark .np-item { color:var(--ink); }
html.dark .np-item:hover, html.dark .sys-menu > a:hover { background:var(--surface2); color:#E3EAF1; }
html.dark .np-item.unread, html.dark .noti.unread { background:var(--accent-soft); }
html.dark .np-all { color:var(--role); }
html.dark .toast { background:var(--surface2); border:1px solid var(--line2); color:var(--ink); }
html.dark .toast:hover { background:#2A343F; color:#E3EAF1; }

html.dark .prog, html.dark .bar-track { background:#212A33; }
html.dark .pos { background:var(--surface2); color:var(--muted); }
html.dark .logo { background:var(--role); color:#0B1614; }
html.dark .hub-card .hc-ic { background:var(--accent-soft); color:var(--role); }
html.dark .hub-card:hover { border-color:#3A4855; }
html.dark .flash.ok { background:var(--ok-soft); color:#8FD1A8; border-color:#2A4534; }
html.dark .flash.bad { background:var(--bad-soft); color:#EAA09C; border-color:#4A2B29; }

/* los chips vienen con color en línea desde el servidor: se bajan medio tono */
html.dark .chip { filter:brightness(.86) saturate(.82); color:#F2F6F8; box-shadow:none; }

/* gráficas generadas en el servidor: navy sobre fondo oscuro no se ve */
html.dark svg [fill="#0F3459"] { fill:#3E9C92; }
html.dark svg [stroke="#0F3459"] { stroke:#57B8AB; }
html.dark svg [fill="#8494A6"] { fill:#93A0AD; }
html.dark svg [fill="#54657A"] { fill:#9AA7B4; }
html.dark svg [stroke="#C05450"] { stroke:#D6706B; }

/* el login no participa del modo oscuro */
html.dark .login-bg, html.dark .login-bg .split-form, html.dark .login-bg .card { background:#F4F7FA; color:#0F1D2E; }
html.dark .login-bg .split-form, html.dark .login-bg .card { background:#fff; }
html.dark .login-bg input, html.dark .login-bg select { background-color:#fff; color:#0F1D2E; border-color:#CBD5E1; }
html.dark .login-bg h1, html.dark .login-bg .sf-inner h1 { color:#0F1D2E; }
html.dark .login-bg .split-brand, html.dark .login-bg .split-brand .sb-title { color:#fff; }
html.dark .login-bg .btn { background:var(--login); color:#fff; }
html.dark .login-bg .btn:hover { background:var(--login-ink); }

/* ==========================================================================
   Responsive
   ========================================================================== */
@media (max-width:1080px) { .brand-txt { max-width:12rem; } }

/* Tablet: kanban deslizable */
@media (max-width:980px) {
  .board { display:flex; overflow-x:auto; width:auto; max-width:none; margin-left:0; scroll-snap-type:x proximity; padding-bottom:.6rem; }
  .col { flex:0 0 228px; scroll-snap-align:start; }
}

@media (max-width:860px) {
  .split { grid-template-columns:1fr; }
  .split-brand { padding:2rem 1.4rem 1.7rem; align-items:center; text-align:center; }
  .split-brand img { width:104px; margin-bottom:.9rem; }
  .sb-line, .sb-list { display:none; }
  .split-form { align-items:flex-start; padding-top:1.8rem; }
}

/* Teléfono: nav inferior fija, tipografía táctil, tablas con scroll propio */
@media (max-width:640px) {
  body { font-size:15px; }
  .wrap { padding:.6rem .8rem calc(4.6rem + env(safe-area-inset-bottom)); }
  h1 { font-size:1.15rem; margin:.7rem 0 .8rem; }
  .nav-inner { flex-wrap:wrap; justify-content:space-between; padding:.4rem .8rem; gap:.5rem; }
  .brand-txt { max-width:calc(100vw - 8rem); }

  .nav-links {
    position:fixed; bottom:0; left:0; right:0; z-index:20;
    background:var(--surface); border-top:1px solid var(--line);
    box-shadow:0 -1px 12px rgba(15,29,46,.1);
    display:flex; justify-content:flex-start; flex-wrap:nowrap; gap:0;
    padding:.3rem .25rem calc(.3rem + env(safe-area-inset-bottom));
  }
  .nav-links a { flex:1 0 auto; min-width:4.2rem; min-height:44px; flex-direction:column; gap:.15rem;
    justify-content:center; text-align:center; font-size:.66rem; font-weight:500; letter-spacing:0;
    color:var(--muted); border-radius:8px; padding:.25rem .2rem; }
  .nav-links a:hover { background:transparent; color:var(--accent); }
  .nav-links a.on { background:var(--accent-soft); color:var(--accent); font-weight:600; }
  .nav-links .ic { width:1.15rem; height:1.15rem; opacity:.9; }

  .noti-pop { position:fixed; top:3.4rem; left:.5rem; right:.5rem; width:auto; max-height:70vh; }
  .sys-menu { position:fixed; top:3.2rem; left:.5rem; right:.5rem; min-width:0; max-height:74vh; overflow:auto; }

  .tiles { grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:.5rem; }
  .tile { padding:.6rem .7rem; }
  .tile .v { font-size:1.3rem; }
  .deal-top { flex-wrap:wrap; }
  .prog-row { grid-template-columns:5.2rem 1fr max-content !important; }
  .bar-label { width:5.6rem; font-size:.7rem; }
  .modal-back { padding:0; }
  .modal { border-radius:0; min-height:100vh; padding-bottom:2rem; }
  .anuncio { padding:1rem; }
  .anuncio .modal.anuncio-box { min-height:0; border-radius:12px; }
  .cfg-inline { min-width:0; width:100%; }
  .toolbar .btn:not(.small):not(.secondary) { flex:1 0 auto; }
  .toast { bottom:4.6rem; left:1rem; right:1rem; max-width:none; }

  /* objetivos táctiles: los controles no bajan de 40px */
  .btn { min-height:38px; }
  .btn.small { min-height:32px; }
  input, select, textarea { padding:.5rem .6rem; font-size:16px; }
}

/* ---------- interruptor de tema en la barra (ícono sol/luna) ---------- */
.theme-btn { display:inline-flex; align-items:center; justify-content:center; width:2.15rem; height:2.15rem; border-radius:8px; border:none; background:transparent; color:rgba(255,255,255,.72); cursor:pointer; transition:background .15s, color .15s; }
.theme-btn:hover { background:rgba(255,255,255,.12); color:#fff; }
.theme-btn svg { width:1.15rem; height:1.15rem; }
.theme-btn .ic-sol { display:none; }
html.dark .theme-btn .ic-sol { display:block; }
html.dark .theme-btn .ic-luna { display:none; }

/* ---------- fotos de perfil ---------- */
.avatar { width:1.7rem; height:1.7rem; border-radius:50%; object-fit:cover; flex-shrink:0; display:inline-block; vertical-align:middle; }
.avatar-ini { display:inline-flex; align-items:center; justify-content:center; background:var(--accent-soft); color:var(--accent-ink); font-size:.62rem; font-weight:700; letter-spacing:.02em; }
.nav-links { margin-left:auto; }
.nav-user { display:inline-flex; align-items:center; gap:.42rem; flex-shrink:0; color:rgba(255,255,255,.85); text-decoration:none; font-weight:600; font-size:.8rem; padding:.25rem .45rem; border-radius:8px; transition:background .15s, color .15s; }
.nav-user:hover { background:rgba(255,255,255,.1); color:#fff; text-decoration:none; }
.nav-user.on { background:rgba(255,255,255,.15); color:#fff; }
@media (max-width:640px) { .nav-user { padding:.2rem; } .nav-user > span:not(.avatar) { display:none; } }
.nav-user .avatar { width:1.55rem; height:1.55rem; border:1.5px solid rgba(255,255,255,.35); }
.nav-user .avatar-ini { background:rgba(255,255,255,.16); color:#fff; border:none; }
.users-tbl .avatar { width:2rem; height:2rem; }
.ucel { display:flex; align-items:center; gap:.6rem; min-width:11rem; }
.ucel > div { min-width:0; }
.avatar-xl { width:4.2rem; height:4.2rem; font-size:1.3rem; }
.perfil-foto { display:flex; gap:1rem; align-items:center; flex-wrap:wrap; }

/* ---------- campus de formación ---------- */
.campus-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:.9rem; }
.curso-card { padding:0; overflow:hidden; display:flex; flex-direction:column; margin-bottom:0; }
.curso-media { width:100%; aspect-ratio:16/9; border:none; display:block; background:#000; }
.curso-fac { position:relative; width:100%; aspect-ratio:16/9; border:none; display:block; background:#10151B center/cover no-repeat; cursor:pointer; padding:0; }
.curso-fac:hover .curso-play { transform:scale(1.08); background:rgba(14,110,102,.95); }
.curso-play { position:absolute; inset:0; margin:auto; width:3.4rem; height:3.4rem; border-radius:50%; background:rgba(10,20,35,.72); transition:transform .15s, background .15s; }
.curso-play::after { content:""; position:absolute; left:55%; top:50%; transform:translate(-50%,-50%); border-style:solid; border-width:.62rem 0 .62rem 1.05rem; border-color:transparent transparent transparent #fff; }
.curso-body { padding:.75rem .95rem .9rem; display:flex; flex-direction:column; flex:1; }
.curso-head { display:flex; justify-content:space-between; align-items:center; gap:.6rem; }
.curso-tag { align-self:flex-start; }
.chip.tag-video { background:#8E3B38; }
.chip.tag-documento { background:var(--accent); }
.chip.tag-enlace { background:#5B6773; }
.curso-media + .curso-body, .curso-fac + .curso-body { border-top:1px solid var(--line); }
.curso-meta { margin-top:auto; padding-top:.4rem; }
.curso-acciones { display:flex; gap:.4rem; flex-wrap:wrap; margin-top:.55rem; }
.curso-form { display:none; }
.curso-form.abierto { display:block; }
.curso-doc { position:relative; width:100%; aspect-ratio:16/6.5; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.45rem; text-decoration:none; color:#fff; }
.curso-doc:hover { text-decoration:none; color:#fff; filter:brightness(1.07); }
.curso-doc svg { width:2.4rem; height:2.4rem; opacity:.92; }
.curso-ext { font-size:.62rem; font-weight:800; letter-spacing:.14em; background:rgba(255,255,255,.18); padding:.2rem .6rem; border-radius:999px; }
.ext-pdf { background:linear-gradient(140deg, #A8433E, #7E2F2B); }
.ext-doc { background:linear-gradient(140deg, #2E5F9E, #1F4676); }
.ext-xls { background:linear-gradient(140deg, #2F7D4F, #1F5A38); }
.ext-ppt { background:linear-gradient(140deg, #C06A2C, #94501F); }
.ext-otro { background:linear-gradient(140deg, #5B6773, #3E4854); }
.doc-link { background:linear-gradient(140deg, #0E6E66, #0A4E48); }
.curso-doc + .curso-body { border-top:1px solid var(--line); }
.curso-imglink { display:block; }
.curso-img { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; background:#10151B; }
.curso-imglink + .curso-body { border-top:1px solid var(--line); }
.curso-file { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:0 0 .35rem; font-size:.72rem; color:var(--faint); }
.curso-lock { background:linear-gradient(140deg, #3E4854, #262E37); }
.curso-bloqueada { opacity:.78; }
.curso-num { display:inline-flex; align-items:center; justify-content:center; width:1.35rem; height:1.35rem; border-radius:50%; background:var(--surface2); color:var(--muted); font-size:.68rem; font-weight:700; flex-shrink:0; }
.curso-flecha { padding:.15rem .45rem; font-size:.72rem; }
.curso-flecha[disabled] { opacity:.35; cursor:default; }

/* ---------- leads liberadas (toma por inactividad): borde que respira suave, aviso adentro de la tarjeta ---------- */
@keyframes lead-late { 0%, 100% { border-color:rgba(192,84,80,.3); } 50% { border-color:rgba(192,84,80,.75); } }
.kcard-libre { border:1.5px solid rgba(192,84,80,.45); animation: lead-late 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .kcard-libre { animation:none; } }
.chip-deuda { border:1.5px solid rgba(192,84,80,.45); animation: lead-late 2.6s ease-in-out infinite; }
@keyframes icono-deuda { 0%, 100% { color:#E05550; filter:drop-shadow(0 0 2px rgba(224,85,80,.5)); } 50% { color:#FF7A73; filter:drop-shadow(0 0 8px rgba(255,122,115,.95)); } }
.nav-links a.deuda .ic { animation: icono-deuda 1.8s ease-in-out infinite; }
.nav-links a.deuda span { color:#E8837F; }
@media (prefers-reduced-motion: reduce) { .chip-deuda, .nav-links a.deuda .ic { animation:none; } }
@media (prefers-reduced-motion: reduce) { .nav-links a.deuda .ic { color:#E05550; } }
.tomar-box { display:flex; gap:1rem; align-items:center; justify-content:space-between; flex-wrap:wrap; background:var(--warn-soft); border:1px solid rgba(168,121,31,.45); border-radius:10px; padding:.8rem 1rem; margin-bottom:.9rem; }
.tomar-box form { flex-shrink:0; }

/* ---------- grilla de constancia (estilo GitHub) ---------- */
.hm-scroll { overflow-x:auto; padding-bottom:.2rem; }
.hm { display:flex; gap:3px; width:max-content; }
.hm-col { display:flex; flex-direction:column; gap:3px; }
.hm-c { width:.7rem; height:.7rem; border-radius:3px; background:var(--surface2); display:inline-block; flex-shrink:0; }
.hm-x { background:transparent; }
.hm-0 { background:var(--surface2); }
.hm-p { background:#E9C46A; }
.hm-v { background:#E8837F; }
html.dark .hm-p { background:#8A6D1F; }
html.dark .hm-v { background:#8A3835; }
.hm-sep { width:1px; height:.8rem; background:var(--line); margin:0 .25rem; display:inline-block; }
.hm-1 { background:#BFE3D2; }
.hm-2 { background:#7CC7A4; }
.hm-3 { background:#3D9A72; }
.hm-4 { background:#166B4A; }
html.dark .hm-0 { background:#1C242D; }
html.dark .hm-1 { background:#14392C; }
html.dark .hm-2 { background:#1D5B43; }
html.dark .hm-3 { background:#2C8663; }
html.dark .hm-4 { background:#57B8AB; }
.hm-meses { display:flex; gap:3px; width:max-content; margin-bottom:.2rem; }
.hm-meses span { width:.7rem; font-size:.56rem; color:var(--faint); overflow:visible; white-space:nowrap; flex-shrink:0; }
.hm-leyenda { display:flex; gap:.25rem; align-items:center; margin-top:.5rem; font-size:.66rem; color:var(--faint); }

/* ---------- modales de carga (actividad, objetivos generales) ---------- */
.modal-carga { display:none; }
.modal-carga.abierto { display:block; }
.modal-carga .modal { max-width:38rem; }
.cfg-actividad { flex:0 1 auto; }
@media (max-width:640px) {
  .cfg-inline { flex-wrap:wrap; }
  .cfg-actividad { flex:1 1 100%; width:100%; }
  .cfg-actividad select { flex:1 1 10rem; min-width:0; max-width:none; }
  .cfg-actividad input[type=date] { flex:1 1 7.5rem; min-width:0; max-width:none; }
  .modal-carga .modal { max-width:none; }
  .toolbar > .sp + .btn, .toolbar > .btn:last-child:not(.small):not(.secondary) { flex:1 1 100%; text-align:center; }
}
.doc-curso { background:linear-gradient(140deg, #0E6E66, #0A3D39); }
.doc-curso .ic, .doc-curso svg { width:2.6rem; height:2.6rem; }
.quiz-preg { padding:.7rem 0; border-bottom:1px solid var(--line); }
.quiz-preg:last-of-type { border-bottom:none; }
.quiz-op { display:flex; align-items:center; gap:.5rem; padding:.3rem .2rem; font-size:.88rem; text-transform:none; letter-spacing:0; font-weight:500; color:var(--ink); margin:0; cursor:pointer; }
.quiz-op input { width:auto; }

/* ---------- notificaciones con actor (foto + nombre + hora) ---------- */
/* El popup abre hacia la derecha de la campanita (anclado a la izquierda de la barra) para no salirse de pantalla. */
.noti-pop { left:0; right:auto; }
@media (max-width:640px) { .noti-pop { left:.5rem; right:.5rem; } }
.np-item { display:flex; gap:.65rem; align-items:flex-start; }
/* especificidad .np-item span: se neutralizan sus display/margen para la estructura nueva */
.np-item span { margin:0; }
.np-item .np-av, .np-item img.np-av { width:2.1rem; height:2.1rem; border-radius:50%; object-fit:cover; flex-shrink:0; margin:.1rem 0 0; display:block; }
.np-item span.np-av-ini { display:inline-flex; align-items:center; justify-content:center; padding:0; line-height:1; background:var(--accent-soft); color:var(--accent-ink); font-size:.55rem; font-weight:700; letter-spacing:0; }
.np-item .np-c { display:flex; flex-direction:column; gap:.16rem; min-width:0; flex:1; font-size:inherit; color:inherit; margin:0; }
.np-item .np-head { display:flex; justify-content:space-between; align-items:baseline; gap:.8rem; font-size:.76rem; color:inherit; margin:0; }
.np-item .np-head strong { font-size:.76rem; font-weight:600; }
.np-item .np-head time { font-size:.64rem; color:var(--faint); white-space:nowrap; font-weight:500; flex-shrink:0; margin-left:auto; }
.np-item .np-txt { display:block; font-size:.82rem; line-height:1.45; color:inherit; margin:0; }
.noti-row { display:flex; gap:.7rem; align-items:flex-start; }
.noti-row .avatar { width:2.2rem; height:2.2rem; margin:.1rem 0 0; }
.noti-row .avatar-ini { padding:0; line-height:1; letter-spacing:0; font-size:.6rem; }
.noti-c { flex:1; min-width:0; }
.noti .noti-head { display:flex; justify-content:space-between; align-items:baseline; gap:.8rem; margin-bottom:.15rem; }
.noti .noti-head strong { font-size:.82rem; }
.noti .noti-head .f { margin:0; flex-shrink:0; margin-left:auto; }
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

function pipelinePage({ user, deals, scope, closed, modal, err = null, robo = null, etapasActivas = ETAPAS_ACTIVAS, colores = ETAPA_COLOR, base = '', nuevoHref = '/deals/new', sistema = 'comercial', q = '', fVendedor = null, fOrigen = null, fEtapa = null, origenes = [], vendedores = [], totalSinFiltro = 0 }) {
  const colorDe = (etapa) => colores[etapa] || '#8494A6';
  const puedeMover = (d) => user.role === 'admin' || d.user_id === user.id;
  const kcard = (d) => {
    const cerrado = ['Ganado', 'Perdido'].includes(d.etapa);
    const pie = d.etapa === 'Perdido' && d.motivo_perdida ? `<div class="kcard-w warn">${esc(d.motivo_perdida)}</div>`
      : d.etapa === 'Ganado' && d.aprobacion !== 'aprobado' ? `<div class="kcard-w aprob">Por aprobar</div>`
      : d.etapa === 'Ganado' && d.fecha_cierre ? `<div class="kcard-w ok">Cerrado ${fecha(d.fecha_cierre)}</div>` : '';
    return `
    <div class="kcard ${d.disponible ? 'kcard-libre' : ''}" ${puedeMover(d) ? 'draggable="true"' : ''} data-id="${d.id}">
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
  // Los filtros activos viajan en todos los links (Míos/Todos, Tablero/Cerrados) para no perderse al cambiar de vista.
  const qsF = [q ? 'q=' + encodeURIComponent(q) : '', fVendedor ? 'vendedor=' + fVendedor : '', fOrigen ? 'origen=' + encodeURIComponent(fOrigen) : '', fEtapa ? 'etapa=' + encodeURIComponent(fEtapa) : ''].filter(Boolean).join('&');
  const amp = qsF ? '&' + qsF : '';
  const filtrando = !!(q || fVendedor || fOrigen || fEtapa);
  return layout({
    title: 'Pipeline', user, active: 'pipeline', sistema, err,
    body: `
  <form method="get" action="${pipeUrl}" class="pipebar">
    <input type="hidden" name="scope" value="${scope}">
    ${closed ? '<input type="hidden" name="cerrados" value="1">' : ''}
    ${fEtapa ? `<input type="hidden" name="etapa" value="${esc(fEtapa)}">` : ''}
    <div class="seg">
      <a href="${pipeUrl}?scope=mios${closed ? '&cerrados=1' : ''}${amp}" class="${scope === 'mios' ? 'on' : ''}">Míos</a>
      <a href="${pipeUrl}?scope=todos${closed ? '&cerrados=1' : ''}${amp}" class="${scope === 'todos' ? 'on' : ''}">Todos</a>
    </div>
    <div class="seg">
      <a href="${pipeUrl}?scope=${scope}${amp}" class="${!closed ? 'on' : ''}">Tablero</a>
      <a href="${pipeUrl}?scope=${scope}&cerrados=1${amp}" class="${closed ? 'on' : ''}">Cerrados</a>
    </div>
    <input name="q" value="${esc(q)}" placeholder="Buscar empresa, contacto, ciudad…" aria-label="Buscar leads">
    ${scope === 'todos' && vendedores.length > 1 ? `
    <select name="vendedor" onchange="this.form.submit()">
      <option value="">Vendedor: todos</option>
      ${vendedores.map((v) => `<option value="${v.id}" ${v.id === fVendedor ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
    </select>` : ''}
    ${origenes.length > 1 ? `
    <select name="origen" onchange="this.form.submit()">
      <option value="">Origen: todos</option>
      ${origenes.map((o) => `<option value="${esc(o)}" ${o === fOrigen ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>` : ''}
    <button class="btn secondary small">Buscar</button>
    ${filtrando ? `<a class="btn secondary small" href="${pipeUrl}?scope=${scope}${closed ? '&cerrados=1' : ''}">Limpiar</a>
    <span class="small muted fresultado">${deals.length} de ${totalSinFiltro} lead${totalSinFiltro === 1 ? '' : 's'}</span>` : ''}
    <a class="btn small nuevo" href="${nuevoHref}">+ Nuevo deal</a>
  </form>
  ${fEtapa ? `<p class="small muted" style="margin:-.4rem 0 .8rem">Mostrando solo las leads en <strong>${esc(fEtapa)}</strong> — arrastralas a otra columna (o cambiales la etapa desde la ficha) y cuando la columna quede vacía vas a poder borrarla en Config.</p>` : ''}
  ${deals.length ? '' : filtrando
    ? `<div class="card"><p class="muted" style="margin:0">Ninguna lead coincide con la búsqueda. Probá con menos filtros o tocá "Limpiar".</p></div>`
    : `<div class="card"><p class="muted" style="margin:0">No hay deals acá todavía. Cargá el primero con “+ Nuevo deal” — la regla del equipo: apenas se agenda la primera reunión, el deal se carga.</p></div>`}
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

// Orígenes de lead para los paneles comerciales configurables (los de CFD son de venta de software).
const ORIGENES_PANEL = ['MarketPlace', 'Ads', 'WhatsApp', 'Instagram', 'Referido', 'Cliente anterior', 'Propio', 'Otro'];

function dealFormModal({ user, deal, vendedores, isAdmin, eventos = [], ultimaEd, errAprob, errCalif, errMigrar, tiempos, companeros = [], tomar = null, panel = 'cfd', etapas = ETAPAS, backHref = '/pipeline', campanas = [] }) {
  const d = deal || {};
  const isNew = !deal;
  const opt = (list, sel) => list.map((o) => `<option value="${esc(o)}" ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
  // El origen guardado siempre aparece en el selector, aunque no esté en la lista (leads importadas).
  const origenes = panel === 'cfd' ? ORIGENES : [...new Set([...(d.origen ? [d.origen] : []), ...ORIGENES_PANEL])];
  return `
  <div class="modal-back" id="modalBack">
  <div class="modal">
  <div class="modal-h"><h2>${isNew ? 'Nuevo deal' : esc(d.empresa)}</h2><a class="modal-x" href="${backHref}" aria-label="Cerrar">&times;</a></div>
  ${!isNew && ultimaEd ? `<p class="small muted" style="margin:-.3rem 0 .7rem">Última edición: <strong>${esc(ultimaEd.nombre)}</strong> · ${fechaHora(ultimaEd.fecha)}${tiempos ? ` &nbsp;·&nbsp; Último movimiento de etapa: <strong>${tiempoRel(tiempos.ultima)}</strong> &nbsp;·&nbsp; Promedio entre etapas: <strong>${tiempos.promedio != null ? durLegible(tiempos.promedio) : '—'}</strong>` : ''}</p>` : ''}
  ${errAprob ? `<div class="flash bad">No se pudo aprobar: falta cargar el <strong>valor del deal</strong>, que es la base para calcular la comisión del vendedor. Completalo, guardá y volvé a aprobar.</div>` : ''}
  ${errCalif ? `<div class="flash bad">No se pudo aprobar: falta la <strong>calificación del cliente</strong> (Calificado / Descalificado / Cliente / Cliente de Alto Valor). Elegila abajo, guardá y volvé a aprobar.</div>` : ''}
  ${errMigrar ? `<div class="flash bad">Una venta <strong>Ganada y aprobada</strong> no se puede migrar: sus comisiones se generaron con las reglas de este panel. Si corresponde migrarla igual, primero reabrila (movela de etapa).</div>` : ''}
  ${!isNew && tomar ? `
  <div class="tomar-box">
    <div>
      <strong>Esta lead está liberada</strong>
      <p class="small" style="margin:.15rem 0 0">Lleva más de ${tomar.horas} horas sin actividad (ni cambio de etapa, ni notas, ni ediciones). Si la tomás, pasa a ser tuya con todo el historial, su dueño actual recibe una notificación y el contador arranca de cero.</p>
    </div>
    <form method="post" action="/deals/${d.id}/tomar" onsubmit="return confirm('¿Tomar la lead «${esc(d.empresa)}»?')"><button class="btn">Tomar lead</button></form>
  </div>` : ''}
  ${!isNew && d.etapa === 'Ganado' && d.aprobacion !== 'aprobado' ? (isAdmin ? `
  <div class="aprob-box">
    ${d.mrr > 0 && d.calificacion ? `
    <p><strong>Esta venta espera tu aprobación.</strong> Validá los datos antes de aprobar (corregilos abajo y guardá si algo está mal):</p>
    <p class="small" style="margin:.2rem 0 .7rem"><strong>Vendedor:</strong> ${esc((vendedores.find((v) => v.id === d.user_id) || {}).name || '—')} · <strong>Tipo:</strong> ${esc(panel === 'cfd' ? d.tipo_venta || '—' : 'Venta ' + panel)} · <strong>Valor:</strong> ${money(d.mrr)} · <strong>Calificación:</strong> ${esc(d.calificacion || '—')} · <strong>Cierre:</strong> ${fecha(d.fecha_cierre) || 'se estampa al aprobar'}</p>
    <form method="post" action="/deals/${d.id}/aprobar"><button class="btn">Aprobar venta</button></form>` : `
    <p style="margin:0"><strong>Faltan datos para aprobar:</strong> ${[!(d.mrr > 0) && 'el valor del deal (base de la comisión)', !d.calificacion && 'la calificación del cliente'].filter(Boolean).join(' y ')}. Completalo abajo y guardá.</p>`}
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
      <div>
        <label>Teléfono</label>
        <input name="telefono" value="${esc(d.telefono)}" inputmode="tel" placeholder="Ej: 54 9 381 555-0000">
      </div>
      ${panel !== 'cfd' ? `
      <div>
        <label>${panel === 'sitioweb' ? 'Valor mensual de la suscripción ($)' : 'Valor de la venta ($)'}</label>
        <input name="mrr" type="number" step="any" min="0" inputmode="decimal" value="${d.mrr ?? ''}" placeholder="${panel === 'sitioweb' ? 'Lo que paga el cliente por mes' : 'Total de la venta'}">
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
        <label>Calificación del cliente ${d.etapa === 'Ganado' ? '· obligatoria para aprobar' : ''}</label>
        <select name="calificacion"><option value="">— Sin calificar —</option>${opt(CALIFICACIONES, d.calificacion)}</select>
      </div>
      <div>
        <label>Origen</label>
        <select name="origen"><option value="">—</option>${opt(origenes, d.origen)}</select>
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
  ${!isNew && !isAdmin && user.id === d.user_id && companeros.length ? `
  <details class="card">
    <summary class="small" style="cursor:pointer;color:var(--accent-ink);font-weight:600">Traspasar esta lead a un compañero</summary>
    <p class="small muted" style="margin:.5rem 0 .4rem">La lead pasa a ser suya (con todo el historial), le llega una notificación y su contador de actividad arranca de cero. Queda registrado quién la traspasó.</p>
    <form method="post" action="/deals/${d.id}/traspasar" class="cfg-inline" onsubmit="return confirm('¿Traspasar «${esc(d.empresa)}» al compañero elegido?')">
      <select name="a" style="width:auto">${companeros.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <button class="btn secondary small">Traspasar</button>
    </form>
  </details>` : ''}
  ${!isNew && isAdmin ? (() => {
    const otros = PANELES_COMERCIALES.filter((p) => p.slug !== panel);
    const ganadoAprobado = d.etapa === 'Ganado' && d.aprobacion === 'aprobado';
    return `
  <details class="card migrar-box">
    <summary class="small" style="cursor:pointer;color:var(--accent-ink);font-weight:600">Migrar esta lead a otro panel comercial</summary>
    ${ganadoAprobado ? `<p class="small muted" style="margin:.6rem 0 0">Esta venta está <strong>Ganada y aprobada</strong>: no se puede migrar porque sus comisiones se generaron con las reglas de este panel.</p>` : `
    <div class="flash bad" style="margin:.7rem 0 .6rem; font-weight:400">
      <strong>Atención — al migrar entre rubros no todos los datos viajan:</strong><br>
      · <strong>Se conservan:</strong> empresa, vendedor, teléfono, contacto, valor, origen, ubicación, fechas, notas y todo el historial.<br>
      · <strong>Se pierde la campaña</strong> (las campañas son propias de cada panel).<br>
      · <strong>La etapa</strong>: si no existe una igual en el panel destino, la lead pasa a la <strong>primera etapa</strong> de ese panel.<br>
      · <strong>El tipo de venta</strong> solo aplica en Cloud For Deploy; en los demás rubros no se usa (y al volver a CFD arranca como "Proyecto único").<br>
      El cambio queda registrado en el historial y el vendedor recibe una notificación.
    </div>
    <form method="post" action="/deals/${d.id}/migrar" class="cfg-inline" onsubmit="return confirm('¿Migrar «${esc(d.empresa)}» al panel elegido? Revisá el cartel de arriba: la campaña se pierde y la etapa puede cambiar.')">
      <select name="destino" style="width:auto">${otros.map((p) => `<option value="${p.slug}">Comercial ${esc(p.nombre)}</option>`).join('')}</select>
      <button class="btn danger small">Migrar lead</button>
    </form>`}
  </details>`;
  })() : ''}
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

// Grilla de constancia estilo GitHub: columnas = semanas, filas = Lun..Dom, intensidad por lo cargado.
// Fórmula de un campo calculado, escrita con etiquetas ({Seguimientos} + {Presupuestos enviados}).
const fmtFormula = (c, campos) => F.idsALabels(F.exprGuardada(c.formula) || '', campos);

function heatmapHtml(heat, { nDias = 182, ventana = null, desde = null } = {}) {
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const hoy = new Date(hoyISO() + 'T00:00:00Z');
  const inicio = new Date(hoy); inicio.setUTCDate(inicio.getUTCDate() - (nDias - 1));
  inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7)); // alinear a lunes
  const max = Math.max(1, ...Object.values(heat));
  const cols = [];
  const meses = [];
  const cursor = new Date(inicio);
  while (cursor <= hoy) {
    const celdas = [];
    let mesCol = '';
    for (let i = 0; i < 7; i++) {
      const iso = cursor.toISOString().slice(0, 10);
      if (cursor > hoy) { celdas.push('<span class="hm-c hm-x"></span>'); }
      else {
        const v = heat[iso] || 0;
        if (cursor.getUTCDate() === 1) mesCol = MES[cursor.getUTCMonth()];
        if (v === 0 && ventana && desde && iso >= desde) {
          // Sin carga: amarillo si el día todavía entra en la ventana retroactiva, rojo si ya venció.
          const puede = ventana.includes(iso);
          celdas.push(`<span class="hm-c ${puede ? 'hm-p' : 'hm-v'}" title="${fecha(iso)}: ${puede ? 'sin cargar — todavía se puede cargar' : 'sin cargar — ya venció'}"></span>`);
        } else {
          const lvl = v === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / max) * 4)));
          celdas.push(`<span class="hm-c hm-${lvl}" title="${fecha(iso)}: ${v > 0 ? v + ' cargado' : 'sin carga'}"></span>`);
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    meses.push(mesCol);
    cols.push(`<span class="hm-col">${celdas.join('')}</span>`);
  }
  return `
  <div class="hm-scroll">
    <div class="hm-meses">${meses.map((m) => `<span>${m}</span>`).join('')}</div>
    <div class="hm">${cols.join('')}</div>
    <div class="hm-leyenda"><span>Menos</span><span class="hm-c hm-0"></span><span class="hm-c hm-1"></span><span class="hm-c hm-2"></span><span class="hm-c hm-3"></span><span class="hm-c hm-4"></span><span>Más</span>${ventana && desde ? '<span class="hm-sep"></span><span class="hm-c hm-p"></span><span>por cargar</span><span class="hm-c hm-v"></span><span>vencido</span>' : ''}</div>
  </div>`;
}

// Tabs de días de la ventana de carga (con punto rojo en los días pasados sin cargar).
function tabsDias(ventana, cargadas, fechaSel, urlBase, extraQS) {
  const lbl = (fch, i) => (i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : `${+fch.slice(8, 10)}/${+fch.slice(5, 7)}`);
  return `
  <div class="seg">
    ${ventana.map((fch, i) => `<a href="${urlBase}?fecha=${fch}${extraQS}" class="${fch === fechaSel ? 'on' : ''}">${lbl(fch, i)}${i > 0 && !cargadas.includes(fch) ? ' <span class="warn">•</span>' : ''}</a>`).join('')}
  </div>`;
}

function actividadPage({ user, today, history, fecha: fechaSel, ventana = [], cargadas = [], esAdmin, target, vendedores = [] }) {
  const t = today || {};
  const otro = esAdmin && target && target.id !== user.id;
  const extraQS = otro ? '&vendedor=' + target.id : '';
  return layout({
    title: 'Actividad diaria', user, active: 'actividad',
    body: `
  <h1>${otro ? 'Actividad de ' + esc(target.name) : 'Mi actividad'}</h1>
  <p class="muted small">Cargala al final de cada día. Podés cargar o corregir hasta 3 días para atrás — los días con <span class="warn">•</span> están sin cargar.${esAdmin ? ' Como admin podés cargar cualquier fecha y de cualquier vendedor.' : ''}</p>
  <div class="toolbar">
    ${tabsDias(ventana, cargadas, fechaSel, '/actividad', extraQS)}
    ${esAdmin ? `
    <form method="get" action="/actividad" class="cfg-inline" style="flex:0">
      <select name="vendedor" style="width:auto">${vendedores.map((v) => `<option value="${v.id}" ${target && v.id === target.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
      <input type="date" name="fecha" value="${fechaSel}" style="width:auto">
      <button class="btn secondary small">Ver</button>
    </form>` : ''}
  </div>
  <form method="post" action="/actividad" class="card">
    <p class="small" style="margin:0 0 .3rem"><strong>Cargando el día ${fecha(fechaSel)}</strong>${otro ? ' de ' + esc(target.name) : ''}</p>
    <input type="hidden" name="fecha" value="${fechaSel}">
    ${otro ? `<input type="hidden" name="user_id" value="${target.id}">` : ''}
    <div class="grid2">
      <div><label>Contactos nuevos agregados</label><input name="contactos" type="number" min="0" inputmode="numeric" value="${t.contactos ?? ''}" placeholder="0"></div>
      <div><label>Toques (llamadas + mensajes + emails)</label><input name="toques" type="number" min="0" inputmode="numeric" value="${t.toques ?? ''}" placeholder="0"></div>
      <div><label>Reuniones agendadas</label><input name="reuniones_agendadas" type="number" min="0" inputmode="numeric" value="${t.reuniones_agendadas ?? ''}" placeholder="0"></div>
      <div><label>Reuniones realizadas</label><input name="reuniones_realizadas" type="number" min="0" inputmode="numeric" value="${t.reuniones_realizadas ?? ''}" placeholder="0"></div>
    </div>
    <label>Notas del día</label>
    <input name="notas" value="${esc(t.notas)}" placeholder="Opcional">
    <div style="margin-top:1.2rem"><button class="btn" style="width:100%">Guardar el día</button></div>
  </form>
  <h2>Mis últimos 14 días</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Fecha</th><th>Contactos</th><th>Toques</th><th>Reu. agend.</th><th>Reu. hechas</th><th>Notas</th></tr></thead>
    <tbody>${history.length ? history.map((r) => `<tr><td>${fecha(r.fecha)}</td><td>${r.contactos}</td><td>${r.toques}</td><td>${r.reuniones_agendadas}</td><td>${r.reuniones_realizadas}</td><td class="muted">${esc(r.notas || '')}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">Todavía no cargaste ningún día.</td></tr>'}</tbody>
  </table></div>`
  });
}

/* --------- dashboard (gráficos SVG sin dependencias) --------- */

function funnelBars(counts, etapas = ETAPAS_ACTIVAS, colores = ETAPA_COLOR) {
  const max = Math.max(1, ...etapas.map((e) => counts[e] || 0));
  return etapas.map((e) => {
    const v = counts[e] || 0;
    const pct = (v / max) * 100;
    const color = colores[e] || '#8494A6';
    // C4D: el valor va dentro de la barra si hay lugar; si no, afuera a la derecha.
    const val = pct >= 60
      ? `<div class="bar-fill" style="width:${pct}%;background:${color}"><span class="bar-val">${v}</span></div>`
      : `<div class="bar-fill" style="width:${pct}%;background:${color}"></div><span class="bar-val" style="left:calc(${pct}% + .5rem)">${v}</span>`;
    return `<div class="bar-row"><span class="bar-label">${esc(e)}</span><div class="bar-track">${val}</div></div>`;
  }).join('');
}

function donut(items, fmt = (v) => v, vacio = 'Sin datos en este período.') {
  const total = items.reduce((a, i) => a + i.n, 0);
  if (!total) return `<p class="muted small">${vacio}</p>`;
  const palette = ['#C05450', '#C08A2E', '#1D6FB8', '#8494A6', '#54657A', '#7A5AB5', '#3E9B57'];
  let acc = 0;
  const C = 2 * Math.PI * 40;
  const segs = items.map((it, i) => {
    const frac = it.n / total;
    const seg = `<circle r="40" cx="50" cy="50" fill="none" stroke="${palette[i % palette.length]}" stroke-width="18" stroke-dasharray="${frac * C} ${C}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 50 50)"/>`;
    acc += frac;
    return seg;
  }).join('');
  const legend = items.map((it, i) => `<div class="small" style="display:flex;align-items:center;gap:.4rem"><span style="width:.7rem;height:.7rem;border-radius:3px;background:${palette[i % palette.length]};flex-shrink:0"></span>${esc(it.label)} <strong style="margin-left:auto">${fmt(it.n)}</strong></div>`).join('');
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

function dashboardPage({ user, k, campos = [], etapas = ETAPAS_ACTIVAS, colores = ETAPA_COLOR }) {
  return layout({
    title: 'Dashboard', user, active: 'dashboard', sistema: 'cfd',
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
      ${funnelBars(k.funnel, etapas, colores)}
      <p class="caption">Donde se acumulan deals está el cuello de botella: Contactado→Reunión = pitch/lista · Discovery→Propuesta = diagnóstico · Propuesta→Cierre = objeciones/urgencia.</p>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Por qué perdemos deals</h2>
      ${donut(k.motivos)}
      <p class="caption">Si un motivo domina, es una decisión de pricing/producto/segmento — no un problema del vendedor.</p>
    </div>
  </div>

  <div class="card" style="margin-top:.75rem">
    <h2 style="margin-top:0">Actividad del equipo: ${esc(k.curvaLabel || 'toques')} por día (14 días)</h2>
    ${lineChart(k.actividad)}
    <p class="caption">El indicador adelantado: la actividad de hoy son las ventas de dentro de 1-2 meses. Si esta línea cae, el pipeline se seca.</p>
  </div>

  ${tablaCampanas(k.campanas)}

  <h2>Deals sin próximo paso definido</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Empresa</th><th>Vendedor</th><th>Etapa</th><th>Última actualización</th></tr></thead>
    <tbody>${k.sinPaso.length ? k.sinPaso.map((d) => `<tr><td><a href="/deals/${d.id}">${esc(d.empresa)}</a></td><td>${esc(d.vendedor_name)}</td><td><span class="chip" style="background:${colores[d.etapa] || '#8494A6'}">${esc(d.etapa)}</span></td><td>${fecha(d.updated_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">Ninguno — todo el pipeline tiene próximo paso.</td></tr>'}</tbody>
  </table></div>

  <h2>Deals estancados (sin cambios hace +14 días)</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Empresa</th><th>Vendedor</th><th>Etapa</th><th>Última actualización</th></tr></thead>
    <tbody>${k.estancados.length ? k.estancados.map((d) => `<tr><td><a href="/deals/${d.id}">${esc(d.empresa)}</a></td><td>${esc(d.vendedor_name)}</td><td><span class="chip" style="background:${colores[d.etapa] || '#8494A6'}">${esc(d.etapa)}</span></td><td>${fecha(d.updated_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">Ninguno.</td></tr>'}</tbody>
  </table></div>

  <h2>Por vendedor — este mes</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Vendedor</th>${campos.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>Deals activos</th><th>Ganados</th><th>Ingresos ganados</th></tr></thead>
    <tbody>${k.porVendedor.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td>${campos.map((c) => `<td>${v['c' + c.id] || 0}</td>`).join('')}<td>${v.activos}</td><td>${v.ganados}</td><td>${money(v.ingresos)}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="caption">Tasas a revisar a fin de mes: reuniones agendadas ÷ contactos (pitch/lista) · propuestas ÷ reuniones hechas (diagnóstico) · ganados ÷ propuestas (cierre).</p>`
  });
}

const ROL_LABEL = { admin: 'Administrador', vendedor: 'Vendedor', developer: 'Developer' };
const ROL_COLOR = { admin: '#0F3459', vendedor: '#1D6FB8', developer: '#54657A' };
const chipRol = (r) => `<span class="chip" style="background:${ROL_COLOR[r] || '#8494A6'}">${ROL_LABEL[r] || r}</span>`;

// Duración legible: 90 → "1 m", 7200 → "2 h", 200000 → "2 d 8 h".
function durLegible(seg) {
  if (seg == null || !Number.isFinite(seg) || seg < 0) return '—';
  const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600), m = Math.round((seg % 3600) / 60);
  if (d > 0) return `${d} d${h ? ' ' + h + ' h' : ''}`;
  if (h > 0) return `${h} h${m ? ' ' + m + ' m' : ''}`;
  return `${Math.max(1, m)} m`;
}

// "hace 5 min" / "hace 2 h" / "hace 3 días" — para último login y última interacción.
function tiempoRel(s) {
  if (!s) return '—';
  const ms = Date.now() - new Date(s.replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(ms) || ms < 0) return fechaHora(s);
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 31) return `hace ${d} día${d === 1 ? '' : 's'}`;
  return fechaHora(s);
}

const rolOpts = (sel) => Object.entries(ROL_LABEL).map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
const permChecks = (sistemas, u) => sistemas.map(([slug, nombre]) => `
    <label class="perm"><input type="checkbox" name="permisos" value="${slug}" ${u && u.permisos.includes(slug) ? 'checked' : ''}> ${esc(nombre)}</label>`).join('');

function adminPage({ user, users, sistemas, abrir = false, errEmail = false }) {
  return layout({
    title: 'Administración', user, active: 'admin', sistema: 'admin',
    body: `
  <div class="toolbar" style="margin-bottom:.2rem">
    <h1 style="margin:0">Usuarios y permisos</h1>
    <div class="sp"></div>
    <button type="button" class="btn" onclick="document.getElementById('modalUsuario').classList.add('abierto')">+ Crear usuario</button>
  </div>
  <p class="small muted">Tocá un usuario para ver su ficha: datos, rol, permisos y el historial de todo lo que hizo en el sistema.</p>
  <div class="tablewrap"><table class="users-tbl">
    <thead><tr><th>Usuario</th><th>Rol</th><th>Sistemas</th><th>Estado</th><th>Alta</th><th>Último login</th><th>Última interacción</th></tr></thead>
    <tbody>${users.map((u) => `
      <tr class="rowlink ${u.active ? '' : 'inactivo'}" onclick="location='/admin/usuarios/${u.id}'">
        <td><div class="ucel">${avatar(u)}<div><a href="/admin/usuarios/${u.id}" onclick="event.stopPropagation()"><strong>${esc(u.name)}</strong></a>${u.id === user.id ? ' <span class="muted small">(vos)</span>' : ''}<div class="small muted">${esc(u.email)}</div></div></div></td>
        <td>${chipRol(u.role)}</td>
        <td class="small muted">${u.role === 'admin' ? 'Todos' : (u.permisos.length || '—')}</td>
        <td>${u.active ? '<span class="chip chip--estado-pagado">Activo</span>' : '<span class="chip chip--estado-cancelado">Inactivo</span>'}</td>
        <td class="small">${fecha(u.created_at)}</td>
        <td class="small">${u.last_login_at ? tiempoRel(u.last_login_at) : '<span class="muted">Nunca entró</span>'}</td>
        <td class="small">${u.last_seen_at ? tiempoRel(u.last_seen_at) : '—'}</td>
      </tr>`).join('')}</tbody>
  </table></div>
  <p class="caption">Los administradores tienen acceso total a todos los sistemas (los permisos no les aplican). "Última interacción" es la última vez que la persona usó el sistema, aunque no haya vuelto a loguearse.</p>

  <div class="modal-back modal-carga ${abrir ? 'abierto' : ''}" id="modalUsuario">
    <div class="modal">
      <div class="modal-h"><h2>Crear usuario</h2><button type="button" class="modal-x" onclick="document.getElementById('modalUsuario').classList.remove('abierto')" aria-label="Cerrar">&times;</button></div>
      ${errEmail ? '<div class="flash bad">Ya existe un usuario con ese email — revisá la lista, quizás está inactivo.</div>' : ''}
      <form method="post" action="/admin/usuarios" class="card">
        <div class="grid2">
          <div><label>Nombre</label><input name="name" required placeholder="Nombre y apellido"></div>
          <div><label>Email (será su usuario)</label><input name="email" type="email" required></div>
          <div><label>Contraseña inicial</label><input name="password" required minlength="6" placeholder="Mínimo 6 caracteres"></div>
          <div><label>Rol</label><select name="role">${rolOpts('vendedor')}</select></div>
        </div>
        <label>Permisos por sistema</label>
        <div class="perm-row">${permChecks(sistemas, { permisos: ['cfd', 'cobranza'] })}</div>
        <div style="margin-top:1.2rem"><button class="btn" style="width:100%">Crear usuario</button></div>
      </form>
    </div>
  </div>`
  });
}

// Lista desplegable de quién vio un aviso o una alerta.
const vistosDetalle = (lista, fmtQuien) => `
    <details style="margin-top:.4rem"><summary class="small" style="cursor:pointer;color:var(--accent-ink);font-weight:600">Ver quién lo vio</summary>
      <div class="hist" style="margin-top:.3rem">${lista.length ? lista.map(fmtQuien).join('') : '<p class="muted small" style="margin:.3rem 0 0">Nadie todavía.</p>'}</div>
    </details>`;

function adminComunicacionPage({ user, users, avisos = [], banners = [], encuestas = [], totalUsuarios = 0 }) {
  return layout({
    title: 'Comunicación', user, active: 'comunicacion', sistema: 'admin',
    body: `
  <h1>Comunicación con el equipo</h1>

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
    ${avisos.length ? `
    <h4 style="margin:1.1rem 0 .3rem">Avisos enviados</h4>
    ${avisos.map((a) => `
    <div class="cfg-row" style="display:block">
      <div class="small"><strong>${esc(a.texto)}</strong> <span class="muted">· ${fechaHora(a.created_at)} · visto por <strong>${a.vistos} de ${a.total}</strong></span></div>
      ${vistosDetalle(a.destinatarios, (d) => `<div class="hist-item"><span class="chip" style="background:${d.leida ? '#3E9B57' : '#8494A6'}">${d.leida ? 'Visto' : 'Sin ver'}</span><span>${esc(d.name)}</span><span class="cuando" style="margin-left:auto">${d.leida_at ? fechaHora(d.leida_at) : ''}</span></div>`)}
    </div>`).join('')}` : ''}
  </div>

  <div class="card card--accent">
    <h3 style="margin-top:0">Alerta en ventana (modal)</h3>
    <p class="small muted">Le aparece a <strong>todo el equipo</strong> como ventana al entrar al sistema, hasta que cada uno toque "Entendido". Para comunicados importantes que no pueden pasar de largo.</p>
    <form method="post" action="/admin/banners">
      <div class="grid2">
        <div><label>Título</label><input name="titulo" required maxlength="80" placeholder="Ej: Reunión general obligatoria"></div>
        <div><label>Mensaje</label><input name="texto" required maxlength="400" placeholder="Ej: mañana viernes 9:00 en la oficina. Traer notebook."></div>
      </div>
      <div style="margin-top:.9rem"><button class="btn">Publicar alerta</button></div>
    </form>
    ${banners.length ? `
    <h4 style="margin:1.1rem 0 .3rem">Alertas publicadas</h4>
    ${banners.map((b) => `
    <div class="cfg-row" style="display:block">
      <div class="small" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <strong>${esc(b.titulo)}</strong>
        ${b.activo ? '<span class="chip" style="background:#3E9B57">Activa</span>' : '<span class="chip chip--estado-cancelado">Apagada</span>'}
        <span class="muted">${fechaHora(b.created_at)} · visto por <strong>${b.vistos} de ${totalUsuarios}</strong></span>
        <form method="post" action="/admin/banners/${b.id}/toggle" style="display:inline;margin-left:auto"><button class="btn secondary small">${b.activo ? 'Apagar' : 'Reactivar'}</button></form>
      </div>
      <div class="small muted">${esc(b.texto)}</div>
      ${vistosDetalle(b.quienes, (q) => `<div class="hist-item"><span class="chip" style="background:#3E9B57">Visto</span><span>${esc(q.name)}</span><span class="cuando" style="margin-left:auto">${fechaHora(q.visto_at)}</span></div>`)}
    </div>`).join('')}` : ''}
  </div>

  <div class="card card--accent">
    <h3 style="margin-top:0">Encuesta al equipo</h3>
    <p class="small muted">Le aparece a todos como ventana al entrar, hasta que voten (pueden posponerla dentro de la misma sesión). Acá ves los resultados en vivo y quién votó qué.</p>
    <form method="post" action="/admin/encuestas">
      <label>Pregunta *</label><input name="pregunta" required maxlength="200" placeholder="Ej: ¿Qué día prefieren la reunión semanal?">
      <div class="grid2">
        <div><label>Opción 1 *</label><input name="op1" required maxlength="100"></div>
        <div><label>Opción 2 *</label><input name="op2" required maxlength="100"></div>
        <div><label>Opción 3</label><input name="op3" maxlength="100"></div>
        <div><label>Opción 4</label><input name="op4" maxlength="100"></div>
        <div><label>Opción 5</label><input name="op5" maxlength="100"></div>
      </div>
      <div style="margin-top:.9rem"><button class="btn">Lanzar encuesta</button></div>
    </form>
    ${encuestas.length ? `
    <h4 style="margin:1.1rem 0 .3rem">Encuestas</h4>
    ${encuestas.map((e) => {
      const total = e.votos.length;
      return `
    <div class="cfg-row" style="display:block">
      <div class="small" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <strong>${esc(e.pregunta)}</strong>
        ${e.activo ? '<span class="chip" style="background:#3E9B57">Activa</span>' : '<span class="chip chip--estado-cancelado">Cerrada</span>'}
        <span class="muted">${fechaHora(e.created_at)} · <strong>${total} de ${totalUsuarios}</strong> votaron</span>
        <form method="post" action="/admin/encuestas/${e.id}/toggle" style="display:inline;margin-left:auto"><button class="btn secondary small">${e.activo ? 'Cerrar' : 'Reabrir'}</button></form>
      </div>
      <div style="margin:.45rem 0 .2rem">
        ${e.opciones.map((op, i) => {
          const n = e.conteo[i];
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          return `<div class="prog-row"><span class="pl" title="${esc(op)}">${esc(op)}</span><div class="prog"><i style="width:${Math.max(2, pct)}%"></i></div><span class="pv"><strong>${n}</strong> · ${pct}%</span></div>`;
        }).join('')}
      </div>
      ${vistosDetalle(e.votos, (v) => `<div class="hist-item"><span style="display:inline-flex;align-items:center;gap:.45rem">${avatar({ id: v.user_id, name: v.name, avatar: v.avatar })}${esc(v.name)}</span><span class="chip" style="background:#0E6E66">${esc(e.opciones[v.opcion] || '?')}</span><span class="cuando" style="margin-left:auto">${fechaHora(v.created_at)}</span></div>`)}
      ${e.sinVotar.length && e.activo ? `<p class="small muted" style="margin:.35rem 0 0">Sin votar todavía: ${e.sinVotar.map(esc).join(', ')}</p>` : ''}
    </div>`;
    }).join('')}` : ''}
  </div>`
  });
}

function adminPreferenciasPage({ user, prefs = {} }) {
  return layout({
    title: 'Preferencias', user, active: 'preferencias', sistema: 'admin',
    body: `
  <h1>Mis preferencias</h1>
  <div class="card">
    <h3 style="margin-top:0">Mis notificaciones</h3>
    <p class="small muted">Elegí qué eventos del equipo te notifican. El paso a <strong>Ganado</strong> no se puede silenciar, y los avisos manuales siempre llegan a sus destinatarios.</p>
    <form method="post" action="/admin/mis-notificaciones" class="perm-row">
      <label class="perm"><input type="checkbox" name="deal_nuevo" ${prefs.deal_nuevo === false ? '' : 'checked'}> Deal nuevo</label>
      <label class="perm"><input type="checkbox" name="cambio_etapa" ${prefs.cambio_etapa === false ? '' : 'checked'}> Cambios de etapa</label>
      <label class="perm" style="opacity:.65"><input type="checkbox" checked disabled> Paso a Ganado / requiere aprobación (siempre activa)</label>
      <button class="btn small">Guardar</button>
    </form>
  </div>
  <p class="small muted">Tu contraseña y el cierre de sesión están en <a href="/perfil">Mi perfil</a>.</p>`
  });
}

/* --------- ficha de usuario (admin) --------- */

const UEVENTO_TIPO = {
  creado: ['Deal', '#3E9B57'], etapa: ['Etapa', '#14538C'], edicion: ['Edición', '#8494A6'],
  login: ['Sesión', '#1D6FB8'], actividad: ['Actividad', '#C08A2E'], cuenta: ['Cuenta', '#54657A'],
};

function adminUserPage({ user, target, sistemas, historial = [], resetInfo }) {
  const esYo = target.id === user.id;
  return layout({
    title: `Usuario · ${target.name}`, user, active: 'admin', sistema: 'admin',
    msg: resetInfo ? `Nueva clave temporal para ${resetInfo.name}: ${resetInfo.password} — pasásela por un canal seguro y pedile que la cambie en Perfil.` : null,
    body: `
  <div class="toolbar"><a class="btn secondary small" href="/admin">← Usuarios</a></div>
  <h1 style="display:flex;align-items:center;gap:.7rem;flex-wrap:wrap">${avatar(target, 'avatar-xl')} ${esc(target.name)} ${chipRol(target.role)}${target.active ? '' : '<span class="chip chip--estado-cancelado">Inactivo</span>'}</h1>

  <div class="card">
    <div class="udata">
      <div><div class="l">Email</div><div class="v">${esc(target.email)}</div></div>
      <div><div class="l">Alta en el sistema</div><div class="v">${fechaHora(target.created_at)}</div></div>
      <div><div class="l">Último login</div><div class="v">${target.last_login_at ? `${tiempoRel(target.last_login_at)}<div class="small muted">${fechaHora(target.last_login_at)}</div>` : 'Nunca entró'}</div></div>
      <div><div class="l">Última interacción</div><div class="v">${target.last_seen_at ? `${tiempoRel(target.last_seen_at)}<div class="small muted">${fechaHora(target.last_seen_at)}</div>` : '—'}</div></div>
    </div>
  </div>

  ${esYo ? '<p class="small muted">Este es tu propio usuario: tu clave se cambia desde Perfil, y tu rol no se puede degradar desde acá.</p>' : `
  <div class="card">
    <h3 style="margin-top:0">Rol y permisos</h3>
    <form method="post" action="/admin/usuarios/${target.id}" class="perm-row">
      <select name="role" style="width:auto">${rolOpts(target.role)}</select>
      ${permChecks(sistemas, target)}
      <button class="btn small">Guardar</button>
    </form>
    <div class="row-actions" style="justify-content:flex-start;margin-top:.9rem">
      <form method="post" action="/admin/usuarios/${target.id}/toggle" style="display:inline"><button class="btn secondary small">${target.active ? 'Desactivar cuenta' : 'Activar cuenta'}</button></form>
      <form method="post" action="/admin/usuarios/${target.id}/reset" style="display:inline" onsubmit="return confirm('¿Generar una clave nueva para ${esc(target.name)}?')"><button class="btn secondary small">Resetear clave</button></form>
    </div>
  </div>`}

  <h2>Historial de acciones</h2>
  <div class="card hist">
    ${historial.length ? historial.map((e) => {
      const [label, color] = UEVENTO_TIPO[e.tipo] || ['Cambio', '#54657A'];
      return `<div class="hist-item"><span class="chip" style="background:${color}">${label}</span><span>${e.url ? `<a href="${e.url}">${esc(e.texto)}</a>` : esc(e.texto)}</span><span class="cuando" style="margin-left:auto">${e.soloFecha ? fecha(e.cuando) : fechaHora(e.cuando)}</span></div>`;
    }).join('') : '<p class="muted small" style="margin:0">Sin acciones registradas todavía. Desde ahora quedan acá los logins, deals tocados, días de actividad cargados y cambios de cuenta.</p>'}
  </div>
  ${historial.length >= 120 ? '<p class="caption">Se muestran las últimas 120 acciones.</p>' : ''}`
  });
}

function perfilPage({ user }) {
  return layout({
    title: 'Configuración', user, active: 'perfil', sistema: 'hub',
    body: `
  <h1>Configuración</h1>
  <div class="card">
    <div class="perfil-foto">
      ${avatar(user, 'avatar-xl')}
      <div style="flex:1;min-width:14rem">
        <p style="margin:.1rem 0"><strong>${esc(user.name)}</strong> · ${esc(user.email)} · rol: ${user.role}</p>
        <form method="post" action="/perfil/foto" enctype="multipart/form-data" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-top:.5rem">
          <input type="file" name="foto" accept=".jpg,.jpeg,.png,.webp" required style="width:auto;flex:1;min-width:11rem">
          <button class="btn small">${user.avatar ? 'Cambiar foto' : 'Subir foto'}</button>
          ${user.avatar ? '<button class="btn secondary small" formaction="/perfil/foto/quitar" formenctype="application/x-www-form-urlencoded" formnovalidate>Quitar</button>' : ''}
        </form>
        <p class="caption" style="margin:.4rem 0 0">JPG, PNG o WebP, hasta 3 MB. Tu foto aparece en la barra superior y en las listas del equipo.</p>
      </div>
    </div>
  </div>
  <h2>Cambiar mi contraseña</h2>
  <form method="post" action="/perfil/password" class="card">
    <label>Contraseña actual</label>
    <input type="password" name="current" required autocomplete="current-password">
    <label>Contraseña nueva (mínimo 6)</label>
    <input type="password" name="next" required minlength="6" autocomplete="new-password">
    <div style="margin-top:1rem"><button class="btn">Cambiar contraseña</button></div>
  </form>`
  });
}

/* --------- soporte --------- */

const tkTexto = (t) => esc(t).replace(/\r?\n/g, '<br>');

function soporteListaPage({ user, tickets, abrir }) {
  const esAdmin = user.role === 'admin';
  return layout({
    title: 'Soporte', user, active: 'soporte', sistema: 'hub',
    body: `
  <h1>Soporte</h1>
  <p class="muted small">${esAdmin ? 'Tickets del equipo: respondé, pedí más datos y marcalos resueltos cuando estén listos.' : '¿Algo no funciona o necesitás ayuda? Abrí un ticket y te respondemos acá — podés adjuntar capturas de pantalla.'}</p>
  <div class="toolbar">
    <div class="sp"></div>
    <button type="button" class="btn" onclick="document.getElementById('modalTicket').classList.add('abierto')">Nuevo ticket</button>
  </div>
  ${tickets.length ? tickets.map((t) => `
  <a class="card tk-row" href="/soporte/${t.id}">
    <span class="tk-estado ${t.estado}">${t.estado === 'abierto' ? 'Abierto' : 'Resuelto'}</span>
    <div class="tk-c">
      <strong>${esc(t.asunto)}</strong>
      <span class="small muted">${esAdmin ? esc(t.autor) + ' · ' : ''}${t.mensajes} mensaje${t.mensajes === 1 ? '' : 's'} · última actividad ${tiempoRel(t.updated_at)}</span>
    </div>
    <span class="tk-flecha">›</span>
  </a>`).join('') : `<div class="card"><p class="muted" style="margin:0">${esAdmin ? 'Todavía no hay tickets del equipo.' : 'Todavía no abriste ningún ticket.'}</p></div>`}

  <div class="modal-back modal-carga ${abrir ? 'abierto' : ''}" id="modalTicket">
    <div class="modal">
      <div class="modal-h"><h2>Nuevo ticket</h2><button type="button" class="modal-x" onclick="document.getElementById('modalTicket').classList.remove('abierto')" aria-label="Cerrar">&times;</button></div>
      <form method="post" action="/soporte" enctype="multipart/form-data" class="card">
        <label>Asunto</label>
        <input name="asunto" required maxlength="120" placeholder="Ej: no me deja aprobar una venta">
        <label>Contanos qué pasa</label>
        <textarea name="texto" rows="5" required maxlength="4000" placeholder="Qué estabas haciendo, qué esperabas que pase y qué pasó. Cuanto más detalle, más rápido lo resolvemos."></textarea>
        <label>Captura de pantalla (opcional)</label>
        <input type="file" name="imagen" accept=".jpg,.jpeg,.png,.webp,.gif">
        <p class="caption" style="margin:.3rem 0 0">JPG, PNG, WebP o GIF, hasta 5 MB.</p>
        <div style="margin-top:1rem"><button class="btn" style="width:100%">Abrir ticket</button></div>
      </form>
    </div>
  </div>`
  });
}

function soporteTicketPage({ user, ticket, mensajes }) {
  return layout({
    title: `Ticket #${ticket.id}`, user, active: 'soporte', sistema: 'hub',
    body: `
  <p style="margin:0 0 .5rem"><a href="/soporte" class="small">‹ Volver a soporte</a></p>
  <div class="toolbar" style="align-items:flex-start; margin-bottom:1rem">
    <div>
      <h1 style="margin:0; display:flex; align-items:center; gap:.6rem; flex-wrap:wrap">${esc(ticket.asunto)} <span class="tk-estado ${ticket.estado}">${ticket.estado === 'abierto' ? 'Abierto' : 'Resuelto'}</span></h1>
      <p class="small muted" style="margin:.25rem 0 0">Ticket #${ticket.id} · abierto por ${esc(ticket.autor)} ${tiempoRel(ticket.created_at)}</p>
    </div>
    <div class="sp"></div>
    <form method="post" action="/soporte/${ticket.id}/estado"><button class="btn secondary small">${ticket.estado === 'abierto' ? 'Marcar resuelto' : 'Reabrir'}</button></form>
  </div>
  <div class="tk-hilo">
    ${mensajes.map((m) => `
    <div class="tk-msg ${m.user_id === user.id ? 'mio' : ''}">
      ${avatar({ id: m.user_id, name: m.name, avatar: m.avatar })}
      <div class="tk-burbuja">
        <div class="tk-mh"><strong>${esc(m.name)}</strong>${m.role === 'admin' ? '<span class="tk-chip-sop">Soporte</span>' : ''}<span class="f">${fechaHora(m.created_at)}</span></div>
        ${m.texto ? `<p>${tkTexto(m.texto)}</p>` : ''}
        ${m.imagen_path ? `<a href="/soporte/img/${m.id}" target="_blank" rel="noopener"><img class="tk-img" src="/soporte/img/${m.id}" alt="${esc(m.imagen_nombre || 'imagen adjunta')}" loading="lazy"></a>` : ''}
      </div>
    </div>`).join('')}
  </div>
  ${ticket.estado === 'cerrado' ? '<p class="small muted">Este ticket está resuelto — si escribís de nuevo, se reabre solo.</p>' : ''}
  <form method="post" action="/soporte/${ticket.id}/mensaje" enctype="multipart/form-data" class="card">
    <label>Tu respuesta</label>
    <textarea name="texto" rows="3" maxlength="4000" placeholder="Escribí tu mensaje…"></textarea>
    <div style="display:flex; gap:.6rem; align-items:center; flex-wrap:wrap; margin-top:.6rem">
      <input type="file" name="imagen" accept=".jpg,.jpeg,.png,.webp,.gif" style="width:auto;flex:1;min-width:11rem">
      <button class="btn">Enviar</button>
    </div>
  </form>`
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
    <div class="noti-row">
      ${n.actor_id ? avatar({ id: n.actor_id, name: n.actor_nombre, avatar: n.actor_avatar }) : '<span class="avatar avatar-ini">C4D</span>'}
      <div class="noti-c">
        <div class="noti-head"><strong>${esc(n.actor_id ? n.actor_nombre : 'Campus C4D')}</strong><span class="f">${fechaHora(n.created_at)}</span></div>
        <div class="t">${esc(n.texto)}</div>
      </div>
    </div>
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

function metasDetallePage({ user, vendedor, campos = [], series, info = { base: '', slug: 'cfd' } }) {
  const bloque = (titulo, sub, pts) => `
  <h2>${titulo} <span class="muted small" style="font-weight:400">· ${sub}</span></h2>
  <div class="charts">
    ${campos.map((c) => `<div class="card"><h4 style="margin:0 0 .4rem">${esc(c.label)}</h4>${barChart(pts.map((p) => ({ label: p.label, v: p['c' + c.id] || 0 })))}</div>`).join('')}
    <div class="card"><h4 style="margin:0 0 .4rem">Ingresos ganados</h4>${barChart(pts.map((p) => ({ label: p.label, v: p.ingresos || 0 })), true)}</div>
  </div>`;
  return layout({
    title: `Métricas · ${vendedor.name}`, user, active: 'metas', sistema: info.slug,
    body: `
  <div class="toolbar">
    <a class="btn secondary small" href="${info.base}/objetivos">← Objetivos</a>
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
      <a href="/campanas" class="${active === 'campanas' ? 'on' : ''}">Campañas</a>
    </div>
  </div>`;
}

// Dashboard unificado por panel: métricas del período + gráficas + tablas + exportación (une Dashboard y Reportes).
function dashboardUnificadoPage({ user, info, p, off, periodos, desde, hasta, r, etapas, colores, funnel, activos, enJuego, curva, curvaLabel, estancados, provincias, campanas, esCfd }) {
  const dashUrl = `${info.base}/dashboard`;
  const barRows = (items, fmt = (v) => v, color = '#1D6FB8') => {
    const max = Math.max(1, ...items.map((i) => i.n));
    return items.length ? items.map((i) => `<div class="prog-row"><span class="pl" title="${esc(i.label)}">${esc(i.label)}</span><div class="prog"><i style="width:${Math.max(2, Math.round((i.n / max) * 100))}%;background:${color}"></i></div><span class="pv"><strong>${fmt(i.n)}</strong></span></div>`).join('') : '<p class="muted small" style="margin:0">Sin datos en este período.</p>';
  };
  const ingresosVendedor = r.porVendedor.filter((v) => v.mrr > 0).sort((a, b) => b.mrr - a.mrr).map((v) => ({ label: v.name.split(' ')[0], n: v.mrr }));
  const alertas = (titulo, rows, vacio) => `
  <h2>${titulo}</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Empresa</th><th>Vendedor</th><th>Etapa</th><th>Última actualización</th></tr></thead>
    <tbody>${rows.length ? rows.map((d) => `<tr><td><a href="/deals/${d.id}">${esc(d.empresa)}</a></td><td>${esc(d.vendedor_name)}</td><td><span class="chip" style="background:${colores[d.etapa] || '#8494A6'}">${esc(d.etapa)}</span></td><td>${fecha(d.updated_at)}</td></tr>`).join('') : `<tr><td colspan="4" class="muted">${vacio}</td></tr>`}</tbody>
  </table></div>`;
  return layout({
    title: `Dashboard · ${info.nombre}`, user, active: 'dashboard', sistema: info.slug,
    body: `
  <h1>Dashboard ${esc(info.nombre)}</h1>
  <div class="toolbar">
    <div class="seg">
      <a href="${dashUrl}?p=dia" class="${p === 'dia' ? 'on' : ''}">Diario</a>
      <a href="${dashUrl}?p=semana" class="${p === 'semana' ? 'on' : ''}">Semanal</a>
      <a href="${dashUrl}?p=mes" class="${p === 'mes' ? 'on' : ''}">Mensual</a>
    </div>
    <form method="get" action="${dashUrl}" style="display:inline">
      <input type="hidden" name="p" value="${p}">
      <select name="off" onchange="this.form.submit()" style="width:auto">
        ${periodos.map((per) => `<option value="${per.off}" ${per.off === off ? 'selected' : ''}>${per.off === 0 ? (p === 'mes' ? 'Mes actual' : p === 'dia' ? 'Hoy' : 'Semana actual') : per.label}</option>`).join('')}
      </select>
    </form>
    <div class="sp"></div>
    <a class="btn secondary small" href="${info.base}/clientes.csv" title="Todos los clientes del panel con teléfono y calificación">CSV clientes</a>
    <a class="btn secondary small" href="${dashUrl}.csv?p=${p}&off=${off}">Descargar CSV</a>
    <a class="btn small" href="${dashUrl}/imprimir?p=${p}&off=${off}" target="_blank" rel="noopener">Exportar PDF</a>
  </div>
  <p class="small muted">Período: <strong>${fecha(desde)}${desde !== hasta ? ' a ' + fecha(hasta) : ''}</strong> · Las tarjetas y tablas son del período; el funnel y las alertas son la foto de hoy.</p>

  <div class="tiles">
    <div class="tile"><div class="v">${money(r.tot.mrr)}</div><div class="l">Ingresos ganados</div></div>
    ${esCfd ? `
    <div class="tile"><div class="v">${money(r.ingresosProyectos)}</div><div class="l">Por proyectos únicos</div></div>
    <div class="tile"><div class="v">${money(r.mrrNuevo)}</div><div class="l">MRR nuevo (suscripciones)</div></div>` : ''}
    <div class="tile"><div class="v">${r.tot.ganados} / ${r.tot.perdidos}</div><div class="l">Ganados / perdidos</div></div>
    <div class="tile"><div class="v">${r.winRate == null ? '—' : r.winRate + '%'}</div><div class="l">Win rate del período</div></div>
    <div class="tile"><div class="v">${r.tot.creados}</div><div class="l">Leads nuevas</div></div>
    <div class="tile"><div class="v">${r.tot.toques}</div><div class="l">${esc(curvaLabel || 'Actividad')} del equipo</div></div>
    <div class="tile"><div class="v">${activos}</div><div class="l">Deals activos (hoy)</div></div>
    <div class="tile"><div class="v">${money(enJuego)}</div><div class="l">En juego (últimas etapas, hoy)</div></div>
  </div>

  <div class="charts">
    <div class="card">
      <h2 style="margin-top:0">Funnel: deals activos por etapa</h2>
      ${funnelBars(funnel, etapas, colores)}
      <p class="caption">Donde se acumulan deals está el cuello de botella del proceso de venta.</p>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Por qué perdemos (período)</h2>
      ${donut(r.motivos)}
      <p class="caption">Si un motivo domina, es una decisión de pricing/producto/segmento — no un problema del vendedor.</p>
    </div>
  </div>

  <div class="card" style="margin-top:.75rem">
    <h2 style="margin-top:0">${esc(curvaLabel || 'Actividad')} por día</h2>
    ${lineChart(curva)}
    <p class="caption">El indicador adelantado: la actividad de hoy son las ventas de dentro de 1-2 meses.</p>
  </div>

  <div class="charts" style="margin-top:.75rem">
    <div class="card">
      <h2 style="margin-top:0">Ingresos por vendedor (período)</h2>
      ${barRows(ingresosVendedor, money, '#3E9B57')}
    </div>
    <div class="card">
      <h2 style="margin-top:0">Leads nuevas por provincia (período)</h2>
      ${barRows(provincias.map((x) => ({ label: x.label, n: x.n })))}
    </div>
  </div>

  <h2>Campañas del período</h2>
  <div class="tiles">
    <div class="tile"><div class="v">${campanas.filter((c) => c.nombre !== 'Sin campaña' && (c.leads || c.ganadas)).length}</div><div class="l">Campañas con movimiento</div></div>
    <div class="tile"><div class="v">${campanas.reduce((a, c) => a + (c.nombre === 'Sin campaña' ? 0 : c.leads), 0)} / ${campanas.reduce((a, c) => a + c.leads, 0)}</div><div class="l">Leads con campaña / totales</div></div>
    <div class="tile"><div class="v">${(campanas.filter((c) => c.nombre !== 'Sin campaña').sort((a, b) => b.ganadas - a.ganadas || b.ingresos - a.ingresos)[0] || {}).nombre || '—'}</div><div class="l">Campaña líder del período</div></div>
  </div>
  <div class="charts">
    <div class="card">
      <h3 style="margin-top:0">Leads por campaña</h3>
      ${donut(campanas.filter((c) => c.leads > 0).map((c) => ({ label: c.nombre, n: c.leads })))}
    </div>
    <div class="card">
      <h3 style="margin-top:0">Ingresos por campaña</h3>
      ${donut(campanas.filter((c) => c.ingresos > 0).map((c) => ({ label: c.nombre, n: c.ingresos })), money, 'Sin ventas con campaña en este período.')}
    </div>
  </div>
  ${tablaCampanas(campanas)}

  <h2>Por vendedor — actividad y resultados del período</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Vendedor</th>${r.campos.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>Leads creadas</th><th>Ganados</th><th>Perdidos</th><th>Ingresos</th></tr></thead>
    <tbody>
      ${r.porVendedor.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td>${r.campos.map((c) => `<td>${v['c' + c.id] || 0}</td>`).join('')}<td>${v.creados}</td><td>${v.ganados}</td><td>${v.perdidos}</td><td>${money(v.mrr)}</td></tr>`).join('')}
      <tr><td><strong>TOTAL</strong></td>${r.campos.map((c) => `<td><strong>${r.tot['c' + c.id] || 0}</strong></td>`).join('')}<td><strong>${r.tot.creados}</strong></td><td><strong>${r.tot.ganados}</strong></td><td><strong>${r.tot.perdidos}</strong></td><td><strong>${money(r.tot.mrr)}</strong></td></tr>
    </tbody>
  </table></div>

  <h2>Deals cerrados en el período</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Empresa</th><th>Resultado</th>${esCfd ? '<th>Tipo</th>' : ''}<th>Valor</th><th>Fecha</th><th>Motivo</th><th>Vendedor</th></tr></thead>
    <tbody>${r.cerrados.length ? r.cerrados.map((d) => `<tr><td><strong>${esc(d.empresa)}</strong></td><td><span class="chip" style="background:${ETAPA_COLOR[d.etapa]}">${d.etapa}</span></td>${esCfd ? `<td class="small">${d.tipo_venta === 'Suscripción mensual' ? 'Suscripción' : 'Proyecto'}</td>` : ''}<td>${money(d.mrr)}${esCfd && d.tipo_venta === 'Suscripción mensual' ? '<span class="muted small">/mes</span>' : ''}</td><td>${fecha(d.fecha_cierre)}</td><td>${esc(d.motivo_perdida || '—')}</td><td>${esc(d.vendedor)}</td></tr>`).join('') : `<tr><td colspan="${esCfd ? 7 : 6}" class="muted">Sin cierres en este período.</td></tr>`}</tbody>
  </table></div>

  ${alertas('Deals estancados: sin cambios hace +14 días (hoy)', estancados, 'Ninguno.')}`
  });
}

// Tabla de campañas ganadoras (compartida por los dashboards).
function tablaCampanas(campanas) {
  return `
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
      </tr>`).join('') : '<tr><td colspan="6" class="muted">Sin leads con campaña todavía. Creá campañas en la Config del panel y elegilas al cargar la lead.</td></tr>'}</tbody>
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
  const R = user.resumen || {};
  const esAdminHub = user.role === 'admin';
  const chipsPanel = (slug) => {
    const i = R[slug]; if (!i) return '';
    const chips = [`<span class="hc-chip">${i.abiertas} lead${i.abiertas === 1 ? '' : 's'} abierta${i.abiertas === 1 ? '' : 's'}${esAdminHub ? ' del equipo' : ''}</span>`];
    if (esAdminHub && i.liberadas > 0) chips.push(`<span class="hc-chip mal">${i.liberadas} liberada${i.liberadas === 1 ? '' : 's'} esperando que alguien la${i.liberadas === 1 ? '' : 's'} tome</span>`);
    if (i.diasFaltan > 0) chips.push(`<span class="hc-chip mal">${i.diasFaltan} día${i.diasFaltan === 1 ? '' : 's'} sin cargar actividad</span>`);
    if (i.vencidas > 0) chips.push(`<span class="hc-chip mal">${i.vencidas} lead${i.vencidas === 1 ? '' : 's'} tuya${i.vencidas === 1 ? '' : 's'} liberada${i.vencidas === 1 ? '' : 's'} — te la${i.vencidas === 1 ? '' : 's'} pueden tomar</span>`);
    return `<span class="hc-info">${chips.join('')}</span>`;
  };
  const deudaPanel = (slug) => { const i = R[slug]; return i && (i.actividad || i.pipeline) ? ' deuda' : ''; };
  const chipsCobranza = () => {
    const i = R.cobranza; if (!i) return '';
    const chips = [];
    if (esAdminHub) {
      chips.push(`<span class="hc-chip">${money(i.pendiente)} por pagar${i.personas > 0 ? ` a ${i.personas} vendedor${i.personas === 1 ? '' : 'es'}` : ''}</span>`);
      if (i.exigible > 0) chips.push(`<span class="hc-chip mal">${money(i.exigible)} ya exigible</span>`);
    } else {
      chips.push(`<span class="hc-chip">${money(i.pendiente)} pendiente de cobro</span>`);
      if (i.exigible > 0) chips.push(`<span class="hc-chip bien">${money(i.exigible)} ya exigible</span>`);
      else if (i.proxima) chips.push(`<span class="hc-chip">próximo cobro: ${fecha(i.proxima)}</span>`);
    }
    return `<span class="hc-info">${chips.join('')}</span>`;
  };
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
        <span class="hc-ic${deudaPanel('cfd')}">${ICONS.pipeline}</span>
        <h3>Comercial Cloud For Deploy</h3>
        <p>Ventas de software: pipeline, actividad diaria, metas, ranking${user.role === 'admin' ? ', dashboard y reportes' : ''}.</p>
        ${chipsPanel('cfd')}
      </a>` : ''}
      ${tieneSistema(user, 'gondolas') ? `
      <a class="hub-card" href="/gondolas/pipeline">
        <span class="hc-ic${deudaPanel('gondolas')}">${IC('<path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/>')}</span>
        <h3>Comercial Góndolas</h3>
        <p>Ventas de góndolas: pipeline con etapas propias y carga diaria a medida.</p>
        ${chipsPanel('gondolas')}
      </a>` : ''}
      ${tieneSistema(user, 'estanterias') ? `
      <a class="hub-card" href="/estanterias/pipeline">
        <span class="hc-ic${deudaPanel('estanterias')}">${IC('<path d="M3.5 3v14M16.5 3v14M3.5 8h13M3.5 13h13"/>')}</span>
        <h3>Comercial Estanterías Reforzadas</h3>
        <p>Ventas de la nueva empresa: pipeline, actividad y metas propias.</p>
        ${chipsPanel('estanterias')}
      </a>` : ''}
      ${tieneSistema(user, 'sitioweb') ? `
      <a class="hub-card" href="/sitioweb/pipeline">
        <span class="hc-ic${deudaPanel('sitioweb')}">${IC('<path d="M10 3a7 7 0 100 14 7 7 0 000-14z"/><path d="M3 10h14M10 3c-2 2.2-2 11.8 0 14M10 3c2 2.2 2 11.8 0 14"/>')}</span>
        <h3>Comercial SitioWeb Digital</h3>
        <p>Ventas de sitios web: pipeline, actividad y metas propias.</p>
        ${chipsPanel('sitioweb')}
      </a>` : ''}
      ${tieneSistema(user, 'cobranza') ? `
      <a class="hub-card" href="/cobranza">
        <span class="hc-ic">${ICONS.cobranza}</span>
        <h3>Panel de Cobranza</h3>
        <p>${user.role === 'admin' ? 'Comisiones del equipo: cuánto, a quién y cuándo pagar.' : 'Tus comisiones: cuánto ganaste, qué está pendiente y cuándo cobrás.'}</p>
        ${chipsCobranza()}
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
      <a class="hub-card" href="/campus">
        <span class="hc-ic">${IC('<path d="M10 4L2.5 7.5 10 11l7.5-3.5L10 4z"/><path d="M5 9v4c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5V9"/>')}</span>
        <h3>Campus de formación</h3>
        <p>Documentación y videos de capacitación por empresa, subidos por administración.</p>
      </a>
      ${sitiosHub()}
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
    ${(paneles || []).map((P) => {
      const r = reglas[P.slug] || {};
      const esFases = r.tipo === 'fases' && Array.isArray(r.fases) && r.fases.length;
      const pct = esFases ? r.fases[0].pct : (r.pct ?? 5);
      const meses = esFases ? r.fases.reduce((a, f) => a + (f.meses || 0), 0) : '';
      return `
    <div class="card">
      <h3 style="margin-top:0">Rubro ${esc(P.nombre)}</h3>
      <p class="small muted">Las ventas del panel Comercial ${esc(P.nombre)} usan esta regla. Con <strong>meses vacío</strong> es una comisión única del % sobre el valor de la venta, cobrable al momento. Con <strong>meses cargados</strong>, el vendedor cobra ese % del <strong>valor mensual</strong> durante esa cantidad de meses (una cuota por mes desde el cierre) — ej: SitioWeb 80% × 2 meses.</p>
      <div class="grid2">
        <div><label>Comisión (%)</label><input name="flat_${P.slug}" type="number" min="0" step="any" value="${pct}"></div>
        <div><label>Meses (vacío = pago único al cierre)</label><input name="meses_${P.slug}" type="number" min="0" value="${meses}"></div>
      </div>
    </div>`; }).join('')}
    <button class="btn">Guardar reglas</button>
  </form>`
  });
}

// Vista imprimible del reporte: el navegador la exporta a PDF (se abre el diálogo de impresión solo).
function reporteImprimirPage({ user, p, nombrePeriodo, desde, hasta, r, info = { slug: 'cfd', nombre: 'Cloud For Deploy' }, campanas = [] }) {
  const esCfd = info.slug === 'cfd';
  const filaV = (v, strong = false) => {
    const t = strong ? 'strong' : 'span';
    return `<tr><td><${t}>${esc(v.name)}</${t}></td>${r.campos.map((c) => `<td>${v['c' + c.id] || 0}</td>`).join('')}<td>${v.creados}</td><td>${v.ganados}</td><td>${v.perdidos}</td><td>${money(v.mrr)}</td></tr>`;
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
    <div class="sub">Período: ${fecha(desde)}${desde !== hasta ? ' a ' + fecha(hasta) : ''} · Comercial ${esc(info.nombre)}</div>
  </div>
  <img src="/logo.png" alt="Cloud For Deploy">
</div>

<div class="tiles">
  <div class="tile"><div class="v">${money(r.tot.mrr)}</div><div class="l">Ingresos ganados</div></div>
  ${esCfd ? `
  <div class="tile"><div class="v">${money(r.ingresosProyectos)}</div><div class="l">Por proyectos</div></div>
  <div class="tile"><div class="v">${money(r.mrrNuevo)}</div><div class="l">MRR nuevo</div></div>` : ''}
  <div class="tile"><div class="v">${r.tot.ganados} / ${r.tot.perdidos}</div><div class="l">Ganados / perdidos</div></div>
  <div class="tile"><div class="v">${r.winRate == null ? '—' : r.winRate + '%'}</div><div class="l">Win rate</div></div>
  <div class="tile"><div class="v">${r.tot.creados}</div><div class="l">Leads nuevas</div></div>
  <div class="tile"><div class="v">${r.tot.toques}</div><div class="l">Actividad</div></div>
</div>

<h2>Por vendedor</h2>
<table>
  <thead><tr><th>Vendedor</th>${r.campos.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th>Deals creados</th><th>Ganados</th><th>Perdidos</th><th>Ingresos</th></tr></thead>
  <tbody>
    ${r.porVendedor.map((v) => filaV(v)).join('')}
    ${filaV({ ...r.tot, name: 'TOTAL' }, true)}
  </tbody>
</table>

<h2>Deals cerrados en el período</h2>
<table>
  <thead><tr><th>Empresa</th><th>Resultado</th>${esCfd ? '<th>Tipo</th>' : ''}<th>Valor</th><th>Fecha</th><th>Motivo</th><th>Vendedor</th></tr></thead>
  <tbody>${r.cerrados.length ? r.cerrados.map((d) => `<tr><td>${esc(d.empresa)}</td><td>${d.etapa}</td>${esCfd ? `<td>${d.tipo_venta === 'Suscripción mensual' ? 'Suscripción' : esc(d.tipo_venta)}</td>` : ''}<td>${money(d.mrr)}</td><td>${fecha(d.fecha_cierre)}</td><td>${esc(d.motivo_perdida || '—')}</td><td>${esc(d.vendedor)}</td></tr>`).join('') : `<tr><td colspan="${esCfd ? 7 : 6}">Sin cierres en este período.</td></tr>`}</tbody>
</table>

<h2>Campañas del período</h2>
<table>
  <thead><tr><th>Campaña</th><th>Leads</th><th>Ganadas</th><th>Perdidas</th><th>Ingresos</th></tr></thead>
  <tbody>${campanas.length ? campanas.map((c) => `<tr><td>${esc(c.nombre)}</td><td>${c.leads}</td><td>${c.ganadas}</td><td>${c.perdidas}</td><td>${money(c.ingresos)}</td></tr>`).join('') : '<tr><td colspan="5">Sin movimientos de campañas en el período.</td></tr>'}</tbody>
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

function panelActividadPage({ user, campos, today, history, info, fecha: fechaSel, ventana = [], cargadas = [], esAdmin, esGeneral, target, vendedores = [], heat = {}, diasAtras = 3, alta = null, abrir = false }) {
  const vals = today ? (() => { try { return JSON.parse(today.valores || '{}'); } catch { return {}; } })() : {};
  const otro = esAdmin && target && target.id !== user.id;
  const qsVend = esGeneral ? '&vendedor=todos' : (otro ? '&vendedor=' + target.id : '');
  const ddmm = (f) => `${+f.slice(8, 10)}/${+f.slice(5, 7)}`;
  const etiqueta = (f, i) => (i === 0 ? `Hoy (${ddmm(f)})` : i === 1 ? `Ayer (${ddmm(f)})` : ddmm(f));
  const faltantes = ventana.filter((f, i) => i > 0 && !cargadas.includes(f));
  const yaCargado = today != null;
  return layout({
    title: `Actividad · ${info.nombre}`, user, active: 'actividad', sistema: info.slug,
    body: `
  <h1>${esGeneral ? 'Actividad de todo el equipo' : (otro ? 'Actividad de ' + esc(target.name) : 'Mi actividad')}</h1>
  <p class="muted small">${esGeneral ? 'La grilla suma lo cargado por todos los vendedores. Elegí una persona en el selector para ver su detalle o cargarle un día.' : `Cargala al final de cada día — toma 2 minutos.${diasAtras > 0 ? ` Podés corregir hasta ${diasAtras} día${diasAtras === 1 ? '' : 's'} para atrás.` : ''}`}</p>
  <div class="toolbar">
    ${esAdmin ? `
    <form method="get" action="${info.base}/actividad" class="cfg-inline cfg-actividad">
      <select name="vendedor" style="width:auto" onchange="this.form.submit()">
        <option value="todos" ${esGeneral ? 'selected' : ''}>— Todo el equipo —</option>
        ${vendedores.map((vu) => `<option value="${vu.id}" ${!esGeneral && target && vu.id === target.id ? 'selected' : ''}>${esc(vu.name)}</option>`).join('')}
      </select>
      <input type="date" name="fecha" value="${fechaSel}" style="width:auto">
      <button class="btn secondary small">Ver</button>
    </form>` : ''}
    <div class="sp"></div>
    ${esGeneral ? '' : `<button type="button" class="btn" onclick="document.getElementById('modalActividad').classList.add('abierto')">Cargar actividad</button>`}
  </div>

  ${!esGeneral && faltantes.length ? `
  <div class="card" style="border-left:4px solid var(--bad)">
    <div style="display:flex; gap:.5rem .6rem; align-items:center; flex-wrap:wrap">
      <strong class="small">${otro ? 'Le faltan' : 'Te faltan'} cargar ${faltantes.length} día${faltantes.length === 1 ? '' : 's'}:</strong>
      ${faltantes.map((f) => `<a class="btn secondary small chip-deuda" href="${info.base}/actividad?fecha=${f}&abrir=1${qsVend}">${etiqueta(f, ventana.indexOf(f))} <span class="warn">•</span></a>`).join('')}
      <span class="small muted">— tocá un día para cargarlo</span>
    </div>
  </div>` : ''}

  <div class="card">
    <h3 style="margin-top:0">Constancia de carga · últimos 6 meses</h3>
    <p class="small muted" style="margin:.1rem 0 .6rem">Cada cuadrado es un día${esGeneral ? ' del equipo completo' : ''}: gris sin carga, más verde cuanto más se cargó. La constancia diaria es la métrica madre — un tablero al día vale más que uno perfecto a fin de mes.</p>
    ${heatmapHtml(heat, esGeneral ? {} : { ventana, desde: alta })}
  </div>

  ${esGeneral ? '' : `
  <div class="modal-back modal-carga ${abrir ? 'abierto' : ''}" id="modalActividad">
    <div class="modal">
      <div class="modal-h"><h2>${otro ? 'Cargar actividad de ' + esc(target.name) : 'Cargar mi actividad'}</h2><button type="button" class="modal-x" onclick="document.getElementById('modalActividad').classList.remove('abierto')" aria-label="Cerrar">&times;</button></div>
      <label style="margin-top:.2rem">Día a cargar</label>
      <select onchange="location='${info.base}/actividad?fecha=' + this.value + '&abrir=1${qsVend}'" style="margin-bottom:.6rem">
        ${ventana.map((f, i) => `<option value="${f}" ${f === fechaSel ? 'selected' : ''}>${etiqueta(f, i)}${i > 0 ? (cargadas.includes(f) ? ' — ya cargado' : ' — sin cargar') : ''}</option>`).join('')}
      </select>
      ${yaCargado ? `
      <div class="aprob-box" style="margin-bottom:.7rem">
        <p style="margin:0"><strong>Atención:</strong> el día ${(() => { const pp = fechaSel.split('-'); return pp[2] + '/' + pp[1]; })()} <strong>ya tiene actividad cargada</strong>. Los valores de abajo son los guardados — si guardás de nuevo, se sobreescriben.</p>
      </div>` : ''}
      <form method="post" action="${info.base}/actividad" class="card">
        <input type="hidden" name="fecha" value="${fechaSel}">
        ${otro ? `<input type="hidden" name="user_id" value="${target.id}">` : ''}
        <div class="grid2">
          ${campos.filter((c) => !c.formula).map((c) => `<div><label>${esc(c.label)}</label><input name="c${c.id}" type="number" min="0" inputmode="numeric" value="${vals['c' + c.id] ?? ''}" placeholder="0"></div>`).join('')}
        </div>
        <label>Notas del día</label>
        <input name="notas" value="${esc(today?.notas)}" placeholder="Opcional">
        <div style="margin-top:1.2rem"><button class="btn" style="width:100%">${yaCargado ? 'Actualizar el día' : 'Guardar el día'}</button></div>
      </form>
    </div>
  </div>

  <h2>${otro ? 'Sus últimos 14 días' : 'Mis últimos 14 días'}</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Fecha</th>${campos.map((c) => `<th${c.formula ? ` class="th-calc" title="Calculado: ${esc(fmtFormula(c, campos))}"` : ''}>${esc(c.label)}${c.formula ? ' <span class="calc-mark">Σ</span>' : ''}</th>`).join('')}<th>Notas</th></tr></thead>
    <tbody>${history.length ? history.map((r) => {
      let vv = {}; try { vv = F.resolverCalculados(campos, JSON.parse(r.valores || '{}')); } catch {}
      return `<tr><td>${fecha(r.fecha)}</td>${campos.map((c) => `<td${c.formula ? ' class="td-calc"' : ''}>${vv['c' + c.id] ?? 0}</td>`).join('')}<td class="muted">${esc(r.notas || '')}</td></tr>`;
    }).join('') : `<tr><td colspan="${campos.length + 2}" class="muted">Todavía no cargó ningún día.</td></tr>`}</tbody>
  </table></div>`}`
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
  <div class="toolbar"><div class="sp"></div><button type="button" class="btn" onclick="document.getElementById('modalObjGen').classList.add('abierto')">Definir objetivos generales del equipo</button></div>
  <div class="modal-back modal-carga" id="modalObjGen">
    <div class="modal">
      <div class="modal-h"><h2>Objetivos generales del equipo</h2><button type="button" class="modal-x" onclick="document.getElementById('modalObjGen').classList.remove('abierto')" aria-label="Cerrar">&times;</button></div>
      <p class="small muted" style="margin:0 0 .4rem">Aplica los mismos objetivos a todos los vendedores activos de una sola vez (pisa los individuales). Después podés ajustar cada uno en su tarjeta.</p>
      <form method="post" action="${info.base}/objetivos-generales" class="card">
        <div class="goal-cols">
          <div><strong class="small">Diario</strong><div class="goal-inputs">${inputs('d', null)}</div></div>
          <div><strong class="small">Semanal</strong><div class="goal-inputs">${inputs('s', null)}</div></div>
          <div><strong class="small">Mensual</strong><div class="goal-inputs">${inputs('m', null)}</div></div>
        </div>
        <div style="margin-top:1rem"><button class="btn" style="width:100%" onclick="return confirm('¿Aplicar a TODOS los vendedores activos?')">Aplicar a todo el equipo</button></div>
      </form>
    </div>
  </div>` : ''}
  ${data.map(({ u, goals, stats }) => `
  <div class="card">
    <div class="deal-top">
      <h3 style="margin:0">${esc(u.name)}</h3>
      <a class="btn secondary small" href="${info.base}/metas/${u.id}">Ver gráficas</a>
    </div>
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

function panelConfigPage({ user, etapas, campos, err, errEtapa, errN = 0, info, campanas = [], robo = null, diasAtras = 3, fx = {} }) {
  const ERRS = { 'ultima-etapa': 'Tiene que quedar al menos una etapa activa.' };
  // Etapa con leads adentro: cartel con la cantidad y acceso directo a esas leads (regla: primero verlas y moverlas, después borrar).
  const cartelEtapa = err === 'etapa-en-uso' ? `
  <div class="flash bad" style="display:flex;gap:.6rem .9rem;align-items:center;flex-wrap:wrap">
    <span style="flex:1;min-width:14rem">No se borró la etapa <strong>${esc(errEtapa || '')}</strong>: tiene <strong>${errN} lead${errN === 1 ? '' : 's'}</strong> adentro. Primero miralas y movelas a otra etapa (arrastrándolas en el tablero o desde su ficha); cuando la columna quede vacía, volvé a borrarla.</span>
    <a class="btn small" href="${info.base}/pipeline?scope=todos&etapa=${encodeURIComponent(errEtapa || '')}">Ver esas leads</a>
  </div>` : '';
  return layout({
    title: `Config · ${info.nombre}`, user, active: 'config', sistema: info.slug, err: ERRS[err],
    body: `
  ${cartelEtapa}
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
    <p class="small muted">Cada campo aparece en la actividad diaria del vendedor y como métrica disponible en los objetivos. Un campo <strong>con fórmula</strong> no se carga a mano: se calcula a partir de otros campos y aparece marcado con <span class="calc-mark">Σ</span> en la actividad, el dashboard, el ranking y los objetivos.</p>
    ${err === 'campo-en-formula' ? `<div class="flash bad">No se puede borrar «${esc(fx.nombre)}»: lo usa la fórmula de «${esc(fx.por)}». Corregí esa fórmula primero.</div>` : ''}
    ${campos.map((c) => `
    <div class="cfg-row">
      <form method="post" action="${info.base}/config/campos/${c.id}" class="cfg-inline">
        <input type="hidden" name="accion" value="renombrar">
        <input name="label" value="${esc(c.label)}">
        <button class="btn secondary small">Renombrar</button>
      </form>
      <form method="post" action="${info.base}/config/campos/${c.id}" style="display:inline" onsubmit="return confirm('¿Borrar el campo ${esc(c.label)}? ${c.formula ? 'Deja de calcularse.' : 'Los datos históricos dejan de mostrarse.'}')"><input type="hidden" name="accion" value="borrar"><button class="btn danger small">Borrar</button></form>
    </div>
    ${c.formula ? `
    <form method="post" action="${info.base}/config/campos/${c.id}" class="fx-edit">
      <input type="hidden" name="accion" value="formula">
      <span class="calc-mark" title="Campo calculado" style="margin-top:.55rem">Σ</span>
      <div class="fx-wrap"><input name="formula" class="fx-input" value="${esc(err === 'formula' && fx.campoId === c.id ? fx.formula : fmtFormula(c, campos))}" autocomplete="off" spellcheck="false"><div class="fx-msg"></div></div>
      <button class="btn secondary small" style="margin-top:.2rem">Guardar fórmula</button>
    </form>
    ${err === 'formula' && fx.campoId === c.id ? `<div class="flash bad" style="margin:0 0 .6rem">Fórmula inválida: ${esc(fx.msg)}</div>` : ''}` : ''}`).join('')}

    <form method="post" action="${info.base}/config/campos" style="margin-top:.8rem" id="formNuevoCampo">
      <div class="cfg-inline">
        <input name="label" placeholder="Nuevo campo (ej: Presupuestos entregados)" required value="${esc(err === 'formula' && !fx.campoId ? fx.label : '')}">
        <label class="perm" style="text-transform:none;letter-spacing:0;white-space:nowrap"><input type="checkbox" name="con_formula" value="1" id="chkFormula" ${err === 'formula' && !fx.campoId ? 'checked' : ''}> Agregar fórmula</label>
        <button class="btn small">Agregar campo</button>
      </div>
      <div class="fx-box" id="fxBox" ${err === 'formula' && !fx.campoId ? '' : 'hidden'}>
        ${err === 'formula' && !fx.campoId ? `<div class="flash bad" style="margin:0 0 .6rem">Fórmula inválida: ${esc(fx.msg)}</div>` : ''}
        <label>Fórmula</label>
        <div class="fx-wrap"><input name="formula" class="fx-input" placeholder="Ej: {Seguimientos} + {Presupuestos enviados}" value="${esc(err === 'formula' && !fx.campoId ? fx.formula : '')}" autocomplete="off" spellcheck="false"><div class="fx-msg"></div></div>
        <p class="caption" style="margin:.35rem 0 0">Escribí <code>{</code> para elegir un campo (autocompleta mientras escribís) o tocá uno de abajo. Operaciones: <code>+ - * /</code>, paréntesis y números (ej: <code>({A} + {B}) / {C} * 100</code>).</p>
        <div class="fx-vars">${campos.map((c) => `<button type="button" class="fx-var" data-var="${esc(c.label)}">${c.formula ? 'Σ ' : ''}${esc(c.label)}</button>`).join('')}</div>
      </div>
    </form>
  </div>
  <script>
  (function () {
    var VARS = ${JSON.stringify(campos.map((c) => c.label)).replace(/</g, '\\u003c')};
    var NORM = function (s) { return String(s || '').split(' ').filter(Boolean).join(' ').trim().toLowerCase(); };
    var VN = VARS.map(NORM);
    // Misma gramática que formulas.js (server): números, {variables}, + - * / y paréntesis.
    function tokenizar(s) {
      var out = [], i = 0;
      while (i < s.length) {
        var ch = s[i];
        if (ch.trim() === '') { i++; continue; }
        if (ch === '{') { var j = s.indexOf('}', i); if (j < 0) throw 'Falta cerrar una llave "}"'; var nm = s.slice(i + 1, j).trim(); if (!nm) throw 'Hay una variable vacía "{}"'; out.push({ t: 'var', v: nm }); i = j + 1; continue; }
        if (/[0-9.]/.test(ch)) { var m = s.slice(i).match(/^[0-9]*[.]?[0-9]+|^[0-9]+[.]?[0-9]*/); if (!m || isNaN(Number(m[0]))) throw 'Número inválido cerca de "' + s.slice(i, i + 6) + '"'; out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
        if ('+-*/'.indexOf(ch) >= 0) { out.push({ t: 'op', v: ch }); i++; continue; }
        if (ch === '(' || ch === ')') { out.push({ t: ch }); i++; continue; }
        throw 'Carácter no permitido: "' + ch + '"';
      }
      return out;
    }
    function parsear(tk) {
      var p = 0;
      function peek() { return tk[p]; }
      function next() { return tk[p++]; }
      function expr() { var n = term(); while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { next(); n = { t: 'bin', a: n, b: term() }; } return n; }
      function term() { var n = factor(); while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) { next(); n = { t: 'bin', a: n, b: factor() }; } return n; }
      function factor() {
        var x = next();
        if (!x) throw 'La fórmula termina de golpe: falta un valor';
        if (x.t === 'num' || x.t === 'var') return x;
        if (x.t === 'op' && x.v === '-') return { t: 'neg', a: factor() };
        if (x.t === '(') { var n = expr(); var c = next(); if (!c || c.t !== ')') throw 'Falta cerrar un paréntesis ")"'; return n; }
        if (x.t === ')') throw 'Hay un paréntesis ")" de más';
        throw 'Falta un valor antes de "' + x.v + '"';
      }
      if (!tk.length) throw 'La fórmula está vacía';
      expr();
      if (p < tk.length) { var r = tk[p]; throw r.t === ')' ? 'Hay un paréntesis ")" de más' : 'Sobra "' + (r.v != null ? r.v : r.t) + '" al final'; }
    }
    function validar(s) {
      try {
        var toks = tokenizar(s); parsear(toks);
        var vars = toks.filter(function (t) { return t.t === 'var'; }).map(function (t) { return t.v; });
        if (!vars.length) return { ok: false, msg: 'La fórmula tiene que usar al menos un campo' };
        for (var i = 0; i < vars.length; i++) if (VN.indexOf(NORM(vars[i])) < 0) return { ok: false, msg: 'No existe el campo "' + vars[i] + '"' };
        return { ok: true, msg: 'Fórmula válida' };
      } catch (e) { return { ok: false, msg: String(e && e.message ? e.message : e) }; }
    }
    var activo = null;
    function initFx(input) {
      var wrap = input.parentNode, msg = wrap.querySelector('.fx-msg');
      var sug = document.createElement('div'); sug.className = 'fx-sug'; sug.hidden = true; wrap.appendChild(sug);
      var items = [], sel = 0, ctx = null;
      function render() {
        if (!items.length) { sug.hidden = true; return; }
        sug.innerHTML = '';
        items.forEach(function (v, i) { var d = document.createElement('div'); d.className = 'fx-op' + (i === sel ? ' on' : ''); d.textContent = v; d.addEventListener('mousedown', function (e) { e.preventDefault(); elegir(i); }); sug.appendChild(d); });
        sug.hidden = false;
      }
      function buscar() {
        var pos = input.selectionStart, s = input.value;
        var a = s.lastIndexOf('{', pos - 1), b = s.lastIndexOf('}', pos - 1);
        if (a < 0 || b > a) { items = []; ctx = null; render(); return; }
        var q = NORM(s.slice(a + 1, pos)); ctx = { start: a, end: pos };
        items = VARS.filter(function (v) { return NORM(v).indexOf(q) >= 0; }).slice(0, 8); sel = 0; render();
      }
      function elegir(i) {
        if (!ctx || !items[i]) return;
        var v = items[i], s = input.value, resto = s.slice(ctx.end);
        if (resto.charAt(0) === '}') resto = resto.slice(1);
        input.value = s.slice(0, ctx.start) + '{' + v + '}' + resto;
        var pp = ctx.start + v.length + 2; items = []; ctx = null; render(); revisar(); input.focus(); input.setSelectionRange(pp, pp);
      }
      function revisar() {
        var v = input.value.trim();
        if (!v) { msg.textContent = ''; msg.className = 'fx-msg'; return; }
        var r = validar(v); msg.textContent = (r.ok ? '✓ ' : '✗ ') + r.msg; msg.className = 'fx-msg ' + (r.ok ? 'ok' : 'bad');
      }
      input.addEventListener('input', function () { buscar(); revisar(); });
      input.addEventListener('click', buscar);
      input.addEventListener('focus', function () { activo = input; revisar(); });
      input.addEventListener('blur', function () { setTimeout(function () { items = []; render(); }, 150); });
      input.addEventListener('keydown', function (e) {
        if (sug.hidden) return;
        if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; render(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; render(); e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === 'Tab') { elegir(sel); e.preventDefault(); }
        else if (e.key === 'Escape') { items = []; render(); }
      });
      input.form.addEventListener('submit', function (e) {
        var chk = input.form.querySelector('#chkFormula');
        if (chk && !chk.checked) return;
        var r = validar(input.value.trim());
        if (!r.ok) { e.preventDefault(); revisar(); input.focus(); }
      });
      revisar();
    }
    Array.prototype.forEach.call(document.querySelectorAll('.fx-input'), initFx);
    var chk = document.getElementById('chkFormula'), box = document.getElementById('fxBox');
    if (chk && box) chk.addEventListener('change', function () { box.hidden = !chk.checked; if (chk.checked) box.querySelector('.fx-input').focus(); });
    Array.prototype.forEach.call(document.querySelectorAll('.fx-var'), function (b) {
      b.addEventListener('click', function () {
        var inp = activo || (box && box.querySelector('.fx-input')); if (!inp) return;
        var s = inp.value, p = inp.selectionStart != null ? inp.selectionStart : s.length, ins = '{' + b.getAttribute('data-var') + '}';
        var prev = s.slice(0, p).trim().slice(-1);
        var sep = prev && '(+-*/'.indexOf(prev) < 0 ? ' + ' : '';
        inp.value = s.slice(0, p) + sep + ins + s.slice(p); inp.focus(); inp.setSelectionRange(p + sep.length + ins.length, p + sep.length + ins.length);
        inp.dispatchEvent(new Event('input'));
      });
    });
  })();
  </script>

  <h2>Carga de actividad</h2>
  <div class="card">
    <p class="small muted">Cuántos días para atrás puede cargar o corregir su actividad un vendedor (el administrador no tiene límite). Con 0, solo puede cargar el día de hoy.</p>
    <form method="post" action="${info.base}/config/actividad" class="perm-row">
      <label class="perm" style="text-transform:none;letter-spacing:0">Días para atrás: <input name="dias" type="number" min="0" max="30" step="1" value="${diasAtras != null ? diasAtras : 3}" style="width:5rem;display:inline-block;margin-left:.3rem"></label>
      <button class="btn small">Guardar</button>
    </form>
  </div>

  <h2>Toma de leads inactivas</h2>
  <div class="card">
    <p class="small muted">Si está activa, toda lead que pase la cantidad de horas configurada <strong>sin actividad</strong> (sin cambio de etapa, sin notas y sin ediciones) queda liberada: su tarjeta titila en rojo en el pipeline y cualquier vendedor puede tomarla (el dueño anterior recibe una notificación y el contador arranca de cero para el nuevo). Los vendedores también pueden traspasarse leads entre sí desde la ficha, esté esto activo o no.</p>
    <form method="post" action="${info.base}/config/robo" class="perm-row">
      <label class="perm"><input type="checkbox" name="activo" ${robo && robo.activo ? 'checked' : ''}> Permitir tomar leads inactivas</label>
      <label class="perm" style="text-transform:none;letter-spacing:0">Horas sin movimiento para liberar: <input name="horas" type="number" min="1" max="720" step="1" value="${robo && robo.horas ? robo.horas : 48}" style="width:5.5rem;display:inline-block;margin-left:.3rem"></label>
      <button class="btn small">Guardar</button>
    </form>
    ${robo && robo.activo ? `<p class="caption">Activo: las leads con más de <strong>${robo.horas} horas</strong> sin actividad están liberadas. Cualquier trabajo real sobre la lead (nota, edición o cambio de etapa) reinicia su contador.</p>` : '<p class="caption">Desactivado: nadie puede tomar leads ajenas (el traspaso voluntario sigue disponible).</p>'}
  </div>

  <h2>Campañas de ${esc(info.nombre)}</h2>
  ${campanasSection(campanas, info.base + '/campanas')}`
  });
}

/* --------- campus de formación --------- */

const idYouTube = (url) => ((url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/) || [])[1] || null;
const idVimeo = (url) => ((url || '').match(/vimeo\.com\/(\d+)/) || [])[1] || null;

// Lista de cursos de una empresa (portada del campus).
function campusPage({ user, empresa, empresas, cursos }) {
  const esAdmin = user.role === 'admin';
  const nombreEmpresa = (empresas.find(([sl]) => sl === empresa) || [])[1] || '';
  return layout({
    title: 'Campus de formación', user, active: 'campus', sistema: 'campus',
    body: `
  <h1>Campus de formación</h1>
  <p class="small muted">Elegí la empresa y entrá a un curso: los contenidos se hacen en orden y cada uno se desbloquea al completar el anterior (y aprobar su quiz, si tiene).</p>
  <div class="toolbar">
    <div class="seg">
      ${empresas.map(([slug, nombre]) => `<a href="/campus/${slug}" class="${slug === empresa ? 'on' : ''}">${esc(nombre)}</a>`).join('')}
    </div>
    <div class="sp"></div>
    ${esAdmin ? `<button type="button" class="btn small" onclick="document.getElementById('nuevoCurso').classList.toggle('abierto')">+ Nuevo curso</button>` : ''}
  </div>
  ${esAdmin ? `
  <div id="nuevoCurso" class="card card--accent curso-form">
    <h3 style="margin-top:0">Crear curso en ${esc(nombreEmpresa)}</h3>
    <form method="post" action="/campus/cursos">
      <input type="hidden" name="empresa" value="${esc(empresa)}">
      <div class="grid2">
        <div><label>Nombre del curso *</label><input name="nombre" required maxlength="100" placeholder="Ej: Cloud for deploy basico"></div>
        <div><label>Descripción</label><input name="descripcion" maxlength="300" placeholder="Qué aprende el vendedor en este curso"></div>
      </div>
      <div style="margin-top:.9rem"><button class="btn">Crear curso</button></div>
    </form>
  </div>` : ''}
  ${cursos.length ? `<div class="campus-grid">${cursos.map((c) => {
    const pct = c.total > 0 ? Math.round((c.completados / c.total) * 100) : 0;
    return `
    <div class="curso-card card">
      <a class="curso-doc doc-curso" href="/campus/curso/${c.id}">${IC('<path d="M10 4L2.5 7.5 10 11l7.5-3.5L10 4z"/><path d="M5 9v4c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5V9"/>')}<span class="curso-ext">CURSO</span></a>
      <div class="curso-body">
        <h3 style="margin:.1rem 0 .2rem">${esc(c.nombre)}</h3>
        ${c.descripcion ? `<p class="small muted" style="margin:0 0 .5rem">${esc(c.descripcion)}</p>` : ''}
        ${!esAdmin && c.total > 0 ? `
        <div style="display:flex;align-items:center;gap:.5rem;margin:.2rem 0 .4rem"><span class="prog" style="flex:1"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i></span><span class="small muted" style="white-space:nowrap">${c.completados}/${c.total}</span></div>` : ''}
        <div class="curso-meta small muted">${c.total} contenido${c.total === 1 ? '' : 's'}</div>
        <div class="curso-acciones">
          <a class="btn small" href="/campus/curso/${c.id}">${!esAdmin && c.completados >= c.total && c.total > 0 ? 'Repasar curso' : 'Entrar al curso'}</a>
          ${esAdmin && c.total === 0 ? `<form method="post" action="/campus/cursos/${c.id}" onsubmit="return confirm('¿Eliminar el curso vacío «${esc(c.nombre)}»?')" style="display:inline"><input type="hidden" name="accion" value="borrar"><button class="btn danger small">Eliminar</button></form>` : ''}
        </div>
      </div>
    </div>`;
  }).join('')}</div>`
    : `<div class="card"><p class="muted" style="margin:0">Todavía no hay cursos de ${esc(nombreEmpresa)}. ${esAdmin ? 'Creá el primero con "+ Nuevo curso".' : 'Administración va a ir armando los cursos acá.'}</p></div>`}`
  });
}

// Contenido de un curso: la secuencia de videos/documentos con bloqueo y quizzes.
function campusCursoPage({ user, curso, empresas, items }) {
  const esAdmin = user.role === 'admin';
  const esVideoArchivo = (a) => /\.(mp4|webm|mov)$/i.test(a || '');
  const ICONO_DOC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h8L19.5 8v12A1.5 1.5 0 0 1 18 21.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5z"/><path d="M14 2.5V8h5.5"/><path d="M8 13h8M8 16.5h5.5"/></svg>`;
  const ICONO_LINK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7.1 0l2.9-2.9a5 5 0 0 0-7.1-7.1l-1.6 1.6"/><path d="M14 10a5 5 0 0 0-7.1 0l-2.9 2.9a5 5 0 0 0 7.1 7.1l1.6-1.6"/></svg>`;
  const CANDADO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`;
  const EXT_INFO = { pdf: ['PDF', 'ext-pdf'], doc: ['WORD', 'ext-doc'], docx: ['WORD', 'ext-doc'], xls: ['EXCEL', 'ext-xls'], xlsx: ['EXCEL', 'ext-xls'], ppt: ['PPT', 'ext-ppt'], pptx: ['PPT', 'ext-ppt'] };
  const card = (it, idx, total) => {
    if (it.bloqueado) {
      return `
    <div class="curso-card card curso-bloqueada">
      <div class="curso-doc curso-lock">${CANDADO}<span class="curso-ext">BLOQUEADO</span></div>
      <div class="curso-body">
        <div class="curso-head"><span class="chip curso-tag" style="background:#5B6773">${idx + 1} de ${total}</span></div>
        <h3 style="margin:.3rem 0 .2rem">${esc(it.titulo)}</h3>
        <p class="small muted" style="margin:0 0 .3rem">Se desbloquea al completar <strong>«${esc(it.requiere || 'el contenido anterior')}»</strong>${it.requiereQuiz ? ' y aprobar su quiz con 70%' : ''}.</p>
        <div class="curso-meta small muted">${esc(it.autor)} · ${fechaHora(it.created_at)}</div>
      </div>
    </div>`;
    }
    let media = '';
    let tipo = 'Documento';
    const yt = idYouTube(it.url), vm = idVimeo(it.url);
    const ext = ((it.archivo || '').split('.').pop() || '').toLowerCase();
    const esImagen = ['png', 'jpg', 'jpeg'].includes(ext);
    if (yt || vm) {
      tipo = 'Video';
      const src = yt ? `https://www.youtube.com/embed/${yt}` : `https://player.vimeo.com/video/${vm}`;
      media = `<button type="button" class="curso-fac" data-id="${it.id}" data-src="${src}"${yt ? ` style="background-image:url('https://i.ytimg.com/vi/${yt}/hqdefault.jpg')"` : ''} aria-label="Reproducir video"><span class="curso-play"></span></button>`;
    } else if (it.url) {
      tipo = 'Enlace';
      media = `<a class="curso-doc doc-link" href="${esc(it.url)}" target="_blank" rel="noopener" data-track="${it.id}">${ICONO_LINK}<span class="curso-ext">ENLACE EXTERNO</span></a>`;
    } else if (esVideoArchivo(it.archivo)) {
      tipo = 'Video';
      media = `<video class="curso-media" controls preload="metadata" data-id="${it.id}" src="/campus/archivo/${it.id}"></video>`;
    } else if (esImagen) {
      media = `<a class="curso-imglink" href="/campus/archivo/${it.id}" target="_blank" rel="noopener"><img class="curso-img" src="/campus/archivo/${it.id}?thumb=1" alt="" loading="lazy"></a>`;
    } else if (it.archivo) {
      const [extLabel, extClase] = EXT_INFO[ext] || [ext.toUpperCase() || 'ARCHIVO', 'ext-otro'];
      media = `<a class="curso-doc ${extClase}" href="/campus/archivo/${it.id}" target="_blank" rel="noopener">${ICONO_DOC}<span class="curso-ext">${extLabel}</span></a>`;
    }
    const quizEstado = !esAdmin && it.n_quiz > 0
      ? (it.quizAprobado
        ? `<span class="chip" style="background:#2F7D4F">Quiz aprobado${it.mejorPuntaje != null ? ' ' + it.mejorPuntaje + '%' : ''}</span>`
        : it.mediaOk
          ? `<a class="btn small" href="/campus/item/${it.id}/quiz">Rendir quiz${it.mejorPuntaje != null ? ` (mejor: ${it.mejorPuntaje}%)` : ''}</a>`
          : `<span class="chip" style="background:#A8791F" title="Primero mirá el contenido; después rendís el quiz">Quiz pendiente</span>`)
      : '';
    return `
    <div class="curso-card card">
      ${media}
      <div class="curso-body">
        <div class="curso-head">
          <span style="display:inline-flex;gap:.35rem;align-items:center;flex-wrap:wrap">
            <span class="curso-num">${idx + 1}</span>
            <span class="chip curso-tag tag-${tipo.toLowerCase()}">${tipo}</span>
            ${!esAdmin && it.completado ? '<span class="chip" style="background:#2F7D4F">Completado</span>' : ''}
          </span>
          <span style="display:inline-flex;gap:.3rem;align-items:center">
            ${esAdmin ? `
            <form method="post" action="/campus/items/${it.id}/mover" style="display:inline"><input type="hidden" name="dir" value="subir"><button class="btn secondary small curso-flecha" ${idx === 0 ? 'disabled' : ''} title="Subir en el orden">↑</button></form>
            <form method="post" action="/campus/items/${it.id}/mover" style="display:inline"><input type="hidden" name="dir" value="bajar"><button class="btn secondary small curso-flecha" ${idx === total - 1 ? 'disabled' : ''} title="Bajar en el orden">↓</button></form>
            <a class="small muted" href="/campus/estadisticas#item-${it.id}" title="Ver estadísticas">${it.vistos || 0} vista${it.vistos === 1 ? '' : 's'}</a>` : ''}
          </span>
        </div>
        <h3 style="margin:.3rem 0 .2rem">${esc(it.titulo)}</h3>
        ${it.descripcion ? `<p class="small muted" style="margin:0 0 .5rem">${esc(it.descripcion)}</p>` : ''}
        ${it.archivo && !esVideoArchivo(it.archivo) ? `<div class="curso-file" title="${esc(it.archivo_nombre || '')}">${esc(it.archivo_nombre || '')}</div>` : ''}
        <div class="curso-meta small muted">${esc(it.autor)} · ${fechaHora(it.created_at)}</div>
        <div class="curso-acciones">
          ${it.url && !yt && !vm ? `<a class="btn secondary small" href="${esc(it.url)}" target="_blank" rel="noopener" data-track="${it.id}">Abrir enlace</a>` : ''}
          ${it.archivo && !esVideoArchivo(it.archivo) && !esImagen ? `<a class="btn secondary small" href="/campus/archivo/${it.id}" target="_blank" rel="noopener">Abrir documento</a>` : ''}
          ${esImagen ? `<a class="btn secondary small" href="/campus/archivo/${it.id}" target="_blank" rel="noopener">Ver imagen</a>` : ''}
          ${quizEstado}
          ${esAdmin ? `<a class="btn secondary small" href="/campus/item/${it.id}/quiz">Quiz${it.n_quiz ? ` (${it.n_quiz})` : ''}</a>
          <form method="post" action="/campus/items/${it.id}/borrar" onsubmit="return confirm('¿Eliminar «${esc(it.titulo)}» del curso?')" style="display:inline"><button class="btn danger small">Eliminar</button></form>` : ''}
        </div>
      </div>
    </div>`;
  };
  return layout({
    title: `${curso.nombre} · Campus`, user, active: 'campus', sistema: 'campus',
    body: `
  <div class="toolbar">
    <a class="btn secondary small" href="/campus/${esc(curso.empresa)}">← Cursos</a>
    <div class="sp"></div>
    ${esAdmin ? `<button type="button" class="btn small" onclick="document.getElementById('subirCampus').classList.toggle('abierto')">+ Subir contenido</button>` : ''}
  </div>
  <h1>${esc(curso.nombre)}</h1>
  ${curso.descripcion ? `<p class="small muted">${esc(curso.descripcion)}</p>` : ''}
  ${esAdmin ? `
  <div id="subirCampus" class="card card--accent curso-form">
    <h3 style="margin-top:0">Subir contenido a «${esc(curso.nombre)}»</h3>
    <form method="post" action="/campus/items" enctype="multipart/form-data">
      <input type="hidden" name="curso_id" value="${curso.id}">
      <div class="grid2">
        <div><label>Título *</label><input name="titulo" required maxlength="120" placeholder="Ej: Cómo cotizar paso a paso"></div>
        <div><label>Descripción</label><input name="descripcion" maxlength="300" placeholder="Opcional: de qué trata y para quién es"></div>
        <div><label>Link de video (YouTube o Vimeo)</label><input name="url" type="url" placeholder="https://www.youtube.com/watch?v=…"></div>
        <div><label>O subí un archivo (video, PDF, imagen, Office)</label><input type="file" name="archivo" accept=".mp4,.webm,.mov,.pdf,.png,.jpg,.jpeg,.pptx,.docx,.xlsx"></div>
      </div>
      <div style="margin-top:.9rem"><button class="btn">Publicar en el curso</button></div>
    </form>
    <p class="caption">El contenido nuevo entra al final del curso; acomodalo con las flechas. Después de publicarlo podés armarle su quiz con el botón "Quiz".</p>
  </div>
  <p class="small muted" style="margin:-.2rem 0 .7rem">El orden de las tarjetas es el orden del curso: los vendedores desbloquean cada contenido al completar el anterior (videos subidos: 80% reproducido) y aprobar su quiz con 70% si tiene.</p>` : ''}
  ${items.length ? `<div class="campus-grid">${items.map((it, idx) => card(it, idx, items.length)).join('')}</div>`
    : `<div class="card"><p class="muted" style="margin:0">Este curso todavía no tiene contenido. ${esAdmin ? 'Publicá el primero con "+ Subir contenido".' : ''}</p></div>`}
  <script>
  (function () {
    function beacon(id) { fetch('/campus/vista/' + id, { method: 'POST' }).catch(function () {}); }
    document.querySelectorAll('.curso-fac').forEach(function (f) {
      f.addEventListener('click', function () {
        beacon(f.dataset.id);
        var ifr = document.createElement('iframe');
        ifr.className = 'curso-media';
        ifr.src = f.dataset.src + (f.dataset.src.indexOf('?') >= 0 ? '&' : '?') + 'autoplay=1';
        ifr.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        ifr.setAttribute('allowfullscreen', '');
        ifr.setAttribute('frameborder', '0');
        f.replaceWith(ifr);
      });
    });
    document.querySelectorAll('video.curso-media').forEach(function (v) {
      var id = v.dataset.id, ultimo = 0, visto = false, prevT = 0, acc = 0;
      function progreso() {
        if (!id) return;
        var rep = acc; acc = 0;
        fetch('/campus/progreso/' + id, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'segundos=' + Math.floor(v.currentTime || 0) + '&duracion=' + Math.floor(v.duration || 0) + '&rep=' + rep.toFixed(1),
        }).catch(function () {});
      }
      v.addEventListener('play', function () { if (!visto) { visto = true; beacon(id); } prevT = v.currentTime; });
      v.addEventListener('seeking', function () { prevT = v.currentTime; });
      v.addEventListener('timeupdate', function () {
        var d = v.currentTime - prevT;
        if (d > 0 && d < 2) acc += d;
        prevT = v.currentTime;
        if (v.currentTime - ultimo >= 10) { ultimo = v.currentTime; progreso(); }
      });
      v.addEventListener('pause', progreso);
      v.addEventListener('ended', progreso);
    });
    document.querySelectorAll('[data-track]').forEach(function (a) {
      a.addEventListener('click', function () { beacon(a.dataset.track); });
    });
  })();
  </script>`
  });
}

// Quiz de un contenido: examen para el vendedor, editor para el admin.
function campusQuizPage({ user, item, preguntas, esAdmin, mediaOk, mejor, nota }) {
  const volver = `/campus/curso/${item.cid || item.curso_id}`;
  const resultado = nota != null ? (nota >= 70
    ? `<div class="flash ok">Sacaste <strong>${nota}%</strong> — ¡quiz aprobado! El siguiente contenido del curso quedó desbloqueado.</div>`
    : `<div class="flash bad">Sacaste <strong>${nota}%</strong> — necesitás 70% para aprobar. Repasá el contenido y volvé a intentar (los intentos son ilimitados).</div>`) : '';
  const examen = preguntas.length ? `
  <form method="post" action="/campus/item/${item.id}/quiz" class="card">
    ${preguntas.map((q, i) => `
    <div class="quiz-preg">
      <p style="margin:.2rem 0 .4rem"><strong>${i + 1}. ${esc(q.pregunta)}</strong></p>
      ${q.opciones.map((op, j) => `<label class="quiz-op"><input type="radio" name="r${q.id}" value="${j}" required> ${esc(op)}</label>`).join('')}
    </div>`).join('')}
    <div style="margin-top:1rem"><button class="btn">Entregar quiz</button></div>
  </form>` : '<div class="card"><p class="muted" style="margin:0">Este contenido no tiene quiz todavía.</p></div>';
  return layout({
    title: `Quiz · ${item.titulo}`, user, active: 'campus', sistema: 'campus',
    body: `
  <div class="toolbar"><a class="btn secondary small" href="${volver}">← ${esc(item.curso_nombre || 'Curso')}</a></div>
  <h1>Quiz: ${esc(item.titulo)}</h1>
  ${resultado}
  ${esAdmin ? `
  <p class="small muted">Editor del quiz. Los vendedores necesitan <strong>70%</strong> para aprobar y desbloquear el siguiente contenido; los intentos son ilimitados y cuenta el mejor.</p>
  <div class="card">
    <h3 style="margin-top:0">Preguntas (${preguntas.length})</h3>
    ${preguntas.length ? preguntas.map((q, i) => `
    <div class="cfg-row" style="display:block">
      <div class="small" style="display:flex;gap:.6rem;align-items:baseline"><strong style="flex:1">${i + 1}. ${esc(q.pregunta)}</strong>
        <form method="post" action="/campus/quiz/preguntas/${q.id}/borrar" onsubmit="return confirm('¿Borrar esta pregunta?')" style="display:inline"><button class="btn danger small">Borrar</button></form>
      </div>
      <div class="small muted" style="margin-top:.15rem">${q.opciones.map((op, j) => `${j === q.correcta ? '<strong style="color:#2F7D4F">✓ ' + esc(op) + '</strong>' : esc(op)}`).join(' · ')}</div>
    </div>`).join('') : '<p class="muted small" style="margin:0">Sin preguntas todavía — agregá la primera abajo.</p>'}
  </div>
  <div class="card card--accent">
    <h3 style="margin-top:0">Agregar pregunta</h3>
    <form method="post" action="/campus/item/${item.id}/quiz/preguntas">
      <label>Pregunta *</label><input name="pregunta" required maxlength="300" placeholder="Ej: ¿Cuál es el primer paso al cotizar?">
      <div class="grid2">
        <div><label>Opción 1 *</label><input name="op1" required maxlength="200"></div>
        <div><label>Opción 2 *</label><input name="op2" required maxlength="200"></div>
        <div><label>Opción 3</label><input name="op3" maxlength="200"></div>
        <div><label>Opción 4</label><input name="op4" maxlength="200"></div>
        <div><label>Respuesta correcta</label><select name="correcta"><option value="0">Opción 1</option><option value="1">Opción 2</option><option value="2">Opción 3</option><option value="3">Opción 4</option></select></div>
      </div>
      <div style="margin-top:.9rem"><button class="btn">Agregar pregunta</button></div>
    </form>
  </div>
  <h2>Vista previa (lo que ve el vendedor)</h2>
  ${examen}` : `
  ${mejor ? `<p class="small muted">Tu mejor intento: <strong>${mejor.puntaje}%</strong> (${mejor.intentos} intento${mejor.intentos === 1 ? '' : 's'})${mejor.aprobado ? ' — aprobado' : ''}.</p>` : `<p class="small muted">Necesitás <strong>70%</strong> para aprobar y desbloquear el siguiente contenido. Intentos ilimitados: cuenta el mejor.</p>`}
  ${!mediaOk ? `<div class="flash bad">Primero mirá el contenido («${esc(item.titulo)}») — el quiz se habilita cuando lo completás.</div>` : examen}`}`
  });
}

// Estadísticas de aprendizaje del campus (solo admin).
function campusStatsPage({ user, empresas, porItem, usuarios, totalVendedores }) {
  const horas = (seg) => {
    if (!seg) return '—';
    const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60);
    return h ? `${h} h ${m} m` : `${m} min`;
  };
  const pctVideo = (v) => (v.duracion > 0 ? Math.min(100, Math.round((v.segundos / v.duracion) * 100)) : null);
  return layout({
    title: 'Estadísticas · Campus', user, active: 'stats', sistema: 'campus',
    body: `
  <div class="toolbar"><a class="btn secondary small" href="/campus">← Campus</a></div>
  <h1>Estadísticas de aprendizaje</h1>
  <p class="small muted">Quién mira el material, hasta dónde llegó en cada video subido, cómo le fue en los quizzes y cuántas horas acumula. Los videos de YouTube/Vimeo registran la reproducción (no el minuto exacto).</p>

  <div class="tiles">
    <div class="tile"><div class="v">${porItem.length}</div><div class="l">Contenidos publicados</div></div>
    <div class="tile"><div class="v">${porItem.reduce((a, i) => a + i.vistos.length, 0)}</div><div class="l">Vistas totales (persona × contenido)</div></div>
    <div class="tile"><div class="v">${horas(usuarios.reduce((a, u) => a + u.segundos, 0))}</div><div class="l">Horas de video del equipo</div></div>
    <div class="tile"><div class="v">${usuarios.reduce((a, u) => a + (u.completados || 0), 0)}</div><div class="l">Videos completados (al 80%)</div></div>
    <div class="tile"><div class="v">${usuarios.reduce((a, u) => a + (u.quizzesAprobados || 0), 0)}</div><div class="l">Quizzes aprobados (70%)</div></div>
    <div class="tile"><div class="v">${usuarios.filter((u) => u.contenidos > 0).length} / ${usuarios.length}</div><div class="l">Personas que vieron algo</div></div>
  </div>

  <h2>Ranking del equipo</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Persona</th><th>Contenidos vistos</th><th>Videos completados</th><th>Quizzes aprobados</th><th>Horas de video</th><th>Última actividad</th></tr></thead>
    <tbody>${usuarios.map((u, i) => `
      <tr>
        <td><div class="ucel">${avatar(u)}<div><strong>${esc(u.name)}</strong>${i === 0 && u.segundos > 0 ? ' <span class="chip" style="background:#C08A2E">Top</span>' : ''}</div></div></td>
        <td>${u.contenidos}</td>
        <td>${u.completados || 0}</td>
        <td>${u.quizzesAprobados || 0}</td>
        <td>${horas(u.segundos)}</td>
        <td class="small">${u.ultima ? fechaHora(u.ultima) : '<span class="muted">Nunca entró al material</span>'}</td>
      </tr>`).join('')}</tbody>
  </table></div>

  <h2>Por contenido</h2>
  ${porItem.length ? porItem.map((it) => `
  <div class="card" id="item-${it.id}">
    <div class="deal-top">
      <div>
        <span class="chip curso-tag tag-${it.esVideo ? 'video' : 'documento'}">${it.esVideo ? 'Video' : 'Documento'}</span>
        <strong style="margin-left:.4rem">${esc(it.titulo)}</strong>
        <span class="muted small"> · ${esc(it.curso_nombre || 'Sin curso')}</span>
        ${it.n_quiz ? `<span class="muted small"> · quiz de ${it.n_quiz} pregunta${it.n_quiz === 1 ? '' : 's'}</span>` : ''}
      </div>
      <span class="small muted">${it.vistos.length} de ${totalVendedores} vendedores lo vieron</span>
    </div>
    ${it.vistos.length ? `
    <div class="hist" style="margin-top:.5rem">
      ${it.vistos.map((v) => {
        const pct = it.esVideo ? pctVideo(v) : null;
        const salto = !v.completado_at && v.duracion > 0 && v.segundos >= v.duracion * 0.95 && v.reproducido < v.duracion * 0.8;
        const estado = v.completado_at
          ? `<span class="chip" style="background:#2F7D4F" title="Reprodujo al menos el 80% real del video (${fechaHora(v.completado_at)})">Completado</span>`
          : salto ? `<span class="chip" style="background:#A8791F" title="Llegó al final pero reproduciendo menos del 80%: adelantó la barra">Saltó al final</span>` : '';
        const quiz = it.n_quiz
          ? (v.quiz
            ? `<span class="chip" style="background:${v.quiz.aprobado ? '#2F7D4F' : '#A8433E'}" title="${v.quiz.intentos} intento${v.quiz.intentos === 1 ? '' : 's'}">Quiz ${v.quiz.puntaje}%</span>`
            : '<span class="chip" style="background:#5B6773">Quiz sin rendir</span>')
          : '';
        return `<div class="hist-item">
          <span style="display:inline-flex;align-items:center;gap:.45rem;min-width:10rem">${avatar({ id: v.user_id, name: v.name, avatar: v.avatar })}${esc(v.name)}</span>
          ${pct != null ? `<span style="flex:1;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap"><span class="prog" style="flex:1;min-width:5rem"><i class="${v.completado_at ? 'full' : ''}" style="width:${pct}%"></i></span><span class="small" style="white-space:nowrap">${pct}% · vio ${horas(v.reproducido || 0)} reales</span>${estado}${quiz}</span>`
            : `<span class="small muted" style="flex:1;display:inline-flex;gap:.5rem;align-items:center;flex-wrap:wrap">${v.veces} apertura${v.veces === 1 ? '' : 's'}${quiz}</span>`}
          <span class="cuando">${fechaHora(v.ultima_vista)}</span>
        </div>`;
      }).join('')}
    </div>` : '<p class="muted small" style="margin:.5rem 0 0">Nadie lo vio todavía.</p>'}
  </div>`).join('') : '<div class="card"><p class="muted" style="margin:0">Sin contenidos publicados todavía.</p></div>'}`
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
    title: 'Documentación', user, active: 'docs', sistema: 'campus',
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
    title: 'Changelog', user, active: 'docs', sistema: 'campus',
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
  loginPage, pipelinePage, dealFormModal, adminPage, adminComunicacionPage, adminPreferenciasPage, adminUserPage, perfilPage, docsPage, changelogPage, soporteListaPage, soporteTicketPage,
  notificacionesPage, metasDetallePage, dashboardUnificadoPage, hubPage, campusPage, campusCursoPage, campusQuizPage, campusStatsPage,
  cobranzaAdminPage, cobranzaVendedorPage, reglasPage,
  panelActividadPage, panelObjetivosPage, panelRankingPage, panelConfigPage, reporteImprimirPage,
};
