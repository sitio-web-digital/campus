FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
# Seeds idempotentes antes de levantar el server: vendedores → limpieza de la importación vieja
# (si quedó en esta base; solo borra leads marcadas) → importación del CSV corregido (Tracker Agosto).
CMD ["sh", "-c", "node crear-vendedores.js && node limpiar-importacion.js && node importar-csv.js && node server.js"]
