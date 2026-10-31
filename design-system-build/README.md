# Nasaem Al-Haramain — Admin design system (source)

Source files for the published Design System artifact (https://claude.ai/artifact/KKaz2xRov6x2mDvZPEW1hG). Nothing here is imported by the app: `web/` and `backend/` are unchanged.

## Approved design baseline (31 Oct 2026)
- Operations Center: `nh-ds/project/components/OperationsCenter/`
- Case Workspace, Egypt security clearance (employee): `components/CaseWorkspace/`
- Case Workspace, Umrah (employee): `components/CaseWorkspaceUmrah/`
- Case Workspace, SUPER_ADMIN, Egypt and Umrah: `components/CaseWorkspaceAdmin/`, `components/CaseWorkspaceAdminUmrah/`

Each folder's `README.md` holds the design notes and the **outstanding implementation requirements**:
- **OperationsCenter**: R1 (Egypt rows show and sort by travel date), R2 (inactive 24 h ≠ missed deadline; red only for missed deadlines), and the contact-request assignment permission note.
- **CaseWorkspaceUmrah**: U1 (sponsor Iqama and sponsor number with review status), U2 (visa-only / air / sea package workflows), U3 (payment and readiness enforced by real backend rules).
- **CaseWorkspace / CaseWorkspaceAdmin**: data the design needs that the case payload lacks today, and what was deliberately not added (no escalation workflow, no case-deadline editing, no payment approval inside the case).
- **nh-ds/project/README.md §3.1**: the unresolved brand colour discrepancy (printed hex codes vs. colours drawn in the artwork). The tokens are provisional.

All data in the previews is synthetic and labelled as such.

## Files
- `nh-ds/project/`: the system: `README.md` (brand book), `tokens.json`, `components/` (bundle.css, bundle.js icon runtime, one preview + guideline per component), `assets/Logos/`, `design-system.json` (index).
- `gen.js`: generates the base component previews and guidelines.
- `ops.js`: generates the Operations Center page.
- `case.js`: generates the employee Case Workspace pages (Egypt, Umrah).
- `admin.js`: generates the SUPER_ADMIN Case Workspace pages from `case.js`.
- `tokens-src.js`: generates `tokens.json`.
- `harness.js`: renders a preview locally with Playwright: `node harness.js OperationsCenter light 1440`.
- `measure.js`: checks that the Operations Center table fits without horizontal scrolling.
- `preview/`: full-page 1440px renders of the approved screens (plus the earlier v2 Operations Center for reference).
- `brand-logos/`: transparent logo lockups and emblem extracted from the official logo PDF.
- `nasaem-mark*.png`: emblem cropped from `web/public/logo*.png` (older site files).
