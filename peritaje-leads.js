// Peritaje de leads: ¿las leads cargadas están montadas donde corresponde?
// SOLO LECTURA — no modifica nada. Correr en el server: docker compose exec panel node peritaje-leads.js
//
// Busca las cuatro formas en que una lead "cargada" puede no verse en el pipeline:
//  1. FANTASMA: su etapa no existe en las columnas de su panel → no se dibuja en ningún lado.
//  2. PANEL INVÁLIDO: quedó con un panel que el sistema no conoce.
//  3. BORRADA: hay rastro (notificación / historial de creación) pero la lead ya no existe.
//  4. CERRADA DIRECTO: nació en Ganado/Perdido → solo aparece en la pestaña "Cerrados", no en el tablero.
// Además: histórico de creaciones por persona y duplicados de empresa por panel.

const path = require('path');
const db = require('better-sqlite3')(process.argv[2] || path.join(__dirname, 'data', 'crm.db'), { readonly: true });

const SLUGS = ['cfd', 'gondolas', 'estanterias', 'sitioweb'];
const NOMBRE = { cfd: 'Cloud For Deploy', gondolas: 'Góndolas', estanterias: 'Estanterías Reforzadas', sitioweb: 'SitioWeb Digital' };
const usuarios = Object.fromEntries(db.prepare('SELECT id, name FROM users').all().map((u) => [u.id, u.name]));
const nom = (id) => usuarios[id] || `usuario #${id}`;
const etapasDe = {};
for (const s of SLUGS) etapasDe[s] = db.prepare('SELECT nombre FROM panel_etapas WHERE panel = ? ORDER BY orden').all(s).map((e) => e.nombre);

let problemas = 0;
const titulo = (t) => console.log(`\n════ ${t} ${'═'.repeat(Math.max(0, 60 - t.length))}`);

titulo('1. Leads FANTASMA (etapa que no existe en las columnas de su panel)');
const fantasmas = db.prepare("SELECT d.*, u.name AS duenio FROM deals d LEFT JOIN users u ON u.id = d.user_id").all()
  .filter((d) => SLUGS.includes(d.panel) && !['Ganado', 'Perdido'].includes(d.etapa) && !etapasDe[d.panel].includes(d.etapa));
if (fantasmas.length) {
  problemas += fantasmas.length;
  for (const d of fantasmas) {
    const creador = db.prepare("SELECT user_id, created_at FROM deal_events WHERE deal_id = ? AND tipo = 'creado'").get(d.id);
    console.log(`  ⚠ #${d.id} «${d.empresa}» — panel ${NOMBRE[d.panel]}, etapa «${d.etapa}» (no existe ahí; columnas: ${etapasDe[d.panel].join(', ')})`);
    console.log(`     dueño: ${d.duenio || '—'} · creada ${creador ? `por ${nom(creador.user_id)} el ${creador.created_at}` : d.created_at} · INVISIBLE en el tablero — arreglo: /deals/${d.id} y elegirle una etapa válida`);
  }
} else console.log('  ✔ Ninguna. Todas las leads abiertas están en una columna válida de su panel.');

titulo('2. Leads con panel inválido');
const invalidas = db.prepare('SELECT id, empresa, panel, etapa, user_id FROM deals').all().filter((d) => !SLUGS.includes(d.panel));
if (invalidas.length) {
  problemas += invalidas.length;
  for (const d of invalidas) console.log(`  ⚠ #${d.id} «${d.empresa}» — panel «${d.panel}» desconocido (dueño ${nom(d.user_id)})`);
} else console.log('  ✔ Ninguna. Todos los paneles son válidos.');

titulo('3. Rastros de leads BORRADAS (notificación o historial sin lead)');
const existe = new Set(db.prepare('SELECT id FROM deals').all().map((d) => d.id));
const rastrosNoti = db.prepare("SELECT id, texto, url, created_at FROM notifications WHERE url LIKE '/deals/%'").all()
  .map((n) => ({ ...n, dealId: parseInt(String(n.url).split('/')[2], 10) }))
  .filter((n) => Number.isFinite(n.dealId) && !existe.has(n.dealId));
const rastrosHist = db.prepare("SELECT deal_id, user_id, detalle, created_at FROM deal_events WHERE tipo = 'creado'").all()
  .filter((e) => !existe.has(e.deal_id));
if (rastrosHist.length || rastrosNoti.length) {
  const vistos = new Set();
  for (const e of rastrosHist) {
    vistos.add(e.deal_id);
    console.log(`  ✂ lead #${e.deal_id} — creada por ${nom(e.user_id)} el ${e.created_at} (${e.detalle}) y HOY NO EXISTE (borrada)`);
  }
  for (const n of rastrosNoti) if (!vistos.has(n.dealId)) { vistos.add(n.dealId); console.log(`  ✂ lead #${n.dealId} — la notificación del ${n.created_at} dice «${n.texto.slice(0, 70)}…» pero la lead no existe`); }
  console.log(`  (${vistos.size} lead${vistos.size === 1 ? '' : 's'} con rastro y sin registro — si nadie las borró a propósito, acá está el problema)`);
  problemas += vistos.size;
} else console.log('  ✔ Ninguna. Toda notificación e historial de creación apunta a una lead que existe.');

titulo('4. Leads nacidas directamente en Ganado/Perdido (solo visibles en "Cerrados")');
const nacidasCerradas = db.prepare(`SELECT e.deal_id, e.user_id, e.detalle, e.created_at, d.empresa, d.panel, d.etapa
  FROM deal_events e JOIN deals d ON d.id = e.deal_id
  WHERE e.tipo = 'creado' AND (e.detalle LIKE '%etapa Ganado%' OR e.detalle LIKE '%etapa Perdido%')`).all();
if (nacidasCerradas.length) {
  for (const e of nacidasCerradas) console.log(`  ◦ #${e.deal_id} «${e.empresa}» (${NOMBRE[e.panel] || e.panel}) — creada ya cerrada por ${nom(e.user_id)} el ${e.created_at}; no sale en el tablero, sí en Cerrados`);
} else console.log('  ✔ Ninguna.');

titulo('5. Histórico de creaciones por persona (dónde montó cada lead)');
const creaciones = db.prepare("SELECT e.user_id, e.deal_id, e.created_at, d.panel, d.etapa, d.empresa, d.user_id AS duenio FROM deal_events e LEFT JOIN deals d ON d.id = e.deal_id WHERE e.tipo = 'creado' ORDER BY e.user_id, e.created_at").all();
const porPersona = new Map();
for (const c of creaciones) { if (!porPersona.has(c.user_id)) porPersona.set(c.user_id, []); porPersona.get(c.user_id).push(c); }
for (const [uid, lista] of porPersona) {
  const vivas = lista.filter((c) => c.panel);
  const borradas = lista.length - vivas.length;
  const fantasma = vivas.filter((c) => SLUGS.includes(c.panel) && !['Ganado', 'Perdido'].includes(c.etapa) && !etapasDe[c.panel].includes(c.etapa)).length;
  const porPanel = {};
  for (const c of vivas) porPanel[c.panel] = (porPanel[c.panel] || 0) + 1;
  const paraOtros = vivas.filter((c) => c.duenio !== uid).length;
  console.log(`  ${nom(uid)}: creó ${lista.length} (${Object.entries(porPanel).map(([p, n]) => `${n} en ${NOMBRE[p] || p}`).join(', ') || 'ninguna viva'})${borradas ? ` · ${borradas} borrada${borradas === 1 ? '' : 's'} ⚠` : ''}${fantasma ? ` · ${fantasma} fantasma ⚠` : ''}${paraOtros ? ` · ${paraOtros} a nombre de otra persona` : ''}`);
  // últimas 5, con dónde quedaron, para poder cotejar contra "yo la cargué y no está"
  for (const c of lista.slice(-5)) {
    console.log(`      ${c.created_at} → ${c.panel ? `#${c.deal_id} «${c.empresa}» — ${NOMBRE[c.panel] || c.panel} / ${c.etapa}${c.duenio !== uid ? ` (dueño: ${nom(c.duenio)})` : ''}` : `#${c.deal_id} BORRADA`}`);
  }
}

titulo('6. Posibles duplicados (misma empresa dos veces en el mismo panel)');
const dups = db.prepare(`SELECT panel, LOWER(TRIM(empresa)) e, COUNT(*) n, GROUP_CONCAT(id) ids FROM deals GROUP BY panel, e HAVING n > 1`).all();
if (dups.length) {
  for (const d of dups) console.log(`  ◦ «${db.prepare('SELECT empresa FROM deals WHERE id = ?').get(+d.ids.split(',')[0]).empresa}» aparece ${d.n} veces en ${NOMBRE[d.panel] || d.panel} (ids ${d.ids})`);
} else console.log('  ✔ Ninguno.');

console.log(`\n${'═'.repeat(66)}\nVEREDICTO: ${problemas === 0 ? '✔ No hay leads perdidas: todo lo cargado está montado y visible donde corresponde.' : `⚠ ${problemas} caso${problemas === 1 ? '' : 's'} que explican leads "cargadas pero invisibles" — detalle arriba.`}`);
