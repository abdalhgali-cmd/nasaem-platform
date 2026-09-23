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

type Stage = "data" | "entry" | "passport" | "review";
type EntryMode = "AIR" | "BORDER" | "";

export default function EgyptRequestScreen() {
  const [stage, setStage] = useState<Stage>("data");
  const [service, setService] = useState<PublicService | null>(null);
  const [visaType, setVisaType] = useState<PublicVisaType | null>(null);
  const [requirements, setRequirements] = useState<PublicRequirement[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [passportNo, setPassportNo] = useState("");
  const [phone, setPhone] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("");
  const [passportFile, setPassportFile] = useState<UploadAsset | null>(null);

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
          services.find(
            (item) => (item.code ?? "").toUpperCase() === "SVC-EGYPT-CLEARANCE"
          ) ?? null;
        const foundVisa =
          visaTypes.find(
            (item) => (item.code ?? "").toUpperCase() === "VISA-EGYPT-CLEARANCE"
          ) ?? null;
        setService(foundService);
        setVisaType(foundVisa);
        if (foundVisa) {
          setRequirements(await getVisaRequirements(foundVisa.id));
        }
      } catch {
        if (active) setError("تعذر تحميل متطلبات الموافقة من الإدارة.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const passportRequirement = useMemo(
    () =>
      requirements.find((item) => item.attachmentType === "passport_copy") ??
      requirements.find(
        (item) =>
          (item.type ?? "DOCUMENT") === "DOCUMENT" &&
          /جواز|passport/i.test(item.name)
      ) ??
      null,
    [requirements]
  );

  const entryRequirement = useMemo(
    () =>
      requirements.find((item) => item.attachmentType === "egypt_entry_mode") ??
      requirements.find(
        (item) =>
          item.type === "SELECT" &&
          /الدخول|entry/i.test(item.name)
      ) ??
      null,
    [requirements]
  );

  const price = visaType?.basePrice ?? service?.basePrice;
  const currency = visaType?.currency ?? service?.currency;
  const priceSdg = visaType?.priceSdg ?? service?.priceSdg;

  async function pickPassport() {
    if (!passportRequirement) {
      setError("إعداد صورة الجواز غير مكتمل في الإدارة.");
      return;
    }
    const types = passportRequirement.allowedMimeTypes?.length
      ? passportRequirement.allowedMimeTypes
      : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const result = await DocumentPicker.getDocumentAsync({
      type: types,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPassportFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      label: passportRequirement.name,
      requirementId: passportRequirement.id,
      travelerIndex: 0,
    });
  }

  async function submit() {
    if (!visaType || !passportRequirement || !entryRequirement || !passportFile) {
      setError("متطلبات الموافقة غير مكتملة. راجع الإعدادات من لوحة الإدارة.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const id = await submitContactRequestWithDocuments(
        {
          name,
          phone: phone.trim(),
          service: service?.name ?? visaType.name ?? "الموافقة الأمنية لمصر",
          serviceId: service?.id,
          visaTypeId: visaType.id,
          message: "طلب الموافقة الأمنية لمصر عبر تطبيق نسائم الحرمين",
          travelerCount: 1,
          intakeData: {
            kind: "egypt",
            entryMode,
          },
          answers: {
            [entryRequirement.id]: entryMode,
          },
          travelers: [
            {
              fullName: name,
              passportNo,
              birthDate,
              isPrimary: true,
            },
          ],
        },
        [passportFile]
      );
      setRequestId(id);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "تعذر إرسال طلب الموافقة"
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
          <Text style={s.successTitle}>تم استلام طلب الموافقة</Text>
          <Text style={s.successText}>
            الآن الوكالة بتراجع بياناتك والجواز. بعد القبول يظهر الدفع بالجنيه داخل
            طلباتك.
          </Text>
          <View style={s.requestBox}>
            <Text style={s.muted}>رقم الطلب</Text>
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

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.hero}>
        <View style={s.orbOne} />
        <View style={s.orbTwo} />
        <Text style={s.kicker}>🇪🇬  الموافقة الأمنية لمصر</Text>
        <Text style={s.heroTitle}>{titleFor(stage)}</Text>
        <Text style={s.heroText}>{subtitleFor(stage)}</Text>
      </View>

      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <Progress stage={stage} />

        {loading ? <ActivityIndicator color={colors.navy} /> : null}

        {stage === "data" ? (
          <>
            <Text style={s.sectionTitle}>بيانات المسافر</Text>
            <View style={s.card}>
              <Field
                label="الاسم الكامل"
                value={name}
                onChangeText={setName}
                placeholder="كما في الجواز"
              />
              <Field
                label="تاريخ الميلاد"
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="YYYY-MM-DD"
              />
              <Field
                label="رقم الجواز"
                value={passportNo}
                onChangeText={(value) => setPassportNo(value.toUpperCase())}
                placeholder="P00000000"
              />
              <View>
                <Text style={s.fieldLabel}>رقم الهاتف السوداني — اختياري</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="09XXXXXXXX"
                  style={s.input}
                  textAlign="right"
                  keyboardType="phone-pad"
                />
                <Text style={s.helper}>
                  أدخله لو داير متابعة الطلب واستلام تحديثات واتساب.
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {stage === "entry" ? (
          <>
            <Text style={s.sectionTitle}>كيف ناوي تدخل مصر؟</Text>
            <Choice
              icon="✈️"
              title="منفذ جوي"
              description="السفر بالطائرة — بعد الموافقة نقدر نحجز الرحلة معاك"
              selected={entryMode === "AIR"}
              onPress={() => setEntryMode("AIR")}
            />
            <Choice
              icon="🚙"
              title="معبر بري"
              description="بعد الموافقة تحدد يوم السفر للتعميم"
              selected={entryMode === "BORDER"}
              onPress={() => setEntryMode("BORDER")}
            />
            <Info text="ما محتاج تحدد تاريخ السفر الآن. التعميم بيجي كمرحلة لاحقة بعد صدور الموافقة." />
          </>
        ) : null}

        {stage === "passport" ? (
          <>
            <View style={s.priceCard}>
              <Text style={s.muted}>سعر الموافقة</Text>
              <Text style={s.price}>
                {formatPrice(price, currency, "السعر قيد المراجعة")}
              </Text>
              {formatSdgEquivalent(priceSdg) ? (
                <Text style={s.sdg}>{formatSdgEquivalent(priceSdg)}</Text>
              ) : null}
              <Text style={s.helper}>
                الدفع ما بيفتح إلا بعد مراجعة وقبول الجواز والبيانات.
              </Text>
            </View>

            <Text style={s.sectionTitle}>صورة الجواز</Text>
            <View style={s.card}>
              <Text style={s.cardTitle}>
                {passportRequirement?.name ?? "صورة جواز السفر"} *
              </Text>
              <Text style={s.helper}>
                صورة واضحة لصفحة البيانات — JPG/PNG/WEBP أو PDF.
              </Text>
              <Pressable
                style={[s.upload, passportFile && s.uploadDone]}
                onPress={passportFile ? () => setPassportFile(null) : pickPassport}
              >
                <Text style={passportFile ? s.uploadDoneText : s.uploadText}>
                  {passportFile ? `✓ ${passportFile.name}` : "رفع صورة الجواز"}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {stage === "review" ? (
          <>
            <Text style={s.sectionTitle}>راجع طلبك</Text>
            <View style={s.card}>
              <ReviewLine label="الاسم" value={name} />
              <ReviewLine label="تاريخ الميلاد" value={birthDate} />
              <ReviewLine label="رقم الجواز" value={passportNo} />
              <ReviewLine
                label="طريقة الدخول"
                value={entryMode === "AIR" ? "منفذ جوي" : "معبر بري"}
              />
              <ReviewLine
                label="الجواز"
                value={passportFile?.name ?? "غير مرفق"}
              />
            </View>
            <Info text="بعد الإرسال: مراجعة الوكالة → الدفع بالجنيه → تنفيذ الموافقة → صدور الموافقة → التعميم أو حجز الرحلة." />
          </>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={s.actions}>
          <Pressable
            style={s.outlineButton}
            onPress={() => {
              if (stage === "data") router.back();
              else if (stage === "entry") setStage("data");
              else if (stage === "passport") setStage("entry");
              else setStage("passport");
            }}
            disabled={busy}
          >
            <Text style={s.outlineButtonText}>رجوع</Text>
          </Pressable>
          <Pressable
            style={[s.goldButton, !canContinue(stage, name, birthDate, passportNo, entryMode, passportFile) && s.disabled]}
            disabled={
              busy ||
              !canContinue(stage, name, birthDate, passportNo, entryMode, passportFile)
            }
            onPress={() => {
              if (stage === "data") setStage("entry");
              else if (stage === "entry") setStage("passport");
              else if (stage === "passport") setStage("review");
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
  name: string,
  birthDate: string,
  passportNo: string,
  entryMode: EntryMode,
  passportFile: UploadAsset | null
) {
  if (stage === "data") {
    return name.trim().length >= 2 && Boolean(birthDate.trim()) && Boolean(passportNo.trim());
  }
  if (stage === "entry") return Boolean(entryMode);
  if (stage === "passport") return Boolean(passportFile);
  return true;
}

function titleFor(stage: Stage) {
  if (stage === "data") return "بيانات بسيطة في البداية";
  if (stage === "entry") return "طريقة الدخول";
  if (stage === "passport") return "ارفع الجواز";
  return "راجع وأرسل";
}

function subtitleFor(stage: Stage) {
  if (stage === "data") return "الاسم، تاريخ الميلاد ورقم الجواز";
  if (stage === "entry") return "جوي أو بري — بدون تاريخ سفر الآن";
  if (stage === "passport") return "مستند واحد قبل مراجعة الوكالة";
  return "الدفع يفتح بعد قبول الطلب";
}

function Progress({ stage }: { stage: Stage }) {
  const labels = ["البيانات", "الدخول", "الجواز", "المراجعة"];
  const index = ["data", "entry", "passport", "review"].indexOf(stage);
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
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
      />
    </View>
  );
}

function Choice({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[s.choice, selected && s.choiceActive]} onPress={onPress}>
      <View style={[s.choiceIcon, selected && s.choiceIconActive]}>
        <Text style={s.choiceEmoji}>{icon}</Text>
      </View>
      <View style={s.choiceCopy}>
        <Text style={[s.choiceTitle, selected && s.choiceTitleActive]}>{title}</Text>
        <Text style={s.choiceDescription}>{description}</Text>
      </View>
      <View style={[s.radio, selected && s.radioActive]}>
        {selected ? <Text style={s.radioCheck}>✓</Text> : null}
      </View>
    </Pressable>
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
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "900", textAlign: "right" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: "900", textAlign: "right" },
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
  choice: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
  },
  choiceActive: { borderColor: colors.navy, borderWidth: 2, backgroundColor: "#F6F9FF" },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#F0F4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceIconActive: { backgroundColor: "#E6EEFB" },
  choiceEmoji: { fontSize: 22 },
  choiceCopy: { flex: 1 },
  choiceTitle: { color: colors.text, fontSize: 13, fontWeight: "900", textAlign: "right" },
  choiceTitleActive: { color: colors.navy },
  choiceDescription: { color: colors.muted, fontSize: 9.5, lineHeight: 16, textAlign: "right", marginTop: 3 },
  radio: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  radioCheck: { color: "#FFF", fontSize: 10, fontWeight: "900" },
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
  upload: { backgroundColor: colors.navy, borderRadius: 13, padding: 13, marginTop: 3 },
  uploadText: { color: "#FFF", textAlign: "center", fontSize: 11, fontWeight: "900" },
  uploadDone: { backgroundColor: "#E8F7ED" },
  uploadDoneText: { color: colors.success, textAlign: "center", fontSize: 10.5, fontWeight: "900" },
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
