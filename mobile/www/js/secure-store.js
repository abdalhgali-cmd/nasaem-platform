// Session secrets (customer token, tracking token). On Android they go to the
// app's own SecureSession plugin (MainActivity / SecureSessionPlugin.java):
// AES-GCM with an Android Keystore key, optionally bound to a fingerprint.
// They are never written to localStorage or Capacitor Preferences there.
//
// In a plain browser (developing www/ without Android) there is no Keystore;
// sessionStorage is used so a dev session dies with the tab and nothing
// long-lived is left behind. Biometrics are reported as unavailable.
import { getItem as getPreference, removeItem as removePreference } from "./storage.js";

const native = window.Capacitor?.Plugins?.SecureSession || null;

export const hasNativeSecureStore = Boolean(native);

function devStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export async function secureGet(key) {
  if (native) {
    const { value } = await native.get({ key });
    return value ?? null;
  }
  return devStore()?.getItem(`secure.${key}`) ?? null;
}

export async function secureSet(key, value) {
  if (native) {
    await native.set({ key, value });
    return;
  }
  devStore()?.setItem(`secure.${key}`, value);
}

export async function secureRemove(key) {
  if (native) {
    await native.remove({ key });
    return;
  }
  devStore()?.removeItem(`secure.${key}`);
}

export async function secureClearAll() {
  if (native) {
    await native.clear();
    return;
  }
  const store = devStore();
  if (!store) return;
  Object.keys(store)
    .filter((k) => k.startsWith("secure."))
    .forEach((k) => store.removeItem(k));
}

// Versions before this one kept tokens in Capacitor Preferences (plain
// SharedPreferences). Move such a token into secure storage once and delete
// the plain copy, so updating the app does not sign anyone out.
export async function migrateLegacyPreference(legacyKey, secureKey) {
  let legacy = null;
  try {
    legacy = await getPreference(legacyKey);
  } catch {
    return;
  }
  if (!legacy) return;
  if (!(await secureGet(secureKey))) await secureSet(secureKey, legacy);
  await removePreference(legacyKey);
}

export async function biometricStatus(key) {
  if (!native) return { available: false, reason: "NOT_NATIVE", enabled: false };
  return native.biometricStatus({ key });
}

// Plugin rejections carry a `.code` (see SecureSessionPlugin.java).
export async function enableBiometric(key, value, { title, subtitle, cancel }) {
  if (!native) throw Object.assign(new Error("not native"), { code: "UNSUPPORTED" });
  return native.enableBiometric({ key, value, title, subtitle, cancel });
}

export async function unlockBiometric(key, { title, subtitle, cancel }) {
  if (!native) throw Object.assign(new Error("not native"), { code: "UNSUPPORTED" });
  const { value } = await native.unlockBiometric({ key, title, subtitle, cancel });
  return value ?? null;
}

export async function disableBiometric(key, value) {
  if (!native) return;
  await native.disableBiometric(value ? { key, value } : { key });
}
