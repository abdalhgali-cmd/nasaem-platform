// dotenv.config() now lives in app.js itself — see the comment there for
// why calling it here (before this static import) doesn't actually run it
// first.
import app from "./app.js";

const port = Number(process.env.PORT) || 5000;

app.listen(port, "0.0.0.0", () => {
  console.log(`Nasaem Platform API running on port ${port}`);
});