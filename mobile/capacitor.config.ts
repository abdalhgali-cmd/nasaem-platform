import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nasaemalharamain.app",
  appName: "Nasaem Al-Haramain",
  webDir: "www",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Native networking (not the WebView's fetch) so the session cookie
    // reliably survives an app restart — see www/js/api.js.
    CapacitorHttp: {
      enabled: true,
    },
    Keyboard: {
      resize: "native",
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#082b58",
    },
    SplashScreen: {
      launchShowDuration: 700,
      launchAutoHide: true,
      backgroundColor: "#082b58",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER",
      showSpinner: false,
    },
  },
};

export default config;
