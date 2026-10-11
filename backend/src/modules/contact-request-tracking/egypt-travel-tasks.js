// Titles of the system tasks the Egypt-clearance travel plan opens
// (egypt-clearance-travel.service.js syncEgyptTravelTasks). Pure constants,
// shared with the workflow policy: a request is not complete while one of
// these is still open.
export const EGYPT_BOOKING_TASK_TITLES = Object.freeze({
  AIR: "ترتيب حجز طيران للموافقة الأمنية لمصر",
  BORDER: "ترتيب رحلة برية للموافقة الأمنية لمصر",
});
export const EGYPT_CIRCULAR_TASK_TITLE = "تجهيز تعميم الموافقة الأمنية لمصر";
export const EGYPT_TRAVEL_TASK_TITLES = Object.freeze([
  EGYPT_BOOKING_TASK_TITLES.AIR,
  EGYPT_BOOKING_TASK_TITLES.BORDER,
  EGYPT_CIRCULAR_TASK_TITLE,
]);
