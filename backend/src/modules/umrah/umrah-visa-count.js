// Arabic counted nouns: 1 → «تأشيرة واحدة», 2 → «تأشيرتان/تأشيرتين»,
// 3–10 → «3 تأشيرات», 11+ → «11 تأشيرة».
function counted(n, { one, two, twoGenitive, plural }, genitive) {
  if (n === 1) return one;
  if (n === 2) return genitive ? twoGenitive : two;
  if (n >= 3 && n <= 10) return `${n} ${plural}`;
  return `${n} ${one.split(" ")[0]}`;
}
const VISA_NOUN = { one: "تأشيرة واحدة", two: "تأشيرتان", twoGenitive: "تأشيرتين", plural: "تأشيرات" };

// «صدرت تأشيرة واحدة من أصل تأشيرتين»: the same sentence on every channel.
export function visaCountText(issued, total) {
  if (!total) return "";
  if (issued <= 0) return total === 1 ? "لم تصدر التأشيرة بعد." : `لم تصدر أي تأشيرة بعد من أصل ${counted(total, VISA_NOUN, true)}.`;
  if (issued >= total) return total === 1 ? "صدرت التأشيرة." : `صدرت جميع التأشيرات (${counted(total, VISA_NOUN, false)}).`;
  return `صدرت ${counted(issued, VISA_NOUN, false)} من أصل ${counted(total, VISA_NOUN, true)}.`;
}
