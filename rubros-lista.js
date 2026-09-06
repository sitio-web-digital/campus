// Lista de rubros con los que se están ofertando webs (Panel de Clientes).
// Solo lectura. Correr en el server: docker compose exec panel node rubros-lista.js
const db = require('better-sqlite3')('data/crm.db');

console.log('=== RUBROS (prospectos cargados desde Google Maps) ===\n');
const rubros = db.prepare(`SELECT rubro,
    COUNT(*) AS total,
    SUM(estado = 'tomado') AS tomados,
    SUM(estado = 'descartado') AS descartados,
    SUM(sitio_web IS NULL OR sitio_web = '') AS sin_web
  FROM prospectos GROUP BY rubro ORDER BY total DESC`).all();
if (!rubros.length) console.log('(todavía no hay prospectos cargados)');
for (const r of rubros) {
  console.log(`- ${r.rubro}: ${r.total} prospectos (${r.tomados} tomados, ${r.descartados} descartados, ${r.sin_web} sin web)`);
}

console.log('\n=== BÚSQUEDAS HECHAS (rubro + zona, quién y cuándo) ===\n');
const scans = db.prepare(`SELECT s.rubro, s.zona, s.encontrados, s.nuevos, u.name,
    substr(datetime(s.created_at, '-3 hours'), 1, 16) AS cuando
  FROM prospecto_scans s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC`).all();
if (!scans.length) console.log('(sin búsquedas registradas)');
for (const s of scans) {
  console.log(`- "${s.rubro}" en ${s.zona} — ${s.encontrados} encontrados (${s.nuevos} nuevos) · ${s.name} · ${s.cuando}`);
}

console.log('\n=== RUBROS QUE YA SE CONVIRTIERON EN LEADS (tomadas por vendedores) ===\n');
const tomados = db.prepare(`SELECT p.rubro, COUNT(*) AS leads, GROUP_CONCAT(DISTINCT u.name) AS vendedores
  FROM prospectos p JOIN users u ON u.id = p.tomado_por
  WHERE p.estado = 'tomado' GROUP BY p.rubro ORDER BY leads DESC`).all();
if (!tomados.length) console.log('(ninguna tomada todavía)');
for (const t of tomados) {
  console.log(`- ${t.rubro}: ${t.leads} leads (${t.vendedores})`);
}

console.log('\n=== LEADS DE CLOUD FOR DEPLOY (para deducir rubros por nombre) ===\n');
const leads = db.prepare(`SELECT d.id, d.empresa, d.etapa, d.origen, d.ciudad, d.provincia,
    (SELECT p.rubro FROM prospectos p WHERE p.deal_id = d.id) AS rubro_maps
  FROM deals d WHERE d.panel = 'cfd' ORDER BY d.id`).all();
if (!leads.length) console.log('(sin leads en CFD)');
for (const d of leads) {
  const nota = db.prepare("SELECT detalle FROM deal_events WHERE deal_id = ? AND detalle LIKE 'Nota:%' ORDER BY id LIMIT 1").get(d.id);
  console.log(`- ${d.empresa} | ${d.etapa} | ${d.rubro_maps ? 'rubro: ' + d.rubro_maps : 'origen: ' + (d.origen || '-')} | ${[d.ciudad, d.provincia].filter(Boolean).join(', ') || '-'}`);
  if (nota) console.log(`    ${nota.detalle.slice(0, 150).replace(/\n/g, ' / ')}`);
}

console.log('\n=== LISTA LIMPIA PARA PLANTILLAS (copiar y pegar) ===\n');
console.log(rubros.map((r) => r.rubro).join('\n'));
