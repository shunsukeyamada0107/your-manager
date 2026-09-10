"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useStore } from "@/lib/StoreContext";
import { OwnerPinGate } from "@/lib/OwnerPinGate";
import {
  Customer,
  CustomerStats,
  CustomerStaffCommissionRule,
  Staff,
  TabWithItems,
  customerStats,
} from "@/lib/types";

function PeopleSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="18" cy="9" r="2.3" />
      <path d="M15.3 14.3c2.5.5 4.2 2.5 4.2 5.7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

type CustomerDraft = {
  name: string;
  nameKana: string;
  phone: string;
  birthday: string;
  primaryStaffId: string; // "" = 未設定
  bottleKeep: string;
  memo: string;
};

const EMPTY_DRAFT: CustomerDraft = {
  name: "",
  nameKana: "",
  phone: "",
  birthday: "",
  primaryStaffId: "",
  bottleKeep: "",
  memo: "",
};

// フォームフィールド共通のラベル付きラッパー（何を入力する欄か常に分かるようにする）
function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded-md bg-bg2 border border-line px-2.5 py-1.5 text-sm";

export default function CustomersPage() {
  const supabase = createClient();
  const { storeId, storeMode, taxRate, settingsPinRequired, loading: storeLoading } = useStore();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerDrafts, setCustomerDrafts] = useState<Record<string, CustomerDraft>>({});
  const [customerStatsById, setCustomerStatsById] = useState<Record<string, CustomerStats>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerDraft, setNewCustomerDraft] = useState<CustomerDraft>(EMPTY_DRAFT);

  // 顧客ごとの指名歩合ルール（誰の売上が、誰の歩合にいくら入るか）
  const [customerRules, setCustomerRules] = useState<Record<string, CustomerStaffCommissionRule[]>>({});
  type NewRuleDraft = { staffId: string; rate: string; dayOffRate: string; note: string };
  const emptyNewRuleDraft: NewRuleDraft = { staffId: "", rate: "", dayOffRate: "0", note: "" };
  const [newRuleDrafts, setNewRuleDrafts] = useState<Record<string, NewRuleDraft>>({});
  type RuleDraft = { rate: string; dayOffRate: string; note: string };
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RuleDraft>>({});

  const loadData = useCallback(async () => {
    if (!storeId || storeMode !== "club") return;

    const { data: staffData } = await supabase
      .from("staff")
      .select("*")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("created_at", { ascending: true });
    setStaff((staffData as Staff[]) ?? []);

    const { data: customersData } = await supabase
      .from("customers")
      .select("*")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("created_at", { ascending: true });
    setCustomers((customersData as Customer[]) ?? []);
    setCustomerDrafts(
      Object.fromEntries(
        ((customersData as Customer[]) ?? []).map((c) => [
          c.id,
          {
            name: c.name,
            nameKana: c.name_kana ?? "",
            phone: c.phone ?? "",
            birthday: c.birthday ?? "",
            primaryStaffId: c.primary_staff_id ?? "",
            bottleKeep: c.bottle_keep ?? "",
            memo: c.memo,
          },
        ])
      )
    );

    // 来店回数・累計売上・最終来店日は保存せず、customer_idで絞ったtabsから都度計算する
    const { data: customerTabsData } = await supabase
      .from("tabs")
      .select("*, tab_items(*)")
      .eq("store_id", storeId)
      .not("customer_id", "is", null);
    const tabsByCustomer: Record<string, TabWithItems[]> = {};
    ((customerTabsData as TabWithItems[]) ?? []).forEach((t) => {
      if (!t.customer_id) return;
      (tabsByCustomer[t.customer_id] ??= []).push(t);
    });
    setCustomerStatsById(
      Object.fromEntries(
        ((customersData as Customer[]) ?? []).map((c) => [c.id, customerStats(tabsByCustomer[c.id] ?? [], taxRate)])
      )
    );

    // 顧客ごとの指名歩合ルール（誰の売上が、誰の歩合にいくら入るか）
    const { data: rulesData } = await supabase
      .from("customer_staff_commission_rules")
      .select("*")
      .eq("store_id", storeId);
    const rulesByCustomer: Record<string, CustomerStaffCommissionRule[]> = {};
    ((rulesData as CustomerStaffCommissionRule[]) ?? []).forEach((r) => {
      (rulesByCustomer[r.customer_id] ??= []).push(r);
    });
    setCustomerRules(rulesByCustomer);
    setRuleDrafts(
      Object.fromEntries(
        ((rulesData as CustomerStaffCommissionRule[]) ?? []).map((r) => [
          r.id,
          {
            rate: String(Math.round(r.rate * 100)),
            dayOffRate: String(Math.round(r.day_off_rate * 100)),
            note: r.note ?? "",
          },
        ])
      )
    );
  }, [storeId, storeMode, taxRate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function staffName(id: string | null) {
    if (!id) return null;
    return staff.find((s) => s.id === id)?.name ?? null;
  }

  async function addCustomer() {
    if (!storeId || !newCustomerDraft.name.trim()) return;
    await supabase.from("customers").insert({
      store_id: storeId,
      name: newCustomerDraft.name.trim(),
      name_kana: newCustomerDraft.nameKana.trim() || null,
      phone: newCustomerDraft.phone.trim() || null,
      birthday: newCustomerDraft.birthday || null,
      primary_staff_id: newCustomerDraft.primaryStaffId || null,
      bottle_keep: newCustomerDraft.bottleKeep.trim() || null,
      memo: newCustomerDraft.memo.trim(),
    });
    setNewCustomerDraft(EMPTY_DRAFT);
    setShowNewCustomerForm(false);
    loadData();
  }

  async function removeCustomer(id: string) {
    await supabase.from("customers").update({ active: false }).eq("id", id);
    setConfirmDeleteId(null);
    loadData();
  }

  async function saveCustomerRow(id: string) {
    const d = customerDrafts[id];
    if (!d || !d.name.trim()) return;
    await supabase
      .from("customers")
      .update({
        name: d.name.trim(),
        name_kana: d.nameKana.trim() || null,
        phone: d.phone.trim() || null,
        birthday: d.birthday || null,
        primary_staff_id: d.primaryStaffId || null,
        bottle_keep: d.bottleKeep.trim() || null,
        memo: d.memo,
      })
      .eq("id", id);
    loadData();
  }

  async function addCustomerRule(customerId: string) {
    if (!storeId) return;
    const d = newRuleDrafts[customerId] ?? emptyNewRuleDraft;
    if (!d.staffId || d.rate.trim() === "") return;
    await supabase.from("customer_staff_commission_rules").insert({
      store_id: storeId,
      customer_id: customerId,
      staff_id: d.staffId,
      rate: Number(d.rate) / 100,
      day_off_rate: d.dayOffRate.trim() === "" ? 0 : Number(d.dayOffRate) / 100,
      note: d.note.trim() || null,
    });
    setNewRuleDrafts((m) => ({ ...m, [customerId]: emptyNewRuleDraft }));
    loadData();
  }

  async function saveCustomerRuleRow(ruleId: string) {
    const d = ruleDrafts[ruleId];
    if (!d) return;
    await supabase
      .from("customer_staff_commission_rules")
      .update({
        rate: Number(d.rate) / 100,
        day_off_rate: d.dayOffRate.trim() === "" ? 0 : Number(d.dayOffRate) / 100,
        note: d.note.trim() || null,
      })
      .eq("id", ruleId);
    loadData();
  }

  async function removeCustomerRule(ruleId: string) {
    await supabase.from("customer_staff_commission_rules").delete().eq("id", ruleId);
    loadData();
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmDeleteId(null);
  }

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return customers;
    return customers.filter((c) => c.name.includes(q) || (c.name_kana ?? "").includes(q));
  }, [customers, searchQuery]);

  function renderCustomerRuleSection(c: Customer) {
    const rules = customerRules[c.id] ?? [];
    const newDraft = newRuleDrafts[c.id] ?? emptyNewRuleDraft;

    return (
      <div className="rounded-lg border border-gold/30 bg-gold/[0.04] p-3 space-y-2.5">
        <div>
          <div className="text-xs font-bold text-gold">✨ 指名歩合ルール</div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            この顧客の売上について、実際に接客したスタッフとは別に、指定したスタッフへ上乗せの歩合を付けます。
          </div>
        </div>

        {rules.length > 0 && (
          <div className="space-y-2">
            {rules.map((r) => {
              const rd =
                ruleDrafts[r.id] ?? {
                  rate: String(Math.round(r.rate * 100)),
                  dayOffRate: String(Math.round(r.day_off_rate * 100)),
                  note: r.note ?? "",
                };
              const name = staff.find((s) => s.id === r.staff_id)?.name ?? "(元スタッフ)";
              return (
                <div key={r.id} className="rounded-md border border-line bg-elevated p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-gray-200">👤 {name}</span>
                    <button onClick={() => removeCustomerRule(r.id)} className="text-rose text-[11px] shrink-0">
                      削除
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Field label="通常時の率" className="flex-1">
                      <input
                        value={rd.rate}
                        onChange={(e) => setRuleDrafts((m) => ({ ...m, [r.id]: { ...rd, rate: e.target.value } }))}
                        placeholder="例: 10"
                        inputMode="numeric"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="休みの日の率" className="flex-1">
                      <input
                        value={rd.dayOffRate}
                        onChange={(e) =>
                          setRuleDrafts((m) => ({ ...m, [r.id]: { ...rd, dayOffRate: e.target.value } }))
                        }
                        placeholder="例: 0"
                        inputMode="numeric"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <input
                    value={rd.note}
                    onChange={(e) => setRuleDrafts((m) => ({ ...m, [r.id]: { ...rd, note: e.target.value } }))}
                    placeholder="メモ（任意。例：半分×42%）"
                    className={inputClass}
                  />
                  <button
                    onClick={() => saveCustomerRuleRow(r.id)}
                    className="text-xs rounded-md border border-line px-2.5 py-1 text-gray-300"
                  >
                    保存
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-md border border-dashed border-gold/50 p-2.5 space-y-2">
          <Field label="歩合を受け取るスタッフ">
            <select
              value={newDraft.staffId}
              onChange={(e) => setNewRuleDrafts((m) => ({ ...m, [c.id]: { ...newDraft, staffId: e.target.value } }))}
              className={inputClass}
            >
              <option value="">選択してください</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-2">
            <Field label="通常時の率(%)" className="flex-1">
              <input
                value={newDraft.rate}
                onChange={(e) => setNewRuleDrafts((m) => ({ ...m, [c.id]: { ...newDraft, rate: e.target.value } }))}
                placeholder="例: 10"
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
            <Field label="休みの日の率(%)" className="flex-1">
              <input
                value={newDraft.dayOffRate}
                onChange={(e) =>
                  setNewRuleDrafts((m) => ({ ...m, [c.id]: { ...newDraft, dayOffRate: e.target.value } }))
                }
                placeholder="例: 0"
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          </div>
          <input
            value={newDraft.note}
            onChange={(e) => setNewRuleDrafts((m) => ({ ...m, [c.id]: { ...newDraft, note: e.target.value } }))}
            placeholder="メモ（任意）"
            className={inputClass}
          />
          <button
            onClick={() => addCustomerRule(c.id)}
            disabled={!newDraft.staffId || newDraft.rate.trim() === ""}
            className="w-full rounded-md px-3 py-1.5 text-xs border border-dashed border-gold text-gold disabled:opacity-40"
          >
            ＋ ルールを追加
          </button>
        </div>
      </div>
    );
  }

  function renderCustomerCard(c: Customer) {
    const d = customerDrafts[c.id] ?? { ...EMPTY_DRAFT, name: c.name, nameKana: c.name_kana ?? "", memo: c.memo };
    const stats = customerStatsById[c.id];
    const rules = customerRules[c.id] ?? [];
    const open = expandedIds.has(c.id);
    const primary = staffName(c.primary_staff_id);

    return (
      <div key={c.id} className="rounded-xl border border-line bg-elevated overflow-hidden">
        <button
          onClick={() => toggleExpanded(c.id)}
          className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-[15px] text-gray-200 truncate">{c.name}</span>
              {c.name_kana && <span className="text-[11px] text-gray-500 truncate">{c.name_kana}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] text-gray-400">
              {primary && <span>👤 {primary}</span>}
              {c.phone && <span>📞 {c.phone}</span>}
              {c.bottle_keep && <span className="truncate max-w-[10rem]">🍾 {c.bottle_keep}</span>}
              {rules.length > 0 && (
                <span className="text-gold font-semibold">✨ 指名歩合 {rules.length}件</span>
              )}
            </div>
            {stats && (
              <div className="text-[11px] text-gray-500 mt-1">
                来店 {stats.visitCount}回 ・ 累計 ¥{stats.totalSales.toLocaleString()} ・ 最終来店{" "}
                {stats.lastVisitDate ?? "-"}
              </div>
            )}
          </div>
          <ChevronIcon open={open} />
        </button>

        {open && (
          <div className="border-t border-line p-3.5 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="お名前" className="col-span-2">
                <input
                  value={d.name}
                  onChange={(e) => setCustomerDrafts((m) => ({ ...m, [c.id]: { ...d, name: e.target.value } }))}
                  className={inputClass}
                />
              </Field>
              <Field label="フリガナ">
                <input
                  value={d.nameKana}
                  onChange={(e) => setCustomerDrafts((m) => ({ ...m, [c.id]: { ...d, nameKana: e.target.value } }))}
                  className={inputClass}
                />
              </Field>
              <Field label="電話番号">
                <input
                  value={d.phone}
                  onChange={(e) => setCustomerDrafts((m) => ({ ...m, [c.id]: { ...d, phone: e.target.value } }))}
                  className={inputClass}
                />
              </Field>
              <Field label="誕生日">
                <input
                  type="date"
                  value={d.birthday}
                  onChange={(e) => setCustomerDrafts((m) => ({ ...m, [c.id]: { ...d, birthday: e.target.value } }))}
                  className={inputClass}
                />
              </Field>
              <Field label="担当キャスト">
                <select
                  value={d.primaryStaffId}
                  onChange={(e) =>
                    setCustomerDrafts((m) => ({ ...m, [c.id]: { ...d, primaryStaffId: e.target.value } }))
                  }
                  className={inputClass}
                >
                  <option value="">未設定</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="ボトルキープ（棚番号・銘柄など）" className="col-span-2">
                <input
                  value={d.bottleKeep}
                  onChange={(e) =>
                    setCustomerDrafts((m) => ({ ...m, [c.id]: { ...d, bottleKeep: e.target.value } }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="メモ" className="col-span-2">
                <textarea
                  value={d.memo}
                  rows={2}
                  onChange={(e) => setCustomerDrafts((m) => ({ ...m, [c.id]: { ...d, memo: e.target.value } }))}
                  className={inputClass}
                />
              </Field>
            </div>

            <button
              onClick={() => saveCustomerRow(c.id)}
              className="w-full rounded-md bg-gold text-bg py-2 text-sm font-bold"
            >
              保存する
            </button>

            {renderCustomerRuleSection(c)}

            <div className="pt-1 border-t border-line">
              {confirmDeleteId === c.id ? (
                <div className="flex items-center justify-between gap-2 pt-2.5">
                  <span className="text-xs text-rose">この顧客を削除しますか？</span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs rounded-md border border-line px-2.5 py-1 text-gray-300"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={() => removeCustomer(c.id)}
                      className="text-xs rounded-md bg-rose text-white px-2.5 py-1 font-bold"
                    >
                      削除する
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(c.id)}
                  className="text-xs text-rose mt-2.5"
                >
                  この顧客を削除
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (storeMode !== "club") {
    return (
      <div className="rounded-xl border border-line p-4">
        <div className="text-sm text-gray-500 text-center py-6">
          顧客管理はクラブモードの店舗のみ利用できます（設定タブの「運用モード」から切り替えられます）。
        </div>
      </div>
    );
  }

  return (
    <OwnerPinGate storeId={storeId} enabled={settingsPinRequired} storeLoading={storeLoading}>
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-gold/12 text-gold flex items-center justify-center shrink-0">
            <PeopleSectionIcon />
          </span>
          <div>
            <div className="font-extrabold text-base leading-tight">顧客管理</div>
            <div className="text-xs text-gray-500">{customers.length}名登録済み</div>
          </div>
        </div>

        <button
          onClick={() => setShowNewCustomerForm((v) => !v)}
          className="w-full rounded-xl border border-dashed border-gold text-gold py-2.5 text-sm font-bold"
        >
          {showNewCustomerForm ? "− 閉じる" : "＋ 新規顧客を登録"}
        </button>

        {showNewCustomerForm && (
          <div className="rounded-xl border border-gold/40 bg-gold/[0.05] p-3.5 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="お名前" className="col-span-2">
                <input
                  autoFocus
                  value={newCustomerDraft.name}
                  onChange={(e) => setNewCustomerDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="例：田中様"
                  className={inputClass}
                />
              </Field>
              <Field label="フリガナ">
                <input
                  value={newCustomerDraft.nameKana}
                  onChange={(e) => setNewCustomerDraft((d) => ({ ...d, nameKana: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="電話番号">
                <input
                  value={newCustomerDraft.phone}
                  onChange={(e) => setNewCustomerDraft((d) => ({ ...d, phone: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="誕生日">
                <input
                  type="date"
                  value={newCustomerDraft.birthday}
                  onChange={(e) => setNewCustomerDraft((d) => ({ ...d, birthday: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="担当キャスト">
                <select
                  value={newCustomerDraft.primaryStaffId}
                  onChange={(e) => setNewCustomerDraft((d) => ({ ...d, primaryStaffId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">未設定</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="ボトルキープ（任意）" className="col-span-2">
                <input
                  value={newCustomerDraft.bottleKeep}
                  onChange={(e) => setNewCustomerDraft((d) => ({ ...d, bottleKeep: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="メモ（任意）" className="col-span-2">
                <textarea
                  value={newCustomerDraft.memo}
                  rows={2}
                  onChange={(e) => setNewCustomerDraft((d) => ({ ...d, memo: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              onClick={addCustomer}
              disabled={!newCustomerDraft.name.trim()}
              className="w-full rounded-md bg-gold text-bg py-2 text-sm font-bold disabled:opacity-40"
            >
              登録する
            </button>
          </div>
        )}

        {customers.length > 0 && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <SearchIcon />
            </span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="名前・フリガナで検索"
              className="w-full rounded-md bg-bg2 border border-line pl-9 pr-3 py-2 text-sm"
            />
          </div>
        )}

        {customers.length === 0 ? (
          <div className="rounded-xl border border-line bg-elevated">
            <div className="text-sm text-gray-500 text-center py-8">
              顧客が未登録です。上の「＋ 新規顧客を登録」から追加してください。
            </div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="rounded-xl border border-line bg-elevated">
            <div className="text-sm text-gray-500 text-center py-8">「{searchQuery}」に一致する顧客がいません</div>
          </div>
        ) : (
          <div className="space-y-2">{filteredCustomers.map(renderCustomerCard)}</div>
        )}
      </div>
    </OwnerPinGate>
  );
}
