// Single source of truth for where the app talks to. Edit the apiBaseUrl
// below (or override it before `cap sync` with a build-time substitution)
// to point a release build at a different backend — nothing else in the
// app hardcodes a host.
export const CONFIG = {
  apiBaseUrl: "https://adaptable-quietude-staging.up.railway.app/api",
  environment: "staging",
  appVersion: "0.3.0",
  supportPhone: "",
};
