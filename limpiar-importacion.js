// Limpieza de la importación histórica: borra SOLO las leads marcadas como importadas
// (planilla de leads + hoja de pagos) de los paneles Góndolas y Estanterías, junto con
// sus comisiones y su historial. Las leads cargadas a mano por los vendedores no se tocan.
// También elimina las etapas creadas por la importación (Frío, Caliente, Seguimiento) si quedan vacías.
// Idempotente: si no queda nada importado, no hace nada.
// Ejecutar en el server: docker compose exec panel node limpiar-importacion.js
const { db } = require('./db');

const ids = db.prepare(`SELECT DISTINCT e.deal_id FROM deal_events e
  JOIN deals d ON d.id = e.deal_id AND d.panel IN ('gondolas', 'estanterias')
  WHERE e.detalle LIKE 'Importada de la planilla histórica%' OR e.detalle LIKE 'Importada de la planilla de pagos%'`)
  .all().map((r) => r.deal_id);

if (!ids.length) {
  console.log('No hay leads importadas para limpiar — sin cambios.');
} else {
  const ph = ids.map(() => '?').join(',');
  db.transaction(() => {
    const com = db.prepare(`DELETE FROM commissions WHERE deal_id IN (${ph})`).run(...ids).changes;
    const dea = db.prepare(`DELETE FROM deals WHERE id IN (${ph})`).run(...ids).changes; // deal_events cae en cascada
    console.log(`Limpieza: ${dea} leads importadas eliminadas, ${com} cuotas de comisión eliminadas.`);
    for (const panel of ['gondolas', 'estanterias']) {
      for (const etapa of ['Frío', 'Caliente', 'Seguimiento']) {
        const enUso = db.prepare('SELECT COUNT(*) AS c FROM deals WHERE panel = ? AND etapa = ?').get(panel, etapa).c;
        if (!enUso) {
          const del = db.prepare('DELETE FROM panel_etapas WHERE panel = ? AND nombre = ?').run(panel, etapa).changes;
          if (del) console.log(`Etapa vacía eliminada de ${panel}: ${etapa}`);
        }
      }
    }
  })();
}
