import { router } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { BottomNav, BrandHeader, ChoiceCard } from "../src/components/ui";
import { colors } from "../src/theme";

const items = [
  { key: "umrah", icon: "🕋", title: "العمرة", desc: "باقات العمرة والمسافرين والمستندات" },
  { key: "flights", icon: "✈️", title: "الطيران", desc: "حجز رحلات ذهاب وعودة" },
  { key: "visas", icon: "🛂", title: "التأشيرات", desc: "الدول وأنواع التأشيرات" },
  { key: "egypt", icon: "🇪🇬", title: "الموافقة الأمنية لمصر", desc: "طلب ومتابعة الموافقة" },
  { key: "family", icon: "🇸🇦", title: "الزيارة العائلية", desc: "متابعة مراحل الزيارة السعودية" },
  { key: "ferries", icon: "⛴️", title: "البواخر", desc: "حجوزات السفر البحري" },
  { key: "hotels", icon: "🏨", title: "الفنادق والسياحة", desc: "الفنادق والبرامج السياحية" },
];

function openService(key: string) {
  if (key === "umrah") return router.push("/umrah");
  if (key === "visas") return router.push("/visas");
  if (key === "flights") return router.push("/flights");
  if (key === "ferries") return router.push("/ferries");
  return router.push({ pathname: "/request/[kind]", params: { kind: key } });
}

export default function RequestHub() {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <BrandHeader compact title="ابدأ طلبك" subtitle="اختر الخدمة، وسنوضح لك الخطوات المطلوبة فقط." />
        <View style={s.body}>
          {items.map((item) => (
            <ChoiceCard key={item.key} icon={item.icon} title={item.title} subtitle={item.desc} meta="‹" onPress={() => openService(item.key)} />
          ))}
        </View>
      </ScrollView>
      <BottomNav active="services" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { paddingBottom: 96 }, body: { padding: 16, gap: 10 } });
