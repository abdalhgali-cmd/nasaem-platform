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
CMD ["sh", "-c", "npm run prisma:migrate && npm start"]
