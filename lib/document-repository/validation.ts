import { createHash } from "node:crypto";
import { REPOSITORY_DEFAULT_MAX_FILE_BYTES } from "@/lib/document-repository/constants";
import {
  HOAHUB_ALLOWED_UPLOAD_EXTENSIONS,
  validateHoaHubUpload,
} from "@/lib/upload-policy";

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

export function validateRepositoryUpload(input: RepositoryUploadValidationInput): RepositoryUploadValidationResult {
  const originalFileName = input.originalFileName.trim();
  if (!originalFileName || originalFileName === "." || originalFileName === "..") throw new Error("A valid original filename is required.");
  if (originalFileName.includes("\0")) throw new Error("Invalid filename.");

  const maxFileBytes = input.maxFileBytes ?? REPOSITORY_DEFAULT_MAX_FILE_BYTES;
  const validation = validateHoaHubUpload({
    fileName: originalFileName,
    contentType: input.contentType,
    size: input.size,
    data: input.data,
    maxBytes: maxFileBytes > 0 ? maxFileBytes : undefined,
  });

  const checksumSha256 = input.data ? createHash("sha256").update(input.data).digest("hex") : undefined;
  return {
    extension: validation.extension,
    normalizedContentType: validation.normalizedContentType,
    checksumSha256,
  };
}

export const repositoryAllowedFileExtensions = HOAHUB_ALLOWED_UPLOAD_EXTENSIONS;
