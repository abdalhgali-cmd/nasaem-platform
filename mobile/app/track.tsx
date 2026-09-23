import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  approveTrackedInvoice,
  getTrackedRequests,
  markTrackedTransferSent,
  rejectTrackedInvoice,
  requestTrackingCode,
  selectTrackedOffer,
  TrackedRequest,
  uploadTrackedPaymentReceipt,
  verifyTrackingCode,
} from "../src/api/tracking";
import { AppButton, BottomNav, BrandHeader, ChoiceCard, EmptyState, FormField, StepIndicator, SurfaceCard } from "../src/components/ui";
import { colors, radius } from "../src/theme";

const TRACK_STEPS = ["الطلب", "المراجعة", "الدفع", "المعالجة", "النتيجة"];

function requestStage(item: TrackedRequest) {
  if (item.deliverables?.length) return 4;
  if (item.paymentStatus === "PAID" || item.paymentStatus === "ACCEPTED" || item.paymentStatus === "UNDER_REVIEW") return 3;
  if (item.invoice || item.paymentStatus === "AWAITING_TRANSFER") return 2;
  if (item.status && item.status !== "NEW") return 1;
  return 0;
}

export default function TrackScreen() {
  const params = useLocalSearchParams<{ requestId?: string; phone?: string }>();
  const [phone, setPhone] = useState(params.phone ?? "");
  const [requestNo, setRequestNo] = useState(params.requestId ?? "");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"request" | "verify" | "results">("request");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<TrackedRequest[]>([]);

  async function refresh(filter = true) {
    const all = await getTrackedRequests();
    setItems(filter && requestNo.trim() ? all.filter((item) => String(item.id).toLowerCase() === requestNo.trim().toLowerCase()) : all);
  }

  async function sendCode() {
    try {
      setBusy(true); setMessage("");
      const response = await requestTrackingCode(phone);
      setStage("verify");
      setMessage(response.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "تعذر إرسال الرمز");
    } finally { setBusy(false); }
  }

  async function verify() {
    try {
      setBusy(true); setMessage("");
      await verifyTrackingCode(phone, code);
      await refresh(true);
      setStage("results");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "تعذر التحقق");
    } finally { setBusy(false); }
  }

  async function action(fn: () => Promise<unknown>) {
    try {
      setBusy(true); setMessage("");
      await fn();
      await refresh(true);
      setMessage("تم تحديث الطلب.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية");
    } finally { setBusy(false); }
  }

  async function pay(id: string) {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf"], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      await action(async () => {
        await uploadTrackedPaymentReceipt(id, { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, label: "إشعار الدفع" });
        await markTrackedTransferSent(id);
      });
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "تعذر رفع إشعار الدفع");
    }
  }

  if (stage === "results") {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.resultsContent}>
          <BrandHeader compact title="طلباتك" subtitle="تابع السعر، الدفع، والمعالجة حتى استلام التأشيرة أو المستند النهائي." />
          <View style={s.resultsBody}>
            <View style={s.resultsHead}>
              <Text style={s.resultsTitle}>آخر التحديثات</Text>
              <Pressable onPress={() => void action(() => refresh(true))}><Text style={s.refresh}>تحديث ↻</Text></Pressable>
            </View>
            {message ? <Text style={s.message}>{message}</Text> : null}
            {items.length === 0 ? <EmptyState icon="⌕" title="لم نجد الطلب" description="تأكد من رقم الطلب ورقم الهاتف ثم حاول مرة أخرى." /> : null}
            {items.map((item) => <RequestCard key={item.id} item={item} busy={busy} action={action} pay={pay} />)}
          </View>
        </ScrollView>
        <BottomNav active="track" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.authContent} keyboardShouldPersistTaps="handled">
        <BrandHeader title="تابع رحلتك خطوة بخطوة" subtitle="أدخل رقم هاتفك، وسنرسل لك رمز تحقق آمن عبر واتساب." />
        <View style={s.authBody}>
          <SurfaceCard>
            {stage === "request" ? (
              <View style={s.formGap}>
                <Text style={s.formTitle}>الوصول إلى طلباتك</Text>
                <FormField label="رقم الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0912345678" />
                <FormField label="رقم الطلب" optional value={requestNo} onChangeText={setRequestNo} placeholder="مثال: cmu..." autoCapitalize="none" />
                <AppButton label="إرسال رمز التحقق" busy={busy} disabled={phone.trim().length < 6} onPress={() => void sendCode()} />
              </View>
            ) : (
              <View style={s.formGap}>
                <Text style={s.formTitle}>أدخل رمز التحقق</Text>
                <Text style={s.formDescription}>تم إرسال الرمز إلى {phone}</Text>
                <FormField label="رمز التحقق" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" />
                <AppButton label="عرض الطلبات" busy={busy} disabled={code.length !== 6} onPress={() => void verify()} />
                <AppButton label="تغيير رقم الهاتف" variant="soft" onPress={() => { setStage("request"); setCode(""); setMessage(""); }} />
              </View>
            )}
          </SurfaceCard>
          {message ? <Text style={s.message}>{message}</Text> : null}
          <SurfaceCard style={s.secureBox}><Text style={s.secureTitle}>بياناتك محمية</Text><Text style={s.secureText}>لن تظهر أي طلبات إلا بعد تأكيد ملكية رقم الهاتف.</Text></SurfaceCard>
        </View>
      </ScrollView>
      <BottomNav active="track" />
    </SafeAreaView>
  );
}

function RequestCard({ item, busy, action, pay }: { item: TrackedRequest; busy: boolean; action: (fn: () => Promise<unknown>) => Promise<void>; pay: (id: string) => Promise<void> }) {
  const current = requestStage(item);
  return (
    <SurfaceCard style={s.requestCard}>
      <View style={s.requestHead}>
        <View style={s.requestCopy}>
          <Text style={s.requestTitle}>{item.service ?? "طلب خدمة"}</Text>
          <Text selectable style={s.requestId}>{item.id}</Text>
        </View>
        <View style={s.statusPill}><Text style={s.statusText}>{item.statusLabel ?? item.status ?? "قيد المراجعة"}</Text></View>
      </View>
      <View style={s.stepWrap}><StepIndicator steps={TRACK_STEPS} current={current} /></View>

      {item.offers?.length && !item.selectedOfferId ? (
        <View style={s.block}>
          <Text style={s.blockTitle}>العروض المتاحة</Text>
          {item.offers.map((offer) => (
            <ChoiceCard
              key={offer.id}
              title={offer.carrier ?? "عرض"}
              subtitle={offer.description ?? undefined}
              meta={`${offer.amount ?? ""} ${offer.currency ?? ""}`}
              onPress={() => void action(() => selectTrackedOffer(item.id, offer.id))}
            />
          ))}
        </View>
      ) : null}

      {item.invoice ? (
        <View style={s.priceCard}>
          <Text style={s.priceLabel}>قيمة الخدمة المعتمدة</Text>
          <Text style={s.priceValue}>{item.invoice.amount ?? ""} {item.invoice.currency ?? ""}</Text>
        </View>
      ) : null}

      {item.invoice?.status === "PENDING" ? (
        <View style={s.actions}>
          <AppButton label="رفض السعر" variant="outline" style={s.actionButton} disabled={busy} onPress={() => void action(() => rejectTrackedInvoice(item.id))} />
          <AppButton label="الموافقة والدفع" style={s.actionButton} disabled={busy} onPress={() => void action(() => approveTrackedInvoice(item.id))} />
        </View>
      ) : null}

      {item.paymentStatus === "AWAITING_TRANSFER" ? (
        <View style={s.block}>
          <Text style={s.blockTitle}>بيانات الدفع</Text>
          {item.paymentAccounts?.length ? item.paymentAccounts.map((account) => (
            <View key={account.id} style={s.bankCard}>
              <Text style={s.bankTitle}>{account.name ?? account.bankName ?? "حساب الدفع"}</Text>
              <Text selectable style={s.bankNumber}>{account.accountNumber ?? account.iban ?? ""}</Text>
              <Text style={s.bankCurrency}>{account.currency ?? item.paymentCurrency ?? ""}</Text>
            </View>
          )) : <Text style={s.small}>لا توجد حسابات دفع نشطة لهذه العملة حاليًا.</Text>}
          <AppButton label="رفع إشعار الدفع" variant="gold" disabled={busy || !item.paymentAccounts?.length} onPress={() => void pay(item.id)} />
        </View>
      ) : null}

      {item.paymentStatus === "UNDER_REVIEW" ? <Text style={s.waiting}>تم رفع إشعار الدفع وهو الآن قيد المراجعة.</Text> : null}

      {item.deliverables?.length ? (
        <View style={s.successBlock}>
          <Text style={s.successTitle}>✓ تم إصدار المستند</Text>
          {item.deliverables.map((file) => <Text key={file.id} style={s.successFile}>{file.label ?? file.fileName ?? "المستند النهائي"}</Text>)}
        </View>
      ) : null}

      {item.visaType?.code === "VISA-EGYPT-CLEARANCE" ? (
        <AppButton label="بيانات السفر والتعميم لمصر" variant="soft" onPress={() => router.push({ pathname: "/egypt-plan/[id]", params: { id: item.id } })} />
      ) : null}
    </SurfaceCard>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, authContent: { paddingBottom: 96 }, authBody: { padding: 16, gap: 12 }, formGap: { gap: 14 }, formTitle: { color: colors.text, fontSize: 17, fontWeight: "900", textAlign: "right" }, formDescription: { color: colors.muted, fontSize: 11, textAlign: "right" },
  secureBox: { backgroundColor: colors.blueSoft }, secureTitle: { color: colors.navy, fontSize: 11.5, fontWeight: "900", textAlign: "right" }, secureText: { color: colors.muted, fontSize: 10, lineHeight: 17, textAlign: "right", marginTop: 4 },
  message: { color: colors.navy, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 11, fontSize: 10.5, lineHeight: 18, textAlign: "right" },
  resultsContent: { paddingBottom: 96 }, resultsBody: { padding: 16, gap: 13 }, resultsHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, resultsTitle: { color: colors.text, fontSize: 18, fontWeight: "900" }, refresh: { color: colors.navy, fontSize: 11, fontWeight: "900" },
  requestCard: { padding: 0, overflow: "hidden" }, requestHead: { padding: 16, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }, requestCopy: { flex: 1 }, requestTitle: { color: colors.text, fontSize: 15, fontWeight: "900", textAlign: "right" }, requestId: { color: colors.subtle, fontFamily: "monospace", fontSize: 9.5, textAlign: "right", marginTop: 4 }, statusPill: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 }, statusText: { color: colors.gold, fontSize: 9, fontWeight: "900" }, stepWrap: { borderTopWidth: 1, borderTopColor: colors.border, borderBottomWidth: 1, borderBottomColor: colors.border },
  block: { padding: 16, gap: 9 }, blockTitle: { color: colors.text, fontSize: 12.5, fontWeight: "900", textAlign: "right" }, priceCard: { margin: 16, backgroundColor: colors.soft, borderRadius: radius.md, padding: 16 }, priceLabel: { color: colors.muted, fontSize: 10, textAlign: "right" }, priceValue: { color: colors.navy, fontSize: 24, fontWeight: "900", textAlign: "right", marginTop: 8 }, actions: { flexDirection: "row-reverse", gap: 9, paddingHorizontal: 16, paddingBottom: 16 }, actionButton: { flex: 1 },
  bankCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13, backgroundColor: colors.surface }, bankTitle: { color: colors.text, fontSize: 11, fontWeight: "800", textAlign: "right" }, bankNumber: { color: colors.navy, fontSize: 15, fontWeight: "900", textAlign: "right", marginTop: 6 }, bankCurrency: { color: colors.muted, fontSize: 9.5, textAlign: "right", marginTop: 3 }, small: { color: colors.muted, fontSize: 10.5, textAlign: "right" },
  waiting: { margin: 16, color: colors.gold, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 12, fontSize: 10.5, fontWeight: "800", textAlign: "right" }, successBlock: { margin: 16, backgroundColor: colors.successSoft, borderRadius: radius.md, padding: 14 }, successTitle: { color: colors.success, fontSize: 12, fontWeight: "900", textAlign: "right" }, successFile: { color: colors.text, fontSize: 10.5, textAlign: "right", marginTop: 5 },
});
