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
import { ServiceLanding } from "../src/components/ServiceLanding";
import { submitContactRequestWithDocuments, UploadAsset } from "../src/api/requests";
import {
  getPublicPackages,
  getPublicServices,
  getServiceRequirements,
  PublicRequirement,
  PublicService,
} from "../src/api/services";
import { colors } from "../src/theme";
import { formatPrice, formatSdgEquivalent } from "../src/utils/price";

type TravelerDocs = Record<string, UploadAsset | null>;
type Traveler = {
  id: string;
  name: string;
  birthDate: string;
  passport: string;
  nationality: string;
  guarantorNumber: string;
  docs: TravelerDocs;
};

type Stage = "landing" | "package" | "traveler" | "documents" | "review";

const makeTraveler = (n: number): Traveler => ({
  id: `traveler-${Date.now()}-${n}`,
  name: "",
  birthDate: "",
  passport: "",
  nationality: "",
  guarantorNumber: "",
  docs: {},
});

export default function UmrahScreen() {
  const [stage, setStage] = useState<Stage>("landing");
  const [travelers, setTravelers] = useState<Traveler[]>([makeTraveler(1)]);
  const [phone, setPhone] = useState("");
  const [packages, setPackages] = useState<PublicService[]>([]);
  const [umrahService, setUmrahService] = useState<PublicService | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [requirements, setRequirements] = useState<PublicRequirement[]>([]);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [services, pkgs] = await Promise.all([getPublicServices(), getPublicPackages()]);
        if (!active) return;
        const umrahPackages = pkgs.filter(
          (item) =>
            (item.category ?? "") === "UMRAH_PACKAGE" ||
            (item.code ?? "").startsWith("SVC-UMRAH-")
        );
        setPackages(umrahPackages);
        const service =
          services.find(
            (item) =>
              (item.code ?? "").toUpperCase() === "SVC-UMRAH" ||
              (item.category ?? "").toLowerCase() === "umrah"
          ) ?? null;
        setUmrahService(service);
        if (umrahPackages.length === 1) setSelectedPackageId(umrahPackages[0].id);
      } catch {
        if (active) setError("تعذر تحميل خيارات العمرة من الإدارة.");
      } finally {
        if (active) setCatalogLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const serviceRef = selectedPackage ?? umrahService;
  const requirementServiceId = serviceRef?.id ?? "";

  useEffect(() => {
    let active = true;
    if (!requirementServiceId) {
      setRequirements([]);
      return () => {
        active = false;
      };
    }
    setRequirementsLoading(true);
    void getServiceRequirements(requirementServiceId)
      .then((list) => {
        if (active) setRequirements(list);
      })
      .catch(() => {
        if (active) {
          setRequirements([]);
          setError("تعذر تحميل متطلبات العمرة من الإدارة.");
        }
      })
      .finally(() => {
        if (active) setRequirementsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requirementServiceId]);

  const travelerDocumentRequirements = useMemo(
    () =>
      requirements.filter(
        (requirement) =>
          (requirement.type ?? "DOCUMENT") === "DOCUMENT" &&
          requirement.scope === "TRAVELER"
      ),
    [requirements]
  );

  const update = (id: string, patch: Partial<Traveler>) =>
    setTravelers((current) =>
      current.map((traveler) => (traveler.id === id ? { ...traveler, ...patch } : traveler))
    );

  const packageComplete = !packages.length || Boolean(selectedPackageId);
  const travelersComplete = travelers.every(
    (traveler) =>
      traveler.name.trim() &&
      traveler.birthDate.trim() &&
      traveler.passport.trim() &&
      traveler.nationality.trim() &&
      traveler.guarantorNumber.trim()
  );
  const documentsComplete =
    !requirementsLoading &&
    travelers.every((traveler) =>
      travelerDocumentRequirements
        .filter((requirement) => requirement.required)
        .every((requirement) => Boolean(traveler.docs[requirement.id]))
    );

  async function pickDocument(travelerId: string, requirement: PublicRequirement) {
    const types = requirement.allowedMimeTypes?.length
      ? requirement.allowedMimeTypes
      : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const result = await DocumentPicker.getDocumentAsync({
      type: types,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const document: UploadAsset = {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      label: requirement.name,
      requirementId: requirement.id,
    };
    setTravelers((current) =>
      current.map((traveler) =>
        traveler.id === travelerId
          ? {
              ...traveler,
              docs: { ...traveler.docs, [requirement.id]: document },
            }
          : traveler
      )
    );
  }

  function removeDocument(travelerId: string, requirementId: string) {
    setTravelers((current) =>
      current.map((traveler) =>
        traveler.id === travelerId
          ? {
              ...traveler,
              docs: { ...traveler.docs, [requirementId]: null },
            }
          : traveler
      )
    );
  }

  async function submit() {
    try {
      setBusy(true);
      setError("");
      const documents: UploadAsset[] = [];
      travelers.forEach((traveler, index) => {
        travelerDocumentRequirements.forEach((requirement) => {
          const document = traveler.docs[requirement.id];
          if (document) {
            documents.push({
              ...document,
              requirementId: requirement.id,
              travelerIndex: index,
              label: requirement.name,
            });
          }
        });
      });

      const id = await submitContactRequestWithDocuments(
        {
          name: travelers[0].name,
          phone: phone.trim(),
          service: serviceRef?.name ?? "العمرة",
          serviceId: serviceRef?.id,
          message: "طلب عمرة عبر تطبيق نسائم الحرمين",
          travelerCount: travelers.length,
          intakeData: {
            kind: "umrah",
            package: selectedPackage
              ? {
                  id: selectedPackage.id,
                  name: selectedPackage.name,
                  basePrice: selectedPackage.basePrice,
                  currency: selectedPackage.currency,
                  priceSdg: selectedPackage.priceSdg,
                }
              : undefined,
            guarantors: travelers.map((traveler) => ({
              travelerName: traveler.name,
              guarantorNumber: traveler.guarantorNumber,
            })),
          },
          travelers: travelers.map((traveler, index) => ({
            fullName: traveler.name,
            birthDate: traveler.birthDate,
            passportNo: traveler.passport,
            nationality: traveler.nationality,
            isPrimary: index === 0,
          })),
        },
        documents
      );
      setRequestId(id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر إرسال طلب العمرة");
    } finally {
      setBusy(false);
    }
  }

  if (requestId) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.successPage}>
          <View style={s.successCircle}>
            <Text style={s.successIcon}>✓</Text>
          </View>
          <Text style={s.successTitle}>طلبك وصلنا</Text>
          <Text style={s.successText}>
            تم استلام البيانات والمستندات. الآن الوكالة بتراجع الطلب، والدفع حيظهر
            ليك بعد القبول.
          </Text>
          <View style={s.requestBox}>
            <Text style={s.smallLabel}>رقم الطلب</Text>
            <Text style={s.requestId}>{requestId}</Text>
          </View>
          {phone.trim().length >= 6 ? (
            <Pressable
              style={s.goldButton}
              onPress={() =>
                router.push({ pathname: "/track", params: { requestId, phone } })
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

  if (stage === "landing") {
    return (
      <ServiceLanding
        icon="🕋"
        kicker="رحلة العمرة"
        title="تأشيرة العمرة"
        subtitle="اختار الخدمة، ارفع المطلوب، وبعد قبول الوكالة ادفع وتابع الإصدار."
        description="العمرة عندنا رحلة قصيرة وواضحة. السعر المنشور يظهر من البداية، لكن الدفع ما يفتح إلا بعد ما الموظف يراجع ويقبل بياناتك ومستنداتك."
        highlights={[
          "اختيار تأشيرة فقط أو عمرة مع خدمات",
          "بيانات المسافر والضامن السعودي",
          "رفع الجواز وهوية / إقامة الضامن",
          "مراجعة الوكالة ثم الدفع والمتابعة",
        ]}
        price={umrahService?.basePrice}
        currency={umrahService?.currency}
        priceSdg={umrahService?.priceSdg}
        onStart={() => setStage("package")}
        onBack={() => router.back()}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={s.headerOrb} />
        <Text style={s.headerKicker}>🕋  رحلة العمرة</Text>
        <Text style={s.headerTitle}>{stageTitle(stage)}</Text>
        <Text style={s.headerText}>{stageSubtitle(stage)}</Text>
      </View>

      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <JourneyProgress stage={stage} />

        {stage === "package" ? (
          <>
            <Text style={s.sectionTitle}>اختار نوع الخدمة</Text>
            {catalogLoading ? (
              <ActivityIndicator color={colors.navy} />
            ) : packages.length ? (
              packages.map((item) => {
                const selected = item.id === selectedPackageId;
                return (
                  <Pressable
                    key={item.id}
                    style={[s.choiceCard, selected && s.choiceActive]}
                    onPress={() => setSelectedPackageId(item.id)}
                  >
                    <View style={s.choiceTop}>
                      <View style={[s.radio, selected && s.radioActive]}>
                        {selected ? <Text style={s.radioText}>✓</Text> : null}
                      </View>
                      <View style={s.choiceCopy}>
                        <Text style={[s.choiceTitle, selected && s.choiceTitleActive]}>
                          {item.name ?? "خدمة عمرة"}
                        </Text>
                        <Text style={s.price}>
                          {formatPrice(item.basePrice, item.currency, "السعر قيد المراجعة")}
                        </Text>
                        {formatSdgEquivalent(item.priceSdg) ? (
                          <Text style={s.sdg}>{formatSdgEquivalent(item.priceSdg)}</Text>
                        ) : null}
                      </View>
                    </View>
                    {item.description ? (
                      <Text style={s.choiceDescription}>{item.description}</Text>
                    ) : null}
                  </Pressable>
                );
              })
            ) : (
              <View style={s.infoCard}>
                <Text style={s.infoTitle}>تأشيرة العمرة</Text>
                <Text style={s.infoText}>
                  الخدمة متاحة، والسعر يظهر من الإدارة عند نشره.
                </Text>
              </View>
            )}
            <InfoNote text="السعر المنشور يظهر من البداية، لكن الدفع يفتح بعد قبول المستندات." />
          </>
        ) : null}

        {stage === "traveler" ? (
          <>
            <View style={s.sectionHead}>
              <Pressable
                onPress={() =>
                  setTravelers((current) => [...current, makeTraveler(current.length + 1)])
                }
              >
                <Text style={s.addLink}>+ إضافة مسافر</Text>
              </Pressable>
              <Text style={s.sectionTitle}>بيانات المسافر</Text>
            </View>

            {travelers.map((traveler, index) => (
              <View key={traveler.id} style={s.card}>
                <View style={s.cardHead}>
                  {travelers.length > 1 ? (
                    <Pressable
                      onPress={() =>
                        setTravelers((current) =>
                          current.filter((item) => item.id !== traveler.id)
                        )
                      }
                    >
                      <Text style={s.remove}>حذف</Text>
                    </Pressable>
                  ) : (
                    <Text style={s.primaryBadge}>المسافر الرئيسي</Text>
                  )}
                  <Text style={s.cardTitle}>مسافر {index + 1}</Text>
                </View>

                <Field
                  label="الاسم الكامل"
                  value={traveler.name}
                  onChangeText={(name) => update(traveler.id, { name })}
                  placeholder="كما في الجواز"
                />
                <Field
                  label="تاريخ الميلاد"
                  value={traveler.birthDate}
                  onChangeText={(birthDate) => update(traveler.id, { birthDate })}
                  placeholder="YYYY-MM-DD"
                />
                <Field
                  label="رقم الجواز"
                  value={traveler.passport}
                  onChangeText={(passport) => update(traveler.id, { passport })}
                  placeholder="P00000000"
                />
                <Field
                  label="الجنسية"
                  value={traveler.nationality}
                  onChangeText={(nationality) => update(traveler.id, { nationality })}
                  placeholder="مثال: سوداني"
                />
                <Field
                  label="رقم الضامن السعودي"
                  value={traveler.guarantorNumber}
                  onChangeText={(guarantorNumber) =>
                    update(traveler.id, { guarantorNumber })
                  }
                  placeholder="05XXXXXXXX"
                  keyboardType="phone-pad"
                />
              </View>
            ))}

            <View style={s.card}>
              <Text style={s.cardTitle}>رقم الهاتف السوداني</Text>
              <Text style={s.helper}>
                اختياري — أدخله لو داير متابعة الطلب واستلام تحديثات واتساب.
              </Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="09XXXXXXXX"
                keyboardType="phone-pad"
                style={s.input}
                textAlign="right"
              />
            </View>

            <InfoNote text="رقم الضامن السعودي إلزامي لكل مسافر. رقم السودان اختياري." />
          </>
        ) : null}

        {stage === "documents" ? (
          <>
            <Text style={s.sectionTitle}>المستندات</Text>
            {requirementsLoading ? (
              <ActivityIndicator color={colors.navy} />
            ) : travelerDocumentRequirements.length ? (
              travelers.map((traveler, index) => (
                <View key={traveler.id} style={s.card}>
                  <Text style={s.cardTitle}>
                    مستندات مسافر {index + 1} — {traveler.name}
                  </Text>
                  {travelerDocumentRequirements.map((requirement) => (
                    <DocumentRow
                      key={requirement.id}
                      requirement={requirement}
                      file={traveler.docs[requirement.id] ?? null}
                      onPick={() => pickDocument(traveler.id, requirement)}
                      onRemove={() => removeDocument(traveler.id, requirement.id)}
                    />
                  ))}
                </View>
              ))
            ) : (
              <InfoNote text="ما في مستندات منشورة لهذه الخدمة حالياً. راجع إعدادات المتطلبات في الإدارة قبل الإطلاق." />
            )}
            <InfoNote text="بعد الإرسال، الموظف يراجع البيانات والمستندات. عند القبول يفتح الدفع تلقائياً داخل طلباتك." />
          </>
        ) : null}

        {stage === "review" ? (
          <>
            <Text style={s.sectionTitle}>راجع طلبك</Text>
            <View style={s.card}>
              <Text style={s.smallLabel}>الخدمة المختارة</Text>
              <Text style={s.reviewMain}>{serviceRef?.name ?? "العمرة"}</Text>
              <Text style={s.price}>
                {formatPrice(
                  serviceRef?.basePrice,
                  serviceRef?.currency,
                  "السعر قيد المراجعة"
                )}
              </Text>
              {formatSdgEquivalent(serviceRef?.priceSdg) ? (
                <Text style={s.sdg}>{formatSdgEquivalent(serviceRef?.priceSdg)}</Text>
              ) : null}
            </View>

            {travelers.map((traveler, index) => (
              <View key={traveler.id} style={s.card}>
                <Text style={s.cardTitle}>
                  مسافر {index + 1} — {traveler.name}
                </Text>
                <ReviewLine label="تاريخ الميلاد" value={traveler.birthDate} />
                <ReviewLine label="رقم الجواز" value={traveler.passport} />
                <ReviewLine label="الجنسية" value={traveler.nationality} />
                <ReviewLine label="الضامن السعودي" value={traveler.guarantorNumber} />
                {travelerDocumentRequirements.map((requirement) => (
                  <ReviewLine
                    key={requirement.id}
                    label={requirement.name}
                    value={traveler.docs[requirement.id]?.name ?? "غير مرفق"}
                  />
                ))}
              </View>
            ))}

            <InfoNote text="إرسال الطلب لا يعني الدفع. الدفع يفتح بعد ما الوكالة تعتمد المستندات." />
          </>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={s.actions}>
          <Pressable
            style={s.backButton}
            onPress={() => setStage(previousStage(stage))}
            disabled={busy}
          >
            <Text style={s.backButtonText}>رجوع</Text>
          </Pressable>
          <Pressable
            style={[
              s.goldButton,
              !canContinue(stage, packageComplete, travelersComplete, documentsComplete) &&
                s.disabled,
            ]}
            disabled={
              busy ||
              !canContinue(stage, packageComplete, travelersComplete, documentsComplete)
            }
            onPress={() => {
              if (stage === "package") setStage("traveler");
              else if (stage === "traveler") setStage("documents");
              else if (stage === "documents") setStage("review");
              else if (stage === "review") void submit();
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

function stageTitle(stage: Stage) {
  if (stage === "package") return "اختار خدمة العمرة";
  if (stage === "traveler") return "بيانات المسافر";
  if (stage === "documents") return "ارفع المستندات";
  return "مراجعة الطلب";
}

function stageSubtitle(stage: Stage) {
  if (stage === "package") return "السعر ظاهر من البداية";
  if (stage === "traveler") return "المعلومات الأساسية فقط";
  if (stage === "documents") return "ارفع المطلوب لكل مسافر";
  return "تأكد من البيانات قبل الإرسال";
}

function previousStage(stage: Stage): Stage {
  if (stage === "traveler") return "package";
  if (stage === "documents") return "traveler";
  if (stage === "review") return "documents";
  return "landing";
}

function canContinue(
  stage: Stage,
  packageComplete: boolean,
  travelersComplete: boolean,
  documentsComplete: boolean
) {
  if (stage === "package") return packageComplete;
  if (stage === "traveler") return travelersComplete;
  if (stage === "documents") return documentsComplete;
  return true;
}

function JourneyProgress({ stage }: { stage: Stage }) {
  const steps = ["الخدمة", "المسافر", "المستندات", "المراجعة"];
  const index = Math.max(0, ["package", "traveler", "documents", "review"].indexOf(stage));
  return (
    <View style={s.progressRow}>
      {steps.map((label, stepIndex) => {
        const done = stepIndex < index;
        const active = stepIndex === index;
        return (
          <View key={label} style={s.step}>
            <View
              style={[
                s.stepDot,
                done && s.stepDone,
                active && s.stepActive,
              ]}
            >
              <Text
                style={[
                  s.stepDotText,
                  (done || active) && s.stepDotTextActive,
                ]}
              >
                {done ? "✓" : stepIndex + 1}
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
  keyboardType?: "default" | "phone-pad";
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
  onPick,
  onRemove,
}: {
  requirement: PublicRequirement;
  file: UploadAsset | null;
  onPick: () => void;
  onRemove: () => void;
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
        onPress={file ? onRemove : onPick}
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

function InfoNote({ text }: { text: string }) {
  return (
    <View style={s.infoCard}>
      <Text style={s.infoMark}>i</Text>
      <Text style={s.infoText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    overflow: "hidden",
    backgroundColor: colors.navyDark,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
    minHeight: 148,
    justifyContent: "flex-end",
  },
  headerOrb: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(11,61,145,.5)",
    left: -34,
    top: -42,
  },
  headerKicker: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "right",
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 23,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 5,
  },
  headerText: {
    color: "#D4DEEE",
    fontSize: 10.5,
    textAlign: "right",
    marginTop: 5,
  },
  page: { padding: 16, gap: 12, paddingBottom: 38 },
  progressRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 12,
  },
  step: { alignItems: "center", gap: 4, minWidth: 66 },
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
  stepDotText: { color: colors.subtle, fontSize: 9, fontWeight: "900" },
  stepDotTextActive: { color: "#FFF" },
  stepLabel: { color: colors.muted, fontSize: 8.5, fontWeight: "700" },
  stepLabelActive: { color: colors.navy, fontWeight: "900" },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "right",
  },
  addLink: { color: colors.navy, fontSize: 11, fontWeight: "900" },
  choiceCard: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 7,
  },
  choiceActive: { borderColor: colors.navy, borderWidth: 2, backgroundColor: "#F6F9FF" },
  choiceTop: { flexDirection: "row-reverse", gap: 10, alignItems: "center" },
  choiceCopy: { flex: 1 },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  radioText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  choiceTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
  },
  choiceTitleActive: { color: colors.navy },
  choiceDescription: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 17,
    textAlign: "right",
  },
  price: { color: colors.navy, fontSize: 14, fontWeight: "900", textAlign: "right", marginTop: 3 },
  sdg: { color: colors.muted, fontSize: 9.5, textAlign: "right", marginTop: 2 },
  card: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: "900", textAlign: "right" },
  primaryBadge: {
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
    fontSize: 12,
    color: colors.text,
  },
  helper: { color: colors.muted, fontSize: 9.5, lineHeight: 16, textAlign: "right" },
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
  infoCard: {
    backgroundColor: "#EEF5FF",
    borderRadius: 16,
    padding: 13,
    flexDirection: "row-reverse",
    gap: 8,
    alignItems: "center",
  },
  infoMark: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#DCE9FB",
    color: colors.navy,
    textAlign: "center",
    textAlignVertical: "center",
    fontWeight: "900",
  },
  infoTitle: { color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "right" },
  infoText: { flex: 1, color: colors.muted, fontSize: 9.8, lineHeight: 16, textAlign: "right" },
  smallLabel: { color: colors.muted, fontSize: 9.5, textAlign: "right" },
  reviewMain: { color: colors.text, fontSize: 15, fontWeight: "900", textAlign: "right" },
  reviewLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 9,
  },
  reviewLabel: { color: colors.muted, fontSize: 9.5, textAlign: "right" },
  reviewValue: { flex: 1, color: colors.text, fontSize: 10.5, fontWeight: "700", textAlign: "left" },
  actions: { flexDirection: "row-reverse", gap: 10, marginTop: 2 },
  goldButton: {
    flex: 2,
    backgroundColor: colors.gold,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  goldButtonText: { color: colors.navyDark, textAlign: "center", fontSize: 12.5, fontWeight: "900" },
  backButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: "#FFF",
  },
  backButtonText: { color: colors.navy, textAlign: "center", fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.42 },
  error: { color: colors.danger, fontSize: 10.5, textAlign: "right" },
  successPage: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 14,
    backgroundColor: colors.background,
  },
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
  successTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  successText: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 20,
    textAlign: "center",
  },
  requestBox: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  requestId: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 5,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: colors.navy,
    borderRadius: 16,
    paddingVertical: 15,
  },
  outlineButtonText: { color: colors.navy, textAlign: "center", fontWeight: "900" },
});
