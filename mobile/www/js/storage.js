// Thin wrapper so the rest of the app never touches localStorage or the
// Capacitor Preferences plugin directly. Preferences is backed by
// SharedPreferences on Android, so a value written here survives an app
// restart or kill — that's what makes "persistent session" possible
// without depending on the WebView's cookie jar.
const prefs = window.Capacitor?.Plugins?.Preferences || null;

export async function getItem(key) {
  if (prefs) {
    const { value } = await prefs.get({ key });
    return value ?? null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  if (prefs) {
    await prefs.set({ key, value });
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private-browsing / storage-blocked fallback: the session simply
    // won't persist across a reload, but the app keeps working.
  }
}

export async function removeItem(key) {
  if (prefs) {
    await prefs.remove({ key });
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore — see setItem.
  }
}
