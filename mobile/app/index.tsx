import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomNav, BrandHeader, SectionTitle, SurfaceCard } from "../src/components/ui";
import { getPublicServices, PublicService } from "../src/api/services";
import { colors, radius } from "../src/theme";
import { formatPrice, formatSdgEquivalent } from "../src/utils/price";

function titleOf(item: PublicService) { return item.nameAr ?? item.name ?? item.title ?? "خدمة"; }

const quickServices = [
  { icon: "✈️", title: "الطيران", route: "/flights" as const },
  { icon: "🇸🇦", title: "زيارة عائلية", route: "/request/family" as const },
  { icon: "🇪🇬", title: "موافقة مصر", route: "/request/egypt" as const },
  { icon: "🕋", title: "العمرة", route: "/umrah" as const },
];

export default function HomeScreen() {
  const [services, setServices] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try { setError(false); setServices(await getPublicServices()); }
    catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const featured = useMemo(() => services.slice(0, 3), [services]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        contentContainerStyle={s.content}
      >
        <BrandHeader title="وين ناوي تسافر؟ ✈️" subtitle="من أول فكرة للرحلة لحد ما تصل — نسائم معاك خطوة بخطوة.">
          <Pressable style={s.search} onPress={() => router.push("/requests")}>
            <Text style={s.searchIcon}>⌕</Text>
            <Text style={s.searchText}>ابحث عن عمرة، تأشيرة، رحلة...</Text>
          </Pressable>
        </BrandHeader>

        <View style={s.body}>
          <View style={s.quickGrid}>
            {quickServices.map((item) => (
              <Pressable key={item.title} onPress={() => router.push(item.route)} style={({ pressed }) => [s.quickCard, pressed && s.pressed]}>
                <Text style={s.quickIcon}>{item.icon}</Text>
                <Text style={s.quickTitle}>{item.title}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => router.push("/track")} style={({ pressed }) => [pressed && s.pressed]}>
            <SurfaceCard style={s.trackCard}>
              <View style={s.trackCopy}>
                <Text style={s.trackHint}>عندك طلب شغال؟</Text>
                <Text style={s.trackTitle}>تابع رحلتك خطوة بخطوة</Text>
                <Text style={s.trackText}>أدخل رقم الهاتف وشوف آخر تحديث فورًا</Text>
              </View>
              <Text style={s.trackArrow}>‹</Text>
            </SurfaceCard>
          </Pressable>

          <SectionTitle title="اكتشف خدماتنا" action="عرض الكل" onAction={() => router.push("/services")} />

          {loading ? <View style={s.loading}><ActivityIndicator color={colors.navy} /><Text style={s.muted}>جاري تحميل الخدمات...</Text></View> : null}
          {error ? (
            <Pressable style={s.errorBox} onPress={() => { setLoading(true); void load(); }}>
              <Text style={s.errorText}>تعذر تحديث الخدمات — اضغط لإعادة المحاولة</Text>
            </Pressable>
          ) : null}
          {!loading && !error ? (
            <View style={s.serviceRow}>
              {featured.map((item, index) => (
                <Pressable
                  key={String(item.id ?? item.slug ?? index)}
                  style={({ pressed }) => [s.serviceCard, pressed && s.pressed]}
                  onPress={() => router.push({ pathname: "/service/[slug]", params: { slug: item.slug ?? String(item.id), payload: JSON.stringify(item) } })}
                >
                  <Text style={s.serviceIcon}>{index === 0 ? "🕋" : index === 1 ? "🇪🇬" : "🇸🇦"}</Text>
                  <Text numberOfLines={1} style={s.serviceTitle}>{titleOf(item)}</Text>
                  <Text numberOfLines={2} style={s.serviceDesc}>{item.description ?? "اعرف التفاصيل وابدأ طلبك"}</Text>
                  <Text style={s.servicePrice}>{formatPrice(item.basePrice, item.currency)}</Text>
                  {formatSdgEquivalent(item.priceSdg) ? <Text style={s.serviceSdg}>{formatSdgEquivalent(item.priceSdg)}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <BottomNav active="home" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 96 },
  body: { padding: 16, gap: 18 },
  search: { marginTop: 20, minHeight: 54, borderRadius: radius.md, backgroundColor: "#FFF", paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10 },
  searchIcon: { color: colors.navy, fontSize: 23, fontWeight: "900" },
  searchText: { flex: 1, color: colors.subtle, textAlign: "right", fontSize: 12 },
  quickGrid: { flexDirection: "row-reverse", gap: 9 },
  quickCard: { flex: 1, minHeight: 88, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center", gap: 8 },
  quickIcon: { fontSize: 24 },
  quickTitle: { color: colors.text, fontSize: 10.5, fontWeight: "900", textAlign: "center" },
  trackCard: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.goldSoft },
  trackCopy: { flex: 1 },
  trackHint: { color: colors.gold, fontSize: 10, fontWeight: "900", textAlign: "right" },
  trackTitle: { color: colors.text, fontSize: 16, fontWeight: "900", textAlign: "right", marginTop: 6 },
  trackText: { color: colors.muted, fontSize: 10.5, textAlign: "right", marginTop: 5 },
  trackArrow: { color: colors.navy, fontSize: 28, fontWeight: "900", marginStart: 10 },
  serviceRow: { flexDirection: "row-reverse", gap: 10 },
  serviceCard: { flex: 1, minHeight: 170, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13, alignItems: "flex-end" },
  serviceIcon: { fontSize: 25, marginBottom: 10 },
  serviceTitle: { width: "100%", color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "right" },
  serviceDesc: { color: colors.muted, fontSize: 9.5, lineHeight: 15, textAlign: "right", marginTop: 5 },
  servicePrice: { color: colors.navy, fontSize: 10.5, fontWeight: "900", textAlign: "right", marginTop: "auto" },
  serviceSdg: { color: colors.gold, fontSize: 8.5, fontWeight: "800", textAlign: "right", marginTop: 2 },
  loading: { paddingVertical: 30, alignItems: "center", gap: 8 },
  muted: { color: colors.muted, fontSize: 11 },
  errorBox: { padding: 13, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  errorText: { color: colors.danger, textAlign: "right", fontSize: 11, fontWeight: "700" },
  pressed: { opacity: 0.82 },
});
