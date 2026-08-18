// Carga los quizzes del curso "Cloud for deploy basico", armados desde el material real de C4D
// (presentación "Estrategia de marca v3" y documento "Embudo de ventas de servicios").
// - Asigna cada banco de preguntas al contenido cuyo título matchee la palabra clave (editable en MAPEO).
// - Idempotente: si un contenido ya tiene quiz, no lo toca.
// - Si un contenido no matchea ningún banco, lo lista al final para que asignes a mano (editando MAPEO).
// Ejecutar en el server: docker compose exec panel node cargar-quizzes.js
const { db } = require('./db');

// Título del contenido (regex, sin distinguir mayúsculas) → banco de preguntas.
const MAPEO = [
  [/califica|filtro|perfil/i, 'calificacion'],
  [/embudo|venta|proceso|rampa|etapa/i, 'embudo'],
  [/estrategia|marca|diferencial|identidad|blueprint|b2b|growth/i, 'estrategia'],
];

// [pregunta, [opciones], índice de la correcta]
const BANCOS = {
  estrategia: [
    ['¿A quién le vende Cloud For Deploy?', [
      'A cualquier empresa que necesite tecnología',
      'A una empresa que depende de software en producción y no tiene equipo de infraestructura',
      'Solo a startups que recién arrancan',
      'A agencias de marketing digital'], 1],
    ['¿Cuáles son los dos perfiles de cliente objetivo?', [
      'PyME con sistema propio y SaaS con techo técnico',
      'Kioscos y supermercados',
      'Estudiantes y freelancers',
      'Solo empresas de Tucumán'], 0],
    ['¿Cuál es la promesa de la marca?', [
      '"Soluciones tecnológicas integrales"',
      '"Calidad y confianza"',
      '"Tu sistema en verde"',
      '"El mejor precio del mercado"'], 2],
    ['¿Cuál es la ventaja real de C4D frente a la competencia?', [
      'Somos los más baratos',
      'Podemos recomendar cloud, on-premise o híbrido sin conflicto de interés: somos asesores, no vendedores',
      'Tenemos la oficina más grande',
      'Trabajamos más horas que nadie'], 1],
    ['¿Cómo se llama el desarrollo en C4D? (nunca "desarrollo a secas")', [
      'Desarrollo express',
      'Desarrollo low-cost',
      'Desarrollo llave en mano',
      'Desarrollo listo para producción (software con infraestructura incluida)'], 3],
    ['¿Qué se hace con el trabajo commodity (landings sueltas, WordPress, tiendas chicas)?', [
      'Se toma igual, plata es plata',
      'Se deriva y se cobra comisión',
      'Se hace gratis para ganar clientes',
      'Se cotiza al doble'], 1],
    ['¿Qué mensaje va en el titular de la home y en el pitch de 30 segundos?', [
      'Infraestructura y disponibilidad (la punta de lanza)',
      'Desarrollo de software a medida',
      'La lista completa de todos los servicios',
      'Los precios de cada servicio'], 0],
  ],
  calificacion: [
    ['¿Desde qué facturación recurrente mensual califica un cliente?', [
      'USD 1.000 por mes',
      'USD 5.000 por mes',
      'USD 10.000 por mes',
      'No importa la facturación'], 2],
    ['¿Cuáles son las tres preguntas del guion del vendedor?', [
      '¿Cuánto factura? ¿Cuántos empleados tiene? ¿Dónde queda la oficina?',
      '¿Tienen sistema propio funcionando? ¿Cuánta gente técnica tienen? ¿Quién se ocupa de que no se caiga?',
      '¿Usan Windows o Linux? ¿Tienen página web? ¿Conocen AWS?',
      '¿Quieren una app? ¿Para cuándo? ¿Con qué presupuesto?'], 1],
    ['Si a "¿quién se ocupa de que eso no se caiga?" responden "nadie" o "el mismo que programa"…', [
      'No califica: no les interesa la infraestructura',
      'Califica: ese es exactamente nuestro cliente',
      'Hay que derivarlo a otra empresa',
      'Hay que esperar a que contrate a alguien de infra'], 1],
    ['¿Cuál de estos NO califica como cliente?', [
      'Una PyME con sistema propio y clientes que se quejan cuando se cae',
      'Un SaaS cuya factura de nube ya duele',
      'Un fundador solo, pre-revenue, que todavía busca product-market fit',
      'Una empresa que crece y su infraestructura no acompaña'], 2],
    ['¿Cuál es el verdadero calificador de un cliente?', [
      'El modelo de negocio',
      'El rubro en el que trabaja',
      'La cantidad de empleados totales',
      'El dolor económico (la caída o la factura ya le cuestan plata)'], 3],
  ],
  embudo: [
    ['¿Cuál es el principio que ordena todo el embudo?', [
      'Muchas puertas de entrada, dos rampas de acceso, un solo camino',
      'Cada cliente entra por donde quiere',
      'Primero vender, después calificar',
      'Todos los clientes van directo al proyecto'], 0],
    ['¿Cuál es la única pregunta que decide la rampa de entrada?', [
      '¿Cuánto presupuesto tienen?',
      '¿Hay algo funcionando en producción hoy?',
      '¿Qué tecnología prefieren?',
      '¿Cuándo quieren arrancar?'], 1],
    ['¿Quién decide la puerta de entrada de un cliente?', [
      'El cliente, que sabe lo que necesita',
      'El vendedor que lo trajo',
      'Nosotros, en la llamada de calificación',
      'Se sortea entre las dos rampas'], 2],
    ['Ante la duda entre diagnóstico y sesión de alcance, ¿qué se elige?', [
      'Sesión de alcance',
      'Se le pregunta al cliente',
      'Las dos a la vez',
      'Diagnóstico, siempre'], 3],
    ['¿Para qué sirven los USD 150 de la entrada (diagnóstico o alcance)?', [
      'Es el ingreso principal del negocio',
      'Es un filtro de intención: sin plata de por medio la gente dice que sí por cortesía y desaparece',
      'Para cubrir los viáticos',
      'Es un error, debería ser gratis'], 1],
    ['¿Cuál es el destino final de todo el embudo?', [
      'El proyecto grande',
      'El diagnóstico',
      'El abono mensual (ingreso recurrente y predecible)',
      'La reunión de presentación'], 2],
    ['¿Qué hacen los vendedores del consorcio con una lead?', [
      'Detectan y derivan; NO enrutan ni explican infraestructura',
      'Deciden si va a diagnóstico o a sesión de alcance',
      'Cierran la venta completa ellos mismos',
      'Explican el detalle técnico de la infraestructura'], 0],
    ['¿Cuándo se ofrece el abono mensual?', [
      'Seis meses después de terminar',
      'Cuando el cliente lo pide',
      'Antes de terminar el proyecto, cuando todavía somos indispensables',
      'Nunca: el abono se contrata solo'], 2],
  ],
};

const curso = db.prepare("SELECT * FROM campus_cursos WHERE nombre = 'Cloud for deploy basico'").get();
if (!curso) { console.error('No existe el curso "Cloud for deploy basico".'); process.exit(1); }

const items = db.prepare('SELECT * FROM campus_items WHERE curso_id = ? ORDER BY orden, id').all(curso.id);
if (!items.length) { console.log('El curso no tiene contenidos todavía — subí los videos primero y volvé a correr este script.'); process.exit(0); }

const sinBanco = [];
for (const it of items) {
  const ya = db.prepare('SELECT COUNT(*) c FROM campus_quiz_preguntas WHERE item_id = ?').get(it.id).c;
  if (ya > 0) { console.log(`"${it.titulo}": ya tiene quiz (${ya} preguntas) — sin cambios.`); continue; }
  const mapeo = MAPEO.find(([re]) => re.test(it.titulo));
  if (!mapeo) { sinBanco.push(it.titulo); continue; }
  const banco = BANCOS[mapeo[1]];
  let orden = 0;
  for (const [pregunta, opciones, correcta] of banco) {
    db.prepare('INSERT INTO campus_quiz_preguntas (item_id, pregunta, opciones, correcta, orden) VALUES (?, ?, ?, ?, ?)')
      .run(it.id, pregunta, JSON.stringify(opciones), correcta, ++orden);
  }
  console.log(`"${it.titulo}": quiz "${mapeo[1]}" cargado (${banco.length} preguntas).`);
}

if (sinBanco.length) {
  console.log('\nSin banco asignado (agregá su palabra clave en MAPEO y volvé a correr):');
  for (const t of sinBanco) console.log('  -', t);
  console.log('Bancos disponibles: ' + Object.keys(BANCOS).join(', '));
}
console.log('\nListo. Los vendedores necesitan 70% en cada quiz para desbloquear el siguiente contenido.');
