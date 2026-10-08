// من نحن — who runs this app and how to reach them. Content comes from
// agency.js (the agency's published details, contact fields overridable
// from the back-office settings); nothing here is invented.
import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { AGENCY, AGENCY_SERVICES, AGENCY_WORKFLOW, AGENCY_VALUES, loadAgency, whatsappLink, telLink } from "../agency.js";
import { stagger } from "../motion.js";

function contactRows(agency) {
  return `
    <a class="about-contact-row" href="${esc(whatsappLink(agency.whatsapp, "السلام عليكم، أرغب في الاستفسار عن خدمات نسائم الحرمين"))}" id="aboutWhatsapp">
      <span class="about-contact-icon about-contact-whatsapp">${icon("chat", { size: 20 })}</span>
      <span class="about-contact-body"><b>واتساب</b><small dir="ltr">+${esc(agency.whatsapp)}</small></span>
      ${icon("chevron-start", { size: 16 })}
    </a>
    <a class="about-contact-row" href="${esc(telLink(agency.phone))}" id="aboutCall">
      <span class="about-contact-icon">${icon("phone", { size: 20 })}</span>
      <span class="about-contact-body"><b>خدمة العملاء</b><small dir="ltr">${esc(agency.phone)}</small></span>
      ${icon("chevron-start", { size: 16 })}
    </a>
    <a class="about-contact-row" href="mailto:${esc(agency.email)}">
      <span class="about-contact-icon">${icon("mail", { size: 20 })}</span>
      <span class="about-contact-body"><b>البريد الإلكتروني</b><small dir="ltr">${esc(agency.email)}</small></span>
      ${icon("chevron-start", { size: 16 })}
    </a>
    <div class="about-contact-row about-contact-static">
      <span class="about-contact-icon">${icon("map-pin", { size: 20 })}</span>
      <span class="about-contact-body"><b>مكتبنا في ${esc(agency.city)}</b><small>${esc(agency.address)}</small></span>
    </div>`;
}

export async function renderAboutScreen({ bodyEl }) {
  bodyEl.innerHTML = `
    <section class="about-hero">
      <img src="assets/brand/logo-mark.png" alt="شعار نسائم الحرمين" width="76" height="76" class="pop-in">
      <h2>${esc(AGENCY.name)}</h2>
      <p class="about-tagline">${esc(AGENCY.tagline)}</p>
    </section>

    <div class="about-sections">
      <section class="about-card">
        <h3>${icon("info", { size: 18 })} من نحن</h3>
        <p>${esc(AGENCY.description)}</p>
      </section>

      <section class="about-card">
        <h3>${icon("star", { size: 18 })} رسالتنا</h3>
        <p>${esc(AGENCY.mission)}</p>
      </section>

      <section class="about-card">
        <h3>${icon("globe", { size: 18 })} خدماتنا</h3>
        <div class="about-services">
          ${AGENCY_SERVICES.map((s) => `<span>${icon(s.icon, { size: 18 })}${esc(s.label)}</span>`).join("")}
        </div>
      </section>

      <section class="about-card">
        <h3>${icon("requests", { size: 18 })} طريقة عملنا</h3>
        <ol class="about-steps">
          ${AGENCY_WORKFLOW.map((step) => `<li><b>${esc(step.title)}</b><p>${esc(step.description)}</p></li>`).join("")}
        </ol>
      </section>

      <section class="about-card">
        <h3>${icon("shield-check", { size: 18 })} ما الذي نحرص عليه؟</h3>
        <div class="about-values">
          ${AGENCY_VALUES.map((v) => `<div><span>${icon(v.icon, { size: 18 })}</span><b>${esc(v.title)}</b><p>${esc(v.description)}</p></div>`).join("")}
        </div>
      </section>

      <section class="about-card" aria-labelledby="aboutContactTitle">
        <h3 id="aboutContactTitle">${icon("phone", { size: 18 })} تواصل معنا</h3>
        <div class="about-contacts" id="aboutContacts">${contactRows(AGENCY)}</div>
      </section>
    </div>`;

  stagger(bodyEl.querySelector(".about-sections"));

  // Apply back-office contact overrides (if any) once they arrive.
  const agency = await loadAgency();
  const contacts = bodyEl.querySelector("#aboutContacts");
  if (contacts) contacts.innerHTML = contactRows(agency);
}
