# Nasaem Al-Haramain — Admin design system (source)

Source files for the published Design System artifact. Nothing here is imported by the app; `web/` is unchanged.

- `nh-ds/project/` — the system: `README.md` (brand book), `tokens.json`, `components/` (bundle.css, bundle.js icon runtime, one preview + guideline per component), `assets/Logos/`.
- `gen.js` — regenerates `components/<Comp>/preview.html` and `README.md`.
- `harness.js` — renders a preview locally with Playwright: `node harness.js DataTable dark 1150`.
- `nasaem-mark*.png` — emblem cropped from `web/public/logo*.png`.
