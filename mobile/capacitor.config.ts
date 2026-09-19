import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nasaemalharamain.app',
  appName: 'Nasaem Al-Haramain',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  android: { allowMixedContent: false },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    Keyboard: { resize: 'native' },
    StatusBar: { overlaysWebView: false }
  }
};

export default config;
