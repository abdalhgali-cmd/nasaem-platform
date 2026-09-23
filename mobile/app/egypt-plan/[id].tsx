import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { saveEgyptTravelPlan } from "../../src/api/tracking";
import type { UploadAsset } from "../../src/api/requests";
import { AppButton, BrandHeader, ChoiceCard, FormField, StepIndicator, SurfaceCard } from "../../src/components/ui";
import { colors } from "../../src/theme";

const steps = ["الطلب", "الموافقة", "خطة السفر", "التعميم"];

export default function EgyptTravelPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entryMode, setEntryMode] = useState<"AIR" | "BORDER">("AIR");
  const [bookingStatus, setBookingStatus] = useState<"EXISTING" | "NEEDS_NASAEM">("EXISTING");
  const [entryDate, setEntryDate] = useState("");
  const [file, setFile] = useState<UploadAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf"], copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, label: "تذكرة / حجز السفر" });
  }

  async function submit() {
    try {
      setBusy(true);
      setError("");
      setDone("");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error("اكتب التاريخ بصيغة YYYY-MM-DD");
      if (bookingStatus === "EXISTING" && !file) throw new Error("ارفع التذكرة أو الحجز الموجود");
      const response = await saveEgyptTravelPlan(id, { entryMode, bookingStatus, entryDate }, file);
      setDone(response.message);
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر حفظ بيانات السفر");
    } finally {
      setBusy(false);
    }
  }

  if (done) return (
    <SafeAreaView style={styles.safe}>
      <BrandHeader compact title="تم إرسال خطة السفر" subtitle="سيتابع فريق نسائم الحرمين إجراءات التعميم ويحدّث حالة الطلب." />
      <View style={styles.successPage}>
        <SurfaceCard style={styles.successCard}>
          <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>
          <Text style={styles.successTitle}>تم الحفظ بنجاح</Text>
          <Text style={styles.description}>{done}</Text>
          <AppButton label="العودة إلى الطلب" onPress={() => router.back()} style={styles.full} />
        </SurfaceCard>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <BrandHeader compact title="خطة السفر إلى مصر" subtitle="الموافقة صدرت؛ أكمل بيانات الدخول حتى تبدأ إجراءات التعميم." />
      <StepIndicator steps={steps} current={2} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <SurfaceCard style={styles.card}>
          <Text style={styles.title}>طريقة الدخول</Text>
          <Text style={styles.description}>اختر الطريقة التي ستدخل بها إلى مصر.</Text>
          <ChoiceCard title="عن طريق الجو" subtitle="الوصول عبر أحد المطارات" icon="✈️" selected={entryMode === "AIR"} onPress={() => setEntryMode("AIR")} />
          <ChoiceCard title="عن طريق البر" subtitle="الوصول عبر المعبر البري" icon="🚌" selected={entryMode === "BORDER"} onPress={() => setEntryMode("BORDER")} />
        </SurfaceCard>

        <SurfaceCard style={styles.card}>
          <Text style={styles.title}>الحجز وتاريخ الدخول</Text>
          <ChoiceCard title="عندي حجز بالفعل" subtitle="سأرفع التذكرة أو إثبات الحجز" icon="🎫" selected={bookingStatus === "EXISTING"} onPress={() => setBookingStatus("EXISTING")} />
          <ChoiceCard title="أريد نسائم تحجز لي" subtitle="يتواصل معي الفريق بعرض مناسب" icon="✦" selected={bookingStatus === "NEEDS_NASAEM"} onPress={() => { setBookingStatus("NEEDS_NASAEM"); setFile(null); }} />
          <FormField label="تاريخ الدخول" value={entryDate} onChangeText={setEntryDate} placeholder="2026-10-15" />
          {bookingStatus === "EXISTING" ? (
            <View style={styles.upload}>
              <View style={styles.uploadIcon}><Text style={styles.uploadIconText}>{file ? "✓" : "↑"}</Text></View>
              <View style={styles.uploadCopy}>
                <Text style={styles.uploadTitle}>{file ? file.name : "التذكرة أو إثبات الحجز"}</Text>
                <Text style={styles.uploadDescription}>{file ? "تم اختيار الملف — اضغط لتغييره" : "PDF أو صورة واضحة"}</Text>
              </View>
              <Pressable onPress={pick}><Text style={styles.uploadAction}>{file ? "تغيير" : "رفع"}</Text></Pressable>
            </View>
          ) : null}
        </SurfaceCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton label="حفظ وإرسال للوكالة" onPress={submit} busy={busy} disabled={!entryDate} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { gap: 12 },
  title: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "right" },
  description: { fontSize: 11.5, color: colors.muted, textAlign: "center", lineHeight: 19 },
  upload: { minHeight: 72, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.navy, borderRadius: 14, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: colors.blueSoft },
  uploadIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" },
  uploadIconText: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  uploadCopy: { flex: 1 },
  uploadTitle: { fontSize: 11.5, fontWeight: "900", color: colors.text, textAlign: "right" },
  uploadDescription: { fontSize: 9.5, color: colors.muted, textAlign: "right", marginTop: 3 },
  uploadAction: { color: colors.navy, fontSize: 11, fontWeight: "900" },
  error: { fontSize: 11, color: colors.danger, textAlign: "right" },
  successPage: { flex: 1, padding: 20, justifyContent: "center" },
  successCard: { alignItems: "center", gap: 12, paddingVertical: 28 },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  checkText: { color: colors.success, fontSize: 32, fontWeight: "900" },
  successTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  full: { alignSelf: "stretch" },
});
