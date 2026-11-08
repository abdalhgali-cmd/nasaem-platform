// A submission key makes a retry of the same application return the request
// the first attempt created. Kept in localStorage so it survives a reload
// after a lost response, but only while the application is the same one
// (fingerprint of phone, service and travelers) and recent: a new
// application never inherits an old key.
const TTL_MS = 6 * 60 * 60 * 1000;

type Stored = { key: string; fingerprint: string; at: number };

export function submissionFingerprint(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => String(part ?? "").trim().toLowerCase()).join("|");
}

export function loadSubmissionKey(storageKey: string, fingerprint: string, make: () => string, inMemory = ""): string {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const stored = JSON.parse(raw) as Stored;
      if (stored && stored.fingerprint === fingerprint && typeof stored.key === "string" && Date.now() - stored.at < TTL_MS) {
        return stored.key;
      }
    }
    const key = make();
    window.localStorage.setItem(storageKey, JSON.stringify({ key, fingerprint, at: Date.now() } satisfies Stored));
    return key;
  } catch {
    // Storage unavailable: keep the key for this page's lifetime only.
    return inMemory || make();
  }
}

// The key of a submission that was started in this browser and has not been
// confirmed yet (a reload after a lost answer), whatever the form now holds.
export function peekSubmissionKey(storageKey: string): string | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    return stored && typeof stored.key === "string" && Date.now() - stored.at < TTL_MS ? stored.key : null;
  } catch {
    return null;
  }
}

export function clearSubmissionKey(storageKey: string): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
