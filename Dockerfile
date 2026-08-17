FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
# Los seeds (crear-vendedores.js, idempotente) corren antes de levantar el server.
CMD ["sh", "-c", "node crear-vendedores.js && node server.js"]
