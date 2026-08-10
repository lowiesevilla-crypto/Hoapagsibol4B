import path from "node:path";
import { createHash } from "node:crypto";
import { REPOSITORY_DEFAULT_MAX_FILE_BYTES } from "@/lib/document-repository/constants";

const allowedExtensions = new Map<string, readonly string[]>([
  [".pdf", ["application/pdf"]],
  [".doc", ["application/msword", "application/octet-stream"]],
  [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"]],
  [".xls", ["application/vnd.ms-excel", "application/octet-stream"]],
  [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"]],
  [".ppt", ["application/vnd.ms-powerpoint", "application/octet-stream"]],
  [".pptx", ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip"]],
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".png", ["image/png"]],
  [".webp", ["image/webp"]],
  [".txt", ["text/plain"]],
  [".csv", ["text/csv", "application/csv", "text/plain"]],
]);

const blockedExtensions = new Set([
  ".exe", ".dll", ".com", ".bat", ".cmd", ".ps1", ".sh", ".bash", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
  ".php", ".phtml", ".py", ".rb", ".pl", ".jar", ".war", ".msi", ".scr", ".vbs", ".vbe", ".wsf", ".hta", ".apk", ".app",
]);

export type RepositoryUploadValidationInput = {
  originalFileName: string;
  contentType: string;
  size: number;
  data?: Uint8Array;
  maxFileBytes?: number | null;
};

export type RepositoryUploadValidationResult = {
  extension: string;
  normalizedContentType: string;
  checksumSha256?: string;
};

function normalizeContentType(contentType: string) {
  return contentType.toLowerCase().split(";", 1)[0]?.trim() || "application/octet-stream";
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

function validateKnownSignature(extension: string, data: Uint8Array) {
  if (!data.byteLength) throw new Error("The uploaded document is empty.");

  if (extension === ".pdf" && !hasAsciiAt(data, 0, "%PDF-")) {
    throw new Error("The uploaded file does not contain a valid PDF signature.");
  }

  if ((extension === ".jpg" || extension === ".jpeg") && !startsWithBytes(data, [0xff, 0xd8, 0xff])) {
    throw new Error("The uploaded file does not contain a valid JPEG signature.");
  }

  if (extension === ".png" && !startsWithBytes(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    throw new Error("The uploaded file does not contain a valid PNG signature.");
  }

  if (extension === ".webp" && !(hasAsciiAt(data, 0, "RIFF") && hasAsciiAt(data, 8, "WEBP"))) {
    throw new Error("The uploaded file does not contain a valid WEBP signature.");
  }

  if ([".docx", ".xlsx", ".pptx"].includes(extension) && !startsWithBytes(data, [0x50, 0x4b])) {
    throw new Error("The uploaded Office Open XML file does not contain a valid ZIP container signature.");
  }

  if ([".doc", ".xls", ".ppt"].includes(extension) && !startsWithBytes(data, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw new Error("The uploaded legacy Office file does not contain a valid compound-document signature.");
  }
}

export function validateRepositoryUpload(input: RepositoryUploadValidationInput): RepositoryUploadValidationResult {
  const originalFileName = path.basename(input.originalFileName.trim());
  if (!originalFileName || originalFileName === "." || originalFileName === "..") {
    throw new Error("A valid original filename is required.");
  }
  if (originalFileName.includes("\0")) throw new Error("Invalid filename.");

  const extension = path.extname(originalFileName).toLowerCase();
  if (blockedExtensions.has(extension)) throw new Error("This file type is not allowed for Document Management.");

  const allowedMimeTypes = allowedExtensions.get(extension);
  if (!allowedMimeTypes) throw new Error("This file type is not supported for Document Management.");

  const maxFileBytes = input.maxFileBytes ?? REPOSITORY_DEFAULT_MAX_FILE_BYTES;
  if (!Number.isSafeInteger(input.size) || input.size <= 0) throw new Error("The uploaded document is empty or has an invalid size.");
  if (maxFileBytes > 0 && input.size > maxFileBytes) {
    throw new Error(`The uploaded document exceeds the ${Math.ceil(maxFileBytes / 1024 / 1024)} MB file limit.`);
  }

  const normalizedContentType = normalizeContentType(input.contentType);
  if (!allowedMimeTypes.includes(normalizedContentType)) {
    throw new Error("The uploaded file type does not match the allowed MIME type for its extension.");
  }

  let checksumSha256: string | undefined;
  if (input.data) {
    if (input.data.byteLength !== input.size) throw new Error("Uploaded file size does not match the received content.");
    validateKnownSignature(extension, input.data);
    checksumSha256 = createHash("sha256").update(input.data).digest("hex");
  }

  return { extension, normalizedContentType, checksumSha256 };
}

export const repositoryAllowedFileExtensions = Object.freeze([...allowedExtensions.keys()]);
