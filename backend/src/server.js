// dotenv.config() now lives in app.js itself — see the comment there for
// why calling it here (before this static import) doesn't actually run it
// first.

import app from "./app.js";
import { startConfirmationReconciler } from "./modules/customer-messages/customer-messages.service.js";
import prisma from "./config/database.js";
import { assertDatabaseCompatible } from "./release/compatibility.js";

const port = Number(process.env.PORT) || 5000;

// Refuse to serve a database written by a later build (see
// release/compatibility.js). If the database cannot be reached the check is
// skipped: requests then fail with 503 on their own, and the next restart
// checks again.
try {
  await assertDatabaseCompatible(prisma);
} catch (error) {
  if (error.code === "INCOMPATIBLE_DATABASE") {
    console.error(`[startup] ${error.message}`);
    process.exit(1);
  }
  console.warn(`[startup] Database compatibility check skipped: ${error.message}`);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Nasaem Platform API running on port ${port}`);
});

// Sends customer confirmations that were stored but not sent (crash, provider
// outage); see customer-messages.service.js.
if (process.env.NODE_ENV !== "test") startConfirmationReconciler();
