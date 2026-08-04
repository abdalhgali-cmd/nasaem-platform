# Nasaem Platform

Staff back-office for the Nasaem Al-Haramain travel platform: a Node.js/Express +
Prisma + PostgreSQL API, and a plain HTML/CSS/JS staff frontend (`frontend/`)
served by the same Express server (same-origin, cookie-based auth, no separate
frontend build step or server needed).

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
   confirm the database connection is up. Staff sign in at
   `http://localhost:5000/login.html` with the seeded admin account
   (`admin@nasaem-platform.local` / `SEED_ADMIN_PASSWORD`).

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

## Frontend

`frontend/login.html`, `frontend/request.html` (create a customer + order,
matched against the seeded `Service` catalog, then upload documents) and
`frontend/admin-dashboard.html` cover the day-to-day staff workflow: overview
stats, orders with status/payment management, customers, payments, and a
"Management" tab (SUPER_ADMIN/ADMIN only) for branches, suppliers, services,
offers and user accounts. Settings management is currently API-only (no
dedicated screen yet).

## Project status

See [`docs/errors-and-development-proposal.md`](docs/errors-and-development-proposal.md)
for a full list of known issues, what's been fixed, and the remaining
development roadmap.
