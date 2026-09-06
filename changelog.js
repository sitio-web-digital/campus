// Historial de versiones del sistema. Agregar la versión nueva AL PRINCIPIO del array.
// Tipos de cambio: 'nuevo' | 'mejora' | 'fix'
module.exports = [
  {
    version: '2.46.1',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'mejora', texto: 'Ahora se puede agendar directo desde el calendario: al tocar un hueco libre, el modal deja elegir la lead de Cloud For Deploy (los admins ven todas las abiertas; cada vendedor las suyas), la modalidad, y Agendar. Entrar desde la ficha sigue funcionando igual, con la lead ya elegida.' },
    ],
  },
  {
    version: '2.46.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'nuevo', texto: 'La agenda ahora tiene tres vistas como Google Calendar: Día (una columna con carriles anchos), Semana y Mes (grilla mensual con las reuniones como pastillas de color; tocás un día y te lleva a su vista Día). Con el título del período y navegación ‹ Hoy › en cada vista.' },
      { tipo: 'mejora', texto: 'El calendario ocupa toda la página con UN solo scroll (se acabó el doble scroll): la cabecera de los días queda pegada arriba mientras bajás, y al entrar te posiciona solo en la primera hora con disponibilidad.' },
    ],
  },
  {
    version: '2.45.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'mejora', texto: 'La agenda ahora es un calendario estilo Google: grilla de 00 a 24 hs con líneas por hora, los 7 días de la semana, la disponibilidad de cada admin como carril de su color, la línea roja de "ahora" en el día de hoy y las reuniones como bloques posicionados a su hora.' },
      { tipo: 'nuevo', texto: 'Al tocar un hueco libre se abre una ventana modal con el detalle (con quién, día y hora), la modalidad y el botón Agendar; al tocar una reunión, su modal con todos los datos, link a la lead y cancelar. En celular la grilla se desplaza horizontal como cualquier calendario.' },
    ],
  },
  {
    version: '2.44.1',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'fix', texto: 'La agenda ya no da por sentada la disponibilidad de nadie: cada admin aparece en el calendario recién cuando carga sus propios horarios en "Mi disponibilidad". Se limpiaron las franjas que se habían clonado automáticamente — cada administrador tiene que cargar la suya una vez.' },
    ],
  },
  {
    version: '2.44.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'mejora', texto: 'Agenda multi-admin: cada administrador carga SU disponibilidad ("Mi disponibilidad" al pie de la agenda) y aparece en el calendario con su color y su nombre. Al agendar, el vendedor elige con quién tocando el horario libre de esa persona; dos admins pueden tener reuniones a la misma hora sin pisarse.' },
      { tipo: 'mejora', texto: 'Calendario más prolijo y profesional: leyenda con foto y color de cada admin, columnas por día con cabecera y marca de HOY, tarjetas de reunión con empresa, vendedor, modalidad y con quién es. La tarjeta del pipeline y la ficha también muestran con qué admin quedó la reunión.' },
    ],
  },
  {
    version: '2.43.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'nuevo', texto: 'Agenda de reuniones para Cloud For Deploy ("Agenda" en la barra): calendario semanal con los turnos disponibles del equipo admin. Desde la ficha de una lead, "Agendar reunión" abre la agenda, elegís modalidad (Meet / presencial / en la oficina) y tocás un turno libre — queda reservado, con nota en el historial de la lead y aviso a los admins.' },
      { tipo: 'nuevo', texto: 'Las leads de CFD en etapa "Reunión agendada" sin turno quedan marcadas en la tarjeta y en la ficha ("Sin reunión agendada — agendar"); con turno muestran fecha y hora. Nadie puede pisar un turno ocupado, se pueden cancelar (dueño o admin) y la disponibilidad (días, franja horaria y duración del turno) se configura al pie de la agenda.' },
    ],
  },
  {
    version: '2.42.1',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'mejora', texto: 'Panel de Clientes remaquetado: tarjetas limpias por prospecto con todos los datos ordenados (dirección, teléfono con WhatsApp y llamar, presencia web, valoración y reseñas, rubro/zona, link a Maps, fecha de carga y quién la tomó), casi sin iconos y totalmente responsive en celular.' },
    ],
  },
  {
    version: '2.42.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'mejora', texto: 'Prospectos con más inteligencia: se etiqueta si su "web" es en realidad Facebook, Instagram o Linktree; los que no tienen nada muestran "⚡ SIN WEB — oportunidad" en verde (el candidato ideal), y hay filtro por presencia web (sin web / solo redes / con web propia).' },
      { tipo: 'mejora', texto: 'Estado del negocio según Google: los que cerraron definitivamente ni se cargan, y los cerrados temporalmente aparecen marcados. Las búsquedas quedan guardadas y compartidas para que todo el equipo vaya tomando.' },
    ],
  },
  {
    version: '2.41.1',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'mejora', texto: 'El Panel de Clientes muestra cuánto del cupo gratuito mensual de Google llevás usado: barra con las búsquedas del mes contra las ~5.000 gratis, contando las llamadas reales de cada escaneo.' },
    ],
  },
  {
    version: '2.41.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'nuevo', texto: 'Panel de Clientes — el generador de prospectos: el admin lanza un escaneo de Google Maps por rubro y zona (API oficial de Google Places) y el sistema carga los prospectos con nombre, dirección, teléfono con link a WhatsApp, sitio web y estrellas, sin duplicar entre escaneos.' },
      { tipo: 'nuevo', texto: 'Cada vendedor puede TOMAR un prospecto eligiendo en el momento a qué panel comercial va: nace como lead suya (primera etapa, teléfono, origen "Prospección Google Maps" y una nota con todos los datos) y el prospecto queda en rojo con quién lo tomó y cuándo. Se pueden descartar los que no sirven y el admin puede liberar tomados. Permiso nuevo "Panel de Clientes" por usuario.' },
      { tipo: 'mejora', texto: 'MiniJuan por ahora atiende solo en el panel de Cloud For Deploy.' },
    ],
  },
  {
    version: '2.40.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'nuevo', texto: 'Cuando MiniJuan cotiza (o detecta algo que debe cotizar Juan), debajo de la respuesta aparece el botón "💬 ¿Querés comentarle el presupuesto a Juan?" que abre WhatsApp con el resumen de la cotización ya escrito, listo para mandar.' },
      { tipo: 'nuevo', texto: 'Extras sobre una web de la lista (un módulo puntual, superar un tope de fotos): MiniJuan los cotiza él mismo con criterio, estimando horas de desarrollo × tarifa en USD (configurable en Preferencias, default 25), aclarando que es estimado y sujeto a confirmación de Juan. Los sistemas a medida completos siguen yendo directo a Juan sin números.' },
    ],
  },
  {
    version: '2.39.1',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'mejora', texto: 'MiniJuan maneja la lista de precios oficial (Web Básica/Media/Pro y Ecommerce Básico/Medio/Pro con sus mantenimientos): cotiza exacto lo que está en lista, y todo lo que la excede — o cualquier sistema a medida — lo deriva directo a hablar con Juan, sin inventar números.' },
    ],
  },
  {
    version: '2.39.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'nuevo', texto: 'MiniJuan modo NEGOCIO (solo admins, link "IA Negocio" en la barra de los paneles): preguntale por los datos reales del negocio — "¿cuántas leads vamos hoy?", "¿cómo viene tal vendedor?" — y consulta la base del CRM en modo solo-lectura antes de responder, con memoria de charla, ejemplos listos y detalle de cuántas consultas hizo y tokens usó.' },
      { tipo: 'nuevo', texto: 'Límites para admins en el panel de la IA: tope de consultas por día (general e individual, editable en la misma tabla de uso) y tope mensual de tokens por admin. Las charlas del modo negocio quedan en Conversaciones marcadas con 📊.' },
    ],
  },
  {
    version: '2.38.0',
    fecha: '2026-09-06',
    cambios: [
      { tipo: 'nuevo', texto: 'Botón "Nueva charla" en el chat de MiniJuan (el lápiz de la cabecera): limpia el chat y arranca de cero. Además MiniJuan ahora tiene memoria dentro de cada charla — se acuerda de lo que venían hablando y podés repreguntarle; la charla nueva corta esa memoria. Para el admin, todas las charlas siguen guardadas.' },
      { tipo: 'mejora', texto: 'Avatar renovado: MiniJuan ahora es un asesor profesional con auricular de headset, fondo con degradado, peinado prolijo con brillo, ojos con reflejo y rubor — y animación de reposo más fina (flota respirando y se sacude cada tanto).' },
    ],
  },
  {
    version: '2.37.3',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'mejora', texto: 'Conversaciones con MiniJuan, ahora como índice cómodo: elegís el día y ves un bloque por persona con cada charla como renglón (hora + título del tema + lead si la hubo); tocás el título y se despliega la charla completa. Se acabó el scrollear todo para encontrar una.' },
    ],
  },
  {
    version: '2.37.2',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'mejora', texto: 'La tabla de uso de MiniJuan ahora también mide a los administradores: sus consultas y tokens del mes aparecen persona por persona (marcados como admin, sin tope diario). La página de Conversaciones ya los incluía.' },
    ],
  },
  {
    version: '2.37.1',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'mejora', texto: 'MiniJuan minimizado tiene vida propia: parpadea, se sacude cada tanto y de vez en cuando suelta una burbujita invitando a preguntar ("¿Tenés dudas para mí? 🙋", entre otras frases) con una sacudida — desaparece sola a los segundos y nunca interrumpe si el chat está abierto o la pestaña en segundo plano.' },
    ],
  },
  {
    version: '2.37.0',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'nuevo', texto: 'Panel de MiniJuan con la plata a la vista: gasto del mes, gastado total y crédito restante en USD con barra de saldo — cargás una vez cuánto crédito pusiste en Anthropic y el sistema descuenta solo, valuando cada consulta según el modelo con que se hizo.' },
      { tipo: 'nuevo', texto: 'Nueva página "Conversaciones con MiniJuan": todas las charlas de los vendedores guardadas y navegables por día y por vendedor, con la lead sobre la que preguntaron y sus tokens — para analizar qué consultan y detectar qué reforzar en el Campus.' },
      { tipo: 'mejora', texto: 'La configuración de límites por vendedor ahora es una tabla prolija: vendedor, barra de uso de hoy (X/tope), consumo del mes y límite propio, alineado y apilable en celular.' },
      { tipo: 'mejora', texto: 'MiniJuan enfocado: experto en VENDER páginas web, ecommerce y sistemas a medida (y dudas de clientes sobre eso). Cualquier pregunta fuera de esos temas la rechaza directamente. Y responde más corto: 3 a 6 líneas salvo que le pidas detalle.' },
    ],
  },
  {
    version: '2.36.3',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'mejora', texto: 'Las respuestas de MiniJuan aparecen de arriba hacia abajo, palabra por palabra (efecto máquina de escribir, como ChatGPT), con la boca del muñeco moviéndose mientras "habla" y el chat siguiéndolo solo. Cada burbuja entra con un fundido suave.' },
    ],
  },
  {
    version: '2.36.2',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'mejora', texto: 'MiniJuan usa por defecto Claude Haiku 4.5, el modelo más económico de Anthropic (~medio centavo de dólar por consulta). El modelo se puede subir cuando quieras desde Administración → Preferencias.' },
    ],
  },
  {
    version: '2.36.1',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'mejora', texto: 'MiniJuan cobró vida: mientras procesa aparece la burbuja de "escribiendo" con puntitos, el muñeco se mece pensando (mira para arriba y frunce la boca) y mueve la boca cuando responde. Siempre arranca minimizado — solo la cara — y la primera vez te saluda con un globito y un saltito en vez de abrirse solo.' },
      { tipo: 'mejora', texto: 'Chat más lindo y responsive: cabecera con degradado, burbujas redondeadas (las tuyas en verde), botón de enviar circular, campo que crece al escribir y, en celular, ocupa la pantalla como una app de mensajería.' },
    ],
  },
  {
    version: '2.36.0',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'nuevo', texto: 'El asesor ahora es MiniJuan 👱: una burbuja flotante abajo a la derecha de los paneles comerciales, con su carita y todo. La tocás y se abre el chat para preguntarle lo que quieras sin salir de donde estás; tus charlas quedan guardadas y las retoma al abrir. La primera vez se presenta solo.' },
      { tipo: 'nuevo', texto: 'Desde la ficha de una lead, "Preguntale a MiniJuan" abre el chat ya sabiendo de qué cliente hablás. Y en Administración → Preferencias: barra de uso por vendedor (hoy vs su tope, consultas y tokens del mes) y límite diario propio por vendedor (vacío = usa el general).' },
    ],
  },
  {
    version: '2.35.0',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'nuevo', texto: 'Asesor IA para el equipo comercial (/asesor, también en la barra de cada panel): un experto en desarrollo web y software a medida que ayuda a responder mensajes de clientes, explicar temas técnicos y manejar objeciones. Desde la ficha de una lead, "Pedirle ayuda al Asesor" le pasa el contexto real (empresa, etapa, valor, últimas notas) para respuestas a medida.' },
      { tipo: 'nuevo', texto: 'Control total desde Administración → Preferencias: activarlo/desactivarlo, tope de consultas por vendedor por día (default 20), modelo de IA a usar (con su costo), y el "manual" de la empresa que el asesor sigue (precios orientativos, qué prometemos y qué no). Con consultas de hoy, del mes, gasto estimado en USD y el log de las últimas consultas del equipo.' },
      { tipo: 'mejora', texto: 'El asesor nunca inventa precios ni plazos: si el dato no está en el manual, le dice al vendedor qué confirmar con administración. Cada consulta queda registrada con sus tokens.' },
    ],
  },
  {
    version: '2.34.1',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'fix', texto: 'Los avisos de administración largos ya no se cortan: la ventana modal tiene scroll interno y respeta los saltos de línea y viñetas del mensaje tal como los escribiste.' },
    ],
  },
  {
    version: '2.34.0',
    fecha: '2026-09-04',
    cambios: [
      { tipo: 'nuevo', texto: 'Nueva página "Contactos" en cada panel comercial (admin): cuántas leads nuevas cargó y cuántos recontactos hizo cada vendedor hoy — un recontacto es una lead que ya existía y ese día volvió a trabajarse (nota, edición o cambio de etapa). Navegable por fecha (día anterior / siguiente / calendario) y con tabla de los últimos 14 días por vendedor, clickeable para ver cualquier día en detalle.' },
    ],
  },
  {
    version: '2.33.0',
    fecha: '2026-08-28',
    cambios: [
      { tipo: 'nuevo', texto: 'Panel de Developers: cada venta de software ganada y APROBADA en Comercial Cloud For Deploy se convierte sola en un proyecto (las ya ganadas entran automáticamente al desplegar). Tablero estilo pipeline con etapas Por iniciar → En desarrollo → En revisión → Entregado, arrastrando tarjetas como en el comercial.' },
      { tipo: 'nuevo', texto: 'Cada proyecto muestra los datos del cliente (contacto, teléfono, valor, ubicación, calificación), permite asignar un developer y dejar notas. Avisos: a los devs cuando entra un proyecto o se los asigna, y al vendedor y admins cuando se entrega.' },
      { tipo: 'mejora', texto: 'El permiso "Panel de Developers" se asigna desde la ficha del usuario; con el permiso, la card del inicio y el menú dejan de decir "Próximamente".' },
    ],
  },
  {
    version: '2.32.1',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'mejora', texto: 'La estrella de las leads ahora es chiquita, en contorno (sin relleno) y aparece solo al pasar el mouse por la tarjeta; si la lead está destacada queda siempre visible en dorado. En celular se ve siempre.' },
    ],
  },
  {
    version: '2.32.0',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'nuevo', texto: 'Estrella en las leads: tocá la ★ de la tarjeta (o del título de la ficha) para destacar una lead importante a cerrar o a la que hay que darle mejor seguimiento. La tarjeta se remarca en dorado y sube primera en su columna. La marcan el dueño de la lead o un admin; los demás la ven destacada.' },
    ],
  },
  {
    version: '2.31.0',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'nuevo', texto: 'Menciones con @ en las notas de una lead: escribí @ y aparece la lista de personas del panel con su foto y nombre — elegís con flechas + Enter o con el mouse. Al guardar, cada persona mencionada recibe una notificación con la nota y el link a la lead.' },
      { tipo: 'mejora', texto: 'Solo se puede mencionar (y solo se resalta) a quienes pertenecen a ese panel comercial. Las @menciones quedan resaltadas en el historial de la lead. Si mencionás al dueño de la lead, le llega un único aviso (no el de "modificó tu lead" además).' },
    ],
  },
  {
    version: '2.30.1',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'mejora', texto: 'Cuando otra persona (un admin o un compañero) toca una lead tuya, la notificación ahora cuenta exactamente qué cambió: la nota completa que te dejó, cada campo editado y/o el cambio de etapa, con la foto de quien lo hizo.' },
      { tipo: 'nuevo', texto: 'Si alguien crea una lead a tu nombre te avisa ("Te asignó la lead…", con la nota si la hay); y si te reasignan una lead a otra persona, se les avisa a los dos.' },
    ],
  },
  {
    version: '2.30.0',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'nuevo', texto: 'Administración → ficha de usuario: nueva sección "Actividad por panel". Por cada panel comercial al que tiene acceso, el admin ve si cargó hoy, los días pendientes, cuántos días cargó de los últimos 30, la última carga, sus leads abiertas y ventas del mes, los totales de cada campo de los últimos 30 días y la grilla estilo GitHub (verde / amarillo a tiempo / rojo vencido), con acceso directo a su actividad.' },
    ],
  },
  {
    version: '2.29.1',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'mejora', texto: 'El menú de sistemas ya no se sale de la pantalla en computadora: ahora es un panel ancho a dos columnas — Paneles y herramientas a la izquierda, Sitios del grupo en una grilla a la derecha — con scroll interno si hiciera falta. En celular sigue en una columna.' },
    ],
  },
  {
    version: '2.29.0',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'nuevo', texto: 'Stock (stock.cloudfordeploy.com), nuestro sistema de gestión de stock, ya está en el inicio del Campus y en el menú de sistemas para todos los usuarios.' },
      { tipo: 'mejora', texto: 'Cada sistema nuevo que se suma al Campus aparece primero y con un cartel "Nuevo" durante sus primeros 30 días, tanto en el inicio como en el menú.' },
    ],
  },
  {
    version: '2.28.0',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'nuevo', texto: 'Editor de fórmulas en Config → Campos de la carga diaria: al crear un campo, tildá "Agregar fórmula" y escribila con variables entre llaves, ej: ({Seguimientos} + {Presupuestos enviados}) / {Llamadas realizadas} * 100. Soporta + - * /, paréntesis y números.' },
      { tipo: 'nuevo', texto: 'Autocompletado de campos al escribir "{" (o tocando los campos listados), validación en vivo (✓ / ✗ con el motivo) y bloqueo del guardado si la fórmula está mal. Las fórmulas pueden usar otros campos calculados; se rechazan las que se referencian a sí mismas.' },
      { tipo: 'mejora', texto: 'La fórmula de un campo calculado se edita en la misma lista. Un campo usado en una fórmula no se puede borrar hasta corregirla. Las fórmulas se guardan por id, así renombrar un campo no las rompe.' },
    ],
  },
  {
    version: '2.27.0',
    fecha: '2026-08-25',
    cambios: [
      { tipo: 'nuevo', texto: 'Campos calculados en Config → Campos de la carga diaria: creá un campo que sea la suma de otros (ej: "Leads tocadas en el día" = todo menos Publicaciones en MKP). No se carga a mano: se calcula solo y aparece marcado con Σ en la actividad, el dashboard, el ranking y los objetivos.' },
      { tipo: 'mejora', texto: 'Si borrás un campo que forma parte de una suma, sale de la fórmula automáticamente (y si la suma queda con un solo campo, se elimina).' },
    ],
  },
  {
    version: '2.26.2',
    fecha: '2026-08-24',
    cambios: [
      { tipo: 'mejora', texto: 'Se retiró "Próximo paso" de las leads: ya no aparece el cartel en la tarjeta del pipeline ("Sin próximo paso" / "Vencido"), ni los campos en la ficha, ni la alerta del dashboard. El seguimiento vive en las notas y en el reloj de actividad.' },
    ],
  },
  {
    version: '2.26.1',
    fecha: '2026-08-24',
    cambios: [
      { tipo: 'fix', texto: 'Config de paneles: las flechas ↑↓ para reordenar etapas del pipeline no funcionaban en paneles donde se habían borrado etapas (Góndolas). Ahora se mueve por posición y de paso se renumera el orden.' },
    ],
  },
  {
    version: '2.26.0',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'mejora', texto: 'La constancia de carga ahora se mide desde el día en que a cada usuario se le asignó el panel (no desde el alta de la cuenta): la grilla, los chips de días pendientes, las deudas del inicio y los recordatorios arrancan recién ahí. Si se quita y se vuelve a dar un panel, el contador arranca de cero.' },
      { tipo: 'fix', texto: 'La grilla ya no puede dibujar una celda fantasma de "mañana" en rojo entre las 21:00 y la medianoche (la fecha de hoy se calcula en hora argentina, no UTC).' },
    ],
  },
  {
    version: '2.25.2',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'mejora', texto: 'Grilla de actividad: los días sin cargar ahora se pintan en amarillo si todavía se pueden cargar (dentro de la ventana retroactiva) y en rojo si ya vencieron. Solo cuenta desde el alta de cada usuario, y la vista de todo el equipo queda como estaba.' },
    ],
  },
  {
    version: '2.25.1',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'mejora', texto: 'Administración: el formulario de crear usuario ahora es una ventana modal detrás del botón "+ Crear usuario". Si el email ya existe, el modal se reabre con el aviso en vez de fallar en silencio.' },
    ],
  },
  {
    version: '2.25.0',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'nuevo', texto: 'Tu foto (arriba a la derecha) ya no navega: despliega una burbuja con tu cuenta, Configuración, Soporte y Cerrar sesión.' },
      { tipo: 'nuevo', texto: 'Canal de soporte: abrí tickets con asunto, descripción y capturas de pantalla; el equipo responde en un hilo tipo chat, con estados Abierto/Resuelto y notificaciones cruzadas (a los admins cuando escribís, a vos cuando te responden). Si escribís en un ticket resuelto, se reabre solo.' },
      { tipo: 'mejora', texto: 'La página Perfil ahora se llama Configuración (foto de perfil y contraseña); los menús desplegables se cierran al tocar fuera.' },
    ],
  },
  {
    version: '2.24.1',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'nuevo', texto: 'Recordatorio de carga diaria: si ayer quedó sin cargar la actividad, te llega una notificación por panel (a partir de las 9 de la mañana) con un link que abre directo la carga de ese día. Un solo aviso por día y por panel.' },
    ],
  },
  {
    version: '2.24.0',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'nuevo', texto: 'El inicio ahora te adelanta qué te espera en cada panel: leads abiertas, días de actividad sin cargar, leads liberadas y estado de tus comisiones — con chips rojos titilando y el ícono de la card en rojo cuando hay deudas.' },
      { tipo: 'nuevo', texto: 'El menú superior de paneles muestra info al costado de cada uno (leads abiertas, liberadas, plata pendiente en Cobranza) y un punto rojo en los paneles donde tenés deudas.' },
      { tipo: 'mejora', texto: 'Admin: la card de Cobranza muestra el total por pagar, a cuántos vendedores y cuánto ya está exigible; las cards comerciales muestran las leads abiertas del equipo y las liberadas sin tomar.' },
    ],
  },
  {
    version: '2.23.5',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'mejora', texto: 'Señales de deuda para el vendedor: los chips de días sin cargar titilan en rojo como las leads liberadas, y los íconos de Pipeline y Actividad de la barra brillan cuando hay deudas según las reglas de Config (días de actividad sin cargar / leads propias vencidas por inactividad).' },
    ],
  },
  {
    version: '2.23.4',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'fix', texto: 'Actividad: encabezado remaquetado (título en su lugar, barra de acciones aparte), la fecha a cargar se elige con un selector dentro de la ventana modal, y si el día elegido ya tiene carga aparece una advertencia clara antes de sobreescribir (el botón pasa a decir Actualizar el día).' },
    ],
  },
  {
    version: '2.23.3',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'mejora', texto: 'Pantalla de Actividad rediseñada alrededor de la carga en modal: si te faltan días aparece un aviso con cada día pendiente como botón (lo tocás y la modal se abre en esa fecha), el selector de días vive dentro de la modal, y la página queda limpia con la grilla de constancia y el historial.' },
    ],
  },
  {
    version: '2.23.2',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'mejora', texto: 'El reloj de inactividad de las leads ahora cuenta el trabajo real, no solo la etapa: agregar una nota o editar la ficha también reinicia el contador (guardar sin cambiar nada, no). Si llamaste al cliente y lo anotaste, la lead no se libera.' },
    ],
  },
  {
    version: '2.23.1',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'mejora', texto: 'Los días de carga retroactiva de actividad ahora se definen en la Config de cada panel (0 a 30; antes eran 3 fijos). Las pestañas de días, el texto de ayuda, el recordatorio al entrar y la validación del servidor se ajustan solos.' },
    ],
  },
  {
    version: '2.23.0',
    fecha: '2026-08-22',
    cambios: [
      { tipo: 'nuevo', texto: 'Grilla de constancia estilo GitHub en Actividad: cada cuadrado es un día de los últimos 6 meses — gris sin carga, más verde cuanto más se cargó. El vendedor ve la suya; el admin filtra por vendedor o ve la del equipo completo con "— Todo el equipo —".' },
      { tipo: 'mejora', texto: 'La carga de actividad diaria y los objetivos generales del equipo ahora se hacen en ventanas modales prolijas (como la ficha de las leads): botón "Cargar el día" / "Definir objetivos generales" y el formulario aparece encima, sin ocupar la pantalla.' },
    ],
  },
  {
    version: '2.22.1',
    fecha: '2026-08-21',
    cambios: [
      { tipo: 'mejora', texto: 'Leads liberadas más sutiles: borde fino y un punto rojo que late suave en la tarjeta (chau titileo); el botón "Tomar lead" ahora vive dentro de la ficha, con el contexto completo antes de tomar.' },
      { tipo: 'nuevo', texto: 'Avisos de vencimiento al dueño de la lead: una notificación a la mitad del tiempo configurado sin movimiento y otra una hora antes de que se libere. Un solo aviso por período — si movés la lead, el reloj y los avisos arrancan de cero.' },
    ],
  },
  {
    version: '2.22.0',
    fecha: '2026-08-21',
    cambios: [
      { tipo: 'nuevo', texto: 'Calificación del cliente en las leads (Calificado / Descalificado / Cliente / Cliente de Alto Valor): obligatoria para aprobar una venta Ganada, junto al valor. El admin puede exportar el directorio de clientes por panel (CSV clientes en el Dashboard) con teléfono y calificación.' },
      { tipo: 'nuevo', texto: 'Toma de leads inactivas, configurable por panel en Config: se activa con una cantidad de horas sin cambio de etapa. Las leads que pasan ese tiempo titilan en rojo en el pipeline y cualquier vendedor puede tomarlas; el dueño anterior recibe notificación y el contador arranca de cero. Si dos van por la misma, el que llega tarde ve quién se la llevó.' },
      { tipo: 'nuevo', texto: 'Traspaso voluntario: el vendedor puede pasarle su lead a un compañero desde la ficha (con notificación e historial). Además, cada lead muestra hace cuánto no se mueve de etapa (en la tarjeta y la ficha) y su promedio de tiempo entre cambios de etapa.' },
    ],
  },
  {
    version: '2.21.0',
    fecha: '2026-08-20',
    cambios: [
      { tipo: 'nuevo', texto: 'Encuestas al equipo: se arman en Administración → Comunicación (pregunta + 2 a 5 opciones) y le aparecen a todos como ventana al entrar, hasta que voten (con opción "Más tarde" para la sesión). Un voto por persona.' },
      { tipo: 'nuevo', texto: 'Resultados en vivo para el admin: barras con conteo y porcentaje por opción, quién votó qué (con foto y hora), la lista de quiénes faltan votar, y el botón para cerrar o reabrir la encuesta.' },
    ],
  },
  {
    version: '2.20.0',
    fecha: '2026-08-19',
    cambios: [
      { tipo: 'nuevo', texto: 'Las leads ahora tienen campo de teléfono, en todos los paneles. También entra en la búsqueda del pipeline y los cambios quedan en el historial.' },
      { tipo: 'nuevo', texto: 'Migración de leads entre paneles comerciales (solo admin, desde la ficha): viajan los datos comunes (empresa, vendedor, teléfono, contacto, valor, ubicación, historial completo) y un cartel advierte qué se pierde — la campaña, y la etapa si no existe igual en el destino pasa a la primera. El vendedor recibe notificación y todo queda en el historial. Ganado aprobado no se migra.' },
    ],
  },
  {
    version: '2.19.0',
    fecha: '2026-08-18',
    cambios: [
      { tipo: 'nuevo', texto: 'El campus ahora se organiza en cursos: entrás a un curso y adentro están sus videos y documentos en orden, con la barra de progreso de cada uno. Todo el contenido existente pasó al curso "Cloud for deploy basico".' },
      { tipo: 'nuevo', texto: 'Quiz por contenido: el admin arma preguntas de opción múltiple en cada video o PDF, y el vendedor necesita 70% para aprobar — sin quiz aprobado, el siguiente contenido del curso no se desbloquea. Intentos ilimitados; cuenta el mejor.' },
      { tipo: 'mejora', texto: 'Las estadísticas suman los quizzes: nota de cada vendedor por contenido, quizzes aprobados en el ranking y en las tarjetas del resumen.' },
    ],
  },
  {
    version: '2.18.0',
    fecha: '2026-08-18',
    cambios: [
      { tipo: 'nuevo', texto: 'El campus ahora es un curso secuencial: el admin ordena los contenidos con flechas (el número de cada tarjeta marca la secuencia) y los vendedores desbloquean cada uno al completar el anterior — videos subidos exigen el 80% reproducido de verdad; YouTube, documentos y enlaces se completan al abrirlos.' },
      { tipo: 'nuevo', texto: 'Las tarjetas bloqueadas muestran candado y qué contenido falta completar; el vendedor ve el chip verde Completado en lo que ya terminó. El bloqueo también se valida en el servidor (no se puede saltear por URL).' },
    ],
  },
  {
    version: '2.17.2',
    fecha: '2026-08-18',
    cambios: [
      { tipo: 'mejora', texto: 'Los documentos del campus ahora tienen miniatura propia: portada de color según el tipo (PDF rojo, Word azul, Excel verde, PPT naranja, enlaces en verde petróleo) con su ícono, las imágenes muestran su vista previa, el botón quedó limpio ("Abrir documento") y el nombre del archivo va aparte, recortado con puntos suspensivos.' },
    ],
  },
  {
    version: '2.17.1',
    fecha: '2026-08-18',
    cambios: [
      { tipo: 'nuevo', texto: 'Validación de video completo: un video subido cuenta como "Completado" cuando el vendedor reprodujo de verdad al menos el 80% (adelantar la barra no suma). En Estadísticas aparece el chip verde "Completado", la columna "Videos completados" en el ranking, los minutos reales vistos por persona, y el chip "Saltó al final" si llegó al final sin mirarlo.' },
      { tipo: 'mejora', texto: 'Estadísticas ahora es una opción propia de la barra del Campus, junto a Contenido y Sistema — visible solo para administradores.' },
    ],
  },
  {
    version: '2.17.0',
    fecha: '2026-08-18',
    cambios: [
      { tipo: 'nuevo', texto: 'Estadísticas de aprendizaje en el Campus (solo admin): quién vio cada video y documento, hasta qué minuto llegó en los videos subidos (con barra de progreso), ranking del equipo por horas de video y última actividad de cada uno.' },
      { tipo: 'mejora', texto: 'Los videos de YouTube/Vimeo muestran la miniatura con botón de play y cargan el reproductor al tocar (la página vuela y la reproducción queda registrada). El formulario de subida ahora está detrás del botón "+ Subir contenido".' },
      { tipo: 'fix', texto: 'Se arregló la tarjeta del campus que mostraba un rectángulo negro con "Video" debajo de la miniatura (conflicto de clases entre la etiqueta y el reproductor).' },
    ],
  },
  {
    version: '2.16.1',
    fecha: '2026-08-18',
    cambios: [
      { tipo: 'mejora', texto: 'Notificaciones más profesionales: cada una muestra la foto y el nombre de quien la generó (o "Campus C4D" si es del sistema), con la hora a la derecha y el mensaje abajo — en la campanita y en la página de notificaciones.' },
      { tipo: 'mejora', texto: 'Los textos de las notificaciones se reescribieron en formato claro ("Movió tu lead…", "Aprobó tu venta…", "Creó el deal…"): el nombre ya no se repite dentro del mensaje.' },
    ],
  },
  {
    version: '2.16.0',
    fecha: '2026-08-18',
    cambios: [
      { tipo: 'nuevo', texto: 'Campus de formación: panel nuevo estilo Udemy — elegís la empresa (General, CFD, Góndolas, Estanterías, SitioWeb) y ves los videos y documentos de capacitación. Los administradores publican links de YouTube/Vimeo (quedan embebidos) o suben archivos (video, PDF, imagen, Office hasta 512 MB).' },
      { tipo: 'mejora', texto: 'La sección Docs salió de la navegación del panel comercial: ahora vive en el Campus de formación, pestaña "Sistema" (junto al Changelog y el manual). "Panel de Cursos — Próximamente" pasó a ser el Campus real en el menú y el inicio.' },
    ],
  },
  {
    version: '2.15.2',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Fotos de perfil: cada usuario puede subir la suya en Mi perfil (JPG/PNG/WebP hasta 3 MB). La foto aparece arriba a la derecha junto a tu nombre, en la lista de usuarios de Administración y en la ficha; quien no tiene foto muestra sus iniciales.' },
      { tipo: 'mejora', texto: 'El interruptor de tema ahora es un ícono sol/luna en la propia barra superior, junto a la campanita (chau píldora flotante que tapaba contenido).' },
    ],
  },
  {
    version: '2.15.1',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'fix', texto: 'El rediseño ahora arranca en modo oscuro como la maqueta original, con el interruptor Claro / Oscuro (arriba a la derecha) que recuerda tu elección en cada dispositivo. El login se mantiene claro en navy corporativo.' },
    ],
  },
  {
    version: '2.15.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Rediseño visual completo del Campus: nueva hoja de estilos en todas las pantallas — barra superior grafito, acento verde petróleo, tipografía IBM Plex, tarjetas y tablas renovadas. Misma estructura y funcionamiento de siempre.' },
      { tipo: 'mejora', texto: 'Las tipografías del rediseño se sirven desde el propio servidor (sin depender de internet).' },
    ],
  },
  {
    version: '2.14.1',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'mejora', texto: 'Panel Administración reorganizado en secciones: Usuarios (tabla del equipo y altas), Comunicación (avisos con quién los vio y alertas modales) y Preferencias (mis notificaciones).' },
      { tipo: 'mejora', texto: 'Mi perfil ahora es una página propia del Campus, fuera de la navegación del panel comercial.' },
    ],
  },
  {
    version: '2.14.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Al entrar después de una actualización, el sistema muestra una ventana con la versión nueva y sus cambios (como esta). Se cierra con "Entendido" y no vuelve a aparecer.' },
      { tipo: 'nuevo', texto: 'Alertas en ventana desde Administración: publicás un comunicado y le aparece a todo el equipo como modal al entrar, hasta que cada uno lo confirme. Podés ver quién lo vio y cuándo, y apagarla.' },
      { tipo: 'nuevo', texto: 'Los avisos manuales ahora muestran quién los vio: en Administración, cada aviso enviado lista sus destinatarios con visto/sin ver y la hora.' },
      { tipo: 'mejora', texto: 'Campañas: la carga quedó solo en Config (la vieja pestaña del dashboard redirige), y el dashboard sumó métricas de campañas y gráficas de torta de leads e ingresos por campaña.' },
    ],
  },
  {
    version: '2.13.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Dashboard y Reportes unificados en una sola sección por panel: elegís el período (día/semana/mes, actual o anteriores) y ves todo junto — métricas, gráficas, campañas, tabla por vendedor, cierres y alertas — con Descargar CSV y Exportar PDF del mismo período.' },
      { tipo: 'nuevo', texto: 'Gráficas nuevas: ingresos por vendedor y leads nuevas por provincia, junto al funnel, los motivos de pérdida (torta) y la curva de actividad diaria.' },
      { tipo: 'mejora', texto: 'Las campañas del dashboard ahora son del período elegido (leads creadas y cierres del rango). El CSV y el PDF incluyen campañas y provincias. Las URLs viejas de /reportes redirigen solas.' },
    ],
  },
  {
    version: '2.12.0',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Comercial Cloud For Deploy recreado sobre la misma base que Góndolas/Estanterías: ahora tiene Config propia (etapas del pipeline y campos de la carga diaria moldeables, campañas incluidas). Las columnas y todas las leads quedaron exactamente igual.' },
      { tipo: 'mejora', texto: 'La actividad diaria y los objetivos de CFD pasaron al sistema configurable (los datos históricos se migraron solos). Objetivos, ranking y las gráficas por vendedor ahora se arman con los campos que definas en Config.' },
      { tipo: 'mejora', texto: 'El Dashboard rico de CFD (funnel, motivos de pérdida, curva de actividad, alertas) y los Reportes con CSV/PDF se adaptan solos a las etapas y campos configurados. Las gráficas "Ver gráficas" ahora existen en todos los paneles.' },
      { tipo: 'mejora', texto: 'La ficha de deal de CFD conserva sus campos propios (tipo de venta y orígenes de software) y las comisiones siguen calculándose por tipo de venta, como siempre.' },
    ],
  },
  {
    version: '2.11.2',
    fecha: '2026-08-17',
    cambios: [
      { tipo: 'nuevo', texto: 'Comisión real de SitioWeb Digital: 80% del valor mensual durante los primeros 2 meses (una cuota por mes desde el cierre). La ficha de la lead ahora pide el "valor mensual de la suscripción".' },
      { tipo: 'mejora', texto: 'Las reglas por rubro en Cobranza → Reglas ahora aceptan % + meses: vacío es pago único al cierre (Góndolas, Estanterías); con meses, el % se cobra sobre el valor mensual esa cantidad de meses.' },
    ],
  },
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
