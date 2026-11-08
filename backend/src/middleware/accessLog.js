import morgan from "morgan";

// Anonymous draft URLs contain a bearer credential. Never log query strings
// or Referer (which can carry the same URL), even on failed/unknown routes.
export function safeAccessPath(value) {
  let pathname = String(value || "").split(/[?#]/, 1)[0];
  try { pathname = decodeURIComponent(pathname); } catch { return "[INVALID_URL]"; }
  pathname = pathname.replace(/[\u0000-\u001f\u007f]/g, "_");
  return pathname.replace(/(\/intake-drafts)\/.*$/i, "$1/[REDACTED]");
}

morgan.token("safe-path", (req) => safeAccessPath(req.originalUrl || req.url));

export function createAccessLogger({ production = process.env.NODE_ENV === "production", stream } = {}) {
  const format = production
    ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-path HTTP/:http-version" :status :res[content-length]'
    : ':method :safe-path :status :response-time ms - :res[content-length]';
  return morgan(format, stream ? { stream } : undefined);
}
