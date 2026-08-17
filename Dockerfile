FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
# Los seeds (idempotentes) corren antes de levantar el server. La importación histórica se dio de baja:
# limpiar-importacion.js borra lo que haya quedado de ella (solo leads marcadas; lo manual no se toca).
CMD ["sh", "-c", "node crear-vendedores.js && node limpiar-importacion.js && node server.js"]
