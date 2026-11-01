// dotenv.config() now lives in app.js itself — see the comment there for
// why calling it here (before this static import) doesn't actually run it
// first.

import app from "./app.js";
import { startConfirmationReconciler } from "./modules/customer-messages/customer-messages.service.js";
import { startTravelReminderWorker } from "./modules/egypt-clearance/travel-reminders.service.js";
import prisma from "./config/database.js";
import { startServer } from "./startup.js";

const port = Number(process.env.PORT) || 5000;
const positive = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

// Nothing is served until the database is verified compatible with this
// build (see startup.js and release/compatibility.js). Any failure exits
// non-zero; the platform restarts the process, which checks again.
try {
  await startServer({
    app,
    db: prisma,
    port,
    attempts: positive(process.env.STARTUP_DB_ATTEMPTS, 5),
    retryDelayMs: positive(process.env.STARTUP_DB_RETRY_DELAY_MS, 3000),
    // Sends customer confirmations that were stored but not sent (crash,
    // provider outage); see customer-messages.service.js.
    startWorkers: () => {
      if (process.env.NODE_ENV !== "test") {
        startConfirmationReconciler();
        // Staff reminders 3 days before an Egypt approval's travel date.
        startTravelReminderWorker();
      }
    },
  });
  console.log(`Nasaem Platform API running on port ${port}`);
} catch (error) {
  console.error(`[startup] ${error.message}`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
