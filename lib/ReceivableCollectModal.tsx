"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useStore } from "@/lib/StoreContext";
import {
  PAYMENT_METHOD_EMOJI,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  ReceivableEntry,
  allocateCollection,
  businessDateFor,
} from "@/lib/types";

// 未収の回収を記録する。お客様1人分の未収（entries＝未回収が残る伝票）に、回収額を古い伝票から順に割り当てて保存する。
// 売上・消費税には一切関係せず、receivable_collectionsに日付・方法・金額だけを残す
export function ReceivableCollectModal({
  customerName,
  entries,
  onClose,
  onDone,
}: {
  customerName: string;
  entries: ReceivableEntry[];
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const { storeId, cutoffHour, acceptsCard, acceptsPaypay, acceptsOtherEpayment } = useStore();
  const outstanding = entries.filter((e) => e.remaining > 0);
  const totalRemaining = outstanding.reduce((a, e) => a + e.remaining, 0);

  const methods: PaymentMethod[] = [
    "cash",
    ...(acceptsCard ? (["card"] as const) : []),
    ...(acceptsPaypay ? (["paypay"] as const) : []),
    ...(acceptsOtherEpayment ? (["other_epayment"] as const) : []),
  ];
  const [amount, setAmount] = useState(String(totalRemaining));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(businessDateFor(new Date(), cutoffHour));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Math.round(Number(amount || 0));
  const { allocations, leftover } = allocateCollection(outstanding, value);
  const valid = value > 0 && leftover === 0 && !!date && !saving;
  const dateOf = (tabId: string) => outstanding.find((e) => e.tabId === tabId)?.businessDate ?? "";

  async function save() {
    if (!storeId || !valid) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("receivable_collections").insert(
      allocations.map((a) => ({
        store_id: storeId,
        tab_id: a.tabId,
        amount: a.amount,
        method,
        collected_on: date,
      }))
    );
    setSaving(false);
    if (err) {
      setError("回収を記録できませんでした。通信状態を確認して、もう一度お試しください。");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-line bg-elevated p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div>
          <div className="text-gold font-bold text-base">未収を回収する</div>
          <div className="text-xs text-gray-400 mt-1">
            {customerName} 様・未収の残り ¥{totalRemaining.toLocaleString()}（売上・消費税には影響しません）
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">受け取った金額</label>
          <div className="flex gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2.5 py-2 text-right font-mono text-lg"
            />
            <button
              type="button"
              onClick={() => setAmount(String(totalRemaining))}
              className="shrink-0 text-xs rounded-md border border-line px-3 text-gray-300"
            >
              全額
            </button>
          </div>
          {leftover > 0 && (
            <div className="text-xs text-rose mt-1">残り（¥{totalRemaining.toLocaleString()}）を超えています</div>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">受け取り方法</label>
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-full px-3 py-1.5 text-sm border ${
                  method === m ? "bg-gold text-bg border-gold" : "bg-bg2 text-gray-300 border-line"
                }`}
              >
                {PAYMENT_METHOD_EMOJI[m]} {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">回収した日（日報の現金に加わる日）</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md bg-bg2 border border-line px-2.5 py-2 text-sm"
          />
        </div>

        {allocations.length > 0 && (
          <div className="rounded-lg bg-bg2 px-3 py-2 text-xs text-gray-400 space-y-0.5">
            <div className="text-gray-300 font-bold">充当先（古い未収から順に）</div>
            {allocations.map((a) => (
              <div key={a.tabId} className="flex justify-between font-mono">
                <span>{dateOf(a.tabId)} の未収</span>
                <span>¥{a.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-xs text-rose">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-line py-3 text-sm text-gray-300">
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={!valid}
            className="flex-1 rounded-xl bg-gold text-bg py-3 text-sm font-bold disabled:opacity-40"
          >
            {saving ? "保存中..." : "回収を記録"}
          </button>
        </div>
      </div>
    </div>
  );
}
