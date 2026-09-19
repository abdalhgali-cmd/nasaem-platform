import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleAlign: "center",
          headerBackTitle: "رجوع",
          contentStyle: { backgroundColor: "#F7F8FA" },
        }}
      />
    </>
  );
}
