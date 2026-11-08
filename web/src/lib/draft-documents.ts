// Resumable Umrah intake (T03): every document is stored on the server draft
// the moment it is chosen, so a reload, a dropped connection or a second
// device never loses it, and the final submission sends nothing again - it
// only turns the draft into the request (POST /intake-drafts/current/submit).
//
// Only references live in the browser: no file contents are kept in
// localStorage, and the price/status shown always come from the server.
// On by default for the Umrah form; NEXT_PUBLIC_RESUMABLE_INTAKE=0 (build
// time) switches back to the classic one-request submission, which also stays
// in place for every other service.
export const RESUMABLE_INTAKE = process.env.NEXT_PUBLIC_RESUMABLE_INTAKE !== "0";

export type DraftDocStatus = "uploading" | "uploaded" | "error";

export type DraftDocEntry = {
  // Stable in this page; the server id exists once the upload finished.
  localId: string;
  serverId?: string;
  name: string;
  status: DraftDocStatus;
  progress: number;
  error?: string;
  // Kept in memory only so a failed upload can be retried without picking it again.
  file?: File;
};

export type DraftDocMap = Record<string, DraftDocEntry[]>;

export function slotKeyFor(requirementId: string, fullTravelerIndex: number | null): string {
  return fullTravelerIndex === null ? requirementId : `${requirementId}::${fullTravelerIndex}`;
}

export function upsertEntry(map: DraftDocMap, key: string, entry: DraftDocEntry): DraftDocMap {
  const list = map[key] ?? [];
  const exists = list.some((item) => item.localId === entry.localId);
  return { ...map, [key]: exists ? list.map((item) => (item.localId === entry.localId ? entry : item)) : [...list, entry] };
}

export function patchEntry(map: DraftDocMap, key: string, localId: string, patch: Partial<DraftDocEntry>): DraftDocMap {
  return { ...map, [key]: (map[key] ?? []).map((item) => (item.localId === localId ? { ...item, ...patch } : item)) };
}

export function dropEntry(map: DraftDocMap, key: string, localId: string): DraftDocMap {
  const next = (map[key] ?? []).filter((item) => item.localId !== localId);
  const copy = { ...map };
  if (next.length) copy[key] = next;
  else delete copy[key];
  return copy;
}

type ServerDocument = { id: string; label?: string; fileName?: string; requirementId?: string | null };

// Rebuilds the slot map from what the server holds. A document with no
// traveler reference belongs to a case-level slot (the requirement id); one
// with a reference belongs to that traveler's slot. Documents without a
// requirement (the passport photo used only for reading) are not slots.
export function entriesFromDraft(documents: ServerDocument[] | null | undefined, refs: Record<string, string> | null | undefined): DraftDocMap {
  const map: DraftDocMap = {};
  for (const doc of documents ?? []) {
    if (!doc.requirementId) continue;
    const ref = refs?.[doc.id];
    const index = ref === undefined || ref === null || ref === "" ? null : Number(ref);
    const key = slotKeyFor(doc.requirementId, index !== null && Number.isInteger(index) ? index : null);
    map[key] = [...(map[key] ?? []), { localId: doc.id, serverId: doc.id, name: doc.fileName || doc.label || "مستند", status: "uploaded", progress: 100 }];
  }
  return map;
}

export type UploadHandle = { promise: Promise<{ id: string; fileName?: string }>; abort: () => void };

// XMLHttpRequest rather than fetch: it reports upload progress.
export function uploadDraftDocument({
  apiUrl,
  token,
  file,
  label,
  requirementId,
  travelerIndex,
  onProgress,
}: {
  apiUrl: string;
  token: string;
  file: File;
  label: string;
  requirementId: string;
  travelerIndex: number | null;
  onProgress?: (percent: number) => void;
}): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ id: string; fileName?: string }>((resolve, reject) => {
    const body = new FormData();
    body.append("label", label);
    body.append("requirementId", requirementId);
    if (travelerIndex !== null) body.append("travelerIndex", String(travelerIndex));
    body.append("file", file);
    xhr.open("POST", `${apiUrl}/intake-drafts/current/documents`);
    xhr.setRequestHeader("X-Draft-Token", token);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      let payload: { data?: { id?: string; fileName?: string }; message?: string } | null = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.data?.id) resolve({ id: payload.data.id, fileName: payload.data.fileName });
      else reject(new Error(payload?.message || "تعذّر رفع المستند"));
    };
    xhr.onerror = () => reject(new Error("انقطع الاتصال أثناء الرفع"));
    xhr.onabort = () => reject(new Error("أُلغي الرفع"));
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

export async function deleteDraftDocument(apiUrl: string, token: string, documentId: string): Promise<void> {
  const res = await fetch(`${apiUrl}/intake-drafts/current/documents/${encodeURIComponent(documentId)}`, { method: "DELETE", headers: { "X-Draft-Token": token } });
  // A document that is already gone is what the customer asked for.
  if (!res.ok && res.status !== 404) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.message || "تعذّر حذف المستند");
  }
}
