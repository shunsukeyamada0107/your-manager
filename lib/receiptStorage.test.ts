import { describe, expect, it } from "vitest";
import { receiptPathFromValue } from "./receiptStorage";

describe("receiptPathFromValue", () => {
  const path = "4b43b1b5-718b-4b59-85c7-68d29bc675ea/2026-08-26/123.jpg";

  it("新形式の保存パスをそのまま返す", () => {
    expect(receiptPathFromValue(path)).toBe(path);
  });

  it("旧公開URLから保存パスを取り出す", () => {
    expect(
      receiptPathFromValue(`https://example.supabase.co/storage/v1/object/public/receipts/${path}`)
    ).toBe(path);
  });

  it("署名付きURLから保存パスを取り出す", () => {
    expect(
      receiptPathFromValue(`https://example.supabase.co/storage/v1/object/sign/receipts/${path}?token=secret`)
    ).toBe(path);
  });

  it("receipts以外のURLは受け付けない", () => {
    expect(receiptPathFromValue("https://example.com/image.jpg")).toBeNull();
  });
});
