export const HOAHUB_ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".docx",
  ".xlsx",
  ".pptx",
] as const;

export type HoaHubAllowedUploadExtension = (typeof HOAHUB_ALLOWED_UPLOAD_EXTENSIONS)[number];

export const HOAHUB_ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;
export const HOAHUB_UPLOAD_ACCEPT = HOAHUB_ALLOWED_UPLOAD_EXTENSIONS.join(",");
export const HOAHUB_IMAGE_ACCEPT = HOAHUB_ALLOWED_IMAGE_EXTENSIONS.join(",");

export const HOAHUB_ALLOWED_UPLOAD_MIME_TYPES_BY_EXTENSION = new Map<HoaHubAllowedUploadExtension, readonly string[]>([
  [".pdf", ["application/pdf"]],
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".png", ["image/png"]],
  [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"]],
  [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"]],
  [".pptx", ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip"]],
]);

export const HOAHUB_ALLOWED_UPLOAD_MIME_TYPES = Object.freeze([
  ...new Set([...HOAHUB_ALLOWED_UPLOAD_MIME_TYPES_BY_EXTENSION.values()].flat()),
]);

export const HOAHUB_ALLOWED_IMAGE_MIME_TYPES = Object.freeze(["image/jpeg", "image/png"]);

export function normalizeUploadContentType(contentType: string) {
  return contentType.toLowerCase().split(";", 1)[0]?.trim() || "application/octet-stream";
}

export function uploadExtensionFromFileName(fileName: string) {
  const cleanName = fileName.trim().replaceAll("\\", "/").split("/").pop() || "";
  const dot = cleanName.lastIndexOf(".");
  return dot > 0 ? cleanName.slice(dot).toLowerCase() : "";
}

export function isHoaHubAllowedUploadExtension(extension: string): extension is HoaHubAllowedUploadExtension {
  return (HOAHUB_ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
}

function startsWithBytes(data: Uint8Array, bytes: readonly number[]) {
  return bytes.every((byte, index) => data[index] === byte);
}

function hasAsciiAt(data: Uint8Array, offset: number, value: string) {
  if (data.byteLength < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (data[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

export function validateHoaHubUploadSignature(extension: HoaHubAllowedUploadExtension, data: Uint8Array) {
  if (!data.byteLength) throw new Error("The uploaded file is empty.");
  if (extension === ".pdf" && !hasAsciiAt(data, 0, "%PDF-")) throw new Error("The uploaded file does not contain a valid PDF signature.");
  if ((extension === ".jpg" || extension === ".jpeg") && !startsWithBytes(data, [0xff, 0xd8, 0xff])) throw new Error("The uploaded file does not contain a valid JPEG signature.");
  if (extension === ".png" && !startsWithBytes(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) throw new Error("The uploaded file does not contain a valid PNG signature.");
  if ([".docx", ".xlsx", ".pptx"].includes(extension) && !startsWithBytes(data, [0x50, 0x4b])) throw new Error("The uploaded Office Open XML file does not contain a valid ZIP container signature.");
}

export function validateHoaHubUpload(input: {
  fileName: string;
  contentType: string;
  size: number;
  data?: Uint8Array;
  maxBytes?: number;
  allowedExtensions?: readonly string[];
}) {
  const extension = uploadExtensionFromFileName(input.fileName);
  const effectiveExtensions = input.allowedExtensions ?? HOAHUB_ALLOWED_UPLOAD_EXTENSIONS;
  if (!isHoaHubAllowedUploadExtension(extension) || !effectiveExtensions.includes(extension)) {
    throw new Error("File type is not allowed. Allowed file types are PDF, JPG, JPEG, PNG, DOCX, XLSX, and PPTX.");
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0) throw new Error("The uploaded file is empty or has an invalid size.");
  if (input.maxBytes && input.size > input.maxBytes) throw new Error(`The uploaded file exceeds the ${Math.ceil(input.maxBytes / 1024 / 1024)} MB limit.`);

  const normalizedContentType = normalizeUploadContentType(input.contentType);
  const allowedMimeTypes = HOAHUB_ALLOWED_UPLOAD_MIME_TYPES_BY_EXTENSION.get(extension);
  if (!allowedMimeTypes?.includes(normalizedContentType)) throw new Error("The uploaded file type does not match its filename extension.");

  if (input.data) {
    if (input.data.byteLength !== input.size) throw new Error("Uploaded file size does not match the received content.");
    validateHoaHubUploadSignature(extension, input.data);
  }

  return { extension, normalizedContentType };
}
