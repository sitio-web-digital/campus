// Motor de comisiones: genera las cuotas del vendedor cuando un deal pasa a Ganado,
// según las reglas configurables en commission_rules.
const { db } = require('./db');

const round2 = (n) => Math.round(n * 100) / 100;
const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

function addMonths(fechaISO, meses) {
  const d = new Date(fechaISO + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function getRules(tipoVenta) {
  const row = db.prepare('SELECT config FROM commission_rules WHERE tipo_venta = ?').get(tipoVenta);
  return row ? JSON.parse(row.config) : null;
}

function getAllRules() {
  const out = {};
  for (const r of db.prepare('SELECT * FROM commission_rules').all()) out[r.tipo_venta] = JSON.parse(r.config);
  return out;
}

function saveRules(tipoVenta, config) {
  db.prepare(`INSERT INTO commission_rules (tipo_venta, config) VALUES (?, ?)
    ON CONFLICT(tipo_venta) DO UPDATE SET config = excluded.config`).run(tipoVenta, JSON.stringify(config));
}

function pctPorTramo(tramos, ticket) {
  for (const t of tramos) {
    if (t.hasta == null || ticket <= t.hasta) return t.pct;
  }
  return tramos[tramos.length - 1].pct;
}

// Genera las cuotas de un deal ganado. No duplica: si ya hay cuotas vivas, no hace nada.
// La regla se elige por RUBRO: góndolas usa su regla plana; el resto, la regla por tipo de venta.
function generarComisiones(deal) {
  if (!deal || !deal.mrr || deal.mrr <= 0) return 0;
  const vivas = db.prepare("SELECT COUNT(*) AS c FROM commissions WHERE deal_id = ? AND estado != 'cancelado'").get(deal.id).c;
  if (vivas > 0) return 0;
  const rules = deal.panel === 'gondolas' ? getRules('gondolas') : getRules(deal.tipo_venta);
  if (!rules) return 0;
  const base = deal.fecha_cierre || hoyAR();
  const ins = db.prepare('INSERT INTO commissions (deal_id, user_id, concepto, monto, fecha_devengada) VALUES (?, ?, ?, ?, ?)');
  let creadas = 0;
  if (rules.tipo === 'flat') {
    // Comisión única cobrable al momento (fecha = cierre → exigible ya).
    ins.run(deal.id, deal.user_id, `Comisión venta góndolas (${rules.pct}% de $${deal.mrr})`, round2(deal.mrr * (rules.pct / 100)), base);
    creadas = 1;
  } else if (rules.tipo === 'tramos') {
    const pct = pctPorTramo(rules.tramos, deal.mrr);
    ins.run(deal.id, deal.user_id, `Comisión por proyecto (${pct}% de $${deal.mrr})`, round2(deal.mrr * (pct / 100)), base);
    creadas = 1;
  } else if (rules.tipo === 'fases') {
    const totalMeses = rules.fases.reduce((a, f) => a + (f.meses || 0), 0);
    let mes = 0;
    for (const f of rules.fases) {
      for (let i = 0; i < (f.meses || 0); i++) {
        mes++;
        ins.run(deal.id, deal.user_id, `Mes ${mes} de ${totalMeses} (${f.pct}% de $${deal.mrr}/mes)`, round2(deal.mrr * (f.pct / 100)), addMonths(base, mes - 1));
        creadas++;
      }
    }
  }
  return creadas;
}

// Si el deal deja de estar Ganado (o el cliente cancela el servicio), se cancelan las cuotas pendientes.
function cancelarPendientes(dealId) {
  return db.prepare("UPDATE commissions SET estado = 'cancelado' WHERE deal_id = ? AND estado = 'pendiente'").run(dealId).changes;
}

module.exports = { getRules, getAllRules, saveRules, generarComisiones, cancelarPendientes, pctPorTramo };
