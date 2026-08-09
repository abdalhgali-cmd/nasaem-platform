# Nasaem Platform

Staff back-office for the Nasaem Al-Haramain travel platform: a Node.js/Express +
Prisma + PostgreSQL API, and a plain HTML/CSS/JS staff frontend (`backend/frontend/`)
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

`backend/frontend/login.html`, `backend/frontend/request.html` (create a customer + order,
matched against the seeded `Service` catalog, then upload documents) and
`backend/frontend/admin-dashboard.html` cover the day-to-day staff workflow: overview
stats, orders with status/payment management, customers, payments, and a
"Management" tab (SUPER_ADMIN/ADMIN only) for branches, suppliers, services,
offers and user accounts. Settings management is currently API-only (no
dedicated screen yet).

## Testing

The test suite (`backend/tests/`, Node's built-in test runner + supertest)
runs real HTTP requests against the Express app and a real PostgreSQL
database — it is **not** safe to point at a database with real data.

The `npm test` step itself picks up `backend/.env.test` automatically (each
test file loads it via `tests/env.js`), but the Prisma CLI commands used to
prepare that database do not — pass the same values explicitly on those
commands, as shown below, so you don't accidentally migrate/seed your dev
database instead.

1. Create a disposable database and env file:
   ```bash
   createdb nasaem_platform_test   # or: psql -c "CREATE DATABASE nasaem_platform_test;"
   cd backend && cp .env.test.example .env.test
   ```
2. Apply migrations and seed it, using the same `DATABASE_URL` /
   `SEED_ADMIN_PASSWORD` you just put in `.env.test`:
   ```bash
   DATABASE_URL="postgresql://postgres:password@localhost:5432/nasaem_platform_test?schema=public" \
     npx prisma migrate deploy
   DATABASE_URL="postgresql://postgres:password@localhost:5432/nasaem_platform_test?schema=public" \
     SEED_ADMIN_PASSWORD="Test@12345" \
     npm run prisma:seed
   ```
3. Run the tests:
   ```bash
   npm test
   ```

CI (`.github/workflows/ci.yml`) does this automatically against a fresh
Postgres service container on every push/PR — no local setup needed for
that path.

## Project status

See [`docs/errors-and-development-proposal.md`](docs/errors-and-development-proposal.md)
for a full list of known issues, what's been fixed, and the remaining
development roadmap.
