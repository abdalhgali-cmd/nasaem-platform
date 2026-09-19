import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { getPublicServices, PublicService } from "../src/api/services";

const NAVY = "#102A43";
const GOLD = "#B58A3A";

export default function HomeScreen() {
  const [services, setServices] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

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

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.muted}>جاري تحميل الخدمات…</Text></View>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={services}
        keyExtractor={(item, index) => String(item.id ?? item.slug ?? index)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        ListHeaderComponent={
          <View style={styles.hero}>
            <Text style={styles.brand}>نسائم الحرمين</Text>
            <Text style={styles.slogan}>اختيارك الآمن للسفر</Text>
            <Text style={styles.heading}>خدماتنا</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.error}>{error ? "تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى." : "لا توجد خدمات متاحة حاليًا."}</Text>
            <Pressable style={styles.retry} onPress={() => { setLoading(true); void load(); }}><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: "/service/[slug]", params: { slug: item.slug ?? String(item.id), payload: JSON.stringify(item) } })}
          >
            <Text style={styles.cardTitle}>{item.nameAr ?? item.name ?? item.title ?? "خدمة"}</Text>
            {!!item.description && <Text numberOfLines={2} style={styles.description}>{item.description}</Text>}
            {(item.price != null || item.currency) && <Text style={styles.price}>{item.price ?? ""} {item.currency ?? ""}</Text>}
          </Pressable>
        )}
        contentContainerStyle={styles.content}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F8FA" },
  content: { padding: 18, paddingBottom: 36 },
  hero: { alignItems: "center", paddingVertical: 28 },
  brand: { fontSize: 30, fontWeight: "800", color: NAVY, textAlign: "center" },
  slogan: { marginTop: 6, color: GOLD, fontSize: 16, fontWeight: "700" },
  heading: { alignSelf: "flex-end", marginTop: 28, fontSize: 22, fontWeight: "800", color: NAVY },
  card: { backgroundColor: "#FFF", borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: "#E8E9EC" },
  cardTitle: { textAlign: "right", fontSize: 18, fontWeight: "800", color: NAVY },
  description: { textAlign: "right", color: "#52606D", lineHeight: 22, marginTop: 8 },
  price: { textAlign: "right", color: GOLD, fontWeight: "800", marginTop: 12 },
  center: { flex: 1, minHeight: 220, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
  muted: { color: "#6B7280" },
  error: { textAlign: "center", color: "#52606D", lineHeight: 24 },
  retry: { backgroundColor: NAVY, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: "#FFF", fontWeight: "700" },
});
