import * as DocumentPicker from "expo-document-picker";
import { DEFAULT_UPLOAD_TYPES, validateUploadFile } from "./uploadRules";

export type PickedFile = { uri: string; name: string; mimeType?: string | null; size?: number | null };
export type PickResult = { file: PickedFile } | { error: string } | null;

/**
 * Opens the document picker and validates the choice (type and size) before the
 * caller ever tries to upload it. Resolves to null when the user cancels.
 */
export async function pickValidatedDocument(
  allowedTypes?: readonly string[],
  maxBytes?: number | null
): Promise<PickResult> {
  const types = allowedTypes?.length ? [...allowedTypes] : [...DEFAULT_UPLOAD_TYPES];
  const result = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file: PickedFile = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size };
  const error = validateUploadFile(file, { allowedTypes: types, maxBytes });
  return error ? { error } : { file };
}
