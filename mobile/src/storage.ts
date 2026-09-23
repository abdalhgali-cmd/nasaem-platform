import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

function browserStorage() {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  return globalThis.localStorage;
}

export async function saveStoredValue(key: string, value: string) {
  if (Platform.OS === "web") {
    browserStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getStoredValue(key: string) {
  if (Platform.OS === "web") return browserStorage()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function deleteStoredValue(key: string) {
  if (Platform.OS === "web") {
    browserStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
