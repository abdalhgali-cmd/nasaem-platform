import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { getPublicVisaTypes, PublicVisaType } from "../src/api/services";
import { AppButton, BottomNav, BrandHeader, ChoiceCard, EmptyState, SurfaceCard } from "../src/components/ui";
import { colors, radius } from "../src/theme";
import { formatPrice, formatSdgEquivalent } from "../src/utils/price";

function countryIcon(country: string) {
  if (country.includes("مصر")) return "🇪🇬";
  if (country.includes("السعود")) return "🇸🇦";
  if (country.includes("الإمارات")) return "🇦🇪";
  return "🛂";
}

export default function VisasScreen() {
  const [items, setItems] = useState<PublicVisaType[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { getPublicVisaTypes().then(setItems).catch(() => setError("تعذر تحميل أنواع التأشيرات")).finally(() => setLoading(false)); }, []);
  const countries = useMemo(() => Array.from(new Set(items.map((item) => item.country))).filter(Boolean), [items]);
  const shown = country ? items.filter((item) => item.country === country) : [];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <BrandHeader compact title={country ?? "التأشيرات"} subtitle={country ? "اختر نوع التأشيرة المناسب ثم ابدأ الطلب." : "اختر الدولة، ونوضح لك السعر والمتطلبات خطوة بخطوة."} />
        <View style={s.body}>
          {loading ? <View style={s.loading}><ActivityIndicator color={colors.navy} /><Text style={s.muted}>جاري تحميل التأشيرات...</Text></View> : null}
          {error ? <EmptyState icon="!" title="تعذر تحميل التأشيرات" description={error} /> : null}
          {!loading && !error && !country ? countries.map((item) => (
            <ChoiceCard key={item} icon={countryIcon(item)} title={item} subtitle="عرض أنواع التأشيرات والأسعار" meta="‹" onPress={() => setCountry(item)} />
          )) : null}
          {!loading && !error && !country && countries.length === 0 ? <EmptyState icon="🛂" title="لا توجد تأشيرات منشورة" description="ارجع لاحقًا أو تواصل مع الوكالة." /> : null}
          {country ? (
            <>
              <Pressable onPress={() => setCountry(null)}><Text style={s.back}>تغيير الدولة ←</Text></Pressable>
              {shown.map((visa) => (
                <SurfaceCard key={visa.id}>
                  <Text style={s.visaTitle}>{visa.name}</Text>
                  {visa.description ? <Text style={s.visaDescription}>{visa.description}</Text> : null}
                  <View style={s.priceBox}>
                    <Text style={s.price}>{formatPrice(visa.basePrice, visa.currency)}</Text>
                    {formatSdgEquivalent(visa.priceSdg) ? <Text style={s.sdg}>{formatSdgEquivalent(visa.priceSdg)}</Text> : null}
                  </View>
                  {visa.processingTime ? <Text style={s.processing}>المدة المتوقعة: {visa.processingTime}</Text> : null}
                  <AppButton
                    label="ابدأ الطلب"
                    onPress={() => router.push({ pathname: "/request/[kind]", params: { kind: "visas", visaTypeId: visa.id, serviceId: visa.serviceId ?? "", serviceName: visa.name, country: visa.country, visaTypeName: visa.name } })}
                  />
                </SurfaceCard>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
      <BottomNav active="services" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingBottom: 96 }, body: { padding: 16, gap: 11 },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 10 }, muted: { color: colors.muted, fontSize: 11 },
  back: { color: colors.navy, fontSize: 12, fontWeight: "900", textAlign: "right", paddingVertical: 5 },
  visaTitle: { color: colors.text, fontSize: 16, fontWeight: "900", textAlign: "right" }, visaDescription: { color: colors.muted, fontSize: 10.5, lineHeight: 18, textAlign: "right", marginTop: 5 },
  priceBox: { backgroundColor: colors.soft, borderRadius: radius.md, padding: 13, marginVertical: 12 }, price: { color: colors.navy, fontSize: 20, fontWeight: "900", textAlign: "right" }, sdg: { color: colors.gold, fontSize: 10.5, fontWeight: "800", textAlign: "right", marginTop: 3 }, processing: { color: colors.muted, fontSize: 10, textAlign: "right", marginBottom: 12 },
});
