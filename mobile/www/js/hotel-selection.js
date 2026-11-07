// Hotel stay details chosen before the shared request form (travelers and
// their documents come next, in intake.js). Pure: validated without a DOM.

export function hotelSelection(data, { today } = {}) {
  const city = String(data.city || "").trim();
  const checkin = String(data.checkin || "");
  const checkout = String(data.checkout || "");
  const rooms = Number.parseInt(data.rooms, 10);
  const preferences = String(data.preferences || "").trim();

  const problems = [];
  if (!city) problems.push("اكتب المدينة.");
  if (!checkin) problems.push("اختر تاريخ الدخول.");
  else if (today && checkin < today) problems.push("تاريخ الدخول في الماضي.");
  if (!checkout) problems.push("اختر تاريخ الخروج.");
  else if (checkin && checkout <= checkin) problems.push("تاريخ الخروج يجب أن يكون بعد تاريخ الدخول.");
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > 10) problems.push("عدد الغرف بين 1 و10.");
  if (problems.length) return { problems, selection: null };

  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
  const summary =
    `فندق في ${city}\nالدخول: ${checkin} — الخروج: ${checkout} (${nights} ${nights === 1 ? "ليلة" : "ليالٍ"})\nعدد الغرف: ${rooms}` +
    `${preferences ? `\nالتفضيلات: ${preferences}` : ""}`;
  return {
    problems,
    selection: { summary, details: { type: "HOTEL", city, checkin, checkout, nights, rooms, preferences: preferences || null } },
  };
}
