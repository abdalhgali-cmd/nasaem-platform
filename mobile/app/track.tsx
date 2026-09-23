import { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
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
  getTrackedRequests,
  requestTrackingCode,
  restoreTrackingSession,
  TrackedRequest,
  verifyTrackingCode,
} from "../src/api/tracking";
import { colors } from "../src/theme";

type Stage = "loading" | "request" | "verify" | "results";
type Tab = "all" | "active" | "action" | "done";

export default function TrackScreen() {
  const params = useLocalSearchParams<{ requestId?: string; phone?: string }>();
  const [phone, setPhone] = useState(params.phone ?? "");
  const [requestNo, setRequestNo] = useState(params.requestId ?? "");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>("loading");
  const [tab, setTab] = useState<Tab>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<TrackedRequest[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const restored = await restoreTrackingSession();
        if (!active) return;
        if (!restored) {
          setStage("request");
          return;
        }
        const all = await getTrackedRequests();
        if (!active) return;
        setItems(filterRequest(all, requestNo));
        setStage("results");
      } catch {
        if (active) setStage("request");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function refresh() {
    const all = await getTrackedRequests();
    setItems(filterRequest(all, requestNo));
  }

  async function sendCode() {
    try {
      setBusy(true);
      setMessage("");
      const result = await requestTrackingCode(phone);
      setStage("verify");
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إرسال الرمز");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    try {
      setBusy(true);
      setMessage("");
      await verifyTrackingCode(phone, code);
      await refresh();
      setStage("results");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر التحقق");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (tab === "all") return true;
        if (tab === "done") return item.status === "CLOSED" || Boolean(item.deliverables?.length);
        if (tab === "action") return Boolean(item.nextActions?.length);
        return (
          item.status !== "CLOSED" &&
          !item.deliverables?.length &&
          !item.nextActions?.length
        );
      }),
    [items, tab]
  );

  if (stage === "loading") {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={s.muted}>بنجيب طلباتك…</Text>
      </View>
    );
  }

  if (stage === "results") {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
          <View style={s.hero}>
            <View style={s.heroOrb} />
            <View style={s.heroTop}>
              <Pressable
                style={s.refreshButton}
                onPress={() => {
                  setBusy(true);
                  void refresh()
                    .catch((error) =>
                      setMessage(error instanceof Error ? error.message : "تعذر التحديث")
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <Text style={s.refreshText}>{busy ? "…" : "↻"}</Text>
              </Pressable>
              <View>
                <Text style={s.kicker}>رحلاتك مع نسائم الحرمين</Text>
                <Text style={s.title}>طلباتي</Text>
                <Text style={s.heroText}>شوف المطلوب منك الآن، والباقي علينا.</Text>
              </View>
            </View>
          </View>

          <View style={s.tabs}>
            <TabButton label="الكل" selected={tab === "all"} onPress={() => setTab("all")} />
            <TabButton
              label="قيد الإجراء"
              selected={tab === "active"}
              onPress={() => setTab("active")}
            />
            <TabButton
              label="بانتظارك"
              selected={tab === "action"}
              onPress={() => setTab("action")}
            />
            <TabButton
              label="مكتمل"
              selected={tab === "done"}
              onPress={() => setTab("done")}
            />
          </View>

          {message ? <Text style={s.message}>{message}</Text> : null}

          {visible.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>◎</Text>
              <Text style={s.emptyTitle}>ما في طلبات هنا</Text>
              <Text style={s.emptyText}>الطلبات المناسبة لهذا القسم حتظهر تلقائياً.</Text>
            </View>
          ) : (
            visible.map((item) => (
              <RequestCard
                key={item.id}
                item={item}
                onPress={() =>
                  router.push({
                    pathname: "/request-details/[id]",
                    params: { id: item.id },
                  })
                }
              />
            ))
          )}

          <Pressable style={s.newRequest} onPress={() => router.push("/requests")}>
            <Text style={s.newRequestText}>+ ابدأ طلب جديد</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.authPage}>
        <View style={s.authHero}>
          <Text style={s.authIcon}>◷</Text>
          <Text style={s.authTitle}>تابع طلباتك</Text>
          <Text style={s.authText}>
            استخدم رقم الهاتف المسجل في طلبك. بنرسل ليك رمز تحقق عبر واتساب.
          </Text>
        </View>

        {stage === "request" ? (
          <>
            <Text style={s.fieldLabel}>رقم الهاتف</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="09XXXXXXXX"
              keyboardType="phone-pad"
              style={s.input}
              textAlign="right"
            />
            <Text style={s.fieldLabel}>رقم الطلب — اختياري</Text>
            <TextInput
              value={requestNo}
              onChangeText={setRequestNo}
              placeholder="NSM-..."
              style={s.input}
              textAlign="right"
            />
            <Pressable
              disabled={busy || phone.trim().length < 6}
              onPress={sendCode}
              style={[
                s.goldButton,
                (busy || phone.trim().length < 6) && s.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.navyDark} />
              ) : (
                <Text style={s.goldButtonText}>إرسال رمز التحقق</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.fieldLabel}>رمز التحقق</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              style={[s.input, s.codeInput]}
              textAlign="center"
            />
            <Pressable
              disabled={busy || code.length !== 6}
              onPress={verify}
              style={[
                s.goldButton,
                (busy || code.length !== 6) && s.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.navyDark} />
              ) : (
                <Text style={s.goldButtonText}>عرض طلباتي</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setStage("request")}>
              <Text style={s.changePhone}>تغيير رقم الهاتف</Text>
            </Pressable>
          </>
        )}

        {message ? <Text style={s.message}>{message}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

function filterRequest(items: TrackedRequest[], requestNo: string) {
  return requestNo.trim()
    ? items.filter(
        (item) => String(item.id).toLowerCase() === requestNo.trim().toLowerCase()
      )
    : items;
}

function serviceIcon(item: TrackedRequest) {
  const text = `${item.service ?? ""} ${item.visaType?.name ?? ""} ${item.visaType?.code ?? ""}`;
  if (/عمرة/i.test(text)) return "🕋";
  if (/مصر|EGYPT/i.test(text)) return "🇪🇬";
  if (/زيارة|FAMILY/i.test(text)) return "🇸🇦";
  if (/طيران|رحلة|flight/i.test(text)) return "✈️";
  if (/باخر|ferr/i.test(text)) return "⛴️";
  return "✦";
}

function progressFor(item: TrackedRequest) {
  if (item.status === "CLOSED" || item.deliverables?.length) return 5;
  if (item.paymentStatus === "CONFIRMED") return 4;
  if (
    item.paymentStatus === "AWAITING_TRANSFER" ||
    item.paymentStatus === "UNDER_REVIEW" ||
    item.invoice?.status
  )
    return 3;
  const checklist = item.checklist ?? [];
  if (checklist.length && checklist.every((row) => row.state !== "MISSING" && row.state !== "REJECTED"))
    return 2;
  return 1;
}

function RequestCard({ item, onPress }: { item: TrackedRequest; onPress: () => void }) {
  const step = progressFor(item);
  const needsAction = Boolean(item.nextActions?.length);
  return (
    <Pressable style={s.card} onPress={onPress}>
      <View style={s.cardTop}>
        <View style={s.cardIcon}>
          <Text style={s.cardEmoji}>{serviceIcon(item)}</Text>
        </View>
        <View style={s.cardCopy}>
          <Text style={s.cardTitle}>{item.service ?? item.visaType?.name ?? "طلب خدمة"}</Text>
          <Text style={s.requestNo}>{item.id}</Text>
        </View>
        <Text style={s.cardArrow}>‹</Text>
      </View>

      <View style={[s.statusBadge, needsAction && s.actionBadge]}>
        <Text style={[s.statusText, needsAction && s.actionText]}>
          {needsAction ? "مطلوب منك إجراء" : item.statusLabel ?? "قيد المراجعة"}
        </Text>
      </View>

      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${Math.max(20, step * 20)}%` }]} />
      </View>
      <View style={s.progressMeta}>
        <Text style={s.progressHint}>{step} من 5</Text>
        <Text style={s.progressHint}>آخر تحديث للطلب</Text>
      </View>

      {item.nextActions?.[0] ? (
        <View style={s.nextAction}>
          <Text style={s.nextActionLabel}>الخطوة التالية</Text>
          <Text style={s.nextActionText}>{item.nextActions[0].label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function TabButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[s.tab, selected && s.tabActive]} onPress={onPress}>
      <Text style={[s.tabText, selected && s.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.background,
  },
  muted: { color: colors.muted, fontSize: 11 },
  page: { paddingBottom: 38 },
  hero: {
    overflow: "hidden",
    backgroundColor: colors.navyDark,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 20,
    minHeight: 150,
    justifyContent: "flex-end",
  },
  heroOrb: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(11,61,145,.52)",
    left: -36,
    top: -44,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  kicker: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "right",
  },
  title: {
    color: "#FFF",
    fontSize: 25,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 4,
  },
  heroText: {
    color: "#D5DDEC",
    fontSize: 10.5,
    textAlign: "right",
    marginTop: 5,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshText: { color: "#FFF", fontSize: 20, fontWeight: "900" },
  tabs: {
    flexDirection: "row-reverse",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 3,
  },
  tab: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  tabText: {
    color: colors.muted,
    fontSize: 9.2,
    fontWeight: "800",
    textAlign: "center",
  },
  tabTextActive: { color: "#FFF" },
  card: {
    marginHorizontal: 14,
    marginTop: 11,
    backgroundColor: "#FFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
  },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#EEF3FB",
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 21 },
  cardCopy: { flex: 1 },
  cardTitle: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "900",
    textAlign: "right",
  },
  requestNo: {
    color: colors.subtle,
    fontSize: 9,
    marginTop: 3,
    textAlign: "right",
  },
  cardArrow: { color: colors.gold, fontSize: 25 },
  statusBadge: {
    alignSelf: "flex-end",
    marginTop: 12,
    backgroundColor: "#EEF3FB",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBadge: { backgroundColor: "#FFF7DC" },
  statusText: { color: colors.navy, fontSize: 9.5, fontWeight: "800" },
  actionText: { color: "#8A6800" },
  progressTrack: {
    height: 5,
    backgroundColor: "#E9EDF4",
    borderRadius: 99,
    overflow: "hidden",
    marginTop: 13,
  },
  progressFill: { height: "100%", backgroundColor: colors.gold, borderRadius: 99 },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  progressHint: { color: colors.subtle, fontSize: 8.5 },
  nextAction: {
    backgroundColor: "#FFF9E9",
    borderRadius: 13,
    padding: 10,
    marginTop: 11,
  },
  nextActionLabel: {
    color: "#8A6800",
    fontSize: 8.5,
    fontWeight: "900",
    textAlign: "right",
  },
  nextActionText: {
    color: colors.text,
    fontSize: 10.5,
    fontWeight: "800",
    textAlign: "right",
    marginTop: 2,
  },
  empty: {
    margin: 16,
    padding: 28,
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: { color: colors.navy, fontSize: 30 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "900", marginTop: 8 },
  emptyText: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 4 },
  newRequest: {
    marginHorizontal: 14,
    marginTop: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.navy,
    borderRadius: 16,
    padding: 14,
  },
  newRequestText: { color: colors.navy, fontWeight: "900", textAlign: "center", fontSize: 11.5 },
  message: {
    marginHorizontal: 16,
    marginTop: 10,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 17,
    textAlign: "right",
  },
  authPage: { flex: 1, padding: 20, justifyContent: "center", gap: 10 },
  authHero: { alignItems: "center", marginBottom: 14 },
  authIcon: { color: colors.gold, fontSize: 38, fontWeight: "900" },
  authTitle: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 8 },
  authText: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },
  fieldLabel: { color: colors.muted, fontSize: 9.5, textAlign: "right", marginTop: 6 },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    minHeight: 48,
    paddingHorizontal: 13,
    color: colors.text,
  },
  codeInput: { fontSize: 20, letterSpacing: 8, fontWeight: "900" },
  goldButton: {
    backgroundColor: colors.gold,
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 7,
  },
  goldButtonText: {
    color: colors.navyDark,
    textAlign: "center",
    fontSize: 12.5,
    fontWeight: "900",
  },
  disabled: { opacity: 0.42 },
  changePhone: {
    color: colors.navy,
    fontSize: 10.5,
    fontWeight: "800",
    textAlign: "center",
    padding: 8,
  },
});
