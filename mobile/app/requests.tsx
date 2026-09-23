import { router } from "expo-router";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../src/theme";

const items = [
  ["🕋", "umrah", "العمرة", "اختار الخدمة وابدأ رحلة العمرة خطوة بخطوة"],
  ["🇪🇬", "egypt", "الموافقة الأمنية لمصر", "بيانات بسيطة، دفع، موافقة ثم التعميم"],
  ["🇸🇦", "family", "الزيارة العائلية", "من بيانات الزائر لحد صدور التأشيرة"],
  ["✈️", "flights", "الطيران", "خلينا نلقى ليك الرحلة المناسبة"],
  ["⛴️", "ferries", "البواخر", "حجوزات السفر البحري"],
  ["🛂", "visas", "تأشيرات أخرى", "اختار الدولة ونوع التأشيرة"],
  ["🏨", "hotels", "الفنادق والسياحة", "إقامة وبرامج سفر"],
] as const;

function open(key: (typeof items)[number][1]) {
  if (key === "umrah") return router.push("/umrah");
  if (key === "egypt") return router.push("/egypt");
  if (key === "family") return router.push("/family-visit");
  if (key === "visas") return router.push("/visas");
  if (key === "flights") return router.push("/flights");
  if (key === "ferries") return router.push("/ferries");
  return router.push({ pathname: "/request/[kind]", params: { kind: key } });
}

export default function RequestHub() {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.hero}>
          <View style={s.orbOne} />
          <View style={s.orbTwo} />
          <Text style={s.kicker}>رحلتك تبدأ من هنا</Text>
          <Text style={s.title}>شنو الخدمة الدايرها؟</Text>
          <Text style={s.intro}>
            الخدمات الأساسية عندها رحلة خاصة، وباقي الخدمات متاحة من نفس المكان.
          </Text>
        </View>

        <Text style={s.sectionTitle}>الخدمات الأساسية</Text>
        {items.map(([icon, key, title, desc], index) => (
          <Pressable
            key={key}
            style={[s.card, index < 3 && s.primaryCard]}
            onPress={() => open(key)}
          >
            <Text style={s.arrow}>‹</Text>
            <View style={s.copy}>
              <Text style={s.cardTitle}>{title}</Text>
              <Text style={s.desc}>{desc}</Text>
            </View>
            <View style={[s.icon, index < 3 && s.primaryIcon]}>
              <Text style={s.emoji}>{icon}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 18, gap: 11, paddingBottom: 36 },
  hero: {
    overflow: "hidden",
    backgroundColor: colors.navyDark,
    borderRadius: 24,
    padding: 20,
    minHeight: 154,
    justifyContent: "flex-end",
    marginBottom: 6,
  },
  orbOne: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(11,61,145,.5)",
    left: -42,
    top: -38,
  },
  orbTwo: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(212,175,55,.14)",
    right: 14,
    top: 20,
  },
  kicker: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "right",
  },
  title: {
    fontSize: 23,
    fontWeight: "900",
    color: "#FFF",
    textAlign: "right",
    marginTop: 5,
  },
  intro: {
    fontSize: 11,
    color: "#D5DCEC",
    textAlign: "right",
    marginTop: 6,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 4,
    marginBottom: 2,
  },
  card: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  primaryCard: {
    borderColor: "#DDE7F7",
  },
  copy: { flex: 1 },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#F0F4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryIcon: { backgroundColor: "#EEF3FB" },
  emoji: { fontSize: 21 },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
  },
  desc: {
    fontSize: 10.5,
    color: colors.muted,
    textAlign: "right",
    marginTop: 4,
    lineHeight: 17,
  },
  arrow: { fontSize: 24, color: colors.gold },
});
