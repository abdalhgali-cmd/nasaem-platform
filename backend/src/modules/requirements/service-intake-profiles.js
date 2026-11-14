import { requirementApplies } from "./requirement-conditions.js";

export const SERVICE_INTAKE_PROFILES = [
  { model: "service", code: "SVC-TASHEEL", fields: [
    { key: "tasheel_application_country", name: "بلد تقديم الطلب", aliases: ["دولة التقديم", "Country of application"], description: "الدولة التي ستراجع فيها مركز الخدمة.", type: "TEXT", required: true },
    { key: "tasheel_center_city", name: "مدينة مركز الخدمة", aliases: ["المدينة المطلوبة", "مدينة الموعد"], description: "المدينة التي تفضّل حجز الموعد فيها.", type: "TEXT", required: true },
    { key: "tasheel_visa_kind", name: "نوع التأشيرة المطلوبة", aliases: ["نوع التأشيرة"], description: "لتحديد إجراءات المركز المناسبة لطلبك.", type: "SELECT", required: true, options: [{ value: "FAMILY_VISIT", label: "زيارة عائلية" }, { value: "WORK", label: "عمل" }, { value: "RESIDENCE", label: "إقامة" }, { value: "OTHER", label: "نوع آخر — تراجعه الوكالة" }] },
    { key: "tasheel_preferred_date", name: "تاريخ الموعد المفضل", aliases: ["التاريخ المفضل"], description: "تفضيل فقط؛ الموعد لا يصبح مؤكدًا حتى تصلك وثيقة الحجز.", type: "DATE", required: false },
  ] },
  { model: "visaType", code: "VISA-INTERNATIONAL", fields: [
    { key: "visa_destination_country", name: "دولة الوجهة", aliases: ["الدولة المطلوبة", "دولة السفر", "Destination country"], description: "الدولة التي تريد التقدم للحصول على تأشيرتها. تتحدد المستندات النهائية بعد مراجعة ملفك.", type: "TEXT", required: true },
    { key: "visa_application_country", name: "بلد تقديم طلب التأشيرة", aliases: ["بلد تقديم الطلب", "دولة التقديم", "Country of application"], description: "بلد إقامتك أو البلد الذي ستقدم منه طلب التأشيرة.", type: "TEXT", required: true },
  ] },
];

export function validateServiceIntakeProfile(code, { requirements = [], answers = {}, travelers = [], travelerCount } = {}) {
  const profile = SERVICE_INTAKE_PROFILES.find(item => item.code === code);
  if (!profile) return null;
  const missing = [];
  for (const requirement of requirements || []) {
    const field = profile.fields.find(item => item.key === requirement.attachmentType || [item.name, ...item.aliases].some(name => name.toLowerCase() === requirement.name.toLowerCase()));
    if (!field || requirement.active === false || !requirementApplies(requirement, answers || {})) continue;
    const value = answers?.[requirement.id];
    const empty = value == null || String(value).trim() === "";
    if (empty) { if (requirement.required) missing.push({ id: requirement.id, name: requirement.name }); continue; }
    let valid = typeof value === "string" && value.trim().length >= 2 && value.length <= 200;
    if (requirement.type === "SELECT") valid = (Array.isArray(requirement.options) ? requirement.options : []).some(option => (typeof option === "string" ? option : option?.value) === value);
    if (requirement.type === "DATE") {
      const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
      valid = Boolean(date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= new Date().toISOString().slice(0, 10));
    }
    if (!valid) missing.push({ id: requirement.id, name: requirement.name });
  }
  const namesRequired = code === "SVC-TASHEEL" && (!travelers.length || travelers.some(traveler => !traveler.fullName?.trim()) || (travelerCount != null && Number(travelerCount) !== travelers.length));
  return missing.length || namesRequired ? { error: "SERVICE_INTAKE_INCOMPLETE", details: { requirements: missing, travelerNamesRequired: namesRequired } } : null;
}
