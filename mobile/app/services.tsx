import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getPublicServices, PublicService } from "../src/api/services";
import { BottomNav, BrandHeader, EmptyState, SurfaceCard } from "../src/components/ui";
import { colors } from "../src/theme";
import { formatPrice, formatSdgEquivalent } from "../src/utils/price";

export default function ServicesScreen() {
  const [items, setItems] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setItems(await getPublicServices());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.navy} />
      <Text style={styles.muted}>جاري تحميل الخدمات…</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <BrandHeader compact title="كل خدماتك في مكان واحد" subtitle="اختر الخدمة المناسبة وسنرشدك خطوة بخطوة حتى اكتمال الطلب." />
      <FlatList
        data={items}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        keyExtractor={(item, index) => String(item.id ?? item.slug ?? index)}
        ListHeaderComponent={(
          <>
            <Pressable style={styles.track} onPress={() => router.push("/track")}>
              <View style={styles.trackIcon}><Text style={styles.trackIconText}>⌕</Text></View>
              <View style={styles.trackCopy}>
                <Text style={styles.trackTitle}>عندك طلب سابق؟</Text>
                <Text style={styles.trackText}>تابع حالته، السعر، الدفع والتأشيرة</Text>
              </View>
              <Text style={styles.arrow}>‹</Text>
            </Pressable>
            {error ? <Text style={styles.error}>تعذر تحميل بعض الخدمات. اسحب للتحديث أو حاول مرة أخرى.</Text> : null}
            <Text style={styles.heading}>الخدمات المتاحة</Text>
          </>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.servicePressable, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: "/service/[slug]", params: { slug: item.slug ?? String(item.id), payload: JSON.stringify(item) } })}
          >
            <SurfaceCard style={styles.card}>
              <Text style={styles.serviceIcon}>{iconFor(item)}</Text>
              <Text style={styles.cardTitle}>{item.nameAr ?? item.name ?? item.title ?? "خدمة"}</Text>
              <Text numberOfLines={2} style={styles.description}>{item.description ?? "اعرض التفاصيل والمتطلبات"}</Text>
              <Text style={styles.cardPrice}>{formatPrice(item.basePrice, item.currency)}</Text>
              {formatSdgEquivalent(item.priceSdg) ? <Text style={styles.cardSdg}>{formatSdgEquivalent(item.priceSdg)}</Text> : null}
            </SurfaceCard>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="لا توجد خدمات الآن" description="سيتم عرض الخدمات هنا فور نشرها من الوكالة." />}
      />
      <BottomNav active="services" />
    </SafeAreaView>
  );
}

function iconFor(item: PublicService) {
  const value = `${item.category ?? ""} ${item.code ?? ""} ${item.nameAr ?? item.name ?? ""}`.toLowerCase();
  if (value.includes("flight") || value.includes("طيران")) return "✈️";
  if (value.includes("ferry") || value.includes("باخر")) return "⛴️";
  if (value.includes("umrah") || value.includes("عمر")) return "🕋";
  if (value.includes("hotel") || value.includes("فندق")) return "🏨";
  if (value.includes("visa") || value.includes("تأشير")) return "🛂";
  return "✦";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 94 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.background },
  muted: { color: colors.muted, fontSize: 12 },
  row: { gap: 12 },
  heading: { color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "right", marginBottom: 12 },
  track: { minHeight: 82, flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, marginBottom: 20, borderRadius: 18, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: "#F0DE9B" },
  trackIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  trackIconText: { color: colors.navyDeep, fontSize: 24, fontWeight: "900" },
  trackCopy: { flex: 1 },
  trackTitle: { color: colors.text, fontSize: 14, fontWeight: "900", textAlign: "right" },
  trackText: { color: colors.muted, fontSize: 10.5, marginTop: 4, textAlign: "right" },
  arrow: { color: colors.navy, fontSize: 28, fontWeight: "900" },
  error: { color: colors.danger, textAlign: "right", fontSize: 11, marginBottom: 14 },
  servicePressable: { flex: 1, marginBottom: 12 },
  pressed: { opacity: 0.84 },
  card: { flex: 1, minHeight: 184, padding: 14 },
  serviceIcon: { fontSize: 28, textAlign: "right", marginBottom: 12 },
  cardTitle: { fontSize: 13.5, lineHeight: 20, fontWeight: "900", color: colors.text, textAlign: "right" },
  description: { fontSize: 10.5, color: colors.muted, lineHeight: 17, textAlign: "right", marginTop: 5, minHeight: 34 },
  cardPrice: { fontSize: 12, fontWeight: "900", color: colors.navy, textAlign: "right", marginTop: 10 },
  cardSdg: { fontSize: 9.5, color: colors.gold, fontWeight: "800", textAlign: "right", marginTop: 2 },
});
