import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { clearTrackingSession, hasTrackingSession, restoreTrackingSession } from "../src/api/tracking";
import { agency, legalLinks } from "../src/config";
import { colors } from "../src/theme";

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("تعذر فتح الرابط", "لا يوجد تطبيق مناسب لفتح هذا الرابط على جهازك.");
  }
}

export default function AccountScreen() {
  const [signedIn, setSignedIn] = useState(hasTrackingSession());

  useFocusEffect(
    useCallback(() => {
      void restoreTrackingSession().then(setSignedIn);
    }, [])
  );

  function confirmSignOut() {
    Alert.alert("تسجيل الخروج", "سيتم حذف جلسة الدخول من هذا الجهاز. يمكنك الدخول مجددًا برقم هاتفك.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تسجيل الخروج",
        style: "destructive",
        onPress: async () => {
          await clearTrackingSession();
          setSignedIn(false);
          router.replace("/");
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.profile}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>ن</Text>
          </View>
          <Text style={s.title}>حسابي</Text>
          <Text style={s.desc}>
            {signedIn ? "أنت مسجّل الدخول. كل رحلاتك وطلباتك في مكان واحد." : "سجّل الدخول برقم هاتفك لمتابعة طلباتك."}
          </Text>
        </View>

        <Text style={s.section}>رحلاتي</Text>
        <Item icon="◷" title="طلباتي" desc="تابع الحالة والسعر والدفع والمستندات" onPress={() => router.push("/track")} />
        <Item icon="＋" title="طلب جديد" desc="ابدأ خدمة جديدة بسهولة" onPress={() => router.push("/requests")} />

        <Text style={s.section}>تواصل معنا</Text>
        <Item icon="✆" title="واتساب" desc={agency.phoneDisplay} onPress={() => void open(`https://wa.me/${agency.whatsapp}`)} />
        <Item icon="☎" title="اتصال هاتفي" desc={agency.phoneDisplay} onPress={() => void open(`tel:${agency.phone}`)} />

        <Text style={s.section}>معلومات قانونية</Text>
        {legalLinks.map((link) => (
          <Item key={link.url} icon="§" title={link.label} desc="يفتح في المتصفح" onPress={() => void open(link.url)} />
        ))}

        {signedIn ? (
          <Pressable accessibilityRole="button" style={s.signOut} onPress={confirmSignOut}>
            <Text style={s.signOutText}>تسجيل الخروج</Text>
          </Pressable>
        ) : null}

        <View style={s.brand}>
          <Text style={s.brandTitle}>{agency.name}</Text>
          <Text style={s.small}>اختيارك الآمن للسفر</Text>
          <Text style={s.small}>{agency.address}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Item({ icon, title, desc, onPress }: { icon: string; title: string; desc: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} style={s.card} onPress={onPress}>
      <Text style={s.arrow}>‹</Text>
      <View style={s.copy}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.small}>{desc}</Text>
      </View>
      <View style={s.icon}>
        <Text style={s.iconText}>{icon}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F7FB" },
  page: { padding: 18, gap: 11, paddingBottom: 36 },
  profile: { alignItems: "center", backgroundColor: colors.navyDark, borderRadius: 24, padding: 24 },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: "rgba(255,255,255,.12)", borderWidth: 1, borderColor: "rgba(255,255,255,.2)", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 26, fontWeight: "900", color: colors.gold },
  title: { fontSize: 22, fontWeight: "900", color: "#FFF", marginTop: 10 },
  desc: { fontSize: 11, color: "#D5DCEC", marginTop: 4, textAlign: "center" },
  section: { fontSize: 12, fontWeight: "900", color: colors.navy, textAlign: "right", marginTop: 8 },
  card: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EAF0", borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1 },
  icon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#EEF3FB", alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 20, color: colors.navy, fontWeight: "900" },
  cardTitle: { fontSize: 13, fontWeight: "900", color: colors.text, textAlign: "right" },
  small: { fontSize: 10.5, color: colors.muted, textAlign: "right", marginTop: 4, lineHeight: 17 },
  arrow: { fontSize: 24, color: colors.gold },
  signOut: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, paddingVertical: 13, alignItems: "center", backgroundColor: "#FFF" },
  signOutText: { color: colors.danger, fontWeight: "900", fontSize: 13 },
  brand: { backgroundColor: "#FFF", borderRadius: 18, padding: 17, borderWidth: 1, borderColor: "#E7EAF0" },
  brandTitle: { fontSize: 13, fontWeight: "900", color: colors.text, textAlign: "right" },
});
