# Flujos HTML del Panel Comercial — guía para rediseño

Esta carpeta tiene el HTML **real renderizado** de cada pantalla de la app (con datos de ejemplo), para entregarle a otra IA o a un diseñador y que proponga estilos profesionales.

- `TODOS-LOS-FLUJOS.html` → las 9 pantallas concatenadas en un solo archivo (para pegar en otra IA de una sola vez).
- `01-…` a `09-…` → cada pantalla por separado (se pueden abrir directo en el navegador para verlas).

## Mapa de flujos

| # | Pantalla | Ruta | Quién la ve | Desde dónde se llega |
|---|---|---|---|---|
| 01 | Login | `GET /login` | Todos | URL inicial |
| 02 | Pipeline (activos) | `GET /pipeline` | Todos (vendedor ve "Míos" por defecto) | Nav principal; destino tras login de vendedor |
| 03 | Pipeline (cerrados) | `GET /pipeline?cerrados=1` | Todos | Toggle "Activos/Cerrados" del pipeline |
| 04 | Nuevo deal | `GET /deals/new` | Todos | Botón "+ Nuevo deal" |
| 05 | Editar deal | `GET /deals/:id` | Todos | Click en una tarjeta del pipeline |
| 06 | Actividad diaria | `GET /actividad` | Todos | Nav principal |
| 07 | Dashboard | `GET /dashboard` | Solo admin | Nav principal; destino tras login de admin |
| 08 | Equipo | `GET /equipo` | Solo admin | Nav principal |
| 09 | Perfil | `GET /perfil` | Todos | Nav principal (nombre del usuario) |

Flujo típico del vendedor: Login → Pipeline → (tarjeta) Editar deal → guardar → Pipeline → Actividad al final del día.
Flujo típico del admin: Login → Dashboard → (link de una alerta) Editar deal → Equipo cuando suma gente.

## Reglas para el rediseño (importante)

1. **No cambiar la funcionalidad**: conservar exactamente los atributos `name=` de inputs/selects, los `action=` y `method=` de los formularios, y los `href` de los links. El backend depende de ellos.
2. **Todo el CSS vive en un solo bloque** `<style>` compartido por todas las páginas (es la constante `CSS` en `views.js` del proyecto). El entregable ideal del rediseño es **ese único bloque CSS nuevo** (+ cambios menores de markup si hacen falta), así se integra pegándolo en un solo lugar.
3. **Mobile-first obligatorio**: los vendedores cargan desde el celular. Hoy en `max-width:640px` la navegación pasa a barra inferior fija; mantener ese patrón (o proponer uno mejor para uso táctil).
4. Los gráficos del dashboard (línea y donut) son **SVG inline generados por el servidor**; se pueden reestilizar colores/trazos pero no reemplazar por librerías externas.
5. Sin dependencias de CDN (fuentes, frameworks CSS, JS): la app es autocontenida. Fuentes del sistema o @font-face embebido.
6. Idioma es-AR; los emojis de la navegación (📋 ✅ 📊 👥 ⚙️) pueden reemplazarse por íconos SVG inline.
7. Datos con acentos y `—` son UTF-8 reales; conservar `<meta charset="utf-8">`.

## Cómo integrar el rediseño cuando esté listo

El nuevo CSS se pega en la constante `CSS` de `panel-comercial/views.js`. Si además cambia estructura HTML, esos cambios se replican en las funciones de página del mismo archivo (una función por pantalla, con el mismo nombre que acá: login, pipeline, dealForm, actividad, dashboard, equipo, perfil).
