// Historial de versiones del sistema. Agregar la versión nueva AL PRINCIPIO del array.
// Tipos de cambio: 'nuevo' | 'mejora' | 'fix'
module.exports = [
  {
    version: '2.11.1',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'mejora', texto: 'Borrar una etapa con leads adentro ahora muestra un cartel con la cantidad exacta y el botón "Ver esas leads", que abre el pipeline filtrado por esa columna para moverlas (arrastrando o desde la ficha). Vacía la columna, se puede borrar.' },
      { tipo: 'nuevo', texto: 'El pipeline acepta filtro por etapa (?etapa=...), combinable con la búsqueda y los demás filtros.' },
    ],
  },
  {
    version: '2.11.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Filtros en el pipeline: búsqueda por texto (empresa, contacto, ciudad, provincia, origen, vendedor) más selectores de vendedor y origen, con contador de resultados. Los filtros se mantienen al cambiar entre Míos/Todos y Tablero/Cerrados.' },
      { tipo: 'mejora', texto: 'El administrador entra al pipeline viendo "Todos" por defecto (supervisa al equipo); los vendedores siguen arrancando en "Míos".' },
    ],
  },
  {
    version: '2.10.5',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'fix', texto: 'La ficha de lead de Estanterías Reforzadas (y SitioWeb) mostraba los campos de Cloud For Deploy: pedía "Tipo de venta" con las opciones de software y los orígenes de CFD. Ahora pide "Valor de la venta" simple, como Góndolas.' },
      { tipo: 'fix', texto: 'Origen propio de los paneles comerciales (MarketPlace, Ads, WhatsApp, Instagram, Referido, etc.). Además, editar una lead importada ya no le borra el origen al guardar.' },
    ],
  },
  {
    version: '2.10.4',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Importación definitiva desde el CSV corregido (Tracker Agosto): 223 leads a Góndolas y Estanterías con vendedor, etapa, valor, provincia y notas al historial. El importador lee el CSV directamente, así que un export futuro se recarga fácil.' },
      { tipo: 'nuevo', texto: 'Las ventas del CSV generan su comisión al importar: Mateo $440.000 (Benedicta y Jorge) y Romina $86.500 (David Ruiz, valor según hoja de pagos) — visibles en Cobranza, cobrables al momento.' },
    ],
  },
  {
    version: '2.10.3',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'fix', texto: 'Se dio de baja la importación histórica: se eliminan las leads importadas de Góndolas y Estanterías (con sus comisiones e historial) y las etapas Frío/Caliente/Seguimiento si quedan vacías. Las leads cargadas a mano por los vendedores no se tocan.' },
    ],
  },
  {
    version: '2.10.2',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Cobranza histórica: las ventas de la hoja de pagos de la planilla ya impactan en el Panel de Cobranza — 7 cuotas de Mateo ($1.181.000) y 1 de Romina ($86.500) al 5% del rubro, cobrables al momento.' },
      { tipo: 'nuevo', texto: 'Se cargaron las 5 ventas de Mateo que estaban solo en la hoja de pagos (Manuel, Gabriel Lopez, Benedicta 2ª, Esteban, Jorge 2ª) y se completó y aprobó la de David Ruiz (Romina, $1.730.000).' },
      { tipo: 'mejora', texto: 'El concepto de la comisión por venta de rubro ya no dice "góndolas" fijo: sirve para todos los paneles.' },
    ],
  },
  {
    version: '2.10.1',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Importación de las leads históricas de la planilla (pre-sistema): 163 leads a los paneles Góndolas y Estanterías Reforzadas, con vendedor, etapa, valor cotizado, provincia y las notas/celular/fuente en el historial de cada lead.' },
      { tipo: 'nuevo', texto: 'Etapas nuevas en Góndolas y Estanterías para reflejar el flujo real del equipo: Seguimiento, Frío y Caliente (editables en Config como siempre).' },
    ],
  },
  {
    version: '2.10.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Administración renovada: los usuarios ahora son una tabla compacta con rol, sistemas habilitados, estado, fecha de alta, último login y última interacción ("hace 5 min", "hace 2 días").' },
      { tipo: 'nuevo', texto: 'Ficha de usuario: tocando cualquier usuario se abre su ficha con los datos de la cuenta, la edición de rol y permisos, y las acciones de desactivar / resetear clave.' },
      { tipo: 'nuevo', texto: 'Historial por usuario: la ficha muestra todo lo que hizo la persona — logins, deals creados/movidos/editados (con link), días de actividad cargados y cambios de cuenta (quién le cambió permisos o le reseteó la clave).' },
    ],
  },
  {
    version: '2.9.1',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'mejora', texto: 'Pulido visual completo para teléfono: la barra de navegación inferior y las pestañas se deslizan si no entran (nunca más se cortan), el menú de sistemas ocupa el ancho de la pantalla, y las barras de objetivos y el funnel se achican para que se lean enteros.' },
      { tipo: 'mejora', texto: 'Kanban en pantallas chicas: columnas más anchas y desplazamiento con imán (cada columna queda alineada al frenar).' },
      { tipo: 'fix', texto: 'Las tarjetas destacadas (aviso al equipo, objetivos generales) ahora se distinguen con una franja de color, y los botones de cada usuario en Administración ya no desbordan la tarjeta en el celular.' },
    ],
  },
  {
    version: '2.9.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'La ficha de la lead muestra "Última edición: quién y cuándo" (no editable) — clave cuando edita alguien distinto al vendedor.' },
      { tipo: 'nuevo', texto: 'Actividad: los vendedores pueden cargar o corregir hasta 3 días para atrás (tabs Hoy/Ayer/… con marca de días sin cargar). El admin puede cargar cualquier fecha de cualquier vendedor.' },
      { tipo: 'nuevo', texto: 'Al entrar al sistema, si al vendedor le faltan días de actividad recibe una notificación con los días pendientes y el link directo.' },
      { tipo: 'nuevo', texto: 'El admin elige qué notificaciones recibir (deal nuevo, cambios de etapa) en Administración. El paso a Ganado no se puede silenciar; los avisos manuales tampoco.' },
      { tipo: 'nuevo', texto: 'Cuando alguien modifica la lead de otro (típicamente el admin), el vendedor dueño recibe la notificación con el detalle.' },
    ],
  },
  {
    version: '2.8.1',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'mejora', texto: 'Las campañas ahora son de cada empresa: se gestionan dentro de su panel comercial (CFD en la pestaña Campañas junto al Dashboard; Góndolas/Estanterías/SitioWeb en su Config) y el selector de la lead muestra solo las campañas de esa empresa.' },
    ],
  },
  {
    version: '2.8.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Campañas: se crean en Administración → Campañas, se eligen al cargar la lead, y cada dashboard muestra las campañas ganadoras (leads, ganadas, ingresos y conversión) para detectar ángulos ganadores.' },
      { tipo: 'nuevo', texto: 'Ubicación de la lead: país (Argentina por defecto), provincia (con las 24 sugeridas) y ciudad. La ciudad se ve en la tarjeta del tablero.' },
    ],
  },
  {
    version: '2.7.1',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'fix', texto: 'Arrastrar un deal a Ganado ya no aprueba automáticamente, ni siquiera al administrador: siempre queda "Por aprobar" y la aprobación exige validar los datos en la ficha (con resumen de vendedor, tipo, valor y fecha). Sin valor cargado, avisa qué falta y bloquea.' },
    ],
  },
  {
    version: '2.7.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Comercial SitioWeb Digital: panel de ventas propio con etapas, carga diaria y objetivos configurables, comisión editable y todo el circuito de aprobación.' },
    ],
  },
  {
    version: '2.6.2',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Accesos a gondola.com.ar y estanterias.online en el menú de sistemas y el campus, con botones personalizados.' },
    ],
  },
  {
    version: '2.6.1',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'fix', texto: 'Maquetado de Metas: los formularios de objetivos se apilan por período con inputs en grilla fluida (soportan cualquier cantidad de campos) y las barras de progreso se compactaron para las tres columnas.' },
    ],
  },
  {
    version: '2.6.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Metas diarias: cada vendedor puede tener objetivos por día además de semanales y mensuales, con columna "Hoy" y progreso que se reinicia cada día. En todos los paneles comerciales.' },
      { tipo: 'mejora', texto: 'Los rankings suman el corte "Hoy".' },
    ],
  },
  {
    version: '2.5.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Comercial Estanterías Reforzadas: panel de ventas propio para la nueva empresa, con etapas, carga diaria y objetivos configurables, comisiones (5% editable) y todo el circuito de aprobación.' },
      { tipo: 'mejora', texto: 'Los paneles comerciales ahora se llaman "Comercial <empresa>" en el campus y los menús.' },
      { tipo: 'mejora', texto: 'Las notas del deal van directo al historial (con autor y fecha) y el campo queda siempre libre para la próxima nota. Las notas viejas se migraron al historial.' },
      { tipo: 'nuevo', texto: 'Reportes: nuevo corte diario (hoy o cualquiera de los últimos 14 días) y botón "Exportar PDF" con vista imprimible.' },
    ],
  },
  {
    version: '2.4.0',
    fecha: '2026-08-14',
    cambios: [
      { tipo: 'mejora', texto: 'La campanita ahora abre un panel flotante con las últimas notificaciones (sin cambiar de pantalla), adaptado al celular. El historial completo sigue disponible.' },
      { tipo: 'nuevo', texto: 'Avisos manuales desde Administración: el admin envía notificaciones a todos, por rol (vendedores, developers, admins) o a un usuario puntual.' },
    ],
  },
  {
    version: '2.3.3',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'mejora', texto: 'El login ahora presenta al Campus C4D como puerta de entrada general de la oficina (paneles, cobranza, administración y plataformas), no solo al panel comercial.' },
    ],
  },
  {
    version: '2.3.2',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Acceso a SitioWeb Digital (app.sitioweb.digital) en el menú de sistemas y el campus, con su logo y paleta oficial (oscuro con acento dorado).' },
    ],
  },
  {
    version: '2.3.1',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Comisión por rubro: las ventas de Góndolas comisionan un 5% por venta (editable en Cobranza → Reglas), en una única cuota cobrable al momento del cierre.' },
    ],
  },
  {
    version: '2.3.0',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Panel Administración: crear vendedores, developers y administradores, cambiar roles y habilitar/quitar permisos por sistema.' },
      { tipo: 'nuevo', texto: 'Comercial Góndolas: panel de ventas propio con etapas del pipeline configurables por el admin (Ganado/Perdido fijas por la lógica de aprobación).' },
      { tipo: 'nuevo', texto: 'Góndolas: carga diaria con campos moldeables y objetivos que se adaptan a esas métricas. Con aprobación, comisiones, historial y notificaciones como el panel principal.' },
      { tipo: 'nuevo', texto: 'Acceso a estanteriasreforzadas.com en el menú y el campus, con su botón personalizado.' },
    ],
  },
  {
    version: '2.2.1',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Accesos "Panel de Developers" y "Panel de Cursos" en el menú de sistemas y el Campus, marcados como Próximamente.' },
    ],
  },
  {
    version: '2.2.0',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Notificaciones para vendedores: cuando el administrador aprueba una venta, el vendedor recibe el aviso en vivo con sonido y cartel, con link directo a su comisión en Cobranza.' },
    ],
  },
  {
    version: '2.1.1',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'fix', texto: 'No se puede aprobar una venta sin el valor cargado (es la base de la comisión): el botón se oculta, el servidor lo rechaza, y los ganados del admin sin valor también quedan pendientes hasta completarlo.' },
    ],
  },
  {
    version: '2.1.0',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Aprobación de ventas: cuando un vendedor gana un deal queda "Por aprobar" — el administrador recibe la notificación, revisa tipo y valor, y al aprobar impacta en métricas y se generan las comisiones en Cobranza.' },
      { tipo: 'mejora', texto: 'Dashboard, ranking, metas y reportes cuentan solo ventas aprobadas. Las ganadas por el administrador se aprueban solas.' },
    ],
  },
  {
    version: '2.0.2',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'mejora', texto: 'Botón y tarjeta de PuntoCO2 con el color oficial de la marca (rojo #C0241A).' },
    ],
  },
  {
    version: '2.0.1',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'mejora', texto: 'Header compactado: todas las opciones entran en una sola línea junto a la marca.' },
      { tipo: 'mejora', texto: 'Accesos a PuntoCO2 y a la web de la empresa con botones personalizados (paleta verde eco y azul corporativo con logo) en el selector de sistemas y el campus.' },
    ],
  },
  {
    version: '2.0.0',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Panel de Cobranza: al ganar un deal se generan automáticamente las cuotas de comisión del vendedor según reglas configurables por tipo de venta.' },
      { tipo: 'nuevo', texto: 'Reglas de comisión editables: proyectos por tramos de ticket; suscripciones, infraestructura y mantenimiento por fases de meses y porcentaje.' },
      { tipo: 'nuevo', texto: 'Gestión de pagos: exigible hoy, marcar pagado, cancelar por no retención, carga y descarga de invoices.' },
      { tipo: 'nuevo', texto: 'Campus de entrada: elegí entre Panel Comercial, Panel de Cobranza, PuntoCO2 y la web de la empresa. Selector de sistemas arriba a la izquierda.' },
      { tipo: 'nuevo', texto: 'Tipos de venta nuevos en el pipeline: Infraestructura y Mantenimiento.' },
    ],
  },
  {
    version: '1.8.0',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Tipo de venta por deal: Proyecto único (a medida) o Suscripción mensual (SaaS). El dashboard y los reportes separan ingresos por proyectos del MRR nuevo.' },
      { tipo: 'mejora', texto: 'Metas y ranking ahora miden "ingresos ganados" (proyectos + suscripciones sumados).' },
    ],
  },
  {
    version: '1.7.1',
    fecha: '2026-08-13',
    cambios: [
      { tipo: 'nuevo', texto: 'Manual oficial del sistema (C4D Sales Panel) publicado en Docs: reemplaza al material provisorio.' },
    ],
  },
  {
    version: '1.7.0',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'nuevo', texto: 'Notificaciones en vivo para el administrador: con el panel abierto, los deals nuevos y cambios de etapa del equipo suenan y muestran un aviso emergente sin recargar la página.' },
    ],
  },
  {
    version: '1.6.2',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'mejora', texto: 'Login corporativo en dos paneles: marca con el logo a tamaño real a la izquierda y formulario de acceso a la derecha. En celular se apilan.' },
    ],
  },
  {
    version: '1.6.1',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'mejora', texto: 'Login rediseñado con el logo de la empresa: fondo azul marino degradado, marca centrada y tarjeta de acceso.' },
    ],
  },
  {
    version: '1.6.0',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'nuevo', texto: 'Manual en PDF en la sección Docs: vista previa embebida y botón de descarga. Se muestra el material vigente mientras se prepara el manual definitivo.' },
    ],
  },
  {
    version: '1.5.1',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'mejora', texto: 'El tablero muestra las 8 columnas completas en pantalla, sin scroll lateral (columnas fluidas y tipografía compacta). En pantallas chicas vuelve el scroll horizontal.' },
      { tipo: 'mejora', texto: 'Crear y editar deals ahora abre una ventana modal sobre el tablero, sin salir del pipeline.' },
    ],
  },
  {
    version: '1.5.0',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'nuevo', texto: 'Pipeline tipo kanban: columnas por etapa con tarjetas compactas y arrastrar y soltar para cambiar de etapa.' },
      { tipo: 'nuevo', texto: 'Objetivos generales: definir metas para todos los vendedores de una sola vez.' },
      { tipo: 'nuevo', texto: 'Gráficas por vendedor en Metas: evolución diaria, semanal y mensual de toques, reuniones y MRR.' },
      { tipo: 'nuevo', texto: 'Reportes semanales y mensuales (período actual o anteriores) con exportación a CSV.' },
      { tipo: 'mejora', texto: 'Al soltar un deal en Perdido se abre la ficha para cargar el motivo; al reabrir un deal cerrado se limpia la fecha de cierre.' },
    ],
  },
  {
    version: '1.4.0',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'nuevo', texto: 'Sección Metas con objetivos semanales y mensuales por vendedor (toques, reuniones, deals ganados y MRR) y barras de progreso en tiempo real.' },
      { tipo: 'nuevo', texto: 'Ranking del equipo por semana o mes, ordenado por MRR ganado, con cumplimiento del objetivo.' },
    ],
  },
  {
    version: '1.3.0',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'nuevo', texto: 'Historial por deal: cada creación, cambio de etapa y edición queda registrada con autor, detalle y fecha/hora.' },
      { tipo: 'nuevo', texto: 'Notificaciones para administradores: campanita con contador de no leídas; avisa cuando se crea un deal o cambia de etapa.' },
    ],
  },
  {
    version: '1.2.0',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'nuevo', texto: 'Sección Docs con la documentación de uso de todo el sistema.' },
      { tipo: 'nuevo', texto: 'Changelog con el historial de versiones.' },
    ],
  },
  {
    version: '1.1.1',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'mejora', texto: 'Se quitaron todos los emojis de la interfaz para un look más sobrio.' },
    ],
  },
  {
    version: '1.1.0',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'nuevo', texto: 'Rediseño C4D: paleta azul marino corporativa, logo y marca Cloud For Deploy, íconos SVG en la navegación.' },
      { tipo: 'mejora', texto: 'Barras del funnel con el valor dentro de la barra cuando hay lugar.' },
      { tipo: 'mejora', texto: 'Sombras y estados hover en tarjetas, botones, tablas y formularios.' },
      { tipo: 'fix', texto: 'Deploy con Docker en Windows: se agregó .dockerignore para no pisar las dependencias de Linux.' },
    ],
  },
  {
    version: '1.0.0',
    fecha: '2026-08-12',
    cambios: [
      { tipo: 'nuevo', texto: 'Lanzamiento inicial: pipeline de deals por etapa con MRR, decisor, origen y próximo paso.' },
      { tipo: 'nuevo', texto: 'Registro de actividad diaria por vendedor (contactos, toques, reuniones).' },
      { tipo: 'nuevo', texto: 'Dashboard de KPIs para administración: funnel, MRR en juego, win rate, motivos de pérdida, alertas y tabla por vendedor.' },
      { tipo: 'nuevo', texto: 'Usuarios con roles (admin y vendedor), gestión de equipo y cambio de contraseña.' },
    ],
  },
];
