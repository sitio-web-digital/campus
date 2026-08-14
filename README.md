# 🎯 Panel Comercial

Plataforma web para equipos de venta B2B: los vendedores cargan sus deals y su actividad diaria desde el celular o la computadora, y el administrador ve el dashboard global de KPIs para tomar decisiones.

Es un **monolito Node.js + SQLite**: una sola app, una sola carpeta de datos (`data/`), sin base de datos externa ni servicios de terceros.

## Qué incluye

- **Login por usuario** con roles: `admin` (ve todo, gestiona el equipo) y `vendedor` (carga sus deals y actividad).
- **Pipeline**: deals agrupados por etapa (Lead → Contactado → Reunión agendada → Discovery hecha → Propuesta enviada → Negociación → Ganado/Perdido), con MRR, decisor, origen, próximo paso y motivo de pérdida.
- **Actividad diaria**: formulario de 2 minutos por vendedor (contactos, toques, reuniones).
- **Dashboard** (solo admin): funnel por etapa, MRR en juego, MRR ganado del mes, win rate 90 días, motivos de pérdida, actividad del equipo, alertas de deals sin próximo paso y estancados, y tabla mensual por vendedor.
- Mobile-first: en celular la navegación pasa abajo y los formularios son táctiles.

## Correr localmente

```bash
npm install
npm start
# abre http://localhost:3000
```

**Primer arranque**: se crea el usuario administrador y la consola muestra su email y clave (`admin@panel.local` + clave aleatoria). Podés fijarlos con las variables `ADMIN_EMAIL` y `ADMIN_PASSWORD` antes del primer arranque. Cambiá la clave desde **Perfil** apenas entres.

## Deploy en tu servidor con tu dominio

### Opción A — Docker (recomendada, la más simple)

En el servidor (con Docker instalado):

```bash
# 1. Subí la carpeta al server (git clone o scp) y entrá a ella
ADMIN_EMAIL=tu@email.com ADMIN_PASSWORD=una-clave-fuerte docker compose up -d --build

# ver logs (ahí aparece la clave del admin si no la fijaste)
docker compose logs panel
```

La app queda en el puerto 3000. Los datos viven en `./data/` (queda fuera del contenedor, sobrevive reinicios y rebuilds).

### Opción B — Node directo + systemd

```bash
# en el server (Ubuntu/Debian con Node 18+)
cd /opt && git clone <tu-repo> panel-comercial && cd panel-comercial
npm ci --omit=dev
ADMIN_EMAIL=tu@email.com ADMIN_PASSWORD=una-clave-fuerte node server.js   # primer arranque
```

Para que quede corriendo siempre, creá `/etc/systemd/system/panel-comercial.service`:

```ini
[Unit]
Description=Panel Comercial
After=network.target

[Service]
WorkingDirectory=/opt/panel-comercial
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now panel-comercial
```

### Conectar tu dominio con HTTPS (Caddy)

Apuntá el DNS de tu dominio (registro A) a la IP del servidor. Después instalá [Caddy](https://caddyserver.com/docs/install) y poné en `/etc/caddy/Caddyfile`:

```
tudominio.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy consigue y renueva el certificado HTTPS solo. Listo: `https://tudominio.com` desde cualquier celular o computadora.

> Si tu server ya usa **nginx**, el equivalente es un `proxy_pass http://localhost:3000;` + certbot para el certificado.

## Puesta en marcha del equipo (mañana mismo)

1. Entrá como admin → **Equipo** → creá un usuario por vendedor (con clave inicial).
2. Pasales la URL y su clave; que la cambien en **Perfil**.
3. Reglas del equipo: el deal se carga **apenas se agenda la primera reunión**; todo deal abierto tiene **siempre** próximo paso con fecha; la actividad se carga **al final de cada día**; si no está cargado, no existe.
4. Vos mirás **Dashboard** 15 minutos cada lunes: alertas primero, funnel después, actividad al final del repaso.

## Backup

Todo el estado es la carpeta `data/`. Backup = copiar esa carpeta (por ejemplo, un cron diario con `tar` o rclone). Restaurar = volver a ponerla y reiniciar.

## Variables de entorno

| Variable | Para qué | Default |
| --- | --- | --- |
| `PORT` | Puerto HTTP | `3000` |
| `ADMIN_EMAIL` | Email del admin (solo primer arranque) | `admin@panel.local` |
| `ADMIN_PASSWORD` | Clave del admin (solo primer arranque) | aleatoria, se muestra en consola |
