FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
# Los seeds (idempotentes) corren antes de levantar el server: primero los vendedores,
# después las leads históricas (que necesitan a esos usuarios; si ya se importaron, no duplica).
CMD ["sh", "-c", "node crear-vendedores.js && node importar-leads.js && node server.js"]
