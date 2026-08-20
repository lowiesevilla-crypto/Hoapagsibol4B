"use server";

import { redirect } from "next/navigation";
import {
  submitDocumentRequestAction,
  type DocumentRequestSubmissionState,
} from "@/lib/actions/documents";

export async function submitDocumentRequestWithRedirectAction(
  previousState: DocumentRequestSubmissionState,
  formData: FormData,
): Promise<DocumentRequestSubmissionState> {
  const result = await submitDocumentRequestAction(previousState, formData);

  if (result.status === "success") {
    const query = new URLSearchParams({
      success: "request",
      message: result.message,
    });
    redirect(`/portal/documents?${query.toString()}`);
  }

  return result;
}
