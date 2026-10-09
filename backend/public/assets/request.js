let serviceIdByCategory = {};
let selectedCategoryKey = null;
let selectedServiceId = null;
let createdOrder = null;
let createdCustomer = null;

const pageAlert = document.getElementById("page-alert");

function el(id) {
  return document.getElementById(id);
}

async function bootstrap() {
  const user = await requireSession();
  if (!user) return;

  if (user.role === "ACCOUNTANT") {
    el("role-blocked").classList.remove("hidden");
    el("request-flow").classList.add("hidden");
  }

  renderHeader(user, "request");

  try {
    const { data: services } = await api.get("/services?limit=100");
    services.forEach((service) => {
      serviceIdByCategory[service.category] = service.id;
    });
  } catch (error) {
    showAlert(pageAlert, "تعذر تحميل قائمة الخدمات: " + error.message);
  }

  renderServiceGrid();
  wireEvents();
}

function renderServiceGrid() {
  const grid = el("service-grid");
  grid.innerHTML = "";

  Object.entries(SERVICES_DATA).forEach(([key, service]) => {
    const card = document.createElement("div");
    card.className = "service-card";
    card.dataset.key = key;
    card.innerHTML = `<span class="icon">${service.icon}</span>${service.label}`;
    card.addEventListener("click", () => selectCategory(key));
    grid.appendChild(card);
  });
}

function selectCategory(key) {
  selectedCategoryKey = key;
  selectedServiceId = serviceIdByCategory[key] || null;

  document.querySelectorAll(".service-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.key === key);
  });

  if (!selectedServiceId) {
    showAlert(
      pageAlert,
      "لا توجد خدمة مطابقة لهذه الفئة في قاعدة البيانات بعد. تواصل مع الإدارة."
    );
  } else {
    showAlert(pageAlert, "");
  }

  const service = SERVICES_DATA[key];
  const subtypeSelect = el("subtype-select");
  subtypeSelect.innerHTML = "";
  Object.keys(service.subs).forEach((subKey) => {
    const option = document.createElement("option");
    option.value = subKey;
    option.textContent = subKey;
    subtypeSelect.appendChild(option);
  });

  el("subtype-section").classList.remove("hidden");
  el("customer-section").classList.remove("hidden");
  el("order-section").classList.remove("hidden");

  renderChecklist();
}

function renderChecklist() {
  const service = SERVICES_DATA[selectedCategoryKey];
  const subKey = el("subtype-select").value;
  const docs = service.subs[subKey] || [];
  const note = (service.notes && service.notes[subKey]) || service.note || "";

  const checklist = el("doc-checklist");
  checklist.innerHTML = docs.map((doc) => `<li>${doc}</li>`).join("");

  el("checklist-note").textContent = note;
  el("doc-checklist-wrap").classList.toggle("hidden", docs.length === 0);
}

function wireEvents() {
  el("subtype-select").addEventListener("change", renderChecklist);
  el("submit-request-btn").addEventListener("click", submitRequest);
  el("upload-doc-btn").addEventListener("click", uploadDocument);
  el("new-request-btn").addEventListener("click", () => window.location.reload());
  el("scan-passport-btn").addEventListener("click", scanPassportImage);
}

// Non-exhaustive ISO 3166-1 alpha-3 -> Arabic name map, covering the
// nationalities most common for this agency's customers. Unmapped codes
// (e.g. from a passport we don't have a translation for) are shown as-is
// so staff can still see and correct the value rather than losing it.
const COUNTRY_NAME_AR = {
  SDN: "السودان",
  SSD: "جنوب السودان",
  EGY: "مصر",
  SAU: "السعودية",
  ARE: "الإمارات",
  KWT: "الكويت",
  QAT: "قطر",
  BHR: "البحرين",
  OMN: "عمان",
  JOR: "الأردن",
  SYR: "سوريا",
  LBN: "لبنان",
  IRQ: "العراق",
  YEM: "اليمن",
  LBY: "ليبيا",
  TUN: "تونس",
  DZA: "الجزائر",
  MAR: "المغرب",
  ETH: "إثيوبيا",
  TCD: "تشاد",
  ERI: "إريتريا",
  TUR: "تركيا",
  GBR: "بريطانيا",
  USA: "أمريكا",
};

function countryLabel(code) {
  if (!code) return "";
  return COUNTRY_NAME_AR[code] || code;
}

async function scanPassportImage() {
  const fileInput = el("passport-image");
  const file = fileInput.files[0];

  if (!file) {
    showAlert(el("passport-scan-alert"), "اختر صورة لصفحة بيانات الجواز أولًا.");
    return;
  }

  const formData = new FormData();
  formData.append("image", file);

  const scanBtn = el("scan-passport-btn");
  scanBtn.disabled = true;
  scanBtn.textContent = "جارٍ القراءة...";
  showAlert(el("passport-scan-alert"), "");

  try {
    const { data } = await api.upload("/passport-ocr/scan", formData);

    const fullName = [data.surname, data.givenNames].filter(Boolean).join(" ");
    if (fullName) el("c-fullName").value = fullName;
    if (data.documentNumber) el("c-passportNo").value = data.documentNumber;
    if (data.nationality) el("c-nationality").value = countryLabel(data.nationality);
    if (data.issuingCountry) el("c-country").value = countryLabel(data.issuingCountry);
    if (data.dateOfBirth) el("c-birthDate").value = data.dateOfBirth;
    if (data.sex === "male") el("c-gender").value = "MALE";
    else if (data.sex === "female") el("c-gender").value = "FEMALE";

    showAlert(
      el("passport-scan-alert"),
      "تم استخراج البيانات — يرجى مراجعتها والتأكد من صحتها قبل المتابعة.",
      "success"
    );
  } catch (error) {
    showAlert(el("passport-scan-alert"), error.message);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "استخراج البيانات";
  }
}

async function submitRequest() {
  showAlert(pageAlert, "");

  if (!selectedServiceId) {
    showAlert(pageAlert, "اختر نوع خدمة له سجل مطابق في قاعدة البيانات أولًا.");
    return;
  }

  const fullName = el("c-fullName").value.trim();
  const passportNo = el("c-passportNo").value.trim();
  const nationality = el("c-nationality").value.trim();
  const unitPrice = el("o-unitPrice").value;

  if (!fullName || !passportNo || !nationality || !unitPrice) {
    showAlert(pageAlert, "يرجى تعبئة كل الحقول المطلوبة (*).");
    return;
  }

  const submitBtn = el("submit-request-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ الإنشاء...";

  try {
    const birthDateValue = el("c-birthDate").value;

    const { data: customer } = await api.post("/customers", {
      fullName,
      passportNo,
      nationality,
      phone: el("c-phone").value.trim() || undefined,
      email: el("c-email").value.trim() || undefined,
      country: el("c-country").value.trim() || undefined,
      birthDate: birthDateValue ? new Date(birthDateValue).toISOString() : undefined,
      gender: el("c-gender").value || undefined,
    });

    const { data: order } = await api.post("/orders", {
      customerId: customer.id,
      currency: el("o-currency").value,
      priority: el("o-priority").value,
      items: [
        {
          serviceId: selectedServiceId,
          quantity: Number(el("o-quantity").value) || 1,
          unitPrice: Number(unitPrice),
        },
      ],
    });

    createdCustomer = customer;
    createdOrder = order;

    el("request-flow").classList.add("hidden");
    el("success-section").classList.remove("hidden");
    el("success-summary").textContent =
      `رقم الطلب: ${order.orderNumber} — العميل: ${customer.fullName} (${customer.customerNo})`;
  } catch (error) {
    showAlert(pageAlert, error.message + (error.errors ? " — " + formatErrors(error.errors) : ""));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "إنشاء الطلب";
  }
}

async function uploadDocument() {
  const fileInput = el("doc-file");
  const file = fileInput.files[0];

  if (!file) {
    showAlert(pageAlert, "اختر ملفًا أولًا.");
    return;
  }

  const formData = new FormData();
  formData.append("orderId", createdOrder.id);
  formData.append("customerId", createdCustomer.id);
  formData.append("type", el("doc-type").value);
  formData.append("file", file);

  const uploadBtn = el("upload-doc-btn");
  uploadBtn.disabled = true;
  uploadBtn.textContent = "جارٍ الرفع...";

  try {
    const { data: document_ } = await api.upload("/documents", formData);
    const item = document.createElement("li");
    item.textContent = `${document_.type} — ${document_.fileName}`;
    el("uploaded-list").appendChild(item);
    fileInput.value = "";
    showAlert(pageAlert, "");
  } catch (error) {
    showAlert(pageAlert, error.message);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "رفع";
  }
}

bootstrap();
