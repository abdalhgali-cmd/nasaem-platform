import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { getPublicServices, PublicService } from "../src/api/services";
import { colors } from "../src/theme";
import { formatPrice, formatSdgEquivalent } from "../src/utils/price";

function titleOf(item: PublicService) {
  return item.nameAr ?? item.name ?? item.title ?? "خدمة";
}

function featureMeta(item: PublicService) {
  return item.features && typeof item.features === "object"
    ? (item.features as Record<string, unknown>)
    : {};
}

function publishedRank(item: PublicService) {
  const meta = featureMeta(item);
  const priority = Number(meta.homePriority ?? meta.priority ?? Number.NaN);
  const popularity = Number(meta.popularityScore ?? meta.viewCount ?? 0);
  return {
    pinned: Boolean(meta.homePinned ?? meta.pinned),
    priority: Number.isFinite(priority) ? priority : 999,
    popularity: Number.isFinite(popularity) ? popularity : 0,
  };
}

function routeFor(item: PublicService) {
  const code = (item.code ?? "").toUpperCase();
  const category = (item.category ?? "").toLowerCase();
  if (code === "SVC-UMRAH" || category === "umrah") return "/umrah";
  if (code === "SVC-EGYPT-CLEARANCE") return "/egypt";
  if (category.includes("family")) return "/family-visit";
  if (category.includes("flight")) return "/flights";
  if (category.includes("ferry")) return "/ferries";
  return null;
}

type QuickItem = {
  icon: string;
  label: string;
  route: string;
};

const fixedQuick: QuickItem[] = [
  { icon: "🕋", label: "العمرة", route: "/umrah" },
  { icon: "✈️", label: "الطيران", route: "/flights" },
  { icon: "⛴️", label: "البواخر", route: "/ferries" },
];

const dynamicFallback: QuickItem = {
  icon: "🇪🇬",
  label: "الموافقة الأمنية",
  route: "/egypt",
};

function dynamicIcon(item: PublicService) {
  const route = routeFor(item);
  if (route === "/egypt") return "🇪🇬";
  if (route === "/family-visit") return "🇸🇦";
  if (route === "/flights") return "✈️";
  if (route === "/ferries") return "⛴️";
  if (route === "/umrah") return "🕋";
  return "✦";
}

export default function HomeScreen() {
  const [services, setServices] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setError(false);
      setServices(await getPublicServices());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const quick = useMemo<QuickItem[]>(() => {
    const fixedRoutes = new Set(fixedQuick.map((item) => item.route));
    const dynamic = services
      .map((service) => ({ service, route: routeFor(service), rank: publishedRank(service) }))
      .filter((item) => item.route && !fixedRoutes.has(item.route))
      .sort((a, b) => {
        if (a.rank.pinned !== b.rank.pinned) return a.rank.pinned ? -1 : 1;
        if (a.rank.priority !== b.rank.priority) return a.rank.priority - b.rank.priority;
        return b.rank.popularity - a.rank.popularity;
      })[0];

    return [
      ...fixedQuick,
      dynamic
        ? {
            icon: dynamicIcon(dynamic.service),
            label: titleOf(dynamic.service),
            route: dynamic.route as string,
          }
        : dynamicFallback,
    ];
  }, [services]);

  const main = useMemo(
    () =>
      services
        .filter((item) => titleOf(item).includes(query.trim()))
        .slice(0, 6),
    [services, query]
  );

  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={s.muted}>بنجهز ليك الرحلة…</Text>
      </View>
    );

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={main}
        numColumns={2}
        columnWrapperStyle={s.row}
        keyExtractor={(item, index) => String(item.id ?? item.slug ?? index)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <>
            <View style={s.hero}>
              <View style={s.heroOrbOne} />
              <View style={s.heroOrbTwo} />
              <View style={s.top}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>ن</Text>
                </View>
                <View style={s.heroCopy}>
                  <Text style={s.hello}>أهلاً بيك في نسائم الحرمين</Text>
                  <Text style={s.heroTitle}>وين ناوي تسافر؟ ✈️</Text>
                </View>
              </View>
              <Text style={s.heroSub}>
                من أول فكرة للرحلة لحد ما تصل — كل طلباتك في مكان واحد.
              </Text>
              <View style={s.search}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="ابحث عن عمرة، تأشيرة، رحلة…"
                  placeholderTextColor={colors.subtle}
                  style={s.searchInput}
                />
                <Text style={s.searchIcon}>⌕</Text>
              </View>
            </View>

            <Text style={s.quickHeading}>الخدمات السريعة</Text>
            <FlatList
              horizontal
              inverted
              showsHorizontalScrollIndicator={false}
              data={quick}
              keyExtractor={(item) => item.route}
              contentContainerStyle={s.quickList}
              renderItem={({ item }) => (
                <Pressable
                  style={s.quickCard}
                  onPress={() => router.push(item.route as never)}
                >
                  <View style={s.quickIcon}>
                    <Text style={s.quickEmoji}>{item.icon}</Text>
                  </View>
                  <Text numberOfLines={2} style={s.quickText}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />

            <Pressable style={s.activeTrip} onPress={() => router.push("/track")}>
              <View style={s.tripTop}>
                <Text style={s.tripArrow}>‹</Text>
                <View>
                  <Text style={s.tripLabel}>عندك طلب شغال؟</Text>
                  <Text style={s.tripTitle}>تابع رحلتك خطوة بخطوة</Text>
                </View>
              </View>
              <View style={s.progress}>
                <View style={s.progressFill} />
              </View>
              <Text style={s.tripHint}>
                افتح طلباتك وشوف المطلوب منك الآن
              </Text>
            </Pressable>

            <View style={s.section}>
              <Pressable onPress={() => router.push("/services")}>
                <Text style={s.link}>عرض الكل</Text>
              </Pressable>
              <View>
                <Text style={s.sectionTitle}>اكتشف خدماتنا</Text>
                <Text style={s.sectionSub}>اختار الخدمة المناسبة لرحلتك</Text>
              </View>
            </View>

            {error ? (
              <Pressable
                style={s.errorBox}
                onPress={() => {
                  setLoading(true);
                  void load();
                }}
              >
                <Text style={s.errorText}>
                  تعذر تحديث الخدمات — اضغط للمحاولة مرة تانية
                </Text>
              </Pressable>
            ) : null}
          </>
        }
        renderItem={({ item }) => {
          const directRoute = routeFor(item);
          return (
            <Pressable
              style={s.card}
              onPress={() =>
                directRoute
                  ? router.push(directRoute as never)
                  : router.push({
                      pathname: "/service/[slug]",
                      params: {
                        slug: item.slug ?? String(item.id),
                        payload: JSON.stringify(item),
                      },
                    })
              }
            >
              <View style={s.cardIcon}>
                <Text style={s.cardIconText}>{dynamicIcon(item)}</Text>
              </View>
              <Text style={s.cardTitle}>{titleOf(item)}</Text>
              <Text numberOfLines={2} style={s.desc}>
                {item.description ?? "شوف التفاصيل والمتطلبات وابدأ طلبك"}
              </Text>
              <View style={s.priceRow}>
                <Text style={s.cardPrice}>
                  {formatPrice(item.basePrice, item.currency, "السعر قيد المراجعة")}
                </Text>
                {formatSdgEquivalent(item.priceSdg) ? (
                  <Text style={s.cardSdg}>{formatSdgEquivalent(item.priceSdg)}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <>
            <Pressable style={s.cta} onPress={() => router.push("/requests")}>
              <Text style={s.ctaText}>كل الخدمات</Text>
              <Text style={s.ctaArrow}>←</Text>
            </Pressable>
            <View style={s.nav}>
              <Pressable onPress={() => router.push("/account")}>
                <Text style={s.navText}>◎{"\n"}حسابي</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/track")}>
                <Text style={s.navText}>◷{"\n"}طلباتي</Text>
              </Pressable>
              <Text style={s.navActive}>⌂{"\n"}الرئيسية</Text>
            </View>
          </>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 22 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.background,
  },
  muted: { color: colors.muted },
  hero: {
    minHeight: 278,
    overflow: "hidden",
    backgroundColor: colors.navyDark,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 26,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  heroOrbOne: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(11,61,145,.55)",
    left: -62,
    top: -54,
  },
  heroOrbTwo: {
    position: "absolute",
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "rgba(212,175,55,.12)",
    right: -18,
    top: 48,
  },
  top: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroCopy: { flex: 1, marginLeft: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,.13)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
  },
  avatarText: { color: colors.gold, fontWeight: "900", fontSize: 20 },
  hello: { color: "#BFCBE2", fontSize: 11, textAlign: "right" },
  heroTitle: {
    color: "#FFF",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 3,
  },
  heroSub: {
    color: "#D5DCEC",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
    marginTop: 14,
  },
  search: {
    marginTop: 18,
    backgroundColor: "#FFF",
    borderRadius: 16,
    height: 52,
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 15,
  },
  searchInput: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: colors.text,
  },
  searchIcon: { fontSize: 23, color: colors.navy, marginLeft: 8 },
  quickHeading: {
    paddingHorizontal: 18,
    paddingTop: 18,
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "right",
  },
  quickList: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  quickCard: {
    width: 88,
    minHeight: 92,
    backgroundColor: "#FFF",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F0F4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  quickEmoji: { fontSize: 20 },
  quickText: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "800",
    color: colors.text,
    marginTop: 7,
    textAlign: "center",
  },
  activeTrip: {
    margin: 16,
    marginBottom: 3,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tripTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripArrow: { fontSize: 27, color: colors.gold },
  tripLabel: {
    fontSize: 10,
    color: colors.gold,
    fontWeight: "900",
    textAlign: "right",
  },
  tripTitle: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 3,
  },
  progress: {
    height: 5,
    backgroundColor: "#E9EDF4",
    borderRadius: 9,
    marginTop: 15,
    overflow: "hidden",
  },
  progressFill: {
    width: "55%",
    height: "100%",
    backgroundColor: colors.gold,
    borderRadius: 9,
  },
  tripHint: {
    fontSize: 10,
    color: colors.muted,
    textAlign: "right",
    marginTop: 8,
  },
  section: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
  },
  sectionSub: {
    fontSize: 10,
    color: colors.muted,
    textAlign: "right",
    marginTop: 3,
  },
  link: { fontSize: 11, color: colors.navy, fontWeight: "800" },
  row: { paddingHorizontal: 16, gap: 12 },
  card: {
    flex: 1,
    minHeight: 164,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 15,
    marginBottom: 12,
    alignItems: "flex-end",
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EEF3FB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardIconText: { color: colors.navy, fontWeight: "900", fontSize: 18 },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
  },
  desc: {
    fontSize: 10.5,
    color: colors.muted,
    lineHeight: 17,
    textAlign: "right",
    marginTop: 5,
  },
  priceRow: { marginTop: "auto", alignItems: "flex-end" },
  cardPrice: { fontSize: 11.5, fontWeight: "900", color: colors.navy },
  cardSdg: {
    fontSize: 9,
    color: colors.gold,
    fontWeight: "700",
    marginTop: 2,
  },
  cta: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.gold,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ctaText: { color: colors.navyDark, fontWeight: "900", fontSize: 14 },
  ctaArrow: { color: colors.navyDark, fontSize: 20, fontWeight: "900" },
  nav: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  navText: {
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "700",
  },
  navActive: {
    fontSize: 10,
    color: colors.navy,
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "900",
  },
  errorBox: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF4F2",
  },
  errorText: { color: colors.danger, textAlign: "right", fontSize: 11 },
});
