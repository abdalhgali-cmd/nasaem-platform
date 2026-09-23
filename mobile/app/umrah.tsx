import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { submitContactRequestWithDocuments, UploadAsset } from "../src/api/requests";
import { getPublicPackages, getPublicServices, getServiceRequirements, PublicRequirement, PublicService } from "../src/api/services";
import { AppButton, BrandHeader, ChoiceCard, FormField, StepIndicator, SurfaceCard } from "../src/components/ui";
import { colors, radius } from "../src/theme";
import { formatPrice, formatSdgEquivalent } from "../src/utils/price";

type TravelerDocs = Record<string, UploadAsset | null>;
type Traveler = {
  id: string;
  name: string;
  passport: string;
  nationality: string;
  birthDate: string;
  guarantorNumber: string;
  docs: TravelerDocs;
};

const STEPS = ["الخدمة", "المسافر", "المستندات", "المراجعة", "المتابعة"];
const makeTraveler = (n: number): Traveler => ({
  id: `traveler-${Date.now()}-${n}`,
  name: "",
  passport: "",
  nationality: "",
  birthDate: "",
  guarantorNumber: "",
  docs: {},
});

export default function UmrahScreen() {
  const [step, setStep] = useState(0);
  const [travelers, setTravelers] = useState<Traveler[]>([makeTraveler(1)]);
  const [phone, setPhone] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [packages, setPackages] = useState<PublicService[]>([]);
  const [umrahService, setUmrahService] = useState<PublicService | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [requirements, setRequirements] = useState<PublicRequirement[]>([]);
  const [caseDocs, setCaseDocs] = useState<TravelerDocs>({});
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [services, catalog] = await Promise.all([getPublicServices(), getPublicPackages()]);
        if (!active) return;
        const umrahPackages = catalog.filter((item) => item.category === "UMRAH_PACKAGE" || (item.code ?? "").startsWith("SVC-UMRAH-"));
        setPackages(umrahPackages);
        const service = services.find((item) => (item.code ?? "").toUpperCase() === "SVC-UMRAH" || (item.category ?? "").toLowerCase() === "umrah") ?? null;
        setUmrahService(service);
        if (umrahPackages.length === 1) setSelectedPackageId(umrahPackages[0].id);
      } catch {
        if (active) setError("تعذر تحميل باقات العمرة من الإدارة.");
      } finally {
        if (active) setCatalogLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const requirementServiceId = selectedPackage?.id ?? umrahService?.id ?? "";

  useEffect(() => {
    let active = true;
    if (!requirementServiceId) {
      setRequirements([]);
      return () => { active = false; };
    }
    setRequirementsLoading(true);
    getServiceRequirements(requirementServiceId)
      .then((list) => { if (active) setRequirements(list); })
      .catch(() => { if (active) { setRequirements([]); setError("تعذر تحميل متطلبات العمرة من الإدارة."); } })
      .finally(() => { if (active) setRequirementsLoading(false); });
    return () => { active = false; };
  }, [requirementServiceId]);

  const travelerDocumentRequirements = useMemo(
    () => requirements.filter((item) => (item.type ?? "DOCUMENT") === "DOCUMENT" && item.scope === "TRAVELER"),
    [requirements],
  );
  const caseDocumentRequirements = useMemo(
    () => requirements.filter((item) => (item.type ?? "DOCUMENT") === "DOCUMENT" && item.scope !== "TRAVELER"),
    [requirements],
  );
  const travelerDataComplete = useMemo(
    () => phone.trim().length >= 6 && travelers.every((item) => item.name.trim() && item.passport.trim() && item.nationality.trim() && item.birthDate.trim()),
    [phone, travelers],
  );
  const documentsComplete = useMemo(
    () => !requirementsLoading
      && caseDocumentRequirements.filter((item) => item.required).every((item) => Boolean(caseDocs[item.id]))
      && travelers.every((traveler) => travelerDocumentRequirements.filter((item) => item.required).every((item) => Boolean(traveler.docs[item.id]))),
    [caseDocs, caseDocumentRequirements, requirementsLoading, travelerDocumentRequirements, travelers],
  );

  function updateTraveler(id: string, patch: Partial<Traveler>) {
    setTravelers((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function chooseDocument(requirement: PublicRequirement, travelerId?: string) {
    const types = requirement.allowedMimeTypes?.length
      ? requirement.allowedMimeTypes
      : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const result = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    const document: UploadAsset = {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      label: requirement.name,
      requirementId: requirement.id,
    };
    if (travelerId) {
      setTravelers((current) => current.map((item) => item.id === travelerId ? { ...item, docs: { ...item.docs, [requirement.id]: document } } : item));
    } else {
      setCaseDocs((current) => ({ ...current, [requirement.id]: document }));
    }
  }

  function removeDocument(requirementId: string, travelerId?: string) {
    if (travelerId) {
      setTravelers((current) => current.map((item) => item.id === travelerId ? { ...item, docs: { ...item.docs, [requirementId]: null } } : item));
    } else {
      setCaseDocs((current) => ({ ...current, [requirementId]: null }));
    }
  }

  async function submit() {
    try {
      setBusy(true);
      setError("");
      const documents: UploadAsset[] = [];
      caseDocumentRequirements.forEach((requirement) => {
        const document = caseDocs[requirement.id];
        if (document) documents.push({ ...document, requirementId: requirement.id, label: requirement.name });
      });
      travelers.forEach((traveler, travelerIndex) => travelerDocumentRequirements.forEach((requirement) => {
        const document = traveler.docs[requirement.id];
        if (document) documents.push({ ...document, requirementId: requirement.id, travelerIndex, label: requirement.name });
      }));

      const serviceRef = selectedPackage ?? umrahService;
      const id = await submitContactRequestWithDocuments({
        name: travelers[0].name,
        phone,
        service: serviceRef?.name ?? "العمرة",
        serviceId: serviceRef?.id,
        message: "طلب عمرة عبر تطبيق نسائم الحرمين",
        travelerCount: travelers.length,
        intakeData: {
          kind: "umrah",
          travelDate: travelDate || undefined,
          package: selectedPackage ? {
            id: selectedPackage.id,
            name: selectedPackage.name,
            basePrice: selectedPackage.basePrice,
            currency: selectedPackage.currency,
            priceSdg: selectedPackage.priceSdg,
          } : undefined,
          guarantors: travelers.map((item) => ({ travelerName: item.name, guarantorNumber: item.guarantorNumber || undefined })),
        },
        travelers: travelers.map((item, index) => ({
          fullName: item.name,
          passportNo: item.passport,
          nationality: item.nationality,
          birthDate: item.birthDate,
          isPrimary: index === 0,
        })),
      }, documents);
      setRequestId(id);
      setStep(4);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إرسال طلب العمرة");
    } finally {
      setBusy(false);
    }
  }

  if (requestId) {
    return (
      <SafeAreaView style={s.safe}>
        <BrandHeader title="تم استلام طلبك" subtitle="فريق نسائم الحرمين سيؤكد الطلب ويرسل لك السعر وخطوة الدفع." />
        <StepIndicator steps={STEPS} current={4} />
        <ScrollView contentContainerStyle={s.page}>
          <SurfaceCard style={s.successCard}>
            <Text style={s.successIcon}>✓</Text>
            <Text style={s.successTitle}>طلب العمرة وصل للوكالة</Text>
            <Text style={s.successText}>احتفظ برقم الطلب لمتابعة السعر، الدفع، وإصدار التأشيرة.</Text>
            <View style={s.requestBox}><Text style={s.requestLabel}>رقم الطلب</Text><Text selectable style={s.requestId}>{requestId}</Text></View>
          </SurfaceCard>
          <SurfaceCard>
            <Text style={s.cardTitle}>ماذا سيحدث الآن؟</Text>
            <Text style={s.timeline}>1. تأكيد استلام الطلب والسعر النهائي</Text>
            <Text style={s.timeline}>2. موافقتك على السعر ورفع إشعار الدفع</Text>
            <Text style={s.timeline}>3. قبول الدفع وانتظار إصدار التأشيرة</Text>
            <Text style={s.timeline}>4. رفع التأشيرة وإرسال إشعار لك</Text>
          </SurfaceCard>
          <AppButton label="متابعة الطلب" onPress={() => router.push({ pathname: "/track", params: { requestId, phone } })} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <BrandHeader
        title={step === 0 ? "تأشيرة العمرة" : step === 1 ? "بيانات المسافر" : step === 2 ? "المستندات" : "مراجعة الطلب"}
        subtitle={step === 0 ? "اختر الخدمة والسعر معروف من البداية" : step === 1 ? "المعلومات الأساسية فقط — بدون تعقيد" : step === 2 ? "ارفع المطلوب وسنراجع الملفات" : "تأكد من البيانات قبل الإرسال"}
        compact
      />
      <StepIndicator steps={STEPS} current={step} />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <Text style={s.sectionTitle}>اختر نوع العمرة</Text>
            {catalogLoading ? <ActivityIndicator color={colors.navy} /> : null}
            {packages.map((item) => {
              const sdg = formatSdgEquivalent(item.priceSdg);
              return (
                <ChoiceCard
                  key={item.id}
                  icon="🕋"
                  title={item.name ?? "باقة عمرة"}
                  subtitle={[item.description, sdg].filter(Boolean).join(" · ")}
                  meta={formatPrice(item.basePrice, item.currency)}
                  selected={selectedPackageId === item.id}
                  onPress={() => { setSelectedPackageId(item.id); setError(""); }}
                />
              );
            })}
            <SurfaceCard style={s.goldNotice}>
              <Text style={s.goldTitle}>السعر ظاهر من البداية</Text>
              <Text style={s.goldText}>الدفع يفتح فقط بعد قبول الوكالة للطلب وتأكيد السعر النهائي.</Text>
            </SurfaceCard>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <FormField label="رقم هاتف مقدم الطلب" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0912345678" />
            <FormField label="تاريخ السفر المتوقع" optional value={travelDate} onChangeText={setTravelDate} placeholder="YYYY-MM-DD" />
            {travelers.map((traveler, index) => (
              <SurfaceCard key={traveler.id}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>مسافر {index + 1}</Text>
                  {travelers.length > 1 ? <Pressable onPress={() => setTravelers((current) => current.filter((item) => item.id !== traveler.id))}><Text style={s.remove}>حذف</Text></Pressable> : null}
                </View>
                <View style={s.formGap}>
                  <FormField label="الاسم الكامل" value={traveler.name} onChangeText={(name) => updateTraveler(traveler.id, { name })} placeholder="كما في الجواز" />
                  <FormField label="تاريخ الميلاد" value={traveler.birthDate} onChangeText={(birthDate) => updateTraveler(traveler.id, { birthDate })} placeholder="YYYY-MM-DD" />
                  <FormField label="رقم الجواز" value={traveler.passport} onChangeText={(passport) => updateTraveler(traveler.id, { passport })} placeholder="P00000000" autoCapitalize="characters" />
                  <FormField label="الجنسية" value={traveler.nationality} onChangeText={(nationality) => updateTraveler(traveler.id, { nationality })} placeholder="الجنسية" />
                  <FormField label="رقم الضامن السعودي" optional value={traveler.guarantorNumber} onChangeText={(guarantorNumber) => updateTraveler(traveler.id, { guarantorNumber })} placeholder="05XXXXXXXX" keyboardType="phone-pad" />
                </View>
              </SurfaceCard>
            ))}
            <AppButton label="+ إضافة مسافر" variant="outline" disabled={travelers.length >= 20} onPress={() => setTravelers((current) => [...current, makeTraveler(current.length + 1)])} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            {requirementsLoading ? <ActivityIndicator color={colors.navy} /> : null}
            {!requirementsLoading && !caseDocumentRequirements.length && !travelerDocumentRequirements.length ? (
              <SurfaceCard style={s.goldNotice}>
                <Text style={s.goldTitle}>لا توجد مستندات مطلوبة الآن</Text>
                <Text style={s.goldText}>إذا احتاج الفريق مستندات إضافية سيطلبها منك بعد مراجعة الطلب.</Text>
              </SurfaceCard>
            ) : null}
            {caseDocumentRequirements.length ? (
              <SurfaceCard>
                <Text style={s.cardTitle}>مستندات الطلب</Text>
                <View style={s.docGap}>{caseDocumentRequirements.map((requirement) => (
                  <DocumentRow key={requirement.id} requirement={requirement} file={caseDocs[requirement.id]} onPick={() => void chooseDocument(requirement)} onRemove={() => removeDocument(requirement.id)} />
                ))}</View>
              </SurfaceCard>
            ) : null}
            {travelers.map((traveler, index) => travelerDocumentRequirements.length ? (
              <SurfaceCard key={traveler.id}>
                <Text style={s.cardTitle}>مستندات مسافر {index + 1} — {traveler.name}</Text>
                <View style={s.docGap}>{travelerDocumentRequirements.map((requirement) => (
                  <DocumentRow key={requirement.id} requirement={requirement} file={traveler.docs[requirement.id]} onPick={() => void chooseDocument(requirement, traveler.id)} onRemove={() => removeDocument(requirement.id, traveler.id)} />
                ))}</View>
              </SurfaceCard>
            ) : null)}
            <SurfaceCard style={s.infoCard}><Text style={s.infoText}>بعد الإرسال، الموظف يراجع البيانات والمستندات ثم يفتح لك الدفع.</Text></SurfaceCard>
          </>
        ) : null}

        {step === 3 ? (
          <>
            {selectedPackage ? (
              <SurfaceCard>
                <Text style={s.mutedLabel}>الخدمة المختارة</Text>
                <Text style={s.reviewTitle}>{selectedPackage.name}</Text>
                <Text style={s.reviewPrice}>{formatPrice(selectedPackage.basePrice, selectedPackage.currency)}</Text>
                {formatSdgEquivalent(selectedPackage.priceSdg) ? <Text style={s.reviewSdg}>{formatSdgEquivalent(selectedPackage.priceSdg)}</Text> : null}
              </SurfaceCard>
            ) : null}
            <SurfaceCard>
              <ReviewRow label="رقم الهاتف" value={phone} />
              <ReviewRow label="تاريخ السفر" value={travelDate || "غير محدد"} />
              <ReviewRow label="عدد المسافرين" value={String(travelers.length)} />
            </SurfaceCard>
            {travelers.map((traveler, index) => (
              <SurfaceCard key={traveler.id}>
                <Text style={s.cardTitle}>مسافر {index + 1}</Text>
                <ReviewRow label="الاسم" value={traveler.name} />
                <ReviewRow label="الجواز" value={traveler.passport} />
                <ReviewRow label="الجنسية" value={traveler.nationality} />
              </SurfaceCard>
            ))}
            <SurfaceCard style={s.goldNotice}>
              <Text style={s.goldTitle}>لن تدفع الآن</Text>
              <Text style={s.goldText}>ترسل الطلب أولًا، وبعد موافقة الوكالة يظهر السعر والدفع داخل صفحة المتابعة.</Text>
            </SurfaceCard>
          </>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.actions}>
          {step > 0 ? <AppButton label="رجوع" variant="outline" style={s.backButton} onPress={() => { setError(""); setStep((current) => current - 1); }} /> : null}
          {step < 3 ? (
            <AppButton
              label={step === 0 ? "متابعة إلى البيانات" : step === 1 ? "متابعة إلى المستندات" : "مراجعة الطلب"}
              style={s.nextButton}
              disabled={step === 0 ? !selectedPackageId : step === 1 ? !travelerDataComplete : !documentsComplete}
              onPress={() => { setError(""); setStep((current) => current + 1); }}
            />
          ) : (
            <AppButton label="إرسال الطلب للوكالة" style={s.nextButton} busy={busy} onPress={() => void submit()} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DocumentRow({ requirement, file, onPick, onRemove }: { requirement: PublicRequirement; file?: UploadAsset | null; onPick: () => void; onRemove: () => void }) {
  return (
    <View style={s.documentRow}>
      <View style={s.documentCopy}>
        <Text style={s.documentTitle}>{requirement.name}{requirement.required ? " *" : ""}</Text>
        <Text numberOfLines={1} style={file ? s.documentReady : s.documentHint}>{file ? `تم الرفع: ${file.name}` : "اضغط لاختيار صورة أو PDF"}</Text>
      </View>
      <Pressable onPress={file ? onRemove : onPick} style={[s.documentButton, file && s.documentButtonDone]}>
        <Text style={file ? s.documentButtonDoneText : s.documentButtonText}>{file ? "إزالة" : "رفع الملف"}</Text>
      </Pressable>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <View style={s.reviewRow}><Text style={s.reviewValue}>{value}</Text><Text style={s.mutedLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 16, gap: 12, paddingBottom: 38 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "900", textAlign: "right", marginBottom: 2 },
  goldNotice: { backgroundColor: colors.goldSoft, borderColor: "#F4E5AD" }, goldTitle: { color: colors.gold, fontSize: 12, fontWeight: "900", textAlign: "right" }, goldText: { color: colors.muted, fontSize: 10.5, lineHeight: 18, textAlign: "right", marginTop: 5 },
  cardHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, cardTitle: { color: colors.text, fontSize: 13.5, fontWeight: "900", textAlign: "right" }, remove: { color: colors.danger, fontSize: 11, fontWeight: "800" }, formGap: { gap: 12 },
  docGap: { gap: 10, marginTop: 12 }, documentRow: { minHeight: 72, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 10 }, documentCopy: { flex: 1 }, documentTitle: { color: colors.text, fontSize: 11.5, fontWeight: "800", textAlign: "right" }, documentHint: { color: colors.subtle, fontSize: 9.5, textAlign: "right", marginTop: 4 }, documentReady: { color: colors.success, fontSize: 9.5, fontWeight: "700", textAlign: "right", marginTop: 4 }, documentButton: { backgroundColor: colors.navy, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 }, documentButtonText: { color: "#FFF", fontSize: 10, fontWeight: "800" }, documentButtonDone: { backgroundColor: colors.successSoft }, documentButtonDoneText: { color: colors.success, fontSize: 10, fontWeight: "800" },
  infoCard: { backgroundColor: colors.blueSoft }, infoText: { color: colors.navy, fontSize: 10.5, lineHeight: 18, textAlign: "right" },
  mutedLabel: { color: colors.muted, fontSize: 10.5, textAlign: "right" }, reviewTitle: { color: colors.text, fontSize: 17, fontWeight: "900", textAlign: "right", marginTop: 5 }, reviewPrice: { color: colors.navy, fontSize: 22, fontWeight: "900", textAlign: "right", marginTop: 10 }, reviewSdg: { color: colors.gold, fontSize: 11, fontWeight: "800", textAlign: "right", marginTop: 3 }, reviewRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }, reviewValue: { color: colors.text, fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 }, backButton: { flex: 1 }, nextButton: { flex: 2 }, error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 12, textAlign: "right", fontSize: 11, fontWeight: "700" },
  successCard: { alignItems: "center", paddingVertical: 26 }, successIcon: { width: 58, height: 58, borderRadius: 29, color: "#FFF", backgroundColor: colors.success, fontSize: 31, fontWeight: "900", textAlign: "center", textAlignVertical: "center" }, successTitle: { color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "center", marginTop: 14 }, successText: { color: colors.muted, fontSize: 11, lineHeight: 19, textAlign: "center", marginTop: 7 }, requestBox: { alignSelf: "stretch", backgroundColor: colors.soft, borderRadius: radius.md, padding: 14, marginTop: 18 }, requestLabel: { color: colors.muted, fontSize: 10, textAlign: "center" }, requestId: { color: colors.navy, fontFamily: "monospace", fontSize: 15, fontWeight: "900", textAlign: "center", marginTop: 5 }, timeline: { color: colors.muted, fontSize: 11, lineHeight: 24, textAlign: "right", marginTop: 5 },
});
