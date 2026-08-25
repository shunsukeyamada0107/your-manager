"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useStore } from "@/lib/StoreContext";
import { useBusinessDate } from "@/lib/BusinessDateContext";
import { DateBar } from "@/lib/DateBar";
import {
  Expense,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ICONS,
  EXPENSE_CATEGORY_COLORS,
  Staff,
  Attendance,
  attHours,
  effectiveHourlyWage,
} from "@/lib/types";

function SectionHeader({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="w-8 h-8 rounded-full bg-gold/12 text-gold flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="font-extrabold text-base">{children}</span>
    </div>
  );
}

function PlusSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function ReceiptSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function ClockSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export default function ExpensesPage() {
  const supabase = createClient();
  const { storeId, cutoffHour } = useStore();
  const { date: businessDate } = useBusinessDate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hourlyStaff, setHourlyStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [attStaffId, setAttStaffId] = useState("");
  const [attStart, setAttStart] = useState("");
  const [attEnd, setAttEnd] = useState("");
  const [attError, setAttError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .eq("store_id", storeId)
      .eq("business_date", businessDate)
      .order("created_at", { ascending: false });
    setExpenses(data ?? []);

    const { data: staffData } = await supabase
      .from("staff")
      .select("*")
      .eq("store_id", storeId)
      .eq("active", true)
      .not("hourly_wage", "is", null)
      .order("created_at", { ascending: true });
    setHourlyStaff(staffData ?? []);

    const { data: attData } = await supabase
      .from("attendance")
      .select("*")
      .eq("store_id", storeId)
      .eq("business_date", businessDate)
      .order("clock_in", { ascending: true });
    setAttendance(attData ?? []);
  }, [storeId, businessDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 「HH:MM」を、営業日の切り替え時刻を基準に実際のカレンダー日時へ変換する
  // （切り替え時刻より前の時刻＝日付をまたいだ後の時間として扱う。例：切り替え6時なら、深夜1時は翌カレンダー日）
  function timeToDate(hhmm: string): Date | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    const d = new Date(`${businessDate}T00:00:00`);
    if (h < cutoffHour) d.setDate(d.getDate() + 1);
    d.setHours(h, min, 0, 0);
    return d;
  }

  function staffName(staffId: string | null) {
    if (!staffId) return "未設定";
    const s = hourlyStaff.find((x) => x.id === staffId);
    return s ? s.name : "(元スタッフ)";
  }

  async function addAttendance() {
    setAttError(null);
    if (!storeId || !attStaffId || !attStart.trim() || !attEnd.trim()) return;
    const s = hourlyStaff.find((x) => x.id === attStaffId);
    if (!s) return;

    const clockIn = timeToDate(attStart);
    const clockOut = timeToDate(attEnd);
    if (!clockIn || !clockOut) {
      setAttError("時刻の形式が正しくありません。");
      return;
    }
    if (clockOut <= clockIn) {
      setAttError("終了時刻は開始時刻より後にしてください。");
      return;
    }

    await supabase.from("attendance").insert({
      store_id: storeId,
      staff_id: s.id,
      business_date: businessDate,
      clock_in: clockIn.toISOString(),
      clock_out: clockOut.toISOString(),
      wage_snapshot: effectiveHourlyWage(s, businessDate),
    });
    setAttStaffId("");
    setAttStart("");
    setAttEnd("");
    loadData();
  }

  async function deleteAttendance(id: string) {
    await supabase.from("attendance").delete().eq("id", id);
    loadData();
  }

  async function handleReceiptFile(file: File) {
    if (!storeId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${storeId}/${businessDate}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("receipts").upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from("receipts").getPublicUrl(path);
        setReceiptUrl(data.publicUrl);
      }
    } finally {
      setUploading(false);
    }
  }

  async function addExpense() {
    if (!storeId || !name.trim() || !amount.trim()) return;
    await supabase.from("expenses").insert({
      store_id: storeId,
      business_date: businessDate,
      category,
      name: name.trim(),
      amount: Number(amount),
      receipt_url: receiptUrl,
    });
    setName("");
    setAmount("");
    setReceiptUrl(null);
    loadData();
  }

  async function deleteExpense(id: string) {
    await supabase.from("expenses").delete().eq("id", id);
    loadData();
  }

  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const categoryBreakdown = EXPENSE_CATEGORIES.map((c) => ({
    category: c,
    amount: expenses.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0),
  })).filter((c) => c.amount > 0);

  return (
    <div className="space-y-4">
      <DateBar />
      <div className="rounded-xl border border-line bg-elevated p-4">
        <SectionHeader icon={<PlusSectionIcon />}>経費を追加</SectionHeader>
        <div className="space-y-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_ICONS[c]} {c}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="内容（例：氷 5袋）"
            className="w-full rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="金額（円）"
            inputMode="numeric"
            className="w-full rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleReceiptFile(file);
              e.target.value = "";
            }}
          />
          {receiptUrl ? (
            <div className="flex items-center gap-2">
              <img src={receiptUrl} alt="レシート" className="w-14 h-14 object-cover rounded-md border border-line" />
              <span className="text-xs text-gray-400 flex-1">レシートを添付しました</span>
              <button onClick={() => setReceiptUrl(null)} className="text-rose text-xs shrink-0">
                削除
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-md border border-dashed border-gold text-gold px-3 py-2 text-sm font-bold disabled:opacity-50"
            >
              {uploading ? "アップロード中..." : "📷 レシートを撮影"}
            </button>
          )}

          <button
            onClick={addExpense}
            className="w-full rounded-md bg-gold text-bg px-3 py-2 text-sm font-bold"
          >
            追加する
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-gold/12 text-gold flex items-center justify-center shrink-0">
              <ReceiptSectionIcon />
            </span>
            <span className="font-extrabold text-base">{businessDate}の経費</span>
          </div>
          <div className="text-sm font-mono text-gray-300">計 ¥{total.toLocaleString()}</div>
        </div>
        {expenses.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
            まだ記録がありません
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-line bg-elevated p-3 mb-2">
              <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-bg2">
                {categoryBreakdown.map((c) => (
                  <div
                    key={c.category}
                    style={{ width: `${(c.amount / total) * 100}%`, backgroundColor: EXPENSE_CATEGORY_COLORS[c.category] }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
                {categoryBreakdown.map((c) => (
                  <div key={c.category} className="flex items-center gap-1 text-gray-400">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: EXPENSE_CATEGORY_COLORS[c.category] }}
                    />
                    {EXPENSE_CATEGORY_ICONS[c.category]} {c.category} ¥{c.amount.toLocaleString()}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
              {expenses.map((e) => (
                <div key={e.id} className="flex justify-between items-center px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    {e.receipt_url && (
                      <img
                        src={e.receipt_url}
                        alt="レシート"
                        onClick={() => setViewerUrl(e.receipt_url)}
                        className="w-8 h-8 object-cover rounded border border-line shrink-0 cursor-pointer"
                      />
                    )}
                    <span className="text-xs rounded bg-bg2 border border-line px-1.5 py-0.5 shrink-0">
                      {EXPENSE_CATEGORY_ICONS[e.category] ?? "📌"} {e.category}
                    </span>
                    <span className="text-gray-300 truncate">{e.name}</span>
                  </span>
                  <span className="font-mono text-gray-400 flex items-center gap-2 shrink-0">
                    -¥{e.amount.toLocaleString()}
                    <button onClick={() => deleteExpense(e.id)} className="text-rose">
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {hourlyStaff.length > 0 && (
        <div className="rounded-xl border border-line p-4">
          <SectionHeader icon={<ClockSectionIcon />}>出勤情報（時給スタッフ）</SectionHeader>
          <div className="rounded-xl border border-line bg-elevated p-3 space-y-2 mb-2">
            <select
              value={attStaffId}
              onChange={(e) => setAttStaffId(e.target.value)}
              className="w-full rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            >
              <option value="">スタッフを選択</option>
              {hourlyStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2 items-center">
              <input
                type="time"
                value={attStart}
                onChange={(e) => setAttStart(e.target.value)}
                className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
              />
              <span className="text-gray-500 text-sm">〜</span>
              <input
                type="time"
                value={attEnd}
                onChange={(e) => setAttEnd(e.target.value)}
                className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
              />
            </div>
            {attError && <p className="text-rose text-xs">{attError}</p>}
            <button
              onClick={addAttendance}
              className="w-full rounded-md bg-gold text-bg px-3 py-2 text-sm font-bold"
            >
              追加する
            </button>
          </div>

          {attendance.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
              まだ記録がありません
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
              {attendance.map((a) => {
                const hrs = attHours(a);
                const inS = new Date(a.clock_in);
                const outS = a.clock_out ? new Date(a.clock_out) : null;
                return (
                  <div key={a.id} className="flex justify-between items-center px-3 py-2 text-sm">
                    <span className="text-gray-300">
                      {staffName(a.staff_id)}{" "}
                      {inS.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}〜
                      {outS ? outS.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "未入力"}
                    </span>
                    <span className="font-mono text-gray-400 flex items-center gap-2">
                      {hrs.toFixed(1)}h /{" "}
                      {a.wage_snapshot != null ? `¥${Math.round(hrs * a.wage_snapshot).toLocaleString()}` : "時給未設定"}
                      <button onClick={() => deleteAttendance(a.id)} className="text-rose">
                        ✕
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {viewerUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewerUrl(null)}
        >
          <img src={viewerUrl} alt="レシート拡大表示" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
