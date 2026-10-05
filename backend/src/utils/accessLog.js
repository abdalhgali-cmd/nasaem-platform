import morgan from "morgan";

// Access logs record the request PATH only. Query strings can carry personal
// data (phones, names, search terms, tokens), and logs are retained and shared
// far more widely than the database.
export function pathOnly(req) {
  return String(req.originalUrl ?? req.url ?? "").split("?")[0];
}

morgan.token("path-only", pathOnly);

// morgan's "combined" format with :url replaced by :path-only and the referrer
// dropped (a referrer is a full URL including its query string).
const COMBINED_SAFE = ':remote-addr - :remote-user [:date[clf]] ":method :path-only HTTP/:http-version" :status :res[content-length] ":user-agent"';
const DEV_SAFE = ":method :path-only :status :response-time ms - :res[content-length]";

export function accessLogger(nodeEnv) {
  return morgan(nodeEnv === "production" ? COMBINED_SAFE : DEV_SAFE);
}
