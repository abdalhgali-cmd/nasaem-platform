// The system tasks the Egypt-clearance travel plan opens
// (egypt-clearance-travel.service.js syncEgyptTravelTasks). Pure constants,
// shared with the workflow policy and the screens: a request is not
// complete while one of these is still open. Tasks are recognised by their
// stable CaseTask.systemKey, never by their (translatable) title.
export const EGYPT_TRAVEL_TASK_KEYS = Object.freeze({
  BOOKING_AIR: "EGYPT_TRAVEL_BOOKING_AIR",
  BOOKING_BORDER: "EGYPT_TRAVEL_BOOKING_BORDER",
  CIRCULAR: "EGYPT_TRAVEL_CIRCULAR",
});
export const EGYPT_TRAVEL_TASK_KEY_LIST = Object.freeze(Object.values(EGYPT_TRAVEL_TASK_KEYS));

// Display titles (what staff read). Changing one does not affect matching.
export const EGYPT_TRAVEL_TASK_TITLES = Object.freeze({
  [EGYPT_TRAVEL_TASK_KEYS.BOOKING_AIR]: "ترتيب حجز طيران للموافقة الأمنية لمصر",
  [EGYPT_TRAVEL_TASK_KEYS.BOOKING_BORDER]: "ترتيب رحلة برية للموافقة الأمنية لمصر",
  [EGYPT_TRAVEL_TASK_KEYS.CIRCULAR]: "تجهيز تعميم الموافقة الأمنية لمصر",
});

export function isEgyptTravelTask(task) {
  return Boolean(task) && (!task.source || task.source === "SYSTEM") && EGYPT_TRAVEL_TASK_KEY_LIST.includes(task.systemKey);
}
