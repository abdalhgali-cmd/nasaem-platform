# StatCard

Stat cards show one operational KPI with its context: label, icon, value, and either a trend or a capacity bar.

- Value uses the `kpi` text style (Inter, tabular, LTR) so digits align across a row of cards.
- Icon tile tone follows the service: default navy (general), `--nile` (Egypt clearance), `--gold` (Umrah), `--danger` (overdue/blocked only).
- Foot: a `nh-delta--up|down` trend OR a progress bar (`nh-stat__bar`, for capacity such as seats filled), plus one short context line. Not both.
- Make it a link (`a.nh-stat`) to the filtered list it counts; hover raises to `shadow-md`.
- Four per row on desktop, two on tablet, one on mobile. Never more than four.
