# Prompt para la IA gráfica — Manual PDF del Panel Comercial

Copiá todo lo que está debajo de la línea y pegalo en la IA gráfica, adjuntando el archivo `CIRCUITO-COMPLETO.html`.

---

Quiero que armes un **manual de usuario en PDF, en español (Argentina)**, del sistema "C4D Panel Comercial", una aplicación web de gestión comercial B2B para equipos de venta de software/SaaS. Te adjunto un archivo HTML (`CIRCUITO-COMPLETO.html`) que contiene las **16 pantallas reales del sistema** renderizadas con datos de ejemplo, cada una delimitada por un comentario `===== PANTALLA N =====` con su nombre, ruta y quién la ve. Cada pantalla es un documento HTML completo y autocontenido: renderizala para generar la imagen/captura de cada capítulo del manual.

## Identidad visual del PDF
- Marca: **C4D · Cloud For Deploy** (logo: cuadrado azul con "C4D" en blanco).
- Paleta: azul marino corporativo `#0F3459` (principal), azul `#1D6FB8` (acento), fondo claro `#F4F7FA`, texto `#0F1D2E`, verde `#3E9B57` (éxito), rojo `#C05450` (alertas).
- Tipografía: Helvetica/Arial. Estilo sobrio y profesional, sin emojis.
- Formato: A4 vertical, portada + índice + capítulos, pie de página con número y versión "v1.5.1".

## Contexto del sistema (para la introducción)
El sistema tiene dos roles: **Administrador** (dueño del negocio: ve todo, define objetivos, recibe notificaciones, saca reportes y gestiona usuarios) y **Vendedor** (carga sus deals y su actividad diaria, ve sus metas y el ranking). La regla de oro del equipo: **"si no está cargado en el sistema, no existe"**. Flujo del vendedor: Login → Pipeline (tablero) → cargar/mover deals → Actividad diaria al final del día → mirar sus Metas. Flujo del admin: Login → Dashboard → alertas → Reportes semanales/mensuales → definir Objetivos.

## Estructura del manual (un capítulo por pantalla, en este orden)
Para cada capítulo: título, a quién aplica (admin/vendedor/todos), imagen de la pantalla, explicación paso a paso de qué se hace ahí, y un recuadro de "consejos".

1. **Login** — ingreso con email y contraseña. Cada usuario recibe su clave del administrador y la cambia en Perfil.
2. **Pipeline (tablero kanban)** — la pantalla principal. 8 columnas por etapa: Lead → Contactado → Reunión agendada → Discovery hecha → Propuesta enviada → Negociación → Ganado → Perdido. **Se arrastra la tarjeta a otra columna para cambiar de etapa**; al soltar en Perdido se abre la ficha para cargar el motivo. Filtros "Míos/Todos" y "Tablero/Cerrados". Tarjetas compactas: empresa, MRR mensual, vendedor y próximo paso (en rojo si está vencido o falta). Regla: el deal se carga apenas se agenda la primera reunión, y todo deal abierto tiene siempre próximo paso con fecha.
3. **Modal de nuevo deal** — se abre sobre el tablero con "+ Nuevo deal". Campos: empresa, etapa, MRR, origen del lead, contacto decisor, próximo paso + fecha, fechas clave, notas.
4. **Modal de edición + historial** — al clickear una tarjeta. Igual al alta, más el **historial del deal** al pie: cada creación, cambio de etapa y edición queda registrada con autor, detalle y fecha/hora (auditoría, no se puede borrar).
5. **Pipeline cerrados** — historial completo de ganados y perdidos.
6. **Actividad diaria** — cada vendedor carga al final del día: contactos nuevos, toques (llamadas+mensajes+emails), reuniones agendadas y realizadas. Toma 2 minutos; si se guarda de nuevo, se actualiza el día. Abajo, los últimos 14 días.
7. **Metas: Objetivos** — el admin define objetivos semanales y mensuales por vendedor (toques, reuniones, deals ganados, MRR) o **generales para todo el equipo** de una vez. Cada vendedor ve sus barras de progreso: azul en camino, verde al cumplir. Semana desde el lunes, mes desde el día 1.
8. **Gráficas por vendedor** — evolución de toques, reuniones y MRR ganado en tres cortes: diario (14 días), semanal (8 semanas) y mensual (6 meses).
9. **Metas: Ranking** — posiciones del equipo por semana o mes, ordenado por MRR ganado. Top 3 con medallones; la fila propia resaltada; última columna: % de cumplimiento del objetivo de MRR.
10. **Dashboard global (admin)** — deals activos, MRR en juego, MRR ganado del mes, win rate 90 días, funnel por etapa (dónde está el cuello de botella), motivos de pérdida, actividad del equipo y alertas: deals sin próximo paso y estancados +14 días. Incluir la rutina sugerida: 15 minutos cada lunes, alertas primero.
11. **Reportes (admin)** — corte semanal o mensual (actual o anteriores): totales, tabla por vendedor, deals cerrados y motivos de pérdida. Botón "Descargar CSV" para Excel.
12. **Notificaciones (admin)** — campanita con contador: avisa cuando un vendedor crea un deal o lo mueve de etapa, con link directo a la ficha.
13. **Equipo (admin)** — crear usuarios con clave inicial, desactivar (no borrar) y resetear claves.
14. **Perfil** — cambiar contraseña y cerrar sesión.
15. **Docs: Documentación** — el manual integrado dentro del sistema.
16. **Docs: Changelog** — historial de versiones con etiquetas Nuevo/Mejora/Fix.

## Cierre del manual
Terminá con una página de "Reglas de oro del equipo": 1) si no está cargado, no existe; 2) el deal se carga al agendar la primera reunión; 3) todo deal abierto tiene próximo paso con fecha; 4) al perder, siempre se carga el motivo; 5) la actividad se carga al final de cada día; 6) el esfuerzo de hoy son las ventas de dentro de dos meses.
