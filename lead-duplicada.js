// Diagnóstico de leads duplicadas. Solo lectura.
// Uso: docker compose exec panel node lead-duplicada.js "ANDES XTREME"
// Sin argumento: lista todos los nombres repetidos por panel.
const db = require('better-sqlite3')('data/crm.db');
const buscar = process.argv[2];
const ar = (c) => `substr(datetime(${c}, '-3 hours'), 1, 16)`;

if (!buscar) {
  console.log('=== NOMBRES REPETIDOS (mismo nombre y panel, más de una lead) ===\n');
  const dups = db.prepare(`SELECT panel, lower(trim(empresa)) AS nombre, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
    FROM deals GROUP BY panel, lower(trim(empresa)) HAVING n > 1 ORDER BY panel, n DESC`).all();
  if (!dups.length) console.log('(ninguno)');
  for (const d of dups) console.log(`- [${d.panel}] "${d.nombre}" × ${d.n} → ids ${d.ids}`);
  console.log('\nPara ver el detalle de una: node lead-duplicada.js "nombre"');
  process.exit(0);
}

const deals = db.prepare(`SELECT d.*, u.name AS duenio, ${ar('d.created_at')} AS creada, ${ar('d.updated_at')} AS tocada
  FROM deals d JOIN users u ON u.id = d.user_id WHERE d.empresa LIKE ? ORDER BY d.id`).all('%' + buscar + '%');
if (!deals.length) { console.log('No hay leads que matcheen "' + buscar + '".'); process.exit(0); }

for (const d of deals) {
  console.log(`\n════ LEAD #${d.id} — ${d.empresa} ════`);
  console.log(`panel: ${d.panel} | etapa: ${d.etapa} | dueño: ${d.duenio} | creada: ${d.creada} | última modificación: ${d.tocada}`);
  console.log(`tel: ${d.telefono || '-'} | origen: ${d.origen || '-'} | valor: ${d.mrr || '-'} | cierre: ${d.fecha_cierre || '-'} | aprobación: ${d.aprobacion || '-'}`);
  const pros = db.prepare('SELECT id, rubro, zona, estado FROM prospectos WHERE deal_id = ?').get(d.id);
  if (pros) console.log(`nació de prospecto #${pros.id} (rubro "${pros.rubro}", ${pros.zona}, estado ${pros.estado})`);
  for (const r of db.prepare(`SELECT id, fecha, hora, estado, modalidad, admin_id FROM reuniones WHERE deal_id = ? ORDER BY id`).all(d.id)) {
    console.log(`reunión #${r.id}: ${r.fecha} ${r.hora} — ${r.estado} (${r.modalidad || '-'})`);
  }
  console.log('--- historial completo ---');
  for (const e of db.prepare(`SELECT e.tipo, e.detalle, ${ar('e.created_at')} AS cuando, u.name
    FROM deal_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.deal_id = ? ORDER BY e.id`).all(d.id)) {
    console.log(`  ${e.cuando} · ${e.name || '?'} · [${e.tipo}] ${String(e.detalle || '').slice(0, 160).replace(/\n/g, ' / ')}`);
  }
}
console.log(`\n${deals.length} lead(s) encontradas. Si hay dos, el historial de arriba dice quién creó cada una, cuándo y por qué vía (prospecto de Maps vs. carga manual).`);
