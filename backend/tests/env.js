import dotenv from "dotenv";
import path from "path";

// CI sets DATABASE_URL / JWT_SECRET / SEED_ADMIN_PASSWORD directly as job
// env vars, so .env.test won't exist there — dotenv.config() silently no-ops
// if the file is missing, which is exactly what we want in that case.
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });
