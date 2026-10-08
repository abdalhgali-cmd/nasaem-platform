// Fills the static (non-router-rendered) icon placeholders in index.html —
// currently just the bottom nav — since those exist before app.js's router
// ever runs. Anything rendered by a screen uses icon() directly instead.
import { icon } from "./icons.js";

document.querySelectorAll("[data-icon]").forEach((el) => {
  el.innerHTML = icon(el.dataset.icon, { size: 22 });
});
