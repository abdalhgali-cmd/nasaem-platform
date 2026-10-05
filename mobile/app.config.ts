import type { ExpoConfig } from "expo/config";

// One app, three environments. APP_ENV selects the identity and API:
//
//   development  local emulator/device   package ….app.dev      API: EXPO_PUBLIC_API_URL or the emulator host
//   staging      internal test builds    package ….app.staging  API: EXPO_PUBLIC_API_URL or the staging host
//   production   Play Store release      package ….app          API: EXPO_PUBLIC_API_URL (REQUIRED)
//
// Separate package ids let a staging build and the production app be installed
// side by side on one phone. The guards below make it impossible to build a
// production app that talks to staging/localhost (or the reverse) by mistake.

type AppEnv = "development" | "staging" | "production";

const ENV = (process.env.APP_ENV ?? "development") as AppEnv;
if (!["development", "staging", "production"].includes(ENV)) {
  throw new Error(`APP_ENV must be development, staging or production (got "${process.env.APP_ENV}")`);
}

const STAGING_API = "https://adaptable-quietude-staging.up.railway.app";
const DEV_API = "http://10.0.2.2:5000"; // Android emulator -> host machine

const configuredApi = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
const apiUrl = configuredApi || (ENV === "development" ? DEV_API : ENV === "staging" ? STAGING_API : undefined);

if (!apiUrl) {
  throw new Error("Production builds require EXPO_PUBLIC_API_URL (the production API base URL). There is deliberately no default.");
}
if (ENV === "production") {
  if (!apiUrl.startsWith("https://")) throw new Error(`Production API URL must use https:// (got ${apiUrl})`);
  if (/staging|localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(apiUrl)) throw new Error(`Refusing a production build that points at a non-production API: ${apiUrl}`);
}

const IDENTITY: Record<AppEnv, { name: string; suffix: string }> = {
  development: { name: "نسائم (تطوير)", suffix: ".dev" },
  staging: { name: "نسائم الحرمين (تجريبي)", suffix: ".staging" },
  production: { name: "نسائم الحرمين", suffix: "" },
};

const versionCode = Number.parseInt(process.env.ANDROID_VERSION_CODE ?? "1", 10);

const config: ExpoConfig = {
  name: IDENTITY[ENV].name,
  slug: "nasaem-alharamain",
  version: process.env.APP_VERSION ?? "0.1.0",
  orientation: "portrait",
  scheme: "nasaem",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  icon: "./assets/logo.png",
  android: {
    package: `com.nasaemalharamain.app${IDENTITY[ENV].suffix}`,
    versionCode: Number.isFinite(versionCode) && versionCode > 0 ? versionCode : 1,
    permissions: ["INTERNET"],
    adaptiveIcon: {
      foregroundImage: "./assets/logo.png",
      backgroundColor: "#0B3D91",
    },
  },
  plugins: ["expo-router", "expo-document-picker", "expo-secure-store", "./plugins/with-release-signing"],
  extra: {
    appEnv: ENV,
    apiUrl,
    webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? "https://nasaem-alharamain.com",
  },
};

export default config;
