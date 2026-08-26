import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense } from "@/lib/types";

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

const RECEIPT_URL_MARKERS = [
  "/storage/v1/object/public/receipts/",
  "/storage/v1/object/sign/receipts/",
] as const;

export function receiptPathFromValue(value: string | null): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");

  try {
    const pathname = new URL(value).pathname;
    const marker = RECEIPT_URL_MARKERS.find((candidate) => pathname.includes(candidate));
    if (!marker) return null;
    return decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length));
  } catch {
    return null;
  }
}

export function validateReceiptFile(file: File): string | null {
  if (!RECEIPT_ALLOWED_TYPES.includes(file.type as (typeof RECEIPT_ALLOWED_TYPES)[number])) {
    return "JPEG・PNG・WebP・HEIC形式の画像を選んでください。";
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return "レシート画像は5MB以下にしてください。";
  }
  return null;
}

export async function signReceiptValue(
  supabase: SupabaseClient,
  value: string | null,
  expiresIn = 60 * 60
): Promise<string | null> {
  const path = receiptPathFromValue(value);
  if (!path) return null;
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, expiresIn);
  return error ? null : data.signedUrl;
}

export async function signExpenseReceipts(supabase: SupabaseClient, expenses: Expense[]): Promise<Expense[]> {
  return Promise.all(
    expenses.map(async (expense) => ({
      ...expense,
      receipt_url: await signReceiptValue(supabase, expense.receipt_url),
    }))
  );
}
