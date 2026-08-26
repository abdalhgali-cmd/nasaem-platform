// Railway (production) terminates TLS and proxies every request through
// exactly one hop before it reaches this container, adding an
// X-Forwarded-For header. Telling Express to trust that single hop (see
// app.js) is what lets req.ip — and therefore express-rate-limit's
// default per-IP key — resolve to the real client instead of Railway's
// own proxy address for every request.
//
// `1` (a hop count), not `true`: express-rate-limit explicitly rejects
// `trust proxy: true` (ERR_ERL_PERMISSIVE_TRUST_PROXY) because it trusts
// the *entire* X-Forwarded-For chain, including anything a client
// appends to the header itself — trivially bypassing IP-based rate
// limiting. Trusting exactly one hop reads the client IP from the header
// entry Railway itself set, not from client-controlled input further
// back in the chain.
//
// Outside production (local dev, CI) nothing sits in front of this
// server, so a directly-connecting caller's own X-Forwarded-For must
// never be trusted — that's exactly how a caller would spoof its own
// rate-limit key. Same NODE_ENV-based signal app.js already uses for
// morgan's log format.
export function trustProxyHops(nodeEnv) {
  return nodeEnv === "production" ? 1 : false;
}
