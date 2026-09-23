import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getPublicServices,
  getPublicVisaTypes,
  getVisaRequirements,
  PublicRequirement,
  PublicService,
  PublicVisaType,
} from "../src/api/services";
import { submitContactRequestWithDocuments, UploadAsset } from "../src/api/requests";
import { colors } from "../src/theme";
import { formatPrice, formatSdgEquivalent } from "../src/utils/price";

type Stage = "visitors" | "sponsor" | "documents" | "review";
type Visitor = {
  id: string;
  fullName: string;
  birthDate: string;
  passportNo: string;
  nationality: string;
  relationship: string;
  docs: Record<string, UploadAsset | null>;
};

const makeVisitor = (index: number): Visitor => ({
  id: `visitor-${Date.now()}-${index}`,
  fullName: "",
  birthDate: "",
  passportNo: "",
  nationality: "",
  relationship: "",
  docs: {},
});

export default function FamilyVisitRequestScreen() {
  const [stage, setStage] = useState<Stage>("visitors");
  const [service, setService] = useState<PublicService | null>(null);
  const [visaType, setVisaType] = useState<PublicVisaType | null>(null);
  const [requirements, setRequirements] = useState<PublicRequirement[]>([]);
  const [loading, setLoading] = useState(true);

  const [visitors, setVisitors] = useState<Visitor[]>([makeVisitor(1)]);
  const [sponsorIqama, setSponsorIqama] = useState("");
  const [sponsorPhone, setSponsorPhone] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [caseDocs, setCaseDocs] = useState<Record<string, UploadAsset | null>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [services, visaTypes] = await Promise.all([
          getPublicServices(),
          getPublicVisaTypes(),
        ]);
        if (!active) return;
        const foundService =
          services.find((item) =>
            (item.category ?? "").toLowerCase().includes("family")
          ) ?? null;
        const foundVisa =
          visaTypes.find(
            (item) => (item.code ?? "").toUpperCase() === "VISA-FAMILY-VISIT"
          ) ??
          visaTypes.find((item) => item.serviceId === foundService?.id) ??
          null;
        setService(foundService);
        setVisaType(foundVisa);
        if (foundVisa) setRequirements(await getVisaRequirements(foundVisa.id));
      } catch {
        if (active) setError("تعذر تحميل متطلبات الزيارة من الإدارة.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const travelerRequirements = useMemo(
    () =>
      requirements.filter(
        (item) =>
          (item.type ?? "DOCUMENT") === "DOCUMENT" && item.scope === "TRAVELER"
      ),
    [requirements]
  );
  const caseRequirements = useMemo(
    () =>
      requirements.filter(
        (item) =>
          (item.type ?? "DOCUMENT") === "DOCUMENT" && item.scope !== "TRAVELER"
      ),
    [requirements]
  );

  const price = visaType?.basePrice ?? service?.basePrice;
  const currency = visaType?.currency ?? service?.currency;
  const priceSdg = visaType?.priceSdg ?? service?.priceSdg;

  const updateVisitor = (id: string, patch: Partial<Visitor>) =>
    setVisitors((current) =>
      current.map((visitor) => (visitor.id === id ? { ...visitor, ...patch } : visitor))
    );

  const visitorsComplete = visitors.every(
    (visitor) =>
      visitor.fullName.trim() &&
      visitor.birthDate.trim() &&
      visitor.passportNo.trim() &&
      visitor.nationality.trim() &&
      visitor.relationship.trim()
  );

  const sponsorComplete = sponsorIqama.trim().length >= 5 && sponsorPhone.trim().length >= 6;

  const docsComplete =
    !loading &&
    visitors.every((visitor) =>
      travelerRequirements
        .filter((requirement) => requirement.required)
        .every((requirement) => Boolean(visitor.docs[requirement.id]))
    ) &&
    caseRequirements
      .filter((requirement) => requirement.required)
      .every((requirement) => Boolean(caseDocs[requirement.id]));

  async function pickFile(requirement: PublicRequirement) {
    const types = requirement.allowedMimeTypes?.length
      ? requirement.allowedMimeTypes
      : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const result = await DocumentPicker.getDocumentAsync({
      type: types,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      label: requirement.name,
      requirementId: requirement.id,
    } satisfies UploadAsset;
  }

  async function pickVisitorDocument(visitorId: string, requirement: PublicRequirement) {
    const file = await pickFile(requirement);
    if (!file) return;
    setVisitors((current) =>
      current.map((visitor) =>
        visitor.id === visitorId
          ? {
              ...visitor,
              docs: { ...visitor.docs, [requirement.id]: file },
            }
          : visitor
      )
    );
  }

  async function pickCaseDocument(requirement: PublicRequirement) {
    const file = await pickFile(requirement);
    if (!file) return;
    setCaseDocs((current) => ({ ...current, [requirement.id]: file }));
  }

  async function submit() {
    if (!visaType) {
      setError("نوع الزيارة غير منشور في الإدارة.");
      return;
    }

    const documents: UploadAsset[] = [];
    visitors.forEach((visitor, visitorIndex) => {
      travelerRequirements.forEach((requirement) => {
        const file = visitor.docs[requirement.id];
        if (file) {
          documents.push({
            ...file,
            requirementId: requirement.id,
            travelerIndex: visitorIndex,
            label: requirement.name,
          });
        }
      });
    });
    caseRequirements.forEach((requirement) => {
      const file = caseDocs[requirement.id];
      if (file) {
        documents.push({
          ...file,
          requirementId: requirement.id,
          label: requirement.name,
        });
      }
    });

    try {
      setBusy(true);
      setError("");
      const id = await submitContactRequestWithDocuments(
        {
          name: visitors[0].fullName,
          phone: contactPhone.trim(),
          service: service?.name ?? visaType.name ?? "الزيارة العائلية السعودية",
          serviceId: service?.id,
          visaTypeId: visaType.id,
          message: "طلب زيارة عائلية سعودية عبر تطبيق نسائم الحرمين",
          travelerCount: visitors.length,
          intakeData: {
            kind: "family",
            sponsor: {
              iqama: sponsorIqama,
              phone: sponsorPhone,
            },
            visitorRelationships: visitors.map((visitor) => ({
              visitorName: visitor.fullName,
              relationship: visitor.relationship,
            })),
          },
          travelers: visitors.map((visitor, index) => ({
            fullName: visitor.fullName,
            birthDate: visitor.birthDate,
            passportNo: visitor.passportNo,
            nationality: visitor.nationality,
            isPrimary: index === 0,
          })),
        },
        documents
      );
      setRequestId(id);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "تعذر إرسال طلب الزيارة"
      );
    } finally {
      setBusy(false);
    }
  }

  if (requestId) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.success}>
          <View style={s.successCircle}>
            <Text style={s.successIcon}>✓</Text>
          </View>
          <Text style={s.successTitle}>تم استلام طلب الزيارة</Text>
          <Text style={s.successText}>
            الوكالة حتراجع البيانات والمستندات. بعد اعتماد الطلب يفتح الدفع وتظهر
            ليك الخطوة المطلوبة فقط.
          </Text>
          <View style={s.requestBox}>
            <Text style={s.muted}>رقم الطلب</Text>
            <Text style={s.requestId}>{requestId}</Text>
          </View>
          {contactPhone.trim().length >= 6 ? (
            <Pressable
              style={s.goldButton}
              onPress={() =>
                router.push({
                  pathname: "/track",
                  params: { requestId, phone: contactPhone },
                })
              }
            >
              <Text style={s.goldButtonText}>متابعة الطلب</Text>
            </Pressable>
          ) : (
            <Pressable style={s.outlineButton} onPress={() => router.replace("/")}>
              <Text style={s.outlineButtonText}>العودة للرئيسية</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.hero}>
        <View style={s.orbOne} />
        <View style={s.orbTwo} />
        <Text style={s.kicker}>🇸🇦  الزيارة العائلية السعودية</Text>
        <Text style={s.heroTitle}>{titleFor(stage)}</Text>
        <Text style={s.heroText}>{subtitleFor(stage)}</Text>
      </View>

      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <Progress stage={stage} />

        {loading ? <ActivityIndicator color={colors.navy} /> : null}

        {stage === "visitors" ? (
          <>
            <View style={s.sectionHead}>
              <Pressable
                onPress={() =>
                  setVisitors((current) => [...current, makeVisitor(current.length + 1)])
                }
              >
                <Text style={s.addLink}>+ إضافة زائر</Text>
              </Pressable>
              <Text style={s.sectionTitle}>بيانات الزائر</Text>
            </View>

            {visitors.map((visitor, index) => (
              <View key={visitor.id} style={s.card}>
                <View style={s.cardHead}>
                  {visitors.length > 1 ? (
                    <Pressable
                      onPress={() =>
                        setVisitors((current) =>
                          current.filter((item) => item.id !== visitor.id)
                        )
                      }
                    >
                      <Text style={s.remove}>حذف</Text>
                    </Pressable>
                  ) : (
                    <Text style={s.badge}>الزائر الرئيسي</Text>
                  )}
                  <Text style={s.cardTitle}>زائر {index + 1}</Text>
                </View>
                <Field
                  label="الاسم الكامل"
                  value={visitor.fullName}
                  onChangeText={(fullName) => updateVisitor(visitor.id, { fullName })}
                  placeholder="كما في الجواز"
                />
                <Field
                  label="تاريخ الميلاد"
                  value={visitor.birthDate}
                  onChangeText={(birthDate) => updateVisitor(visitor.id, { birthDate })}
                  placeholder="YYYY-MM-DD"
                />
                <Field
                  label="رقم الجواز"
                  value={visitor.passportNo}
                  onChangeText={(passportNo) =>
                    updateVisitor(visitor.id, { passportNo: passportNo.toUpperCase() })
                  }
                  placeholder="P00000000"
                />
                <Field
                  label="الجنسية"
                  value={visitor.nationality}
                  onChangeText={(nationality) => updateVisitor(visitor.id, { nationality })}
                  placeholder="مثال: سوداني"
                />
                <Field
                  label="صلة القرابة"
                  value={visitor.relationship}
                  onChangeText={(relationship) =>
                    updateVisitor(visitor.id, { relationship })
                  }
                  placeholder="زوجة، ابن، أم..."
                />
              </View>
            ))}
          </>
        ) : null}

        {stage === "sponsor" ? (
          <>
            <Text style={s.sectionTitle}>بيانات المضيف في السعودية</Text>
            <View style={s.card}>
              <Field
                label="رقم الهوية / الإقامة"
                value={sponsorIqama}
                onChangeText={setSponsorIqama}
                placeholder="رقم المضيف"
                keyboardType="number-pad"
              />
              <Field
                label="رقم الجوال السعودي"
                value={sponsorPhone}
                onChangeText={setSponsorPhone}
                placeholder="05XXXXXXXX"
                keyboardType="phone-pad"
              />
              <View>
                <Text style={s.fieldLabel}>رقم التواصل السوداني — اختياري</Text>
                <TextInput
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  placeholder="09XXXXXXXX"
                  style={s.input}
                  textAlign="right"
                  keyboardType="phone-pad"
                />
                <Text style={s.helper}>
                  يستخدم لمتابعة الطلب عبر واتساب إذا رغبت.
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {stage === "documents" ? (
          <>
            <View style={s.priceCard}>
              <Text style={s.muted}>سعر الخدمة</Text>
              <Text style={s.price}>
                {formatPrice(price, currency, "السعر قيد المراجعة")}
              </Text>
              {formatSdgEquivalent(priceSdg) ? (
                <Text style={s.sdg}>{formatSdgEquivalent(priceSdg)}</Text>
              ) : null}
              <Text style={s.helper}>الدفع يفتح بعد قبول الطلب من الوكالة.</Text>
            </View>

            <Text style={s.sectionTitle}>مستندات الزوار</Text>
            {travelerRequirements.length ? (
              visitors.map((visitor, index) => (
                <View key={visitor.id} style={s.card}>
                  <Text style={s.cardTitle}>
                    زائر {index + 1} — {visitor.fullName}
                  </Text>
                  {travelerRequirements.map((requirement) => (
                    <DocumentRow
                      key={requirement.id}
                      requirement={requirement}
                      file={visitor.docs[requirement.id] ?? null}
                      onPress={() =>
                        visitor.docs[requirement.id]
                          ? updateVisitor(visitor.id, {
                              docs: { ...visitor.docs, [requirement.id]: null },
                            })
                          : void pickVisitorDocument(visitor.id, requirement)
                      }
                    />
                  ))}
                </View>
              ))
            ) : (
              <Info text="ما في مستندات زائر منشورة حالياً. راجع إعدادات الخدمة قبل الإطلاق." />
            )}

            {caseRequirements.length ? (
              <>
                <Text style={s.sectionTitle}>مستندات الطلب والمضيف</Text>
                <View style={s.card}>
                  {caseRequirements.map((requirement) => (
                    <DocumentRow
                      key={requirement.id}
                      requirement={requirement}
                      file={caseDocs[requirement.id] ?? null}
                      onPress={() =>
                        caseDocs[requirement.id]
                          ? setCaseDocs((current) => ({
                              ...current,
                              [requirement.id]: null,
                            }))
                          : void pickCaseDocument(requirement)
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Info text="بعد الإرسال الوكالة تراجع المستندات. بعدها يفتح الدفع وتبدأ متابعة مراحل الزيارة." />
          </>
        ) : null}

        {stage === "review" ? (
          <>
            <Text style={s.sectionTitle}>راجع الطلب</Text>
            <View style={s.card}>
              <ReviewLine label="المضيف" value={sponsorIqama} />
              <ReviewLine label="الجوال السعودي" value={sponsorPhone} />
              <ReviewLine label="عدد الزوار" value={String(visitors.length)} />
            </View>
            {visitors.map((visitor, index) => (
              <View key={visitor.id} style={s.card}>
                <Text style={s.cardTitle}>
                  زائر {index + 1} — {visitor.fullName}
                </Text>
                <ReviewLine label="الجواز" value={visitor.passportNo} />
                <ReviewLine label="تاريخ الميلاد" value={visitor.birthDate} />
                <ReviewLine label="صلة القرابة" value={visitor.relationship} />
              </View>
            ))}
            <Info text="المراحل الداخلية ما حتظهر كلها مرة واحدة. التطبيق يوريك الإجراء المطلوب منك فقط، مثل البصمة أو أي مستند إضافي." />
          </>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={s.actions}>
          <Pressable
            style={s.outlineButton}
            disabled={busy}
            onPress={() => {
              if (stage === "visitors") router.back();
              else if (stage === "sponsor") setStage("visitors");
              else if (stage === "documents") setStage("sponsor");
              else setStage("documents");
            }}
          >
            <Text style={s.outlineButtonText}>رجوع</Text>
          </Pressable>
          <Pressable
            style={[
              s.goldButton,
              !canContinue(stage, visitorsComplete, sponsorComplete, docsComplete) &&
                s.disabled,
            ]}
            disabled={
              busy ||
              !canContinue(stage, visitorsComplete, sponsorComplete, docsComplete)
            }
            onPress={() => {
              if (stage === "visitors") setStage("sponsor");
              else if (stage === "sponsor") setStage("documents");
              else if (stage === "documents") setStage("review");
              else void submit();
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.navyDark} />
            ) : (
              <Text style={s.goldButtonText}>
                {stage === "review" ? "إرسال للمراجعة" : "استمرار"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function canContinue(
  stage: Stage,
  visitorsComplete: boolean,
  sponsorComplete: boolean,
  docsComplete: boolean
) {
  if (stage === "visitors") return visitorsComplete;
  if (stage === "sponsor") return sponsorComplete;
  if (stage === "documents") return docsComplete;
  return true;
}

function titleFor(stage: Stage) {
  if (stage === "visitors") return "بيانات الزائر";
  if (stage === "sponsor") return "بيانات المضيف";
  if (stage === "documents") return "ارفع المستندات";
  return "راجع وأرسل";
}

function subtitleFor(stage: Stage) {
  if (stage === "visitors") return "أضف زائر واحد أو أكثر";
  if (stage === "sponsor") return "المعلومات الأساسية للمضيف السعودي";
  if (stage === "documents") return "المطلوب المنشور من الإدارة فقط";
  return "الدفع يفتح بعد قبول الطلب";
}

function Progress({ stage }: { stage: Stage }) {
  const labels = ["الزوار", "المضيف", "المستندات", "المراجعة"];
  const index = ["visitors", "sponsor", "documents", "review"].indexOf(stage);
  return (
    <View style={s.progressRow}>
      {labels.map((label, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <View key={label} style={s.step}>
            <View style={[s.stepDot, done && s.stepDone, active && s.stepActive]}>
              <Text style={[s.stepNumber, (done || active) && s.stepNumberActive]}>
                {done ? "✓" : i + 1}
              </Text>
            </View>
            <Text style={[s.stepLabel, active && s.stepLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad" | "number-pad";
}) {
  return (
    <View>
      <Text style={s.fieldLabel}>{label} *</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={s.input}
        textAlign="right"
        keyboardType={keyboardType}
      />
    </View>
  );
}

function DocumentRow({
  requirement,
  file,
  onPress,
}: {
  requirement: PublicRequirement;
  file: UploadAsset | null;
  onPress: () => void;
}) {
  return (
    <View style={s.docRow}>
      <View style={s.docCopy}>
        <Text style={s.docTitle}>
          {requirement.name}
          {requirement.required ? " *" : ""}
        </Text>
        <Text numberOfLines={1} style={file ? s.docOk : s.helper}>
          {file ? file.name : requirement.description ?? "صورة أو PDF"}
        </Text>
      </View>
      <Pressable
        style={[s.docButton, file && s.docButtonDone]}
        onPress={onPress}
      >
        <Text style={file ? s.docButtonDoneText : s.docButtonText}>
          {file ? "✓ تم" : "رفع"}
        </Text>
      </Pressable>
    </View>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.reviewLine}>
      <Text style={s.reviewValue}>{value}</Text>
      <Text style={s.reviewLabel}>{label}</Text>
    </View>
  );
}

function Info({ text }: { text: string }) {
  return (
    <View style={s.info}>
      <Text style={s.infoIcon}>i</Text>
      <Text style={s.infoText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: {
    minHeight: 154,
    overflow: "hidden",
    backgroundColor: colors.navyDark,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
    justifyContent: "flex-end",
  },
  orbOne: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(11,61,145,.5)",
    left: -40,
    top: -42,
  },
  orbTwo: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(212,175,55,.14)",
    right: -10,
    top: 62,
  },
  kicker: { color: colors.gold, fontSize: 10, fontWeight: "900", textAlign: "right" },
  heroTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", textAlign: "right", marginTop: 5 },
  heroText: { color: "#D5DDEC", fontSize: 10.5, textAlign: "right", marginTop: 5 },
  page: { padding: 16, gap: 12, paddingBottom: 38 },
  progressRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  step: { alignItems: "center", minWidth: 68, gap: 4 },
  stepDot: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#E7ECF3",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDone: { backgroundColor: colors.success },
  stepActive: { backgroundColor: colors.navy },
  stepNumber: { color: colors.subtle, fontSize: 9, fontWeight: "900" },
  stepNumberActive: { color: "#FFF" },
  stepLabel: { color: colors.muted, fontSize: 8.5, fontWeight: "700" },
  stepLabelActive: { color: colors.navy, fontWeight: "900" },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: "900", textAlign: "right" },
  addLink: { color: colors.navy, fontSize: 11, fontWeight: "900" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: "900", textAlign: "right" },
  badge: {
    color: colors.navy,
    backgroundColor: "#EEF3FB",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: "900",
  },
  remove: { color: colors.danger, fontSize: 10.5, fontWeight: "800" },
  fieldLabel: { color: colors.muted, fontSize: 9.5, textAlign: "right", marginBottom: 5 },
  input: {
    minHeight: 46,
    backgroundColor: "#F9FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 12,
  },
  helper: { color: colors.muted, fontSize: 9.5, lineHeight: 16, textAlign: "right", marginTop: 5 },
  priceCard: {
    backgroundColor: "#FFF9E9",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F3E5B0",
  },
  price: { color: colors.navy, fontSize: 23, fontWeight: "900", textAlign: "right", marginTop: 3 },
  sdg: { color: colors.text, fontSize: 11, fontWeight: "700", textAlign: "right", marginTop: 3 },
  muted: { color: colors.muted, fontSize: 9.5, textAlign: "right" },
  docRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9FAFC",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
  },
  docCopy: { flex: 1 },
  docTitle: { color: colors.text, fontSize: 11.5, fontWeight: "800", textAlign: "right" },
  docOk: { color: colors.success, fontSize: 9.5, textAlign: "right", marginTop: 3 },
  docButton: {
    backgroundColor: colors.navy,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  docButtonDone: { backgroundColor: "#E8F7ED" },
  docButtonText: { color: "#FFF", fontSize: 9.5, fontWeight: "900" },
  docButtonDoneText: { color: colors.success, fontSize: 9.5, fontWeight: "900" },
  info: {
    backgroundColor: "#EEF5FF",
    borderRadius: 16,
    padding: 13,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  infoIcon: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#DCE9FB",
    color: colors.navy,
    fontWeight: "900",
    textAlign: "center",
    textAlignVertical: "center",
  },
  infoText: { flex: 1, color: colors.muted, fontSize: 9.8, lineHeight: 16, textAlign: "right" },
  reviewLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 9,
  },
  reviewLabel: { color: colors.muted, fontSize: 9.5, textAlign: "right" },
  reviewValue: { flex: 1, color: colors.text, fontSize: 10.5, fontWeight: "700", textAlign: "left" },
  actions: { flexDirection: "row-reverse", gap: 10 },
  goldButton: {
    flex: 2,
    backgroundColor: colors.gold,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  goldButtonText: { color: colors.navyDark, textAlign: "center", fontSize: 12.5, fontWeight: "900" },
  outlineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 12,
  },
  outlineButtonText: { color: colors.navy, textAlign: "center", fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.42 },
  error: { color: colors.danger, fontSize: 10.5, textAlign: "right" },
  success: { flex: 1, justifyContent: "center", padding: 24, gap: 14 },
  successCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#E8F7ED",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  successIcon: { color: colors.success, fontSize: 34, fontWeight: "900" },
  successTitle: { color: colors.text, fontSize: 22, fontWeight: "900", textAlign: "center" },
  successText: { color: colors.muted, fontSize: 11.5, lineHeight: 20, textAlign: "center" },
  requestBox: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  requestId: { color: colors.navy, fontSize: 17, fontWeight: "900", textAlign: "center", marginTop: 5 },
});
