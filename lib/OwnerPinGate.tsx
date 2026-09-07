"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

// オーナー専用PIN（stores.owner_pin）で画面全体をロックする共通コンポーネント。
// enabled=falseなら素通し。trueの場合、そのstoreIdのowner_pinと一致するまでchildrenを表示しない。
// storeLoading中はstoreContextの初期値（enabled=false）で一瞬ロック解除された画面が見えてしまうのを防ぐため何も描画しない。
export function OwnerPinGate({
  storeId,
  enabled,
  storeLoading = false,
  onUnlock,
  children,
}: {
  storeId: string | null;
  enabled: boolean;
  storeLoading?: boolean;
  onUnlock?: () => void;
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const [ownerPin, setOwnerPin] = useState<string | null>(null);
  const [pinLoaded, setPinLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinSetupInput, setPinSetupInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled || !storeId || pinLoaded) return;
    (async () => {
      const { data } = await supabase.from("stores").select("owner_pin").eq("id", storeId).single();
      setOwnerPin(data?.owner_pin ?? null);
      setPinLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storeId]);

  if (storeLoading) return null;
  if (!enabled || unlocked) return <>{children}</>;

  function submitPin() {
    if (pinInput.trim() !== "" && pinInput === ownerPin) {
      setUnlocked(true);
      onUnlock?.();
    } else {
      setPinError("暗証番号が違います");
      setPinInput("");
    }
  }

  async function setupPin() {
    if (!storeId || pinSetupInput.trim().length < 4) {
      setPinError("4桁以上の数字で設定してください");
      return;
    }
    setSaving(true);
    await supabase.from("stores").update({ owner_pin: pinSetupInput.trim() }).eq("id", storeId);
    setOwnerPin(pinSetupInput.trim());
    setSaving(false);
    setUnlocked(true);
    onUnlock?.();
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-elevated p-5 space-y-4">
        {!pinLoaded ? (
          <div className="text-sm text-gray-400 text-center py-4">読み込み中...</div>
        ) : ownerPin == null ? (
          <>
            <div className="text-gold font-bold text-base">🔒 暗証番号を設定（初回のみ）</div>
            <div className="text-xs text-gray-500">
              ログインはスタッフ全員で共有しているため、この暗証番号は他のスタッフには教えないでください
            </div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinSetupInput}
              onChange={(e) => {
                setPinSetupInput(e.target.value);
                setPinError("");
              }}
              placeholder="4桁以上の数字"
              className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-lg tracking-widest text-center"
            />
            {pinError && <div className="text-xs text-rose">{pinError}</div>}
            <button
              onClick={setupPin}
              disabled={saving}
              className="w-full rounded-md bg-gold text-bg py-2.5 text-sm font-bold disabled:opacity-50"
            >
              設定する
            </button>
          </>
        ) : (
          <>
            <div className="text-gold font-bold text-base">🔒 この画面を見るには暗証番号が必要です</div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPin();
              }}
              placeholder="暗証番号"
              className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-lg tracking-widest text-center"
            />
            {pinError && <div className="text-xs text-rose">{pinError}</div>}
            <button onClick={submitPin} className="w-full rounded-md bg-gold text-bg py-2.5 text-sm font-bold">
              開く
            </button>
          </>
        )}
      </div>
    </div>
  );
}
