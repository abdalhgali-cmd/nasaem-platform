import { router } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomNav, BrandHeader, ChoiceCard, SurfaceCard } from "../src/components/ui";
import { colors } from "../src/theme";

export default function AccountScreen() {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <BrandHeader compact eyebrow="حساب العميل" title="أهلاً بك في نسائم" subtitle="طلباتك وخدماتك في مكان واحد." />
        <View style={s.body}>
          <ChoiceCard icon="＋" title="طلب جديد" subtitle="اختر الخدمة وابدأ الإجراءات" meta="‹" onPress={() => router.push("/requests")} />
          <ChoiceCard icon="▣" title="متابعة طلباتي" subtitle="الحالة والدفع والمستندات" meta="‹" onPress={() => router.push("/track")} />
          <SurfaceCard style={s.about}>
            <Text style={s.logo}>ن</Text>
            <View style={s.aboutCopy}>
              <Text style={s.aboutTitle}>نسائم الحرمين للسفر والسياحة</Text>
              <Text style={s.aboutText}>اختيارك الآمن للسفر</Text>
            </View>
          </SurfaceCard>
        </View>
      </ScrollView>
      <BottomNav active="account" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingBottom: 96 }, body: { padding: 16, gap: 12 },
  about: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 8 }, logo: { width: 46, height: 46, borderRadius: 23, textAlign: "center", textAlignVertical: "center", backgroundColor: colors.navy, color: colors.gold, fontSize: 20, fontWeight: "900" },
  aboutCopy: { flex: 1 }, aboutTitle: { color: colors.text, fontSize: 13, fontWeight: "900", textAlign: "right" }, aboutText: { color: colors.muted, fontSize: 10.5, textAlign: "right", marginTop: 4 },
});
