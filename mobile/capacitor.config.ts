import type { CapacitorConfig } from '@capacitor/cli';

const appUrl = process.env.NASAEM_APP_URL || 'https://nasaem-alharamain.com';

const config: CapacitorConfig = {
  appId: 'com.nasaemalharamain.app',
  appName: 'Nasaem Al-Haramain',
  webDir: 'www',
  server: {
    url: appUrl,
    cleartext: false,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    Keyboard: {
      resize: 'native'
    },
    StatusBar: {
      overlaysWebView: false
    }
  }
};

export default config;
