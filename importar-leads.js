// Importación de las leads históricas (planilla pre-sistema) a los paneles Góndolas y Estanterías Reforzadas.
// - Idempotente: si detecta una importación previa, no vuelve a cargar (correr con --force para repetirla igual).
// - Crea las etapas que falten en cada panel (Frío, Caliente, Seguimiento) respetando Ganado/Perdido fijas.
// - "Vendido" entra como Ganado: aprobado si trae valor; pendiente de aprobación si no lo trae (para completarlo).
// - No genera comisiones (ventas históricas): si las querés, aprobalas de nuevo desde la ficha o avisame.
// Ejecutar en el server: docker compose exec panel node importar-leads.js
const { db } = require('./db');

const FORCE = process.argv.includes('--force');

// Vendedor de la planilla → email del usuario en el campus.
const VENDEDORES = {
  ana: 'anadeliciafernandez1@gmail.com',
  leandro: 'leandroulrich9@gmail.com',
  celina: 'celinanunezcarabajal25@gmail.com',
  mateo: 'mateogabriel7468@gmail.com',
  romina: 'rominalpz14@gmail.com',
};

// Estado de la planilla → etapa del pipeline (Ganado/Perdido son las fijas del sistema).
const MAPA_ESTADOS = {
  'Vendido': 'Ganado',
  'Perdido': 'Perdido',
  '1º Contacto': 'Contactado',
  'Negociación': 'Negociación',
  'Seguimiento': 'Seguimiento',
  'Frío': 'Frío',
  'Caliente': 'Caliente',
};

// Columnas: estado|celular|ultimoContacto|empresa|valor|nombre|clasificacion|gestion|provincia|vendedor|apropiacion|primerContacto|fuente|url|notas
const RAW = `
Frío|54 9 2646 71-5044|15/8/2026|Góndola|230637|Exe|Calificado|Recuperación|Buenos Aires|Ana|6/8/2026|22/7/2026|WhatsApp||Exe no es decisor
Caliente|54 9 3804 88-8485|14/8/2026|ER||Vir|Calificado|Recuperación|La Rioja|Ana|6/8/2026|31/7/2026|WhatsApp||Contactarse en 15 días
Perdido|54 9 3873 60-3781|7/8/2026|ER||Delia|Calificado||Salta|Ana|6/8/2026||Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Si califica porque charló un poco pero la falta de asesoramiento y seguimiento correcto hicieron que no contestara a mi intento de recupero
Frío|54 9 388 420-3622|6/8/2026|ER|||Calificado|Recuperación|Jujuy|Ana|6/8/2026|26/6/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Debo contactarme en 30 días
Caliente|54 9 3875 37-2223|15/8/2026|ER||Andrés Pérez Iván|Calificado|Recuperación|Salta|Ana|5/8/2026|5/8/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|
Perdido|54 9 2216 47-4198|8/8/2026|Góndola|13500000|Armando|Calificado||Buenos Aires|Ana|6/8/2026||Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Compró en una tienda física de La Plata porque quería verlo presencialmente antes de comprar
Perdido|54 9 11 6949-5928|8/8/2026|Góndola||Francisca||||Ana|6/8/2026|||https://www.facebook.com/share/r/1DaFB9JYZY/|
Frío|54 9 11 5644-8660|11/8/2026|Góndola||Gladys|Calificado|Recuperación|Buenos Aires|Ana|6/8/2026|16/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Comunicarse en 30 días porque indica que primero colocarea el piso en el local y luego comprará las góndolas
Perdido|54 9 11 2826-3002|7/8/2026|Góndola||Miguel Castillo||||Ana|7/8/2026|||https://www.facebook.com/share/r/1DaFB9JYZY/|Mandarle 12/8
Caliente|54 9 364 446-8766|12/8/2026|Góndola||Matias|Calificado|Recuperación|Buenos Aires|Leandro|6/8/2026|6/8/2026|WhatsApp||hablarle el jueves 13/8
Perdido|5493854788727|7/8/2026|ER||Ret||Recuperación||Celina|6/8/2026|||https://www.facebook.com/story.php?story_fbid=1466303415539186&id=61578315714493|Hablarle el lunes 10/8
Perdido|5493854788727|6/8/2026|ER||||Recuperación|Santiago del Estero|Celina|6/8/2026||||Ya compró
Frío|5493814632057|14/8/2026|ER|2380800|||Recuperación||Celina|6/8/2026|||https://www.facebook.com/story.php?story_fbid=1466303415539186&id=61578315714493|Comunicarse en 30 días
Frío|5493865683684|7/8/2026|ER||Luis||Recuperación||Celina|6/8/2026|||https://www.facebook.com/story.php?story_fbid=1466303415539186&id=61578315714493|
Frío||12/8/2026|Góndola||Olga|No calificado|Recuperación|Buenos Aires|Leandro|6/8/2026|6/8/2026|WhatsApp||
Frío|54 9 11 5052-8141|15/8/2026|Góndola|3026885.88||Calificado|Recuperación|Buenos Aires|Ana|7/8/2026|15/7/2026|Ads|https://www.facebook.com/share/r/1EPe8S1Hek/|Si quería comprar pero no le hicieron seguimiento. Llamar a las 16
Perdido|2323614142|6/8/2026|Góndola||Patricia||||Mateo|6/8/2026||||
Perdido|3644700937|6/8/2026|Góndola||||||Mateo|6/8/2026||||Mandarle 10/8
Perdido|3875683244|6/8/2026|ER||Soledad||||Romina|6/8/2026||||
Perdido|3886375135|6/8/2026|ER||Maria||||Romina|6/8/2026||||
Perdido|3874078476|6/8/2026|ER||Nadia||||Romina|6/8/2026||||
Perdido|3883361557|6/8/2026|ER||Nelly||||Romina|6/8/2026||||
Perdido|54 9 11 6246-5756|7/8/2026|Góndola||Loli||||Ana|7/8/2026|||https://www.facebook.com/share/r/1DaFB9JYZY/|
Perdido|2216386007|7/8/2026|Góndola||Carlos||||Mateo|7/8/2026||||
Perdido|2213585218|7/8/2026|Góndola||Nancy||||Mateo|7/8/2026||||
Frío|5493886599898|6/8/2026|ER||Aldo||Recuperación||Celina|6/8/2026|||https://www.facebook.com/share/r/1EPe8S1Hek/|
Frío|5493835515682|6/8/2026|ER||Loli||Recuperación||Celina|6/8/2026|||https://www.facebook.com/share/r/1EPe8S1Hek/|
Frío|5493812127259|6/8/2026|ER||Meraki||Recuperación||Celina|6/8/2026|||https://www.facebook.com/share/r/1EPe8S1Hek/|
Frío|5493854067739|14/8/2026|ER||Ivana||Recuperación||Celina|6/8/2026|||https://www.facebook.com/share/r/1EPe8S1Hek/|
Perdido|54 9 11 6023-1852|10/8/2026|Góndola|2965000|Enes|Calificado||Córdoba|Ana|7/8/2026||MarketPlace||
Frío|5493854067739|6/8/2026|ER||Ivana||Recuperación||Celina|6/8/2026|||https://www.facebook.com/share/r/1EPe8S1Hek/|
Frío|5493874501147|6/8/2026|ER||Mariela||Recuperación||Celina|6/8/2026|||https://www.facebook.com/share/r/1EPe8S1Hek/|
Caliente||7/8/2026|Góndola||Flor Omar|Calificado|Nueva|Santa Fe|Celina|6/8/2026||MarketPlace||
Perdido|54 9 11 3340-0008|7/8/2026|Góndola||Gonzalo|No calificado||Buenos Aires|Ana|7/8/2026||WhatsApp||Quería si o si una estantería de un ancho personalizado que nosotros no podemos darle
Caliente||6/8/2026|Góndola||Victoria Monzon|||Santa Fe|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola||Waly Villa|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola||Santi Nicolás|||Santa Fe|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola||Romina Yossen|||Santa Fe|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola||Norma Noguera Montiel|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola||Franz Vallejos|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola||Marcial Defagot|||Santa Fe|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Jaimes Relos|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Camila Schumacher|||Santa Fe|Celina|6/8/2026||MarketPlace||
Caliente||7/8/2026|Góndola|4135211|Andres Gomez|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Gaston Recalde|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Any Gonzalez|||Santa Fe|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola||Cintia Heredia|||Córdoba|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola||Aneley Cancian|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Armoniza Santa Fe cap|||Santa Fe|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Rami Ranbo|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Santiago Azcurra|||Córdoba|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola|4293787|Oscar Omar Folmer|||Santa Fe|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Pretty Nails|||Santa Fe|Celina|6/8/2026||MarketPlace||
Caliente||6/8/2026|Góndola|750.36|Vero Peñaranda|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Perdido||6/8/2026|Góndola||Axel Soruco|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Pedro Arispe|||Córdoba|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Alexandro Flores|||Santa Fe|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Mary Cruz|||Córdoba|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|ER||Dai Isa Diaz|||Catamarca|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|ER||Ariadna Velarde|||Tucumán|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola|1431767|Leo Wen|||Buenos Aires|Celina|6/8/2026||MarketPlace||
Frío||6/8/2026|Góndola||Passtor Renjifo|||Córdoba|Celina|6/8/2026||MarketPlace||
Frío||7/8/2026|Góndola||Hernan Díaz|||Córdoba|Celina|7/8/2026||MarketPlace||
Frío||7/8/2026|ER||Ariel Marquez|||Catamarca|Celina|7/8/2026||MarketPlace||
Frío||7/8/2026|Góndola||Luca Sterr|||Santa Fe|Celina|7/8/2026||MarketPlace||
Frío||7/8/2026|Góndola||Yessy Lopez|||Córdoba|Celina|7/8/2026||MarketPlace||
Caliente||7/8/2026|Góndola|1091066|Damian Ledesma|||Santa Fe|Celina|7/8/2026||MarketPlace||
Seguimiento||12/8/2026|Góndola|25778059|Martin Huang|||Córdoba|Celina|7/8/2026||MarketPlace||
Frío||7/8/2026|Góndola|409.66|Anabel Sanchez|||Córdoba|Celina|7/8/2026||MarketPlace||
Frío|54 9 2615 27-3357|11/8/2026|Góndola||Pablo Espinosa||||Celina|7/8/2026||MarketPlace||
Caliente||7/8/2026|Góndola|2372401|Cristian Barrios|||Buenos Aires|Celina|7/8/2026||MarketPlace||
Perdido||14/8/2026|||Romeo Isaac||Nueva||Ana|8/8/2026|8/8/2026|MarketPlace|https://www.facebook.com/share/r/1EPe8S1Hek/|
Caliente|54 9 2665 04-8730|15/8/2026|Góndola||Luciano Ávila|Calificado|Nueva|San Luis|Ana|8/8/2026|8/8/2026|MarketPlace|https://www.facebook.com/share/r/1EPe8S1Hek/|Celi está apoyando al cierre
Frío|54 9 11 6922-3675|15/8/2026|Góndola|2287000|Lore Moreno|Calificado|Recuperación|Buenos Aires|Ana|8/8/2026|12/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|
Frío|54 9 11 2170-5503|15/8/2026|Góndola||Fabi|Calificado|Recuperación|Buenos Aires|Ana|8/8/2026|11/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|
Frío|54 9 2974 70-9650|14/8/2026|Góndola|685000|Javier|Calificado|Recuperación|Chubut|Ana|8/8/2026|11/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Hablar en 30 días
Caliente|54 9 11 3793-2527|15/8/2026|Góndola|||Calificado|Recuperación|Buenos Aires|Ana|8/8/2026|12/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Comunicarse el Miércoles
Frío|54 9 11 3027-1670|8/8/2026|Góndola|||Calificado|Recuperación|Buenos Aires|Ana|8/8/2026|12/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Contactar en 30 días porque ha postergado la planificación del negocio
Caliente|54 9 11 3240-0886|15/8/2026|Góndola|||Calificado|Recuperación|Buenos Aires|Ana|8/8/2026|17/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Ya compró
Perdido|54 9 11 4083-3682|8/8/2026|Góndola||Susana|Calificado||Buenos Aires|Ana|8/8/2026||Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Desistió en montar el negocio
Caliente|54 9 11 3045-7677|15/8/2026|Góndola|7000000|Pablo|Calificado|Recuperación|Buenos Aires|Ana|8/8/2026|9/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|54 9 11 3045-7677 Jhonatan Gonzalez liberará el dinero
Perdido|54 9 11 3925-5530|15/8/2026|Góndola|1377000|Silvia|Calificado|Recuperación|Buenos Aires|Ana|8/8/2026|9/7/2026|Ads|https://www.facebook.com/share/r/1DaFB9JYZY/|Vende cosas de Bolivia como bazar y blanco
Perdido|54 9 38115 39-2494|7/8/2026|ER||Adrian Tamaño|Calificado|Nueva|Tucumán|Leandro|7/8/2026|7/8/2026|MarketPlace|https://www.facebook.com/share/19M2rwemrN/?mibextid=wwXIfr|
Frío||12/8/2026|ER||Hernan Orellana|Calificado|Nueva|Tucumán|Leandro|7/8/2026|7/8/2026|MarketPlace|https://www.facebook.com/share/19M2rwemrN/?mibextid=wwXIfr|
Frío||12/8/2026|ER||Gonzalo Elias|Calificado|Nueva|Tucumán|Leandro|7/8/2026|7/8/2026|MarketPlace|https://www.facebook.com/share/19M2rwemrN/?mibextid=wwXIfr|
Frío||12/8/2026|ER||Romi Condori|Calificado|Nueva|Tucumán|Leandro|8/8/2026|8/8/2026|MarketPlace|https://www.facebook.com/share/19M2rwemrN/?mibextid=wwXIfr|
Frío||12/8/2026|ER||Kevin Pipke|Calificado|Nueva|Tucumán|Leandro|8/8/2026|8/8/2026|MarketPlace|https://www.facebook.com/share/19M2rwemrN/?mibextid=wwXIfr|
Frío||12/8/2026|ER||Gabriela Paz|Calificado|Nueva|Tucumán|Leandro|8/8/2026|8/8/2026|MarketPlace|https://www.facebook.com/share/19M2rwemrN/?mibextid=wwXIfr|
Caliente|54 9 11 2182-8936|15/8/2026|Góndola||Alvaro Ugarte|Calificado|Nueva|Buenos Aires|Ana|9/8/2026|9/8/2026|MarketPlace|https://www.facebook.com/share/19M2rwemrN/?mibextid=wwXIfr|
Caliente|54 9 3518 59-3225|15/8/2026|Góndola|||Calificado|Recuperación|Córdoba|Ana|10/8/2026|9/8/2026|Ads|https://www.facebook.com/share/19M2rwemrN/?mibextid=wwXIfr|
Frío|54 9 3853 10-1902|10/8/2026|ER||Aldi|No calificado|Recuperación|Santiago del Estero|Leandro|10/8/2026||WhatsApp||
Negociación|+54 9 3814 66-6960|10/8/2026|ER|750000|Daniel|Calificado||Tucumán|Mateo|10/8/2026||Propio||
1º Contacto|+54 9 3814 38-5744|10/8/2026|ER||Elias|||Tucumán|Mateo|10/8/2026||MarketPlace||
Seguimiento|2223063897|10/8/2026|ER|1000000|Maia Brito|||Tucumán|Mateo|7/8/2026||MarketPlace||
1º Contacto|+54 9 3815 83-7343|10/8/2026|ER||Nicolas|||Tucumán|Mateo|10/8/2026||MarketPlace||
Negociación|+54 9 3875 34-8815|10/8/2026|ER|3000000|Josema|Calificado||Salta|Mateo|4/8/2026||WhatsApp||
1º Contacto|+54 9 3815 89-8117|10/8/2026|ER||Hernan|Calificado||Tucumán|Mateo|10/8/2026||MarketPlace||
1º Contacto|+54 9 3874 87-7378|10/8/2026|ER|||||Salta|Mateo|10/8/2026||MarketPlace||
1º Contacto|3814777650|10/8/2026|ER||Cristian|||Tucumán|Mateo|4/8/2026||MarketPlace||
1º Contacto|+54 9 3814 45-8749|10/8/2026|ER|||||Tucumán|Mateo|10/8/2026||MarketPlace||
1º Contacto|+54 9 3815 89-5687|10/8/2026|ER|||No calificado||Tucumán|Mateo|10/8/2026||MarketPlace||Seco
Negociación|+54 9 3863 52-2951|10/8/2026|ER||Victor|Calificado||Tucumán|Mateo|4/8/2026||WhatsApp||
Seguimiento|+54 9 3816 60-6502|10/8/2026|ER||Mariela|||Tucumán|Mateo|7/8/2026||MarketPlace||
1º Contacto|+54 9 3813 47-6277|10/8/2026|ER||Marcela|||Tucumán|Mateo|10/8/2026||MarketPlace||
1º Contacto|+54 9 3816 51-7187|10/8/2026|ER||Rosa|||Tucumán|Mateo|10/8/2026||MarketPlace||
1º Contacto|+54 9 3813 60-2476|10/8/2026|ER||Sara|||Tucumán|Mateo|10/8/2026||MarketPlace||
Vendido||10/8/2026|ER|2800000|Benedicta|Cliente HT||Catamarca|Mateo|14/4/2026||MarketPlace||
Vendido|54 9 3837 695005|10/8/2026|ER|6000000|Jorge|||Catamarca|Mateo|1/7/2026||Ads||
Frío|54 9 11 6474-8435|10/8/2026|Góndola||Gabriel|||Buenos Aires|Leandro|10/8/2026||WhatsApp||
Perdido|54 9 3547 64-0114|10/8/2026|Góndola||Nathalie|||Córdoba|Leandro|10/8/2026||WhatsApp||Ya compro en otro sitio
Frío|54 9 3541 63-3043|10/8/2026|Góndola||Cyn|||Córdoba|Leandro|10/8/2026||WhatsApp||
Perdido|54 9 11 2690-5748|10/8/2026|Góndola||Rocio Trejo|||Buenos Aires|Leandro|10/8/2026||WhatsApp||Compro estanterias normales por tema de tiempo y precios
Frío|54 9 221 610-2859|10/8/2026|Góndola||Miriam Camacho|||Buenos Aires|Leandro|10/8/2026||WhatsApp||No atendio a las llamadas pero se le dejo un mensaje
Frío|54 9 11 6413-2375|10/8/2026|Góndola||Miluska Torres|||Buenos Aires|Leandro|10/8/2026||WhatsApp||
1º Contacto|+54 9 3815 03-8574|11/8/2026|ER||Matias||Nueva|Tucumán|Mateo|11/8/2026||MarketPlace||
1º Contacto|3815848883|11/8/2026|ER||Mateo||Nueva|Tucumán|Mateo|11/8/2026||MarketPlace||
Perdido||13/8/2026|||Lizu CH|No calificado|Nueva||Ana|11/8/2026|11/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|Se salió del chat de MP y tiene restringido su perfil, por lo que no puedo enviarle mensajes
Caliente|54 9 2657 71-7200|15/8/2026|Góndola|2782000|Ezequiel Narpe|Calificado|Nueva|San Luis|Ana|11/8/2026|11/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|
Caliente|54 9 3512 11-7496|15/8/2026|Góndola|1237000|Jonathan Bracamonte|Calificado|Nueva|Córdoba|Ana|11/8/2026|11/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|Kiosko. 2 metros profundidad x 1.20/160 de alto x ancho sin especificar
1º Contacto|3814437365|11/8/2026|ER||||||Mateo||||
Caliente|54 9 3513 27-1643|15/8/2026|Góndola|9699000|Matias Vega|Calificado|Nueva|Córdoba|Ana|12/8/2026|12/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|
Caliente||15/8/2026|||Mauricio Liendo||Nueva||Ana|12/8/2026|12/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|
Caliente||15/8/2026|||Carlos Arias||Nueva||Ana|12/8/2026|12/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|
Caliente||15/8/2026|||Maldonado Katy|Calificado|Nueva||Ana|12/8/2026|12/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|
Perdido|3815312777|7/8/2026|ER||Cali|Calificado|Recuperación|Tucumán|Romina|7/8/2026||WhatsApp||
Perdido|3863531115|7/8/2026|ER||Mónica Herrera|Calificado|Recuperación||Romina|7/8/2026||WhatsApp||
Perdido|3815541417|7/8/2026|ER||Yohana|Calificado|Recuperación|Tucumán|Romina|7/8/2026||WhatsApp||
Perdido|3815791723|7/8/2026|ER||Emanuel|Calificado|Recuperación|Tucumán|Romina|7/8/2026||||
1º Contacto|3812067992|10/8/2026|ER|||Calificado|Nueva|Tucumán|Romina|10/8/2026|10/8/2026|MarketPlace||
1º Contacto|3813425205|10/8/2026|ER|||Calificado|Nueva|Tucumán|Romina|10/8/2026|10/8/2026|MarketPlace||
1º Contacto|3865205170|11/8/2026|ER||Jonathan Ariel Parra|Calificado|Nueva||Romina|11/8/2026||MarketPlace||
1º Contacto|3815312777|11/8/2026|ER|||Calificado|Nueva|Tucumán|Romina|11/8/2026||MarketPlace||
Vendido|3816772405|11/8/2026|ER||David Ruiz|Calificado|Nueva|Tucumán|Romina|10/8/2026||MarketPlace||
Frío||12/8/2026|ER||Roni Apaza|Calificado|Nueva|Salta|Leandro|11/8/2026|11/8/2026|MarketPlace|https://www.facebook.com/share/1JzwvBxAkJ/?mibextid=wwXIfr|
Frío||10/8/2026|Góndola||Gise Suarez||Nueva|Santa Fe|Celina|10/8/2026|10/8/2026|MarketPlace||
Caliente||12/8/2026|Góndola|1547634|Natanael Fernandez||Nueva|Buenos Aires|Celina|10/8/2026|10/8/2026|MarketPlace||
Frío||10/8/2026|Góndola||Pablo accornero||Nueva|Córdoba|Celina|10/8/2026|10/8/2026|MarketPlace||
Frío||10/8/2026|Góndola||Lorena V. Gonzalez||Nueva|Córdoba|Celina|10/8/2026|10/8/2026|MarketPlace||
Frío||10/8/2026|Góndola||Alejo Tschopp||Nueva|Santa Fe|Celina|10/8/2026|10/8/2026|MarketPlace||
Frío||10/8/2026|Góndola||Rodrigo Blunno||Nueva|Córdoba|Celina|10/8/2026|10/8/2026|MarketPlace||
Frío||10/8/2026|ER||Efrain Herrera||Nueva|Catamarca|Celina|10/8/2026|10/8/2026|MarketPlace||
Seguimiento||12/8/2026|Góndola|4217042|Walter frutos||Nueva|Buenos Aires|Celina|10/8/2026|10/8/2026|MarketPlace||
Caliente|5493518588051|12/8/2026|Góndola||Daniel GPalenzuela|Calificado|Nueva|Córdoba|Celina|10/8/2026|10/8/2026|MarketPlace||Se llegaría directo a fabrica
Seguimiento||12/8/2026|Góndola|1547634|Nahuel Godoy||Nueva|Córdoba|Celina|10/8/2026|10/8/2026|MarketPlace||
Frío||10/8/2026|ER||Iriel Figueroa||Nueva|La Rioja|Celina|10/8/2026|10/8/2026|MarketPlace||
Frío||11/8/2026|Góndola||Simon Toledo||Nueva|Córdoba|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|Góndola||Mariano Heredia||Nueva|Córdoba|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|ER||Jorge Miguel Luna||Nueva|La Rioja|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|ER||Hernan Taquichiri||Nueva|La Rioja|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|Góndola||Elvita Melgarejo||Nueva|Buenos Aires|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|Góndola||Pedro Arispe Fernandez||Nueva|Córdoba|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|ER||Julieta Sarmiento||Nueva|La Rioja|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|ER||Enzo Brizuela||Nueva|La Rioja|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|Góndola||Mauro Bertello||Nueva|Córdoba|Celina|11/8/2026|11/8/2026|MarketPlace||
Seguimiento|5493825520339|11/8/2026|ER|1956348|Jorge Daniel Aspe||Nueva|La Rioja|Celina|11/8/2026|11/8/2026|MarketPlace||
Caliente||12/8/2026|Góndola|989474|Willy Zanabria Rocha||Nueva|Buenos Aires|Celina|11/8/2026|11/8/2026|MarketPlace||
Frío||11/8/2026|ER|1068415|Costa Villalobos Soliz||Nueva|La Rioja|Celina|11/8/2026|11/8/2026|MarketPlace||
Caliente||15/8/2026|||Passtor Renjifo||Nueva||Ana|13/8/2026|13/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|Veremos con Celina a quién le contesta primero
Caliente|54 9 3515 93-0116|15/8/2026|Góndola|3340000|Mónica Ortega|Calificado|Nueva|Córdoba|Ana|13/8/2026|13/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|
Caliente||15/8/2026|||Limpia Mas||Nueva||Ana|13/8/2026|13/8/2026|MarketPlace|https://www.facebook.com/share/19RxBKCca7/|
Caliente|5491155647625|13/8/2026|Góndola|1989847|Fran Borrelli||Nueva||Celina|12/8/2026|12/8/2026|MarketPlace||
Frío|5491126590476|13/8/2026|Góndola||Bian||Nueva|Buenos Aires|Celina|10/8/2026|10/8/2026|MarketPlace||
Frío|5491167505947|13/8/2026|Góndola|310441|Romi||Nueva|Buenos Aires|Celina|5/8/2026|5/8/2026|WhatsApp||Tiene parado el proyecto, hablar en 2 semanas
Frío|5493883298725|13/8/2026|ER|7716179|Elias||Nueva|Jujuy|Celina|4/8/2026|4/8/2026|WhatsApp||
`;

const MARCA = 'Importada de la planilla histórica';

/* ---------- helpers ---------- */

// "6/8/2026" → "2026-08-06" (tolera dobles barras y años mal tipeados tipo 0206).
function fechaISO(s) {
  if (!s) return null;
  const m = s.replace(/\/+/g, '/').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, d, mes, y] = m;
  y = parseInt(y, 10);
  if (y < 100) y += 2000;
  if (y < 2020 || y > 2030) y = 2026; // años mal tipeados en la planilla (0206, 2023)
  return `${y}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const num = (s) => {
  if (!s) return null;
  const v = parseFloat(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/* ---------- chequeos previos ---------- */

if (!FORCE) {
  const ya = db.prepare(`SELECT COUNT(*) AS c FROM deal_events WHERE detalle LIKE '${MARCA}%'`).get().c;
  if (ya > 0) {
    console.log(`Ya hay una importación previa (${ya} leads marcadas). No se cargó nada. Usá --force si realmente querés duplicar.`);
    process.exit(0);
  }
}

const usuarios = {};
const faltan = [];
for (const [nombre, email] of Object.entries(VENDEDORES)) {
  const u = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
  if (u) usuarios[nombre] = u; else faltan.push(`${nombre} <${email}>`);
}
if (faltan.length) {
  console.error('Faltan estos usuarios (corré primero crear-vendedores.js):\n  ' + faltan.join('\n  '));
  process.exit(1);
}

// Etapas destino que falten en cada panel se crean al final del orden (Ganado/Perdido son fijas del sistema).
for (const panel of ['gondolas', 'estanterias']) {
  const existentes = db.prepare('SELECT nombre FROM panel_etapas WHERE panel = ?').all(panel).map((e) => e.nombre);
  let orden = db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM panel_etapas WHERE panel = ?').get(panel).m;
  for (const etapa of Object.values(MAPA_ESTADOS)) {
    if (etapa === 'Ganado' || etapa === 'Perdido' || existentes.includes(etapa)) continue;
    db.prepare('INSERT INTO panel_etapas (panel, nombre, orden) VALUES (?, ?, ?)').run(panel, etapa, ++orden);
    existentes.push(etapa);
    console.log(`Etapa creada en ${panel}: ${etapa}`);
  }
}

/* ---------- parseo y deduplicación ---------- */

const filas = RAW.trim().split('\n').map((l) => l.split('|').map((c) => c.trim()));
const leads = [];
const vistos = new Map(); // clave panel+nombre+celular+vendedor → índice en leads (se queda el último contacto más nuevo)

for (const f of filas) {
  const [estado, celular, ultimo, empresa, valor, nombre, clasif, gestion, provincia, vendedor, aprop, primero, fuente, url, notas] = f;
  const etapa = MAPA_ESTADOS[estado];
  if (!etapa) { console.warn('Estado desconocido, salteada:', estado, nombre || celular); continue; }
  const user = usuarios[(vendedor || '').toLowerCase()];
  if (!user) { console.warn('Vendedor desconocido, salteada:', vendedor, nombre || celular); continue; }
  const panel = empresa === 'ER' ? 'estanterias' : 'gondolas';
  const lead = {
    panel, etapa, user,
    titulo: nombre || celular || 'Lead sin nombre',
    celular, nombre, clasif, gestion, fuente, url, notas,
    sinEmpresa: !empresa,
    mrr: num(valor),
    provincia: provincia || null,
    creada: fechaISO(aprop) || fechaISO(primero) || fechaISO(ultimo) || '2026-08-06',
    ultimo: fechaISO(ultimo),
    primero: fechaISO(primero),
    estadoOriginal: estado,
  };
  const clave = `${panel}|${(nombre || '').toLowerCase()}|${(celular || '').replace(/\D/g, '')}|${user.id}`;
  if ((nombre || celular) && vistos.has(clave)) {
    const idx = vistos.get(clave);
    if ((lead.ultimo || '') > (leads[idx].ultimo || '')) leads[idx] = lead; // fila duplicada: queda la más reciente
    continue;
  }
  vistos.set(clave, leads.length);
  leads.push(lead);
}

/* ---------- inserción ---------- */

const insDeal = db.prepare(`INSERT INTO deals
  (empresa, user_id, panel, etapa, tipo_venta, mrr, decisor, origen, fecha_cierre, aprobacion, pais, provincia, created_at, updated_at)
  VALUES (@empresa, @user_id, @panel, @etapa, 'Proyecto único', @mrr, @decisor, @origen, @fecha_cierre, @aprobacion, 'Argentina', @provincia, @created_at, @updated_at)`);
const insEv = db.prepare('INSERT INTO deal_events (deal_id, user_id, tipo, detalle, created_at) VALUES (?, ?, ?, ?, ?)');

const resumen = {};
db.transaction(() => {
  for (const l of leads) {
    const cerrada = l.etapa === 'Ganado' || l.etapa === 'Perdido';
    const r = insDeal.run({
      empresa: l.titulo,
      user_id: l.user.id,
      panel: l.panel,
      etapa: l.etapa,
      mrr: l.mrr,
      decisor: l.nombre || null,
      origen: l.fuente || null,
      fecha_cierre: cerrada ? (l.ultimo || l.creada) : null,
      aprobacion: l.etapa === 'Ganado' ? (l.mrr ? 'aprobado' : 'pendiente') : null,
      provincia: l.provincia,
      created_at: l.creada + ' 12:00:00',
      updated_at: (l.ultimo || l.creada) + ' 12:00:00',
    });
    insEv.run(r.lastInsertRowid, l.user.id, 'creado', `${MARCA} — estado original: ${l.estadoOriginal}`, l.creada + ' 12:00:00');
    const extras = [
      l.celular && `Celular: ${l.celular}`,
      l.clasif && `Clasificación: ${l.clasif}`,
      l.gestion && `Gestión: ${l.gestion}`,
      l.primero && `1º contacto: ${l.primero.split('-').reverse().join('/')}`,
      l.url && `URL: ${l.url}`,
      l.sinEmpresa && 'La planilla no especificaba empresa (se asignó a Góndolas)',
      l.notas && `Nota: ${l.notas}`,
    ].filter(Boolean);
    if (extras.length) insEv.run(r.lastInsertRowid, l.user.id, 'edicion', `Nota: ${extras.join(' · ')}`, (l.ultimo || l.creada) + ' 12:00:00');
    const k = `${l.panel} / ${l.etapa}`;
    resumen[k] = (resumen[k] || 0) + 1;
  }
})();

console.log(`\nImportadas ${leads.length} leads (${filas.length - leads.length} filas duplicadas unificadas):`);
for (const [k, n] of Object.entries(resumen).sort()) console.log(`  ${k}: ${n}`);
console.log('\nLas ventas ("Vendido") con valor entraron aprobadas; las que no tenían valor quedaron pendientes de aprobación.');
console.log('No se generaron comisiones por ser ventas históricas.');
