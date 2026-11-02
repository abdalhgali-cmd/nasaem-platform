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
    // Status bar: always light icons on navy. Capacitor 8's SystemBars
    // (edge-to-edge) otherwise picks dark icons from the light app theme.
    // On Android 15+ the bar is transparent and the page paints the navy
    // strip itself (.status-scrim, sized by --safe-area-inset-top); on older
    // versions StatusBar's backgroundColor below paints it natively.
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
      initialViewportFitValueHint: "cover",
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#061f42",
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
