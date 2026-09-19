import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { PublicService } from "../../src/api/services";

export default function ServiceDetailsScreen() {
  const params = useLocalSearchParams<{ slug: string; payload?: string }>();
  let service: PublicService | null = null;
  try {
    service = params.payload ? JSON.parse(params.payload) as PublicService : null;
  } catch {
    service = null;
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>{service?.nameAr ?? service?.name ?? service?.title ?? "تفاصيل الخدمة"}</Text>
      {!!service?.description && <Text style={styles.description}>{service.description}</Text>}
      <View style={styles.card}>
        <Text style={styles.label}>السعر</Text>
        <Text style={styles.value}>{service?.price ?? "يحدد بعد مراجعة الطلب"} {service?.currency ?? ""}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>رمز الخدمة</Text>
        <Text style={styles.value}>{service?.slug ?? params.slug}</Text>
      </View>
      <Text style={styles.note}>سيتم ربط نموذج التقديم الديناميكي ومتطلبات المستندات بهذه الصفحة في المرحلة التالية.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, backgroundColor: "#F7F8FA", flexGrow: 1 },
  title: { fontSize: 26, fontWeight: "800", color: "#102A43", textAlign: "right" },
  description: { fontSize: 16, lineHeight: 27, color: "#52606D", textAlign: "right" },
  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E8E9EC" },
  label: { textAlign: "right", color: "#6B7280", marginBottom: 6 },
  value: { textAlign: "right", color: "#102A43", fontSize: 17, fontWeight: "700" },
  note: { textAlign: "right", color: "#B58A3A", lineHeight: 24, marginTop: 10 },
});
