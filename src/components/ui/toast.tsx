"use client";

// The Sonner <Toaster> is mounted once in the root layout (styled to tokens there).
// This module is the thin app-facing surface: import `toast` from here so callers
// have a single import point and we can wrap defaults later without churn.
import { toast } from "sonner";

export { toast };

/** Success toast styled with the success token accent. */
export function toastSuccess(message: string, description?: string) {
  return toast.success(message, { description });
}

/** Error toast. Sonner announces errors assertively via its live region. */
export function toastError(message: string, description?: string) {
  return toast.error(message, { description });
}
