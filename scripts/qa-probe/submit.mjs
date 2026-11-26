import fs from "node:fs";
// Through the QA website's same-origin /api proxy, as the browser would.
const base = `${process.env.QA_WEB}/api`;
const get = async (p) => { const r = await fetch(`${base}${p}`); if (!r.ok) throw new Error(`${p} ${r.status}`); return (await r.json()).data; };
const packages = await get("/services/public/packages");
const visa = packages.find((p) => p.code === "SVC-UMRAH-VISA" && p.active !== false);
if (!visa) throw new Error("SVC-UMRAH-VISA not published on QA");
console.log("package:", visa.code, visa.pricingMode, visa.basePrice, visa.currency, visa.priceUnit);
const reqs = await get(`/services/${visa.id}/requirements/public`);
const residence = reqs.find((r) => r.name.includes("إقامة الضامن"));
const passport = reqs.find((r) => /جواز|passport/i.test(r.name));
const png = fs.readFileSync("web/e2e/fixtures/sample-document.png");
const stamp = String(Date.now()).slice(-7);
const form = new FormData();
const fields = {
  name: `عميل اختبار QA ${stamp}`, phone: `+24990${stamp}`, message: "طلب اختبار اصطناعي (QA) — معتمران، تأشيرة فقط",
  serviceId: visa.id, acceptedTotal: String(Number(visa.basePrice) * 2), acceptedCurrency: visa.currency,
  guarantorPhone: "+966 50 000 0000",
  travelers: JSON.stringify([{ fullName: `معتمر اختبار أول ${stamp}`, isPrimary: true }, { fullName: `معتمر اختبار ثان ${stamp}` }]),
  documentLabels: JSON.stringify(["إقامة الضامن", "جواز المعتمر الأول", "جواز المعتمر الثاني"]),
  documentRequirementIds: JSON.stringify([residence.id, passport.id, passport.id]),
  documentTravelerIndexes: JSON.stringify(["", "0", "1"]),
};
for (const [k, v] of Object.entries(fields)) form.append(k, v);
for (const n of ["residence.png", "passport-1.png", "passport-2.png"]) form.append("documents", new Blob([png], { type: "image/png" }), n);
const res = await fetch(`${base}/contact-requests`, { method: "POST", body: form, headers: { "X-Requested-With": "XMLHttpRequest" } });
const body = await res.json().catch(() => ({}));
console.log("submit status:", res.status);
if (res.status !== 201) { console.log("message:", body?.message, body?.code); process.exit(1); }
console.log("SYNTHETIC REFERENCE:", body.data.id, "phone:", fields.phone);
