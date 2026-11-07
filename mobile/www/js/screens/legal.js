// Privacy policy, terms of use and payment/refund/cancellation information.
// The text lives in legal-content.js (mirrors web/src/lib/legal-content.ts).
import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { AGENCY } from "../agency.js";
import { LEGAL_DOCS } from "../legal-content.js";

export const LEGAL_MENU = [
  { id: "privacy", icon: "lock" },
  { id: "terms", icon: "info" },
  { id: "payment", icon: "wallet" },
  { id: "refund", icon: "refresh" },
  { id: "cancellation", icon: "close" },
];

export async function renderLegalScreen({ bodyEl, params }) {
  const doc = LEGAL_DOCS[params?.doc];
  if (!doc) {
    bodyEl.innerHTML = `<div class="empty-state"><p>الصفحة غير متاحة.</p></div>`;
    return;
  }
  bodyEl.innerHTML = `
    <article class="legal-doc">
      <p class="legal-intro">${esc(doc.intro)}</p>
      ${doc.sections
        .map((section) => `<section class="about-card"><h3>${esc(section.h)}</h3>${section.p.map((text) => `<p>${esc(text)}</p>`).join("")}</section>`)
        .join("")}
      <section class="about-card">
        <h3>${icon("phone", { size: 18 })} للتواصل</h3>
        <p>${esc(AGENCY.name)} — ${esc(AGENCY.address)}</p>
        <p dir="ltr">${esc(AGENCY.phone)}</p>
      </section>
    </article>`;
}
