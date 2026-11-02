FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 5000

# Apply committed, idempotent Prisma migrations before accepting traffic.
# Railway injects DATABASE_URL at runtime; a failed migration prevents the
# new application revision from starting against an incompatible schema.
# check-database-url.js first refuses an empty or unintended DATABASE_URL
# (see the script), so nothing is migrated in that case.
CMD ["sh", "-c", "node src/scripts/check-database-url.js && npm run prisma:migrate && npm start"]
