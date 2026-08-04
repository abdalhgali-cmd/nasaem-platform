# Nasaem Platform

Backend API for the Nasaem Al-Haramain travel platform (Node.js/Express + Prisma + PostgreSQL).

## Running with Docker Compose

1. Copy the environment template and fill in real values:
   ```bash
   cp backend/.env.example backend/.env
   ```
   At minimum, set `JWT_SECRET` and `SEED_ADMIN_PASSWORD` to non-default values.
   The default `DATABASE_URL` in the template already points at the `postgres`
   service used by `docker-compose.yml` — leave it as is for Docker.

2. Start the stack:
   ```bash
   docker compose up --build
   ```
   This starts PostgreSQL, waits for it to be healthy, then runs the backend
   (`prisma migrate deploy` applies the database schema automatically).

3. Create the first SUPER_ADMIN account:
   ```bash
   docker compose exec backend npm run prisma:seed
   ```

4. The API is available at `http://localhost:5000`. Check `GET /api/health` to
   confirm the database connection is up.

## Running the backend locally (without Docker)

1. Start a local PostgreSQL instance (or reuse the one from `docker compose up postgres`).
2. `cd backend && cp .env.example .env` and set `DATABASE_URL` to point at
   `localhost` instead of `postgres`.
3. Install dependencies and apply migrations:
   ```bash
   npm install
   npx prisma migrate deploy
   npm run prisma:seed
   npm run dev
   ```

## Project status

See [`docs/errors-and-development-proposal.md`](docs/errors-and-development-proposal.md)
for a full list of known issues and the development roadmap. The frontend
(`frontend/`) currently only contains shared service data and does not yet
include the actual application pages.
