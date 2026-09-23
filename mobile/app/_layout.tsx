import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme";
import { restoreTrackingSession } from "../src/api/tracking";

export default function RootLayout() {
  useEffect(() => {
    void restoreTrackingSession();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleAlign: "center",
          headerBackTitle: "رجوع",
          headerTintColor: colors.navy,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: "#FFF" },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="services" options={{ title: "الخدمات" }} />
        <Stack.Screen name="track" options={{ title: "طلباتي" }} />
        <Stack.Screen name="umrah" options={{ title: "العمرة", headerShown: false }} />
        <Stack.Screen name="egypt" options={{ title: "الموافقة الأمنية", headerShown: false }} />
        <Stack.Screen name="egypt-request" options={{ title: "طلب الموافقة", headerShown: false }} />
        <Stack.Screen name="family-visit" options={{ title: "الزيارة العائلية", headerShown: false }} />
        <Stack.Screen name="service/[slug]" options={{ title: "تفاصيل الخدمة" }} />
        <Stack.Screen name="requests" options={{ title: "الخدمات" }} />
        <Stack.Screen name="request/[kind]" options={{ title: "بيانات الطلب" }} />
        <Stack.Screen name="visas" options={{ title: "التأشيرات" }} />
        <Stack.Screen name="flights" options={{ title: "الطيران" }} />
        <Stack.Screen name="ferries" options={{ title: "البواخر" }} />
        <Stack.Screen name="account" options={{ title: "حسابي" }} />
        <Stack.Screen name="egypt-plan/[id]" options={{ title: "رحلتك لمصر" }} />
      </Stack>
    </>
  );
}
