import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { FerryOperator, FerrySchedule, getPublicFerries } from "../src/api/travel";
import { AppButton, BrandHeader, EmptyState, SectionTitle, SurfaceCard } from "../src/components/ui";
import { colors } from "../src/theme";

export default function FerriesScreen() {
  const [operators, setOperators] = useState<FerryOperator[]>([]);
  const [schedules, setSchedules] = useState<FerrySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getPublicFerries()
      .then((response) => { setOperators(response.operators); setSchedules(response.schedules); })
      .catch(() => setError("تعذر تحميل مواعيد البواخر"))
      .finally(() => setLoading(false));
  }, []);

  const operatorMap = useMemo(() => Object.fromEntries(operators.map((operator) => [operator.id, operator])), [operators]);

  function select(schedule: FerrySchedule) {
    const operator = operatorMap[schedule.operatorId];
    router.push({
      pathname: "/request/[kind]",
      params: {
        kind: "ferries",
        origin: schedule.origin,
        destination: schedule.destination,
        date: schedule.travelDate,
        operatorName: operator?.name ?? "",
        scheduleId: schedule.id,
        departureTime: schedule.departureTime ?? "",
        basePrice: String(schedule.basePrice ?? ""),
        currency: schedule.currency ?? "SAR",
      },
    });
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.navy} />
      <Text style={styles.muted}>جاري تحميل المواعيد…</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <BrandHeader compact title="رحلتك بالبحر ⛴️" subtitle="اختر الموعد المناسب وسنؤكد لك المقعد والسعر قبل الدفع." />
      <ScrollView contentContainerStyle={styles.page}>
        <SectionTitle title="المواعيد المتاحة" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!schedules.length ? (
          <EmptyState
            icon="⛴️"
            title="لا توجد مواعيد منشورة الآن"
            description="يمكنك إرسال طلب للوكالة وسنبحث لك عن الموعد المناسب."
            action={<AppButton label="إرسال طلب حجز" onPress={() => router.push({ pathname: "/request/[kind]", params: { kind: "ferries" } })} style={styles.emptyButton} />}
          />
        ) : schedules.map((schedule) => {
          const operator = operatorMap[schedule.operatorId];
          return (
            <SurfaceCard key={schedule.id} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.shipIcon}><Text style={styles.ship}>⛴️</Text></View>
                <View style={styles.headCopy}>
                  <Text style={styles.operator}>{operator?.name ?? "شركة الباخرة"}</Text>
                  <Text style={styles.date}>{formatDate(schedule.travelDate)} {schedule.departureTime ? `· ${schedule.departureTime}` : ""}</Text>
                </View>
                <View><Text style={styles.price}>{schedule.basePrice} {schedule.currency}</Text></View>
              </View>
              <View style={styles.route}>
                <Text style={styles.port}>{schedule.origin}</Text>
                <Text style={styles.arrow}>←</Text>
                <Text style={styles.port}>{schedule.destination}</Text>
              </View>
              <View style={styles.metaRow}>
                {schedule.arrivalTime ? <Text style={styles.meta}>الوصول {schedule.arrivalTime}</Text> : null}
                {schedule.capacity != null ? <Text style={styles.meta}>السعة المنشورة: {schedule.capacity}</Text> : null}
              </View>
              <AppButton label="اختيار هذا الموعد" onPress={() => select(schedule)} />
            </SurfaceCard>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ar");
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.background },
  muted: { color: colors.muted, fontSize: 12 },
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  error: { fontSize: 11, color: colors.danger, textAlign: "right" },
  emptyButton: { alignSelf: "stretch", marginTop: 16 },
  card: { gap: 14 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  shipIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  ship: { fontSize: 24 },
  headCopy: { flex: 1 },
  operator: { fontSize: 14, fontWeight: "900", color: colors.navy, textAlign: "right" },
  date: { fontSize: 10.5, color: colors.muted, textAlign: "right", marginTop: 4 },
  price: { fontSize: 12.5, fontWeight: "900", color: colors.gold },
  route: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.soft },
  port: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "900", textAlign: "center" },
  arrow: { color: colors.gold, fontSize: 22, fontWeight: "900" },
  metaRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 10 },
  meta: { fontSize: 10.5, color: colors.muted, textAlign: "right" },
});
