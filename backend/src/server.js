// dotenv.config() now lives in app.js itself — see the comment there for
// why calling it here (before this static import) doesn't actually run it
// first.

import app from "./app.js";
import { startConfirmationReconciler } from "./modules/customer-messages/customer-messages.service.js";

const port = Number(process.env.PORT) || 5000;

app.listen(port, "0.0.0.0", () => {
  console.log(`Nasaem Platform API running on port ${port}`);
});

// Sends customer confirmations that were stored but not sent (crash, provider
// outage); see customer-messages.service.js.
if (process.env.NODE_ENV !== "test") startConfirmationReconciler();
