import { useState } from "react";
import { router } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { FlightOption, searchFlights } from "../src/api/travel";
import { AppButton, BrandHeader, ChoiceCard, FormField, SectionTitle, SurfaceCard } from "../src/components/ui";
import { colors } from "../src/theme";

export default function FlightsScreen() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [travelers, setTravelers] = useState("1");
  const [tripType, setTripType] = useState<"ONE_WAY" | "ROUND_TRIP">("ONE_WAY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<FlightOption[]>([]);

  async function search() {
    try {
      setBusy(true);
      setError("");
      setResults([]);
      if (!from.trim() || !to.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("أدخل مدينة المغادرة والوجهة وتاريخ السفر بصيغة YYYY-MM-DD");
      if (tripType === "ROUND_TRIP" && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) throw new Error("أدخل تاريخ العودة بصيغة YYYY-MM-DD");
      const response = await searchFlights({
        from: from.trim(),
        to: to.trim(),
        date,
        returnDate: tripType === "ROUND_TRIP" ? returnDate : undefined,
        travelers: Math.max(1, Number(travelers) || 1),
        tripType,
      });
      const first = response.legs[0];
      setResults([...(first?.manual ?? []), ...(first?.trip ?? [])]);
      if (!(first?.manual?.length || first?.trip?.length)) setError("لا توجد رحلات مطابقة منشورة الآن. يمكنك إرسال طلب بحث للوكالة.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "تعذر البحث عن الرحلات");
    } finally {
      setBusy(false);
    }
  }

  function request(selected?: FlightOption) {
    router.push({
      pathname: "/request/[kind]",
      params: {
        kind: "flights",
        from,
        to,
        date,
        returnDate: tripType === "ROUND_TRIP" ? returnDate : "",
        travelers,
        tripType,
        selectedFlight: selected ? JSON.stringify(selected) : "",
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <BrandHeader compact title="وين ناوي تسافر؟ ✈️" subtitle="ابحث عن رحلة مناسبة ثم أرسلها للوكالة لتأكيد السعر والتوفر." />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <SurfaceCard style={styles.form}>
          <SectionTitle title="تفاصيل الرحلة" />
          <View style={styles.choices}>
            <ChoiceCard title="ذهاب فقط" icon="↗" selected={tripType === "ONE_WAY"} onPress={() => setTripType("ONE_WAY")} />
            <ChoiceCard title="ذهاب وعودة" icon="⇄" selected={tripType === "ROUND_TRIP"} onPress={() => setTripType("ROUND_TRIP")} />
          </View>
          <View style={styles.routeRow}>
            <View style={styles.flex}><FormField label="من" value={from} onChangeText={setFrom} placeholder="PZU أو بورتسودان" /></View>
            <Text style={styles.routeArrow}>←</Text>
            <View style={styles.flex}><FormField label="إلى" value={to} onChangeText={setTo} placeholder="JED أو جدة" /></View>
          </View>
          <FormField label="تاريخ السفر" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          {tripType === "ROUND_TRIP" ? <FormField label="تاريخ العودة" value={returnDate} onChangeText={setReturnDate} placeholder="YYYY-MM-DD" /> : null}
          <FormField label="عدد المسافرين" value={travelers} onChangeText={setTravelers} placeholder="1" keyboardType="number-pad" />
          <AppButton label="بحث الرحلات" onPress={search} busy={busy} />
        </SurfaceCard>

        {error ? (
          <SurfaceCard style={styles.notice}>
            <Text style={styles.noticeTitle}>لم نجد نتيجة جاهزة</Text>
            <Text style={styles.noticeText}>{error}</Text>
            <AppButton label="أرسل طلب بحث للوكالة" variant="outline" onPress={() => request()} />
          </SurfaceCard>
        ) : null}

        {results.length ? <SectionTitle title="الرحلات المتاحة" /> : null}
        {results.map((flight, index) => (
          <SurfaceCard key={String(flight.id ?? flight.externalRef ?? index)} style={styles.result}>
            <View style={styles.resultHead}>
              <View>
                <Text style={styles.airline}>{flight.airline ?? "رحلة"}</Text>
                <Text style={styles.flightNo}>{flight.flightNumber ?? ""}</Text>
              </View>
              <Text style={styles.price}>{flight.price != null ? `${flight.price} ${flight.currency ?? ""}` : "السعر بعد المراجعة"}</Text>
            </View>
            <View style={styles.routeVisual}>
              <Text style={styles.city}>{flight.origin?.name ?? from}</Text>
              <View style={styles.routeLine}><View style={styles.dot} /><View style={styles.line} /><Text style={styles.plane}>✈</Text><View style={styles.line} /><View style={styles.dot} /></View>
              <Text style={styles.city}>{flight.destination?.name ?? to}</Text>
            </View>
            <Text style={styles.meta}>{formatDate(flight.departureAt)} {flight.baggage ? `· ${flight.baggage}` : ""} {flight.cabin ? `· ${flight.cabin}` : ""}</Text>
            {flight.priceSdg != null ? <Text style={styles.sdg}>≈ {Math.round(flight.priceSdg).toLocaleString()} SDG</Text> : null}
            <AppButton label="اختيار هذه الرحلة" onPress={() => request(flight)} />
          </SurfaceCard>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ar");
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 16, gap: 16, paddingBottom: 40 },
  form: { gap: 14 },
  choices: { gap: 9 },
  routeRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 8 },
  flex: { flex: 1 },
  routeArrow: { color: colors.gold, fontSize: 22, fontWeight: "900", paddingBottom: 14 },
  notice: { gap: 9, backgroundColor: colors.goldSoft, borderColor: "#F0DE9B" },
  noticeTitle: { color: colors.text, fontSize: 14, fontWeight: "900", textAlign: "right" },
  noticeText: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: "right" },
  result: { gap: 13 },
  resultHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start" },
  airline: { fontSize: 14, fontWeight: "900", color: colors.navy, textAlign: "right" },
  flightNo: { fontSize: 10, color: colors.muted, textAlign: "right", marginTop: 2 },
  price: { fontSize: 13, fontWeight: "900", color: colors.text },
  routeVisual: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  city: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "800", textAlign: "center" },
  routeLine: { flex: 1.5, flexDirection: "row-reverse", alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.navy },
  line: { height: 1, flex: 1, backgroundColor: colors.border },
  plane: { color: colors.gold, fontSize: 16 },
  meta: { fontSize: 10.5, color: colors.muted, textAlign: "right" },
  sdg: { fontSize: 10, color: colors.gold, fontWeight: "800", textAlign: "right" },
});
