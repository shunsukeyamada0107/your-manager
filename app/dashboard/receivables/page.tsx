"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { useStore } from "@/lib/StoreContext";
import { useBusinessDate } from "@/lib/BusinessDateContext";
import { OwnerPinGate } from "@/lib/OwnerPinGate";
import { ReceivableCollectModal } from "@/lib/ReceivableCollectModal";
import { fetchReceivableTabs } from "@/lib/receivables";
import {
  PAYMENT_METHOD_EMOJI,
  PAYMENT_METHOD_LABELS,
  ReceivableGroup,
  TabWithItems,
  groupReceivables,
} from "@/lib/types";

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString()}`;
}

function md(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][d.getDay()]})`;
}

// 未収管理：未収（後日回収する分）が残っているお客様の一覧。未収が発生した日と、回収した日・方法・金額の履歴を確認し、回収を記録する
export default function ReceivablesPage() {
  const supabase = createClient();
  const router = useRouter();
  const { storeId, taxRate, roundUnit, reportPinRequired, loading: storeLoading } = useStore();
  const { setDate: setBusinessDate } = useBusinessDate();

  const [tabs, setTabs] = useState<TabWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collecting, setCollecting] = useState<ReceivableGroup | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    try {
      setTabs(await fetchReceivableTabs(supabase, storeId));
      setLoadError(null);
    } catch {
      setLoadError("未収を読み込めませんでした。通信状態を確認して、もう一度お試しください。");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const all = groupReceivables(tabs, taxRate, roundUnit, !showSettled);
    const q = query.trim();
    return q ? all.filter((g) => g.name.includes(q)) : all;
  }, [tabs, taxRate, roundUnit, showSettled, query]);

  const totalRemaining = useMemo(
    () => groupReceivables(tabs, taxRate, roundUnit, true).reduce((a, g) => a + g.remaining, 0),
    [tabs, taxRate, roundUnit]
  );

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openTab(t: TabWithItems) {
    setBusinessDate(t.business_date);
    router.push(`/dashboard?tab=${t.id}`);
  }

  async function cancelCollection(id: string) {
    if (!confirm("この回収の記録を取り消しますか？（未収が元の額に戻ります）")) return;
    const { error } = await supabase.from("receivable_collections").delete().eq("id", id);
    if (error) {
      setLoadError("回収の取り消しに失敗しました。もう一度お試しください。");
      return;
    }
    load();
  }

  return (
    <OwnerPinGate storeId={storeId} enabled={reportPinRequired} storeLoading={storeLoading}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-extrabold text-base leading-tight">未収管理</div>
            <div className="text-xs text-gray-500 mt-0.5">
              後日回収する未収を、お客様ごとに確認・回収を記録します（回収は売上・消費税に影響しません）
            </div>
          </div>
          <button
            onClick={() => router.push("/dashboard/report")}
            className="shrink-0 text-xs rounded-md border border-line px-2.5 py-1.5 text-gray-300"
          >
            集計に戻る
          </button>
        </div>

        <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 flex justify-between items-baseline">
          <span className="text-sm text-gray-200">未収の残り合計</span>
          <span className="font-mono font-bold text-gold text-xl">{yen(totalRemaining)}</span>
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="お客様名で絞り込み"
            className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-3 py-2 text-sm"
          />
          <button
            onClick={() => setShowSettled((v) => !v)}
            className={`shrink-0 rounded-md border px-3 text-xs ${
              showSettled ? "border-gold text-gold bg-gold/10" : "border-line text-gray-300"
            }`}
          >
            {showSettled ? "回収済みも表示中" : "未回収のみ"}
          </button>
        </div>

        {loadError && <div className="text-xs text-rose">{loadError}</div>}

        {loading ? (
          <div className="text-sm text-gray-500 text-center py-10">読み込み中...</div>
        ) : groups.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-10 border border-dashed border-line rounded-xl">
            {showSettled ? "未収の記録はありません" : "未回収の未収はありません"}
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => {
              const open = expanded.has(g.key);
              return (
                <div key={g.key} className="rounded-xl border border-line bg-elevated overflow-hidden">
                  <button
                    onClick={() => toggle(g.key)}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[15px] truncate">{g.name}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        未収 {g.entries.length}件・発生 {yen(g.receivable)}・回収済み {yen(g.collected)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-mono font-bold ${g.remaining > 0 ? "text-warn" : "text-good"}`}>
                        {g.remaining > 0 ? yen(g.remaining) : "完済"}
                      </div>
                      <div className="text-[11px] text-gray-500">{open ? "▲ 閉じる" : "▼ 内訳"}</div>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-line p-3.5 space-y-3">
                      {g.entries.map((e) => (
                        <div key={e.tabId} className="rounded-lg border border-line bg-bg2 p-2.5 space-y-1.5">
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="text-sm font-bold text-gray-200">発生 {md(e.businessDate)}</span>
                            <span className="font-mono text-warn font-bold">{yen(e.receivable)}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            お会計 {yen(e.total)} のうち未収・{e.name}
                          </div>
                          {e.collections.length === 0 ? (
                            <div className="text-xs text-gray-500">まだ回収していません</div>
                          ) : (
                            <div className="space-y-1">
                              {e.collections.map((c) => (
                                <div key={c.id} className="flex justify-between items-center gap-2 text-xs">
                                  <span className="text-good">
                                    回収 {md(c.collected_on)}・{PAYMENT_METHOD_EMOJI[c.method]}{" "}
                                    {PAYMENT_METHOD_LABELS[c.method]}
                                  </span>
                                  <span className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono text-gray-300">{yen(c.amount)}</span>
                                    <button onClick={() => cancelCollection(c.id)} className="text-rose">
                                      取消
                                    </button>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-1 border-t border-line text-xs">
                            <span className={e.remaining > 0 ? "text-warn font-bold" : "text-good font-bold"}>
                              {e.remaining > 0 ? `残り ${yen(e.remaining)}` : "回収済み"}
                            </span>
                            <button onClick={() => openTab(e.tab)} className="text-gold">
                              伝票を開く ›
                            </button>
                          </div>
                        </div>
                      ))}
                      {g.remaining > 0 && (
                        <button
                          onClick={() => setCollecting(g)}
                          className="w-full rounded-xl bg-gold text-bg py-3 text-sm font-bold active:scale-[0.97] transition-transform"
                        >
                          {g.name} 様の未収を回収する
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {collecting && (
        <ReceivableCollectModal
          customerName={collecting.name}
          entries={collecting.entries}
          onClose={() => setCollecting(null)}
          onDone={() => {
            setCollecting(null);
            load();
          }}
        />
      )}
    </OwnerPinGate>
  );
}
