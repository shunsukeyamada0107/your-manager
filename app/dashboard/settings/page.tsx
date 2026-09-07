"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { useStore, NameInputMode } from "@/lib/StoreContext";
import { OwnerPinGate } from "@/lib/OwnerPinGate";
import {
  Attendance,
  MenuItem,
  Staff,
  CommissionScheme,
  CommissionTaxBasis,
  DEFAULT_DRINK_BACK_AMOUNT,
  PayCycle,
  StaffCommission,
  TabLog,
  TabWithItems,
  UNCATEGORIZED_LABEL,
  hourlyLaborBreakdown,
  staffCommissionBreakdown,
  commissionTaxBasisResolver,
  totalSalesCommissionStaff,
  commissionRateResolver,
  CommissionBasis,
} from "@/lib/types";
import { DEFAULT_REPORT_TEMPLATE, REPORT_TEMPLATE_TOKENS } from "@/lib/reportTemplate";
import { StoreTheme } from "@/lib/theme";

const CUTOFF_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

const ACCENT_PRESETS = [
  { name: "Gold", hex: "#D4AF6A" },
  { name: "Purple", hex: "#9B7FE8" },
  { name: "Blue", hex: "#5B9EF3" },
  { name: "Red", hex: "#E5636B" },
  { name: "Pink", hex: "#E579A3" },
  { name: "Carbon", hex: "#C7CDD6" },
] as const;

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

function GearSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  );
}

function DocumentSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2h8l4 4v16H7Z" />
      <path d="M15 2v4h4M9 12h6M9 16h6" />
    </svg>
  );
}

function CupSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12l-1.6 12.5a4.4 4.4 0 0 1-8.8 0L6 3Z" />
      <path d="M9 21h6M12 15.5V21" />
    </svg>
  );
}

function PeopleSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="18" cy="9" r="2.3" />
      <path d="M15.3 14.3c2.5.5 4.2 2.5 4.2 5.7" />
    </svg>
  );
}

function ListSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function LockSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function SettingsPage() {
  const supabase = createClient();
  const {
    storeId,
    storeName,
    taxRate,
    commissionRate,
    cutoffHour,
    reportTemplate,
    cashFloatAmount,
    accentColor,
    commissionScheme,
    drinkBackAmount,
    theme,
    showInsights,
    acceptsCard,
    acceptsPaypay,
    acceptsOtherEpayment,
    enableNameSearch,
    nameInputMode,
    payCycle,
    commissionTaxBasis,
    reportPinRequired,
    settingsPinRequired,
    loading: storeLoading,
    reload,
  } = useStore();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tabLogs, setTabLogs] = useState<TabLog[]>([]);
  const [menuName, setMenuName] = useState("");
  const [menuPrice, setMenuPrice] = useState("");
  const [menuCourseMinutes, setMenuCourseMinutes] = useState("");
  const [menuIsCastDrink, setMenuIsCastDrink] = useState(false);
  const [menuCategory, setMenuCategory] = useState("");
  const [menuIsQuickPick, setMenuIsQuickPick] = useState(false);
  const [wageDrafts, setWageDrafts] = useState<Record<string, string>>({});
  const [totalSalesRateDrafts, setTotalSalesRateDrafts] = useState<Record<string, string>>({});
  const [commissionRateOverrideDrafts, setCommissionRateOverrideDrafts] = useState<Record<string, string>>({});
  const [specialWageDrafts, setSpecialWageDrafts] = useState<
    Record<string, { amount: string; days: number[]; holiday: boolean }>
  >({});
  const [specialWageOpenIds, setSpecialWageOpenIds] = useState<Set<string>>(new Set());
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffWage, setNewStaffWage] = useState("");
  const [menuNameDrafts, setMenuNameDrafts] = useState<Record<string, string>>({});
  const [menuCategoryDrafts, setMenuCategoryDrafts] = useState<Record<string, string>>({});
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // オーナー専用：店舗情報（暗証番号ロック）
  const [ownerPin, setOwnerPin] = useState<string | null>(null);
  const [ownerPinLoaded, setOwnerPinLoaded] = useState(false);
  const [ownerUnlocked, setOwnerUnlocked] = useState(false);
  const [showOwnerLock, setShowOwnerLock] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinSetupInput, setPinSetupInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, { base: string; allowance: string }>>({});
  const [monthCommission, setMonthCommission] = useState<StaffCommission[]>([]);
  const [monthCommissionLoaded, setMonthCommissionLoaded] = useState(false);
  const [showPayslipPicker, setShowPayslipPicker] = useState(false);
  const [payslipStaffId, setPayslipStaffId] = useState("");
  const [payslipPeriod, setPayslipPeriod] = useState("");
  const [generatingPayslip, setGeneratingPayslip] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [payslipData, setPayslipData] = useState<{
    staffName: string;
    monthLabel: string;
    base: number;
    allowance: number;
    commission: number;
    personalSales: number;
    hourlyHours: number;
    hourlyCost: number;
    total: number;
  } | null>(null);

  const [storeNameDraft, setStoreNameDraft] = useState(storeName ?? "");
  const [taxRateDraft, setTaxRateDraft] = useState(String(Math.round(taxRate * 100)));
  const [commissionRateDraft, setCommissionRateDraft] = useState(String(Math.round(commissionRate * 100)));
  const [cutoffHourDraft, setCutoffHourDraft] = useState(String(cutoffHour));
  const [cashFloatDraft, setCashFloatDraft] = useState(String(cashFloatAmount));
  const [accentColorDraft, setAccentColorDraft] = useState(accentColor);
  const [themeDraft, setThemeDraft] = useState<StoreTheme>(theme);
  const [showInsightsDraft, setShowInsightsDraft] = useState(showInsights);
  const [acceptsCardDraft, setAcceptsCardDraft] = useState(acceptsCard);
  const [acceptsPaypayDraft, setAcceptsPaypayDraft] = useState(acceptsPaypay);
  const [acceptsOtherEpaymentDraft, setAcceptsOtherEpaymentDraft] = useState(acceptsOtherEpayment);
  const [enableNameSearchDraft, setEnableNameSearchDraft] = useState(enableNameSearch);
  const [nameInputModeDraft, setNameInputModeDraft] = useState<NameInputMode>(nameInputMode);
  const [payCycleDraft, setPayCycleDraft] = useState<PayCycle>(payCycle);
  const [commissionTaxBasisDraft, setCommissionTaxBasisDraft] = useState<CommissionTaxBasis>(commissionTaxBasis);
  const [commissionSchemeDraft, setCommissionSchemeDraft] = useState<CommissionScheme>(commissionScheme);
  const [drinkBackAmountDraft, setDrinkBackAmountDraft] = useState(String(drinkBackAmount));
  const [savingStoreSettings, setSavingStoreSettings] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(reportTemplate ?? DEFAULT_REPORT_TEMPLATE);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);

  useEffect(() => {
    setStoreNameDraft(storeName ?? "");
    setTaxRateDraft(String(Math.round(taxRate * 100)));
    setCommissionRateDraft(String(Math.round(commissionRate * 100)));
    setCutoffHourDraft(String(cutoffHour));
    setTemplateDraft(reportTemplate ?? DEFAULT_REPORT_TEMPLATE);
    setCashFloatDraft(String(cashFloatAmount));
    setAccentColorDraft(accentColor);
    setCommissionSchemeDraft(commissionScheme);
    setDrinkBackAmountDraft(String(drinkBackAmount));
    setThemeDraft(theme);
    setShowInsightsDraft(showInsights);
    setAcceptsCardDraft(acceptsCard);
    setAcceptsPaypayDraft(acceptsPaypay);
    setAcceptsOtherEpaymentDraft(acceptsOtherEpayment);
    setEnableNameSearchDraft(enableNameSearch);
    setNameInputModeDraft(nameInputMode);
    setPayCycleDraft(payCycle);
    setCommissionTaxBasisDraft(commissionTaxBasis);
  }, [
    storeName,
    taxRate,
    commissionRate,
    cutoffHour,
    reportTemplate,
    cashFloatAmount,
    accentColor,
    commissionScheme,
    drinkBackAmount,
    theme,
    showInsights,
    acceptsCard,
    acceptsPaypay,
    acceptsOtherEpayment,
    enableNameSearch,
    nameInputMode,
    payCycle,
    commissionTaxBasis,
  ]);

  const loadData = useCallback(async () => {
    if (!storeId) return;
    const { data: menuData } = await supabase
      .from("menu_items")
      .select("*")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    setMenu(menuData ?? []);
    setMenuNameDrafts(Object.fromEntries((menuData ?? []).map((m) => [m.id, m.name])));
    setMenuCategoryDrafts(Object.fromEntries((menuData ?? []).map((m) => [m.id, m.category ?? ""])));

    const { data: staffData } = await supabase
      .from("staff")
      .select("*")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("created_at", { ascending: true });
    setStaff(staffData ?? []);
    setWageDrafts(
      Object.fromEntries((staffData ?? []).map((s) => [s.id, s.hourly_wage != null ? String(s.hourly_wage) : ""]))
    );
    setTotalSalesRateDrafts(
      Object.fromEntries(
        (staffData ?? []).map((s) => [
          s.id,
          s.total_sales_commission_rate != null ? String(Math.round(s.total_sales_commission_rate * 100)) : "",
        ])
      )
    );
    setCommissionRateOverrideDrafts(
      Object.fromEntries(
        (staffData ?? []).map((s) => [
          s.id,
          s.commission_rate_override != null ? String(Math.round(s.commission_rate_override * 100)) : "",
        ])
      )
    );
    setSpecialWageDrafts(
      Object.fromEntries(
        (staffData ?? []).map((s) => [
          s.id,
          {
            amount: s.special_wage != null ? String(s.special_wage) : "",
            days: s.special_wage_days ?? [],
            holiday: s.special_wage_holiday ?? false,
          },
        ])
      )
    );
    setSalaryDrafts(
      Object.fromEntries(
        (staffData ?? []).map((s) => [
          s.id,
          {
            base: s.base_salary != null ? String(s.base_salary) : "",
            allowance: s.special_allowance != null ? String(s.special_allowance) : "",
          },
        ])
      )
    );

    const { data: tabLogsData } = await supabase
      .from("tab_logs")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(100);
    setTabLogs((tabLogsData as TabLog[]) ?? []);
  }, [storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function addMenuItem() {
    if (!storeId || !menuName.trim() || !menuPrice.trim()) return;
    const nextSortOrder = menu.reduce((max, m) => Math.max(max, m.sort_order), 0) + 1;
    await supabase.from("menu_items").insert({
      store_id: storeId,
      name: menuName.trim(),
      price: Number(menuPrice),
      course_minutes: menuCourseMinutes.trim() === "" ? null : Number(menuCourseMinutes),
      sort_order: nextSortOrder,
      is_cast_drink: menuIsCastDrink,
      category: menuCategory.trim() === "" ? null : menuCategory.trim(),
      is_quick_pick: menuIsQuickPick,
    });
    setMenuName("");
    setMenuPrice("");
    setMenuCourseMinutes("");
    setMenuIsCastDrink(false);
    setMenuCategory("");
    setMenuIsQuickPick(false);
    loadData();
  }

  async function toggleCastDrink(m: MenuItem) {
    await supabase.from("menu_items").update({ is_cast_drink: !m.is_cast_drink }).eq("id", m.id);
    loadData();
  }

  async function toggleQuickPick(m: MenuItem) {
    await supabase.from("menu_items").update({ is_quick_pick: !m.is_quick_pick }).eq("id", m.id);
    loadData();
  }

  async function removeMenuItem(id: string) {
    await supabase.from("menu_items").update({ active: false }).eq("id", id);
    loadData();
  }

  async function saveMenuRow(id: string) {
    const name = (menuNameDrafts[id] ?? "").trim();
    if (!name) return;
    const category = (menuCategoryDrafts[id] ?? "").trim();
    await supabase.from("menu_items").update({ name, category: category === "" ? null : category }).eq("id", id);
    loadData();
  }

  async function moveMenuItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= menu.length) return;
    const current = menu[index];
    const target = menu[targetIndex];
    setReorderingId(current.id);
    await Promise.all([
      supabase.from("menu_items").update({ sort_order: target.sort_order }).eq("id", current.id),
      supabase.from("menu_items").update({ sort_order: current.sort_order }).eq("id", target.id),
    ]);
    setReorderingId(null);
    loadData();
  }

  async function saveWage(staffId: string) {
    const raw = wageDrafts[staffId] ?? "";
    const wage = raw.trim() === "" ? null : Number(raw);
    await supabase.from("staff").update({ hourly_wage: wage }).eq("id", staffId);
    loadData();
  }

  function toggleSpecialWageOpen(id: string) {
    setSpecialWageOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveSpecialWage(staffId: string) {
    const draft = specialWageDrafts[staffId];
    if (!draft) return;
    const amount = draft.amount.trim() === "" ? null : Number(draft.amount);
    await supabase
      .from("staff")
      .update({
        special_wage: amount,
        special_wage_days: draft.days.length > 0 ? draft.days : null,
        special_wage_holiday: draft.holiday,
      })
      .eq("id", staffId);
    loadData();
  }

  async function removeStaff(id: string) {
    await supabase.from("staff").update({ active: false }).eq("id", id);
    loadData();
  }

  async function toggleCommissionEligible(s: Staff) {
    await supabase.from("staff").update({ commission_eligible: !s.commission_eligible }).eq("id", s.id);
    loadData();
  }

  async function saveCommissionTaxBasisOverride(s: Staff, value: CommissionTaxBasis | null) {
    await supabase.from("staff").update({ commission_tax_basis_override: value }).eq("id", s.id);
    loadData();
  }

  async function saveCommissionBasis(s: Staff, value: CommissionBasis) {
    await supabase.from("staff").update({ commission_basis: value }).eq("id", s.id);
    loadData();
  }

  async function saveTotalSalesRate(staffId: string) {
    const raw = totalSalesRateDrafts[staffId] ?? "";
    const rate = raw.trim() === "" ? null : Number(raw) / 100;
    await supabase.from("staff").update({ total_sales_commission_rate: rate }).eq("id", staffId);
    loadData();
  }

  async function saveCommissionRateOverride(staffId: string) {
    const raw = commissionRateOverrideDrafts[staffId] ?? "";
    const rate = raw.trim() === "" ? null : Number(raw) / 100;
    await supabase.from("staff").update({ commission_rate_override: rate }).eq("id", staffId);
    loadData();
  }

  async function toggleReportPinRequired(value: boolean) {
    if (!storeId) return;
    await supabase.from("stores").update({ report_pin_required: value }).eq("id", storeId);
    reload();
  }

  async function toggleSettingsPinRequired(value: boolean) {
    if (!storeId) return;
    await supabase.from("stores").update({ settings_pin_required: value }).eq("id", storeId);
    reload();
  }

  async function openOwnerLock() {
    setPinError("");
    setPinInput("");
    setShowOwnerLock(true);
    if (!ownerPinLoaded && storeId) {
      const { data } = await supabase.from("stores").select("owner_pin").eq("id", storeId).single();
      setOwnerPin(data?.owner_pin ?? null);
      setOwnerPinLoaded(true);
    }
  }

  async function loadMonthCommission() {
    if (!storeId) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${y}-${pad(m + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${pad(m + 1)}-${pad(lastDay)}`;

    const { data } = await supabase
      .from("tabs")
      .select("*, tab_items(*)")
      .eq("store_id", storeId)
      .gte("business_date", start)
      .lte("business_date", end)
      .not("closed_at", "is", null);

    const isEligible = (staffId: string) => staff.find((x) => x.id === staffId)?.commission_eligible ?? true;
    const breakdown = staffCommissionBreakdown(
      (data as TabWithItems[]) ?? [],
      (id) => staff.find((x) => x.id === id)?.name ?? "(元スタッフ)",
      taxRate,
      commissionRate,
      commissionScheme,
      drinkBackAmount,
      isEligible,
      commissionTaxBasisResolver(staff, commissionTaxBasis),
      totalSalesCommissionStaff(staff),
      commissionRateResolver(staff, commissionRate)
    );
    setMonthCommission(breakdown);
    setMonthCommissionLoaded(true);
  }

  // 支払いサイクルに応じて、明細作成の対象期間ピッカーのデフォルト値を返す
  // （月払い="YYYY-MM"、週払い/日払い="YYYY-MM-DD"。締め後に作るのが普通なので、直近の完了済み期間をデフォルトにする）
  function defaultPayslipPeriod() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    if (payCycle === "monthly") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // 支払いサイクルとピッカーの入力値から、実際に集計する日付範囲と明細の表示ラベルを組み立てる
  function payslipPeriodRange(period: string): { start: string; end: string; label: string } {
    const pad = (n: number) => String(n).padStart(2, "0");
    if (payCycle === "monthly") {
      const [y, m] = period.split("-").map(Number);
      const start = `${period}-01`;
      const end = `${period}-${pad(new Date(y, m, 0).getDate())}`;
      return { start, end, label: `${y}年${m}月分` };
    }
    if (payCycle === "weekly") {
      const startDate = new Date(`${period}T12:00:00`);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const short = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
      return { start: fmt(startDate), end: fmt(endDate), label: `${short(startDate)}〜${short(endDate)}分` };
    }
    return { start: period, end: period, label: `${period}分` };
  }

  async function generatePayslip() {
    if (!storeId || !payslipStaffId || !payslipPeriod) return;
    const s = staff.find((x) => x.id === payslipStaffId);
    if (!s) return;
    setGeneratingPayslip(true);

    const { start, end, label } = payslipPeriodRange(payslipPeriod);

    const [{ data: tabsData }, { data: attData }] = await Promise.all([
      supabase
        .from("tabs")
        .select("*, tab_items(*)")
        .eq("store_id", storeId)
        .gte("business_date", start)
        .lte("business_date", end)
        .not("closed_at", "is", null),
      supabase
        .from("attendance")
        .select("*")
        .eq("store_id", storeId)
        .eq("staff_id", payslipStaffId)
        .gte("business_date", start)
        .lte("business_date", end),
    ]);

    const isEligible = (staffId: string) => staff.find((x) => x.id === staffId)?.commission_eligible ?? true;
    const nameOf = (id: string | null) => staff.find((x) => x.id === id)?.name ?? "(元スタッフ)";
    const myCommission = staffCommissionBreakdown(
      (tabsData as TabWithItems[]) ?? [],
      nameOf,
      taxRate,
      commissionRate,
      commissionScheme,
      drinkBackAmount,
      isEligible,
      commissionTaxBasisResolver(staff, commissionTaxBasis),
      totalSalesCommissionStaff(staff),
      commissionRateResolver(staff, commissionRate)
    ).find((c) => c.staffId === payslipStaffId);
    const commission = myCommission?.commission ?? 0;
    const personalSales = myCommission?.salesWithTax ?? 0;
    const hourly = hourlyLaborBreakdown((attData as Attendance[]) ?? [], nameOf)[0] ?? null;

    const base = s.base_salary ?? 0;
    const allowance = s.special_allowance ?? 0;
    const hourlyHours = hourly?.hours ?? 0;
    const hourlyCost = hourly?.cost ?? 0;

    setPayslipData({
      staffName: s.name,
      monthLabel: label,
      base,
      allowance,
      commission,
      personalSales,
      hourlyHours,
      hourlyCost,
      total: base + allowance + commission + hourlyCost,
    });
    setGeneratingPayslip(false);
    setShowPayslipPicker(false);
  }

  // 明細のDOMを画像化してPDFに埋め込む（jsPDF単体は日本語フォントを内蔵していないため、
  // html2canvasで見たままを画像化する方式で日本語を含めて確実に出力する）
  async function downloadPayslipPdf() {
    if (!payslipData) return;
    const el = document.getElementById("payslip-print-area");
    if (!el) return;
    setDownloadingPdf(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);
      pdf.save(`給与明細_${payslipData.staffName}_${payslipData.monthLabel}.pdf`);
    } finally {
      setDownloadingPdf(false);
    }
  }

  function submitPin() {
    if (pinInput.trim() !== "" && pinInput === ownerPin) {
      setOwnerUnlocked(true);
      setShowOwnerLock(false);
      loadMonthCommission();
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
    setSavingPin(true);
    await supabase.from("stores").update({ owner_pin: pinSetupInput.trim() }).eq("id", storeId);
    setOwnerPin(pinSetupInput.trim());
    setSavingPin(false);
    setPinSetupInput("");
    setPinError("");
    setOwnerUnlocked(true);
    setShowOwnerLock(false);
    loadMonthCommission();
  }

  async function changePin() {
    if (!storeId || pinSetupInput.trim().length < 4) {
      setPinError("4桁以上の数字で設定してください");
      return;
    }
    setSavingPin(true);
    await supabase.from("stores").update({ owner_pin: pinSetupInput.trim() }).eq("id", storeId);
    setOwnerPin(pinSetupInput.trim());
    setSavingPin(false);
    setPinSetupInput("");
    setPinError("");
    setShowPinChange(false);
  }

  async function saveSalary(staffId: string) {
    const draft = salaryDrafts[staffId];
    if (!draft) return;
    const base = draft.base.trim() === "" ? null : Number(draft.base);
    const allowance = draft.allowance.trim() === "" ? null : Number(draft.allowance);
    await supabase.from("staff").update({ base_salary: base, special_allowance: allowance }).eq("id", staffId);
    loadData();
  }

  async function addStaff() {
    if (!storeId || !newStaffName.trim()) return;
    const wage = newStaffWage.trim() === "" ? null : Number(newStaffWage);
    await supabase.from("staff").insert({
      store_id: storeId,
      name: newStaffName.trim(),
      hourly_wage: wage,
    });
    setNewStaffName("");
    setNewStaffWage("");
    loadData();
  }

  async function saveStoreSettings() {
    if (!storeId || !storeNameDraft.trim()) return;
    setSavingStoreSettings(true);
    await supabase
      .from("stores")
      .update({
        name: storeNameDraft.trim(),
        tax_rate: Number(taxRateDraft) / 100,
        commission_rate: Number(commissionRateDraft) / 100,
        business_day_cutoff_hour: Number(cutoffHourDraft),
        cash_float_amount: Number(cashFloatDraft) || 0,
        accent_color: accentColorDraft,
        commission_scheme: commissionSchemeDraft,
        drink_back_amount: Number(drinkBackAmountDraft) || 0,
        theme: themeDraft,
        show_insights: showInsightsDraft,
        accepts_card: acceptsCardDraft,
        accepts_paypay: acceptsPaypayDraft,
        accepts_other_epayment: acceptsOtherEpaymentDraft,
        enable_name_search: enableNameSearchDraft,
        name_input_mode: nameInputModeDraft,
        pay_cycle: payCycleDraft,
        commission_tax_basis: commissionTaxBasisDraft,
      })
      .eq("id", storeId);
    setSavingStoreSettings(false);
    reload();
  }

  async function saveTemplate() {
    if (!storeId) return;
    setSavingTemplate(true);
    await supabase.from("stores").update({ report_template: templateDraft }).eq("id", storeId);
    setSavingTemplate(false);
    reload();
  }

  function resetTemplate() {
    setTemplateDraft(DEFAULT_REPORT_TEMPLATE);
  }

  const eligibleStaff = staff.filter((s) => s.commission_eligible);
  const ineligibleStaff = staff.filter((s) => !s.commission_eligible);

  const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  function renderStaffRow(s: Staff) {
    const specialOpen = specialWageOpenIds.has(s.id);
    const specialDraft = specialWageDrafts[s.id] ?? { amount: "", days: [], holiday: false };
    const specialDirty =
      specialDraft.amount !== (s.special_wage != null ? String(s.special_wage) : "") ||
      JSON.stringify([...specialDraft.days].sort()) !== JSON.stringify([...(s.special_wage_days ?? [])].sort()) ||
      specialDraft.holiday !== (s.special_wage_holiday ?? false);

    return (
      <div key={s.id} className="px-3 py-2 space-y-2">
        <div className="flex justify-between items-center gap-2">
          <span className="text-gray-300 shrink-0">{s.name}</span>
          <input
            value={wageDrafts[s.id] ?? ""}
            onChange={(e) => setWageDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
            placeholder="時給(任意)"
            inputMode="numeric"
            className="w-24 rounded-md bg-bg2 border border-line px-2 py-1 text-sm"
          />
          <button
            onClick={() => saveWage(s.id)}
            disabled={(wageDrafts[s.id] ?? "") === (s.hourly_wage != null ? String(s.hourly_wage) : "")}
            className="text-xs rounded-md border border-line px-2 py-1 text-gray-300 disabled:opacity-40 shrink-0"
          >
            保存
          </button>
          <button
            onClick={() => toggleCommissionEligible(s)}
            className={`text-xs rounded-md border px-2 py-1 shrink-0 ${
              s.commission_eligible ? "border-gold text-gold bg-gold/10" : "border-line text-gray-500"
            }`}
          >
            {s.commission_eligible ? "💰歩合対象" : "対象外"}
          </button>
          <button onClick={() => removeStaff(s.id)} className="text-rose text-xs shrink-0">
            削除
          </button>
        </div>

        {s.commission_eligible && s.commission_basis !== "total_sales" && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 shrink-0">歩合の基準</label>
            <select
              value={s.commission_tax_basis_override ?? ""}
              onChange={(e) =>
                saveCommissionTaxBasisOverride(
                  s,
                  e.target.value === "" ? null : (e.target.value as CommissionTaxBasis)
                )
              }
              className="rounded-md bg-bg2 border border-line px-2 py-1 text-xs"
            >
              <option value="">店舗設定に従う（{commissionTaxBasis === "pre_tax" ? "税抜小計" : "税込金額"}）</option>
              <option value="with_tax">消費税込みの金額</option>
              <option value="pre_tax">消費税抜きの小計</option>
            </select>
          </div>
        )}

        {s.commission_eligible && (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-500 shrink-0">歩合の対象</label>
            <select
              value={s.commission_basis}
              onChange={(e) => saveCommissionBasis(s, e.target.value as CommissionBasis)}
              className="rounded-md bg-bg2 border border-line px-2 py-1 text-xs"
            >
              <option value="own_tabs">自分の担当伝票のみ</option>
              <option value="total_sales">歩合対象の伝票全体</option>
            </select>
            {s.commission_basis === "total_sales" && (
              <>
                <input
                  value={totalSalesRateDrafts[s.id] ?? ""}
                  onChange={(e) => setTotalSalesRateDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                  placeholder="歩合率(%)"
                  inputMode="numeric"
                  className="w-20 rounded-md bg-bg2 border border-line px-2 py-1 text-xs"
                />
                <span className="text-xs text-gray-500">
                  %（他の歩合対象スタッフが担当した伝票の合計が対象。歩合対象外のスタッフの分・未設定の伝票分は含まない）
                </span>
                <button
                  onClick={() => saveTotalSalesRate(s.id)}
                  disabled={
                    (totalSalesRateDrafts[s.id] ?? "") ===
                    (s.total_sales_commission_rate != null ? String(Math.round(s.total_sales_commission_rate * 100)) : "")
                  }
                  className="text-xs rounded-md border border-line px-2 py-1 text-gray-300 disabled:opacity-40"
                >
                  保存
                </button>
              </>
            )}
            {s.commission_basis === "own_tabs" && (
              <>
                <input
                  value={commissionRateOverrideDrafts[s.id] ?? ""}
                  onChange={(e) => setCommissionRateOverrideDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                  placeholder={`歩合率(%) 例:${Math.round(commissionRate * 100)}`}
                  inputMode="numeric"
                  className="w-32 rounded-md bg-bg2 border border-line px-2 py-1 text-xs"
                />
                <span className="text-xs text-gray-500">%（空欄なら店舗設定の歩合率{Math.round(commissionRate * 100)}%を使用）</span>
                <button
                  onClick={() => saveCommissionRateOverride(s.id)}
                  disabled={
                    (commissionRateOverrideDrafts[s.id] ?? "") ===
                    (s.commission_rate_override != null ? String(Math.round(s.commission_rate_override * 100)) : "")
                  }
                  className="text-xs rounded-md border border-line px-2 py-1 text-gray-300 disabled:opacity-40"
                >
                  保存
                </button>
              </>
            )}
          </div>
        )}

        <button
          onClick={() => toggleSpecialWageOpen(s.id)}
          className={`text-xs rounded-md border px-2 py-1 ${
            s.special_wage != null ? "border-gold text-gold bg-gold/10" : "border-line text-gray-500"
          }`}
        >
          特別時給{s.special_wage != null ? `：¥${s.special_wage.toLocaleString()}` : "を設定"}
          {specialOpen ? " ▲" : " ▼"}
        </button>

        {specialOpen && (
          <div className="rounded-md border border-line bg-elevated p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={specialDraft.amount}
                onChange={(e) =>
                  setSpecialWageDrafts((d) => ({ ...d, [s.id]: { ...specialDraft, amount: e.target.value } }))
                }
                placeholder="特別時給(任意)"
                inputMode="numeric"
                className="w-28 rounded-md bg-bg2 border border-line px-2 py-1 text-sm"
              />
              <span className="text-xs text-gray-500">対象の曜日・祝日のみ通常の時給の代わりに適用</span>
            </div>
            <div className="flex gap-1.5">
              {WEEKDAY_LABELS.map((label, dow) => {
                const active = specialDraft.days.includes(dow);
                return (
                  <button
                    key={dow}
                    onClick={() =>
                      setSpecialWageDrafts((d) => ({
                        ...d,
                        [s.id]: {
                          ...specialDraft,
                          days: active ? specialDraft.days.filter((x) => x !== dow) : [...specialDraft.days, dow],
                        },
                      }))
                    }
                    className={`w-8 h-8 rounded-md border text-xs ${
                      active ? "border-gold text-gold bg-gold/10" : "border-line text-gray-500"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={specialDraft.holiday}
                onChange={(e) =>
                  setSpecialWageDrafts((d) => ({ ...d, [s.id]: { ...specialDraft, holiday: e.target.checked } }))
                }
              />
              祝日も対象にする
            </label>
            <button
              onClick={() => saveSpecialWage(s.id)}
              disabled={!specialDirty}
              className="text-xs rounded-md border border-line px-3 py-1.5 text-gray-300 disabled:opacity-40"
            >
              保存
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <OwnerPinGate
      storeId={storeId}
      enabled={settingsPinRequired}
      storeLoading={storeLoading}
      onUnlock={() => setOwnerUnlocked(true)}
    >
    <div className="space-y-6">
      <Link
        href="/dashboard/settings/guide"
        className="flex items-center justify-between rounded-xl border border-gold/40 bg-gold/10 px-4 py-3.5"
      >
        <span className="flex items-center gap-2 font-bold text-sm text-gold">📖 アプリの使い方ガイド</span>
        <span className="text-gold text-lg">›</span>
      </Link>

      <div className="rounded-xl border border-line p-4">
        <SectionHeader icon={<GearSectionIcon />}>店舗設定</SectionHeader>
        <div className="rounded-xl border border-line bg-elevated p-3 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">店舗名</label>
            <input
              value={storeNameDraft}
              onChange={(e) => setStoreNameDraft(e.target.value)}
              className="w-full rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">消費税率（%）</label>
            <input
              value={taxRateDraft}
              onChange={(e) => setTaxRateDraft(e.target.value)}
              inputMode="numeric"
              className="w-24 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">歩合の計算方式</label>
            <select
              value={commissionSchemeDraft}
              onChange={(e) => setCommissionSchemeDraft(e.target.value as CommissionScheme)}
              className="w-full rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            >
              <option value="simple">売上の一律%（シンプル）</option>
              <option value="drink_back">売上バック＋ドリンクバック</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {commissionSchemeDraft === "drink_back"
                ? "（担当伝票の売上 − キャストドリンク代）× 歩合率 ＋ キャストドリンク数 × ドリンクバック単価"
                : "担当した伝票の売上（実会計額）に、そのまま歩合率を掛けます"}
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">歩合の計算に使う金額の基準</label>
            <select
              value={commissionTaxBasisDraft}
              onChange={(e) => setCommissionTaxBasisDraft(e.target.value as CommissionTaxBasis)}
              className="w-full rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            >
              <option value="with_tax">消費税込みの金額（実際の会計額ベース）</option>
              <option value="pre_tax">消費税抜きの小計</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {commissionTaxBasisDraft === "pre_tax"
                ? "レジの100円切り上げは反映されません（税抜の小計そのものが対象のため）"
                : "1人で丸ごと担当した伝票は、レジで実際に切り上げられた金額まで含めて歩合の対象になります"}
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {commissionSchemeDraft === "drink_back" ? "売上バック率（%）" : "歩合率（%）"}
            </label>
            <input
              value={commissionRateDraft}
              onChange={(e) => setCommissionRateDraft(e.target.value)}
              inputMode="numeric"
              className="w-24 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            />
          </div>
          {commissionSchemeDraft === "drink_back" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">ドリンクバック単価（1杯あたり・円）</label>
              <input
                value={drinkBackAmountDraft}
                onChange={(e) => setDrinkBackAmountDraft(e.target.value)}
                inputMode="numeric"
                placeholder={String(DEFAULT_DRINK_BACK_AMOUNT)}
                className="w-28 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              営業日の切り替え時刻（この時刻より前は前日の営業として記録されます）
            </label>
            <select
              value={cutoffHourDraft}
              onChange={(e) => setCutoffHourDraft(e.target.value)}
              className="w-24 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            >
              {CUTOFF_HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}時
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              給与の支払いサイクル（オーナー専用ページの給与明細作成で使う対象期間の単位）
            </label>
            <select
              value={payCycleDraft}
              onChange={(e) => setPayCycleDraft(e.target.value as PayCycle)}
              className="w-32 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            >
              <option value="monthly">月払い</option>
              <option value="weekly">週払い</option>
              <option value="daily">日払い</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              釣り銭元金（営業終了後に金庫に残す固定額）
            </label>
            <input
              value={cashFloatDraft}
              onChange={(e) => setCashFloatDraft(e.target.value)}
              inputMode="numeric"
              className="w-28 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">ブランドカラー（アプリ内の強調色）</label>
            <div className="flex items-center gap-2.5 mb-2.5">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setAccentColorDraft(preset.hex)}
                  aria-label={preset.name}
                  aria-pressed={accentColorDraft.toLowerCase() === preset.hex.toLowerCase()}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    accentColorDraft.toLowerCase() === preset.hex.toLowerCase()
                      ? "border-white/85 scale-110"
                      : "border-transparent"
                  }`}
                  style={{ background: preset.hex }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColorDraft}
                onChange={(e) => setAccentColorDraft(e.target.value)}
                className="w-10 h-9 rounded-md bg-bg2 border border-line p-0.5 cursor-pointer"
              />
              <span className="text-xs text-gray-400 font-mono">{accentColorDraft}</span>
              <span className="text-xs text-gray-500">（自由に色を指定することもできます）</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">画面テーマ</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setThemeDraft("dark")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  themeDraft === "dark" ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                🌙 ダーク
              </button>
              <button
                type="button"
                onClick={() => setThemeDraft("light")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  themeDraft === "light" ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                ☀️ ライト（白背景）
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              現金以外に受け付ける決済方法（会計時にボタンとして表示されます）
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setAcceptsCardDraft((v) => !v)}
                aria-pressed={acceptsCardDraft}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  acceptsCardDraft ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                💳 カード
              </button>
              <button
                type="button"
                onClick={() => setAcceptsPaypayDraft((v) => !v)}
                aria-pressed={acceptsPaypayDraft}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  acceptsPaypayDraft ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                📱 PayPay
              </button>
              <button
                type="button"
                onClick={() => setAcceptsOtherEpaymentDraft((v) => !v)}
                aria-pressed={acceptsOtherEpaymentDraft}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  acceptsOtherEpaymentDraft ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                🔷 その他電子決済
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              2つ以上選ぶと、会計時にどれで支払われたか選ぶ画面が出ます。1つだけならそのまま会計されます。
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              伝票作成時に、同じ名前の過去の伝票を検索表示する
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEnableNameSearchDraft(true)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  enableNameSearchDraft ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                ON
              </button>
              <button
                type="button"
                onClick={() => setEnableNameSearchDraft(false)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  !enableNameSearchDraft ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                OFF
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">伝票の名前欄の入力方法</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNameInputModeDraft("keyboard")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  nameInputModeDraft === "keyboard" ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                キーボード入力
              </button>
              <button
                type="button"
                onClick={() => setNameInputModeDraft("kana_keypad")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  nameInputModeDraft === "kana_keypad"
                    ? "border-gold text-gold bg-gold/10"
                    : "border-line text-gray-400"
                }`}
              >
                カタカナボタン
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              「カタカナボタン」を選ぶと、キーボードの代わりに行→文字の2タップで打てるカタカナ専用ボタンが出ます。
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">集計タブの「気づき」</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowInsightsDraft(true)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  showInsightsDraft ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                ON
              </button>
              <button
                type="button"
                onClick={() => setShowInsightsDraft(false)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${
                  !showInsightsDraft ? "border-gold text-gold bg-gold/10" : "border-line text-gray-400"
                }`}
              >
                OFF
              </button>
            </div>
          </div>
          <button
            onClick={saveStoreSettings}
            disabled={savingStoreSettings}
            className="rounded-md bg-gold text-bg px-3 py-1.5 text-sm font-bold disabled:opacity-50"
          >
            {savingStoreSettings ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <SectionHeader icon={<DocumentSectionIcon />}>LINE報告レポートのひな形</SectionHeader>
        <div className="rounded-xl border border-line bg-elevated p-3 space-y-2">
          <div className="text-xs text-gray-500">
            集計タブの「報告レポート」ボタンで生成される文章のひな形です。{"{{sales}}"}
            のようなタグを好きな場所に入れて、自由に文言・並び順を変更できます。
          </div>
          <textarea
            value={templateDraft}
            onChange={(e) => setTemplateDraft(e.target.value)}
            rows={14}
            className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-xs font-mono whitespace-pre"
          />
          <button
            onClick={() => setShowTokenHelp((v) => !v)}
            className="text-xs text-gold"
          >
            {showTokenHelp ? "使えるタグを隠す" : "使えるタグ一覧を見る"}
          </button>
          {showTokenHelp && (
            <div className="rounded-md bg-bg2 border border-line p-2 text-xs text-gray-400 space-y-0.5 max-h-48 overflow-y-auto">
              {REPORT_TEMPLATE_TOKENS.map((t) => (
                <div key={t.token}>
                  <span className="text-gold font-mono">{`{{${t.token}}}`}</span> — {t.label}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={resetTemplate}
              className="flex-1 rounded-md border border-line py-2 text-sm text-gray-300"
            >
              既定に戻す
            </button>
            <button
              onClick={saveTemplate}
              disabled={savingTemplate}
              className="flex-1 rounded-md bg-gold text-bg py-2 text-sm font-bold disabled:opacity-50"
            >
              {savingTemplate ? "保存中..." : "保存する"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <SectionHeader icon={<CupSectionIcon />}>メニュー管理</SectionHeader>
        <div className="rounded-xl border border-line bg-elevated divide-y divide-line mb-2">
          {menu.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-6">メニューが未登録です</div>
          )}
          {menu.map((m, i) => (
            <div key={m.id} className="flex flex-wrap items-center px-3 py-2 text-sm gap-2">
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => moveMenuItem(i, -1)}
                  disabled={i === 0 || reorderingId !== null}
                  className="text-gray-400 disabled:opacity-20 leading-none px-1"
                  aria-label="上に移動"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveMenuItem(i, 1)}
                  disabled={i === menu.length - 1 || reorderingId !== null}
                  className="text-gray-400 disabled:opacity-20 leading-none px-1"
                  aria-label="下に移動"
                >
                  ▼
                </button>
              </div>
              <input
                value={menuNameDrafts[m.id] ?? m.name}
                onChange={(e) => setMenuNameDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                className="flex-1 min-w-[6rem] rounded-md bg-bg2 border border-line px-2 py-1 text-sm text-gray-300"
              />
              <input
                value={menuCategoryDrafts[m.id] ?? ""}
                onChange={(e) => setMenuCategoryDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                placeholder="カテゴリ"
                list="menu-category-options"
                className="w-24 shrink-0 rounded-md bg-bg2 border border-line px-2 py-1 text-sm text-gray-300"
              />
              <span className="text-xs text-gray-500 shrink-0">
                ¥{m.price.toLocaleString()}
                {m.course_minutes != null && ` ・⏱${m.course_minutes}分`}
              </span>
              <button
                onClick={() => toggleQuickPick(m)}
                title="よく出る商品（伝票画面の最上部に固定表示）"
                className={`text-xs rounded-md border px-2 py-1 shrink-0 ${
                  m.is_quick_pick ? "border-gold text-gold bg-gold/10" : "border-line text-gray-500"
                }`}
              >
                ⭐
              </button>
              <button
                onClick={() => toggleCastDrink(m)}
                title="キャストドリンク（ドリンクバック対象）"
                className={`text-xs rounded-md border px-2 py-1 shrink-0 ${
                  m.is_cast_drink ? "border-gold text-gold bg-gold/10" : "border-line text-gray-500"
                }`}
              >
                🍾
              </button>
              <button
                onClick={() => saveMenuRow(m.id)}
                disabled={
                  (menuNameDrafts[m.id] ?? m.name) === m.name &&
                  (menuCategoryDrafts[m.id] ?? "") === (m.category ?? "")
                }
                className="text-xs rounded-md border border-line px-2 py-1 text-gray-300 disabled:opacity-40 shrink-0"
              >
                保存
              </button>
              <button onClick={() => removeMenuItem(m.id)} className="text-rose text-xs shrink-0">
                削除
              </button>
            </div>
          ))}
        </div>
        <datalist id="menu-category-options">
          {Array.from(new Set(menu.map((m) => m.category).filter((c): c is string => !!c))).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="rounded-xl border border-dashed border-line p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={menuName}
              onChange={(e) => setMenuName(e.target.value)}
              placeholder="品名"
              className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            />
            <input
              value={menuPrice}
              onChange={(e) => setMenuPrice(e.target.value)}
              placeholder="金額"
              inputMode="numeric"
              className="w-20 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={menuCategory}
              onChange={(e) => setMenuCategory(e.target.value)}
              placeholder={`カテゴリ（任意・例：ドリンク）`}
              list="menu-category-options"
              className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            />
            <input
              value={menuCourseMinutes}
              onChange={(e) => setMenuCourseMinutes(e.target.value)}
              placeholder="コース分(任意)"
              inputMode="numeric"
              className="w-24 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={menuIsQuickPick}
                  onChange={(e) => setMenuIsQuickPick(e.target.checked)}
                />
                ⭐ よく出る商品（最上部に固定表示）
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={menuIsCastDrink}
                  onChange={(e) => setMenuIsCastDrink(e.target.checked)}
                />
                🍾 キャストドリンク（ドリンクバック対象）
              </label>
            </div>
            <button
              onClick={addMenuItem}
              className="rounded-md px-3 py-1.5 text-sm border border-dashed border-gold text-gold shrink-0"
            >
              ＋ 追加
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          カテゴリを入れると伝票画面でタブ分けされ、商品を探しやすくなります（空欄は「{UNCATEGORIZED_LABEL}」扱い）。「コース分」は飲み放題など時間制メニュー用です。設定すると、伝票タブでこのメニューをタップした瞬間に伝票へタイマーがセットされます
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <SectionHeader icon={<PeopleSectionIcon />}>スタッフ管理</SectionHeader>
        {staff.length === 0 ? (
          <div className="rounded-xl border border-line bg-elevated">
            <div className="text-sm text-gray-500 text-center py-6">
              スタッフが未登録です（「スタッフ」タブから追加できます）
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">💰 歩合対象スタッフ</div>
              {eligibleStaff.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line text-xs text-gray-500 text-center py-4">
                  いません
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
                  {eligibleStaff.map(renderStaffRow)}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">歩合対象外スタッフ（時給のみ）</div>
              {ineligibleStaff.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line text-xs text-gray-500 text-center py-4">
                  いません
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
                  {ineligibleStaff.map(renderStaffRow)}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="mt-2 rounded-xl border border-dashed border-line p-3 flex gap-2">
          <input
            value={newStaffName}
            onChange={(e) => setNewStaffName(e.target.value)}
            placeholder="スタッフ名"
            className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
          />
          <input
            value={newStaffWage}
            onChange={(e) => setNewStaffWage(e.target.value)}
            placeholder="時給(任意)"
            inputMode="numeric"
            className="w-24 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
          />
          <button
            onClick={addStaff}
            className="rounded-md px-3 py-1.5 text-sm border border-dashed border-gold text-gold shrink-0"
          >
            ＋ 追加
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <SectionHeader icon={<ListSectionIcon />}>伝票ログ（作成・削除の履歴）</SectionHeader>
        {tabLogs.length === 0 ? (
          <div className="rounded-xl border border-line bg-elevated text-sm text-gray-500 text-center py-6">
            まだ記録がありません
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-elevated divide-y divide-line max-h-96 overflow-y-auto">
            {tabLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        log.action === "deleted"
                          ? "text-rose font-bold"
                          : log.action === "time_edited"
                          ? "text-gold font-bold"
                          : "text-good font-bold"
                      }
                    >
                      {log.action === "deleted" ? "🗑削除" : log.action === "time_edited" ? "🕒時刻修正" : "🆕作成"}
                    </span>
                    <span className="font-bold text-gray-200 truncate">{log.tab_name}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {log.business_date}（営業日）・
                    {new Date(log.created_at).toLocaleString("ja-JP", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {log.guest_count != null && ` ・${log.guest_count}名`}
                  </div>
                  {log.note && <div className="text-xs text-gold mt-0.5">{log.note}</div>}
                </div>
                {log.action === "deleted" && log.total_amount != null && (
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-rose">¥{log.total_amount.toLocaleString()}</div>
                    {log.item_count != null && <div className="text-xs text-gray-500">{log.item_count}点</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="text-xs text-gray-500 mt-1">
          削除は元に戻せないため、会計前後にかかわらず削除時点の点数・金額を記録しています（直近100件まで表示）
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <SectionHeader icon={<LockSectionIcon />}>オーナー専用：店舗情報</SectionHeader>
        {!ownerUnlocked ? (
          <button
            onClick={openOwnerLock}
            className="w-full rounded-xl border border-dashed border-gold/50 text-gold py-4 text-sm font-bold"
          >
            🔒 タップして暗証番号を入力
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center gap-2">
              <div className="text-xs text-gray-500">
                各スタッフの基本給・特別手当（入力欄は参照情報のみで、歩合・時給の自動計算には含まれません。下の合計にはその場で今月の歩合を足しています）
              </div>
              <button
                onClick={() => setOwnerUnlocked(false)}
                className="text-xs text-gray-400 shrink-0"
              >
                🔒ロックする
              </button>
            </div>
            {staff.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line text-xs text-gray-500 text-center py-6">
                スタッフが未登録です
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
                  {staff.map((s) => {
                    const draft = salaryDrafts[s.id] ?? { base: "", allowance: "" };
                    const dirty =
                      draft.base !== (s.base_salary != null ? String(s.base_salary) : "") ||
                      draft.allowance !== (s.special_allowance != null ? String(s.special_allowance) : "");
                    const commission = monthCommission.find((c) => c.staffId === s.id)?.commission ?? 0;
                    const total = (s.base_salary ?? 0) + (s.special_allowance ?? 0) + commission;
                    return (
                      <div key={s.id} className="px-3 py-2.5 space-y-1.5">
                        <div className="text-sm font-bold text-gray-200">{s.name}</div>
                        <div className="flex gap-2 items-center">
                          <input
                            value={draft.base}
                            onChange={(e) =>
                              setSalaryDrafts((d) => ({ ...d, [s.id]: { ...draft, base: e.target.value } }))
                            }
                            placeholder="基本給(任意)"
                            inputMode="numeric"
                            className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
                          />
                          <input
                            value={draft.allowance}
                            onChange={(e) =>
                              setSalaryDrafts((d) => ({ ...d, [s.id]: { ...draft, allowance: e.target.value } }))
                            }
                            placeholder="特別手当(任意)"
                            inputMode="numeric"
                            className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
                          />
                          <button
                            onClick={() => saveSalary(s.id)}
                            disabled={!dirty}
                            className="text-xs rounded-md border border-line px-2 py-1.5 text-gray-300 disabled:opacity-40 shrink-0"
                          >
                            保存
                          </button>
                        </div>
                        {!monthCommissionLoaded ? (
                          <div className="text-xs text-gray-500">今月の歩合を読み込み中...</div>
                        ) : (
                          <div className="text-xs text-gray-400 font-mono">
                            今月の歩合 ¥{Math.round(commission).toLocaleString()} ・ 人件費合計{" "}
                            <span className="text-gold font-bold">¥{Math.round(total).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {monthCommissionLoaded && (
                  <div className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-200">人件費 合計（今月・全スタッフ）</span>
                    <span className="font-mono font-bold text-gold text-base">
                      ¥
                      {Math.round(
                        staff.reduce(
                          (a, s) =>
                            a +
                            (s.base_salary ?? 0) +
                            (s.special_allowance ?? 0) +
                            (monthCommission.find((c) => c.staffId === s.id)?.commission ?? 0),
                          0
                        )
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
              </>
            )}
            {staff.length > 0 && (
              <button
                onClick={() => {
                  setPayslipStaffId(staff[0].id);
                  setPayslipPeriod(defaultPayslipPeriod());
                  setShowPayslipPicker(true);
                }}
                className="w-full rounded-xl border border-dashed border-gold/50 text-gold py-3 text-sm font-bold"
              >
                📄 給与明細を作成
              </button>
            )}
            <button
              onClick={() => {
                setPinSetupInput("");
                setPinError("");
                setShowPinChange(true);
              }}
              className="text-xs text-gray-500 underline"
            >
              暗証番号を変更する
            </button>
            <div className="rounded-xl border border-line p-3 space-y-2">
              <div className="text-xs text-gray-500">画面ロック（この暗証番号を知らないスタッフには見せない）</div>
              <label className="flex items-center justify-between gap-2 text-sm text-gray-300">
                集計ページに鍵をかける
                <input
                  type="checkbox"
                  checked={reportPinRequired}
                  onChange={(e) => toggleReportPinRequired(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-gray-300">
                設定ページに鍵をかける
                <input
                  type="checkbox"
                  checked={settingsPinRequired}
                  onChange={(e) => toggleSettingsPinRequired(e.target.checked)}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {showOwnerLock && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowOwnerLock(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-elevated p-5 space-y-4"
          >
            {!ownerPinLoaded ? (
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
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowOwnerLock(false)}
                    className="flex-1 rounded-md border border-line py-2.5 text-sm text-gray-300"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={setupPin}
                    disabled={savingPin}
                    className="flex-1 rounded-md bg-gold text-bg py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    設定する
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-gold font-bold text-base">🔒 暗証番号を入力</div>
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
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowOwnerLock(false)}
                    className="flex-1 rounded-md border border-line py-2.5 text-sm text-gray-300"
                  >
                    キャンセル
                  </button>
                  <button onClick={submitPin} className="flex-1 rounded-md bg-gold text-bg py-2.5 text-sm font-bold">
                    開く
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showPinChange && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowPinChange(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-elevated p-5 space-y-4"
          >
            <div className="text-gold font-bold text-base">🔒 暗証番号を変更</div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinSetupInput}
              onChange={(e) => {
                setPinSetupInput(e.target.value);
                setPinError("");
              }}
              placeholder="新しい暗証番号（4桁以上）"
              className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-lg tracking-widest text-center"
            />
            {pinError && <div className="text-xs text-rose">{pinError}</div>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowPinChange(false)}
                className="flex-1 rounded-md border border-line py-2.5 text-sm text-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={changePin}
                disabled={savingPin}
                className="flex-1 rounded-md bg-gold text-bg py-2.5 text-sm font-bold disabled:opacity-50"
              >
                変更する
              </button>
            </div>
          </div>
        </div>
      )}

      {showPayslipPicker && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowPayslipPicker(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-elevated p-5 space-y-4"
          >
            <div className="text-gold font-bold text-base">📄 給与明細を作成</div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">スタッフ</label>
              <select
                value={payslipStaffId}
                onChange={(e) => setPayslipStaffId(e.target.value)}
                className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-sm"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {payCycle === "monthly" ? "対象月" : payCycle === "weekly" ? "週の開始日" : "対象日"}
              </label>
              <input
                type={payCycle === "monthly" ? "month" : "date"}
                value={payslipPeriod}
                onChange={(e) => setPayslipPeriod(e.target.value)}
                className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-sm"
              />
              {payCycle === "weekly" && (
                <div className="text-xs text-gray-500 mt-1">この日から7日間が対象になります</div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPayslipPicker(false)}
                className="flex-1 rounded-md border border-line py-2.5 text-sm text-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={generatePayslip}
                disabled={generatingPayslip || !payslipStaffId || !payslipPeriod}
                className="flex-1 rounded-md bg-gold text-bg py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {generatingPayslip ? "作成中..." : "作成する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {payslipData && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #payslip-print-area, #payslip-print-area * { visibility: visible; }
              #payslip-print-area { position: absolute; top: 0; left: 0; width: 100%; }
            }
          `}</style>
          <div className="fixed inset-0 z-50 bg-bg overflow-y-auto p-4 print:p-0 print:bg-white">
            <div className="max-w-lg mx-auto flex justify-end gap-2 mb-4 print:hidden">
              <button
                onClick={() => setPayslipData(null)}
                className="rounded-md border border-line py-2 px-4 text-sm text-gray-300"
              >
                閉じる
              </button>
              <button
                onClick={downloadPayslipPdf}
                disabled={downloadingPdf}
                className="rounded-md bg-gold text-bg py-2 px-4 text-sm font-bold disabled:opacity-50"
              >
                {downloadingPdf ? "作成中..." : "📥 PDFをダウンロード"}
              </button>
            </div>
            <div
              id="payslip-print-area"
              className="max-w-lg mx-auto bg-white text-black rounded-xl p-8 space-y-6"
            >
              <div className="text-center space-y-1">
                <div className="text-xl font-bold">給与支給明細書</div>
                <div className="text-sm text-gray-600">{storeName}</div>
              </div>
              <div className="flex justify-between items-baseline border-b border-gray-300 pb-3 text-sm">
                <span className="font-bold">{payslipData.staffName} 様</span>
                <span>{payslipData.monthLabel}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-200">
                    <td className="py-2.5">基本給</td>
                    <td className="py-2.5 text-right font-mono">¥{Math.round(payslipData.base).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2.5">特別手当</td>
                    <td className="py-2.5 text-right font-mono">
                      ¥{Math.round(payslipData.allowance).toLocaleString()}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <td className="py-1.5">個人総売上（歩合の元）</td>
                    <td className="py-1.5 text-right font-mono">
                      ¥{Math.round(payslipData.personalSales).toLocaleString()}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2.5">歩合給</td>
                    <td className="py-2.5 text-right font-mono">
                      ¥{Math.round(payslipData.commission).toLocaleString()}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2.5">時給分（{payslipData.hourlyHours.toFixed(1)}時間）</td>
                    <td className="py-2.5 text-right font-mono">
                      ¥{Math.round(payslipData.hourlyCost).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td className="pt-4 font-bold">支給合計</td>
                    <td className="pt-4 text-right font-mono font-bold text-lg">
                      ¥{Math.round(payslipData.total).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="text-xs text-gray-500 pt-4 border-t border-gray-300">
                ※ 所得税・住民税・社会保険料等の控除は含まれていません。必要な場合は別途計算・記載してください。
              </div>
              <div className="text-xs text-gray-400">
                発行日:{" "}
                {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </OwnerPinGate>
  );
}
