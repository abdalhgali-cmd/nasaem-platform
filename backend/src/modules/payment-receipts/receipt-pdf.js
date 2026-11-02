// Renders a paid receipt («إيصال سداد / Payment Receipt») as a PDF from the
// frozen PaymentReceipt row. It states only what the platform knows: the
// agency's profile, the request, the amount actually confirmed and its
// recorded exchange rate. It is not a tax invoice: no tax number or VAT line
// is ever invented here.
//
// Arabic text: pdfkit shapes Arabic through fontkit; the `rtla` feature lays
// the glyphs out right-to-left. Left-to-right runs inside Arabic text
// (numbers, Latin words, e-mails) are pre-reversed so they read correctly,
// and paired brackets are mirrored. Font: Amiri (SIL OFL 1.1, assets/fonts).
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

const FONTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../assets/fonts");
const REGULAR = path.join(FONTS_DIR, "Amiri-Regular.ttf");
const BOLD = path.join(FONTS_DIR, "Amiri-Bold.ttf");

const ARABIC = /[\u0600-\u06FF]/;
const LTR_RUN = /[+A-Za-z0-9][A-Za-z0-9.,:/@_+#\-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.,:/@_+#\-]*)*/g;
const MIRROR = { "(": ")", ")": "(", "[": "]", "]": "[", "«": "»", "»": "«" };

// Optional Arabic vowel marks (harakat, tanween, superscript alef) are
// dropped: they do not change the meaning, and fontkit's mark positioning
// fails on some of them with this font.
const HARAKAT = /[\u064B-\u065F\u0670]/g;

export function rtlText(text) {
  const value = String(text ?? "").replace(HARAKAT, "");
  // Without Arabic letters the line is laid out left-to-right as is.
  if (!ARABIC.test(value)) return value;
  return value
    .replace(LTR_RUN, (run) => [...run].reverse().join(""))
    .replace(/[()[\]«»]/g, (ch) => MIRROR[ch]);
}

function money(amount, currency) {
  const value = Number(amount);
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function khartoumDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}

// The receipt's lines, in order (pure; unit-tested).
export function receiptLines(receipt) {
  const lines = [
    ["رقم الإيصال", receipt.receiptNo, "ltr"],
    ["تاريخ تأكيد السداد", khartoumDate(receipt.paidAt), "ltr"],
    ["اسم العميل", receipt.customerName, "rtl"],
    ["الخدمة", receipt.serviceName, "rtl"],
    ["عدد المسافرين", String(receipt.travelerCount), "ltr"],
    ["رقم الطلب", receipt.contactRequestId, "ltr"],
    ["المبلغ المدفوع", money(receipt.amount, receipt.currency), "ltr"],
  ];
  if (receipt.amountSdg !== null && receipt.amountSdg !== undefined && receipt.currency !== "SDG") {
    lines.push(["ما يعادل بالجنيه السوداني", money(receipt.amountSdg, "SDG"), "ltr"]);
    if (receipt.exchangeRateToSdg) lines.push(["سعر الصرف المعتمد", `1 ${receipt.currency} = ${Number(receipt.exchangeRateToSdg)} SDG`, "ltr"]);
  }
  if (receipt.settlementCurrency && receipt.settlementAmount !== null && receipt.settlementAmount !== undefined) {
    lines.push(["المبلغ المحوَّل فعليًا", money(receipt.settlementAmount, receipt.settlementCurrency), "ltr"]);
  }
  lines.push(["طريقة السداد", "تحويل بنكي — تحقق منه موظف مختص", "rtl"]);
  lines.push(["حالة السداد", "مدفوع", "rtl"]);
  return lines;
}

export function renderReceiptPdf(receipt, agency = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Payment Receipt ${receipt.receiptNo}`, Author: agency.name || "" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("ar", REGULAR);
    doc.registerFont("ar-bold", BOLD);
    const left = 50;
    const width = doc.page.width - 100;
    const blue = "#0b3d91";
    const gold = "#b8892d";
    const ar = (text, options = {}) => doc.text(rtlText(text), { align: "right", features: ["rtla"], width, ...options });

    doc.rect(0, 0, doc.page.width, 8).fill(blue);
    doc.fillColor(blue).font("ar-bold").fontSize(20);
    doc.y = 30;
    ar(agency.name || "نسائم الحرمين");
    doc.font("ar").fontSize(10).fillColor("#444");
    const contact = [agency.phone, agency.email, agency.address].filter(Boolean).join(" — ");
    if (contact) ar(contact);
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor(gold).stroke();
    doc.moveDown(0.8);

    doc.font("ar-bold").fontSize(18).fillColor("#111");
    ar("إيصال سداد");
    doc.font("ar").fontSize(11).fillColor("#555").text("Payment Receipt", { align: "right", width });
    doc.moveDown(0.8);

    const rowHeight = 26;
    const labelWidth = 190;
    for (const [index, [label, value, direction]] of receiptLines(receipt).entries()) {
      const y = doc.y;
      if (index % 2 === 0) doc.rect(left, y - 4, width, rowHeight).fill("#f3f6fb");
      doc.fillColor("#333").font("ar-bold").fontSize(12);
      doc.text(rtlText(label), left + width - labelWidth, y, { width: labelWidth - 10, align: "right", features: ["rtla"], lineBreak: false });
      doc.fillColor("#111").font("ar").fontSize(12);
      if (direction === "rtl") doc.text(rtlText(value), left + 10, y, { width: width - labelWidth - 20, align: "right", features: ["rtla"], lineBreak: false });
      else doc.text(String(value), left + 10, y, { width: width - labelWidth - 20, align: "right", lineBreak: false });
      doc.y = y + rowHeight;
    }

    doc.moveDown(1.2);
    doc.font("ar").fontSize(10).fillColor("#555");
    ar("هذا إيصال يثبت استلام المبلغ أعلاه لطلبك، وليس فاتورة ضريبية.");
    ar("صدر آليًا بعد تأكيد موظف مختص للتحويل. للاستفسار تواصل مع الوكالة برقم الطلب.");
    doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(blue);
    doc.end();
  });
}
