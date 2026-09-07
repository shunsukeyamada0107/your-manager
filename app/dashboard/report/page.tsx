"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { signExpenseReceipts } from "@/lib/receiptStorage";
import { useStore } from "@/lib/StoreContext";
import { OwnerPinGate } from "@/lib/OwnerPinGate";
import { useBusinessDate } from "@/lib/BusinessDateContext";
import { DateBar } from "@/lib/DateBar";
import {
  Staff,
  Attendance,
  Expense,
  TabWithItems,
  DaySummary,
  HourlyLaborRow,
  StaffCommission,
  PAYMENT_METHOD_EMOJI,
  PAYMENT_METHOD_LABELS,
  itemSubtotal,
  tabSubtotal,
  tabDiscountAmount,
  tabTax,
  tabTotal,
  daySummary,
  staffCommissionBreakdown,
  hourlyLaborBreakdown,
  commissionTaxBasisResolver,
  totalSalesCommissionStaff,
  commissionRateResolver,
} from "@/lib/types";
import { generateInsights } from "@/lib/insights";
import { MonthlySalesChart, ChartPoint } from "@/lib/MonthlySalesChart";
import { DEFAULT_REPORT_TEMPLATE, renderReportTemplate } from "@/lib/reportTemplate";

type DayRow = { date: string; tabCount: number; guestCount: number } & DaySummary;

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString()}`;
}

function monthRange(d: Date) {
  const year = d.getFullYear();
  const month = d.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  return { start, end, label: `${year}年${month + 1}月` };
}

function pctChange(now: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

// 平均滞在時間：会計済みの伝票のみ対象（来店〜退店の実測時間）
function avgStayMinutes(rows: TabWithItems[]): number | null {
  const durations = rows
    .filter((t) => t.closed_at)
    .map((t) => (new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime()) / 60000)
    .filter((m) => m >= 0);
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

function formatMinutes(mins: number): string {
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

type RepeatCustomerRow = { name: string; visits: number; total: number; lastVisit: string };

const REPEAT_NAME_SIMILARITY_THRESHOLD = 0.8;

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// 編集距離ベースの類似度（1 = 完全一致、0 = 全く別の文字列）
function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// 伝票名を8割以上一致する表記ゆれ（タイポ・送り仮名違い等）ごとにまとめて来店回数・累計売上を集計し、
// 2回以上来店したグループだけを返す（グループ名は最初に登場した表記を代表として使う）
function buildRepeatCustomers(rows: TabWithItems[], taxRate: number): RepeatCustomerRow[] {
  const clusters: RepeatCustomerRow[] = [];
  rows.forEach((t) => {
    const key = t.name.trim();
    if (!key) return;
    const amount = tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount);
    const cluster = clusters.find((c) => nameSimilarity(c.name, key) >= REPEAT_NAME_SIMILARITY_THRESHOLD);
    if (cluster) {
      cluster.visits += 1;
      cluster.total += amount;
      if (t.created_at > cluster.lastVisit) cluster.lastVisit = t.created_at;
    } else {
      clusters.push({ name: key, visits: 1, total: amount, lastVisit: t.created_at });
    }
  });
  return clusters.filter((r) => r.visits >= 2).sort((a, b) => b.visits - a.visits || b.total - a.total);
}

type GenderTotals = { male: number; female: number; trackedTabs: number; totalTabs: number };

// 男女の内訳が入力された伝票だけを対象に集計（未入力の伝票は集計対象外）
function genderTotals(rows: TabWithItems[]): GenderTotals {
  let male = 0;
  let female = 0;
  let trackedTabs = 0;
  rows.forEach((t) => {
    if (t.guest_count_male != null || t.guest_count_female != null) {
      male += t.guest_count_male ?? 0;
      female += t.guest_count_female ?? 0;
      trackedTabs += 1;
    }
  });
  return { male, female, trackedTabs, totalTabs: rows.length };
}

type CustomerGroup = { name: string; visits: number; total: number; avg: number; firstVisit: string; lastVisit: string };

// 検索結果（あいまい検索でヒットした伝票）を名前ごとにまとめ、来店回数・累計/平均額・初回/最終来店日を出す
function groupCustomerResults(rows: TabWithItems[], taxRate: number): CustomerGroup[] {
  const byName = new Map<string, CustomerGroup>();
  rows.forEach((t) => {
    const key = t.name.trim();
    if (!key) return;
    const amount = tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount);
    const existing = byName.get(key);
    if (existing) {
      existing.visits += 1;
      existing.total += amount;
      if (t.created_at < existing.firstVisit) existing.firstVisit = t.created_at;
      if (t.created_at > existing.lastVisit) existing.lastVisit = t.created_at;
    } else {
      byName.set(key, { name: key, visits: 1, total: amount, avg: 0, firstVisit: t.created_at, lastVisit: t.created_at });
    }
  });
  return Array.from(byName.values())
    .map((g) => ({ ...g, avg: g.total / g.visits }))
    .sort((a, b) => b.visits - a.visits || b.total - a.total);
}

const GENDER_COLOR_MALE = "#5B9EF3";
const GENDER_COLOR_FEMALE = "#E579A3";

function GenderRatioBar({ gender }: { gender: GenderTotals }) {
  const total = gender.male + gender.female;
  if (total === 0) {
    return (
      <div className="text-xs text-gray-500 text-center py-3 border border-dashed border-line rounded-lg">
        男女の内訳が入力された伝票がまだありません
      </div>
    );
  }
  const malePct = (gender.male / total) * 100;
  const femalePct = (gender.female / total) * 100;
  return (
    <>
      <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-bg2">
        <div style={{ width: `${malePct}%`, backgroundColor: GENDER_COLOR_MALE }} />
        <div style={{ width: `${femalePct}%`, backgroundColor: GENDER_COLOR_FEMALE }} />
      </div>
      <div className="flex justify-between text-[11px] text-gray-400 mt-1.5">
        <span>
          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: GENDER_COLOR_MALE }} />
          男性 {gender.male}名（{Math.round(malePct)}%）
        </span>
        <span>
          女性 {gender.female}名（{Math.round(femalePct)}%）
          <span className="inline-block w-1.5 h-1.5 rounded-full ml-1" style={{ backgroundColor: GENDER_COLOR_FEMALE }} />
        </span>
      </div>
      <div className="text-[11px] text-gray-500 mt-1">
        入力済 {gender.trackedTabs}/{gender.totalTabs}件
      </div>
    </>
  );
}

type SectionTone = "gold" | "blue";

function SectionHeader({
  icon,
  tone = "gold",
  right,
  children,
}: {
  icon: React.ReactNode;
  tone?: SectionTone;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const badge = tone === "blue" ? "bg-[#6FB3E0]/12 text-[#6FB3E0]" : "bg-gold/12 text-gold";
  return (
    <div className={`flex items-center justify-between gap-2.5 ${right ? "" : "mb-3"}`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-full ${badge} flex items-center justify-center shrink-0`}>{icon}</span>
        <span className="font-extrabold text-base">{children}</span>
      </div>
      {right}
    </div>
  );
}

function CalendarSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function CashSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 6v12M18 6v12" />
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

function LightbulbSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 21h4M8 14a5 5 0 1 1 8 0c-.9 1-1.3 1.6-1.3 2.7H9.3c0-1.1-.4-1.7-1.3-2.7Z" />
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

function ListSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
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

function RepeatSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2.1 21 6l-4 3.9" />
      <path d="M3 12.5a9 9 0 0 1 15-6.7l3 3.2" />
      <path d="M7 21.9 3 18l4-3.9" />
      <path d="M21 11.5a9 9 0 0 1-15 6.7l-3-3.2" />
    </svg>
  );
}

function GenderSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="15" r="5" />
      <path d="M16.5 3h4.5v4.5M20.5 3.5 14 10" />
    </svg>
  );
}

function SearchSectionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

type LaborRow = {
  staffId: string;
  name: string;
  hours: number | null;
  wage: number | null;
  hourlyCost: number | null;
  salesWithTax: number | null;
  commission: number | null;
  salesBack: number | null;
  drinkBack: number | null;
  drinkCount: number | null;
  total: number;
};

// 時給人件費と歩合給を人別にまとめる（両方持つ人はどちらも表示）
function buildLaborRows(hourly: HourlyLaborRow[], comm: StaffCommission[], staffList: Staff[]): LaborRow[] {
  const ids = Array.from(
    new Set([...hourly.map((h) => h.staffId), ...comm.map((c) => c.staffId).filter((id): id is string => !!id)])
  );
  return ids
    .map((id) => {
      const h = hourly.find((x) => x.staffId === id) ?? null;
      const c = comm.find((x) => x.staffId === id) ?? null;
      return {
        staffId: id,
        name: h?.name ?? c?.name ?? "(元スタッフ)",
        hours: h?.hours ?? null,
        wage: staffList.find((s) => s.id === id)?.hourly_wage ?? null,
        hourlyCost: h?.cost ?? null,
        salesWithTax: c?.salesWithTax ?? null,
        commission: c?.commission ?? null,
        salesBack: c?.salesBack ?? null,
        drinkBack: c?.drinkBack ?? null,
        drinkCount: c?.drinkCount ?? null,
        total: (h?.cost ?? 0) + (c?.commission ?? 0),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export default function ReportPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    storeId,
    storeName,
    taxRate,
    commissionRate,
    reportTemplate,
    cashFloatAmount,
    commissionScheme,
    drinkBackAmount,
    commissionTaxBasis,
    showInsights,
    reportPinRequired,
    loading: storeLoading,
  } = useStore();
  const { date: businessDate, isToday } = useBusinessDate();
  const { start: monthStart, end: monthEnd, label: monthLabel } = monthRange(new Date(`${businessDate}T12:00:00`));
  const prevMonthAnchor = new Date(`${monthStart}T12:00:00`);
  prevMonthAnchor.setMonth(prevMonthAnchor.getMonth() - 1);
  const { start: prevMonthStart, end: prevMonthEnd, label: prevMonthLabel } = monthRange(prevMonthAnchor);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [tabs, setTabs] = useState<TabWithItems[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthRows, setMonthRows] = useState<DayRow[]>([]);
  const [monthTabsRaw, setMonthTabsRaw] = useState<TabWithItems[]>([]);
  const [monthAttRaw, setMonthAttRaw] = useState<Attendance[]>([]);
  const [monthExpRaw, setMonthExpRaw] = useState<Expense[]>([]);
  const [exporting, setExporting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [copyLabel, setCopyLabel] = useState("コピーする");
  const [showChart, setShowChart] = useState(false);
  const [selectedChartDate, setSelectedChartDate] = useState<string | null>(null);
  const [showCostChart, setShowCostChart] = useState(false);
  const [selectedCostDate, setSelectedCostDate] = useState<string | null>(null);
  const [prevMonthSummary, setPrevMonthSummary] = useState<DaySummary | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<TabWithItems[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [viewingTab, setViewingTab] = useState<TabWithItems | null>(null);

  const loadData = useCallback(async () => {
    if (!storeId) return;
    const { data: staffData } = await supabase.from("staff").select("*").eq("store_id", storeId);
    setStaff(staffData ?? []);

    const { data: tabsData } = await supabase
      .from("tabs")
      .select("*, tab_items(*)")
      .eq("store_id", storeId)
      .eq("business_date", businessDate);
    setTabs((tabsData as TabWithItems[]) ?? []);

    const { data: attData } = await supabase
      .from("attendance")
      .select("*")
      .eq("store_id", storeId)
      .eq("business_date", businessDate);
    setAttendance(attData ?? []);

    const { data: expData } = await supabase
      .from("expenses")
      .select("*")
      .eq("store_id", storeId)
      .eq("business_date", businessDate);
    setExpenses(await signExpenseReceipts(supabase, expData ?? []));

    const [
      { data: monthTabs },
      { data: monthAtt },
      { data: monthExp },
      { data: prevTabs },
      { data: prevAtt },
      { data: prevExp },
    ] = await Promise.all([
      supabase
        .from("tabs")
        .select("*, tab_items(*)")
        .eq("store_id", storeId)
        .gte("business_date", monthStart)
        .lte("business_date", monthEnd),
      supabase
        .from("attendance")
        .select("*")
        .eq("store_id", storeId)
        .gte("business_date", monthStart)
        .lte("business_date", monthEnd),
      supabase
        .from("expenses")
        .select("*")
        .eq("store_id", storeId)
        .gte("business_date", monthStart)
        .lte("business_date", monthEnd),
      supabase
        .from("tabs")
        .select("*, tab_items(*)")
        .eq("store_id", storeId)
        .gte("business_date", prevMonthStart)
        .lte("business_date", prevMonthEnd),
      supabase
        .from("attendance")
        .select("*")
        .eq("store_id", storeId)
        .gte("business_date", prevMonthStart)
        .lte("business_date", prevMonthEnd),
      supabase
        .from("expenses")
        .select("*")
        .eq("store_id", storeId)
        .gte("business_date", prevMonthStart)
        .lte("business_date", prevMonthEnd),
    ]);

    const dates = new Set<string>();
    (monthTabs ?? []).forEach((t: TabWithItems) => dates.add(t.business_date));
    (monthAtt ?? []).forEach((a: Attendance) => dates.add(a.business_date));
    (monthExp ?? []).forEach((e: Expense) => dates.add(e.business_date));

    const staffNameOf = (staffId: string | null) => {
      if (!staffId) return "未設定";
      const s = (staffData ?? []).find((x) => x.id === staffId);
      return s ? s.name : "(元スタッフ)";
    };
    const isEligibleOf = (staffId: string) => (staffData ?? []).find((x) => x.id === staffId)?.commission_eligible ?? true;
    const taxBasisOfMonth = commissionTaxBasisResolver(staffData ?? [], commissionTaxBasis);
    const totalSalesStaffOfMonth = totalSalesCommissionStaff(staffData ?? []);
    const commissionRateOfMonth = commissionRateResolver(staffData ?? [], commissionRate);

    const rows: DayRow[] = Array.from(dates)
      .sort()
      .map((date) => {
        const dTabs = ((monthTabs ?? []) as TabWithItems[]).filter((t) => t.business_date === date);
        const dAtt = ((monthAtt ?? []) as Attendance[]).filter((a) => a.business_date === date);
        const dExp = ((monthExp ?? []) as Expense[]).filter((e) => e.business_date === date);
        const tabCount = dTabs.length;
        const guestCount = dTabs.reduce((a, t) => a + (t.guest_count ?? 0), 0);
        return {
          date,
          tabCount,
          guestCount,
          ...daySummary(
            dTabs,
            dAtt,
            dExp,
            staffNameOf,
            taxRate,
            commissionRate,
            commissionScheme,
            drinkBackAmount,
            isEligibleOf,
            taxBasisOfMonth,
            totalSalesStaffOfMonth,
            commissionRateOfMonth
          ),
        };
      });
    setMonthRows(rows);
    setMonthTabsRaw((monthTabs as TabWithItems[]) ?? []);
    setMonthAttRaw((monthAtt as Attendance[]) ?? []);
    setMonthExpRaw(await signExpenseReceipts(supabase, (monthExp as Expense[]) ?? []));
    setPrevMonthSummary(
      daySummary(
        (prevTabs as TabWithItems[]) ?? [],
        (prevAtt as Attendance[]) ?? [],
        (prevExp as Expense[]) ?? [],
        staffNameOf,
        taxRate,
        commissionRate,
        commissionScheme,
        drinkBackAmount,
        isEligibleOf,
        taxBasisOfMonth,
        totalSalesStaffOfMonth,
        commissionRateOfMonth
      )
    );
  }, [
    storeId,
    businessDate,
    monthStart,
    monthEnd,
    prevMonthStart,
    prevMonthEnd,
    taxRate,
    commissionRate,
    commissionScheme,
    drinkBackAmount,
    commissionTaxBasis,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 顧客検索：名前のあいまい検索で、日付を問わず全期間の伝票から探す（デバウンス付き）
  useEffect(() => {
    setExpandedCustomer(null);
    if (!storeId || !customerQuery.trim()) {
      setCustomerResults([]);
      setSearchingCustomer(false);
      return;
    }
    const query = customerQuery.trim();
    setSearchingCustomer(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("tabs")
        .select("*, tab_items(*)")
        .eq("store_id", storeId)
        .ilike("name", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(300);
      setCustomerResults((data as TabWithItems[]) ?? []);
      setSearchingCustomer(false);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQuery, storeId]);

  function staffName(staffId: string | null) {
    if (!staffId) return "未設定";
    const s = staff.find((x) => x.id === staffId);
    return s ? s.name : "(元スタッフ)";
  }

  // 伝票内の品目を実担当（個別指定があればそれ、無ければ伝票の担当）ごとに集計する。
  // 伝票の👤表示だけでは品目レベルの個別指定が見えず、歩合の数字と食い違って見える原因になるため、
  // 複数人にまたがる伝票はここで内訳を出せるようにする
  function tabStaffBreakdown(t: TabWithItems) {
    const byStaff = new Map<string | null, number>();
    t.tab_items.forEach((i) => {
      const effectiveStaffId = i.staff_id ?? t.staff_id;
      byStaff.set(effectiveStaffId, (byStaff.get(effectiveStaffId) ?? 0) + itemSubtotal(i));
    });
    return Array.from(byStaff.entries())
      .map(([staffId, amount]) => ({ staffId, name: staffName(staffId), amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  function isEligible(staffId: string) {
    return staff.find((x) => x.id === staffId)?.commission_eligible ?? true;
  }
  const taxBasisOf = commissionTaxBasisResolver(staff, commissionTaxBasis);
  const totalSalesStaffList = totalSalesCommissionStaff(staff);
  const commissionRateOf = commissionRateResolver(staff, commissionRate);

  const summary = daySummary(
    tabs,
    attendance,
    expenses,
    staffName,
    taxRate,
    commissionRate,
    commissionScheme,
    drinkBackAmount,
    isEligible,
    taxBasisOf,
    totalSalesStaffList,
    commissionRateOf
  );
  const commission = staffCommissionBreakdown(
    tabs,
    staffName,
    taxRate,
    commissionRate,
    commissionScheme,
    drinkBackAmount,
    isEligible,
    taxBasisOf,
    totalSalesStaffList,
    commissionRateOf
  );
  const hourlyLabor = hourlyLaborBreakdown(attendance, staffName);
  const laborRows = buildLaborRows(hourlyLabor, commission, staff);
  const tabRows = [...tabs].sort(
    (a, b) => Number(!!a.closed_at) - Number(!!b.closed_at) || tabSubtotal(b.tab_items) - tabSubtotal(a.tab_items)
  );
  const insights = generateInsights(summary, tabs, expenses, commission, monthRows);

  const monthTotal = monthRows.reduce(
    (a, r) => ({
      subtotal: a.subtotal + r.subtotal,
      tax: a.tax + r.tax,
      roundingAdjustment: a.roundingAdjustment + r.roundingAdjustment,
      total: a.total + r.total,
      laborHourly: a.laborHourly + r.laborHourly,
      commissionTotal: a.commissionTotal + r.commissionTotal,
      labor: a.labor + r.labor,
      expense: a.expense + r.expense,
      profit: a.profit + r.profit,
      cash: a.cash + r.cash,
      card: a.card + r.card,
      unsettled: a.unsettled + r.unsettled,
      tabCount: a.tabCount + r.tabCount,
      guestCount: a.guestCount + r.guestCount,
    }),
    {
      subtotal: 0,
      tax: 0,
      roundingAdjustment: 0,
      total: 0,
      laborHourly: 0,
      commissionTotal: 0,
      labor: 0,
      expense: 0,
      profit: 0,
      cash: 0,
      card: 0,
      unsettled: 0,
      tabCount: 0,
      guestCount: 0,
    }
  );

  const monthCommission = staffCommissionBreakdown(
    monthTabsRaw,
    staffName,
    taxRate,
    commissionRate,
    commissionScheme,
    drinkBackAmount,
    isEligible,
    taxBasisOf,
    totalSalesStaffList,
    commissionRateOf
  );
  const monthHourlyLabor = hourlyLaborBreakdown(monthAttRaw, staffName);
  const monthLaborRows = buildLaborRows(monthHourlyLabor, monthCommission, staff);

  const todayAvgStay = avgStayMinutes(tabs);
  const monthAvgStay = avgStayMinutes(monthTabsRaw);
  const repeatCustomers = buildRepeatCustomers(monthTabsRaw, taxRate);
  const customerGroups = groupCustomerResults(customerResults, taxRate);
  const monthGender = genderTotals(monthTabsRaw);

  // 月間売上グラフ用：その月の1日〜末日まで欠けなく並べる（記録が無い日は0）
  function buildChartSeries(): ChartPoint[] {
    const [monthYear, monthNum] = monthStart.split("-").map(Number);
    const daysInMonth = new Date(monthYear, monthNum, 0).getDate();
    const rowByDate = new Map(monthRows.map((r) => [r.date, r]));
    const series: ChartPoint[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`;
      series.push({ day, date, total: rowByDate.get(date)?.total ?? 0 });
    }
    return series;
  }
  const chartSeries = buildChartSeries();
  const selectedChartRow = selectedChartDate ? monthRows.find((r) => r.date === selectedChartDate) : null;

  // 原価（経費）グラフ用：日ごとの経費合計
  function buildCostSeries(): ChartPoint[] {
    const [monthYear, monthNum] = monthStart.split("-").map(Number);
    const daysInMonth = new Date(monthYear, monthNum, 0).getDate();
    const rowByDate = new Map(monthRows.map((r) => [r.date, r]));
    const series: ChartPoint[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`;
      series.push({ day, date, total: rowByDate.get(date)?.expense ?? 0 });
    }
    return series;
  }
  const costSeries = buildCostSeries();
  const selectedCostReceipts = selectedCostDate
    ? monthExpRaw.filter((e) => e.business_date === selectedCostDate && e.receipt_url)
    : [];

  function buildReportText() {
    const [, m, d] = businessDate.split("-").map(Number);
    const [, monM] = monthStart.split("-").map(Number);

    const coupon50Today = tabRows.filter((t) => t.discount_percent === 50).length;
    const coupon50Month = monthTabsRaw.filter((t) => t.discount_percent === 50).length;
    const monthUnsettled = monthTabsRaw.filter((t) => !t.closed_at);

    const tokens: Record<string, string> = {
      date: `${m}/${d}`,
      sales: yen(summary.total),
      expense: yen(summary.expense),
      profit: yen(summary.profit),
      card: yen(summary.card),
      tab_count: String(tabRows.length),
      guest_count: String(tabs.reduce((a, t) => a + (t.guest_count ?? 0), 0)),
      coupon50: String(coupon50Today),
      hourly_hours:
        hourlyLabor.length > 0 ? hourlyLabor.map((h) => `${h.name} ${h.hours.toFixed(1)}h`).join("\n") : "　",
      hourly_cost: hourlyLabor.length > 0 ? hourlyLabor.map((h) => `${h.name} ${yen(h.cost)}`).join("\n") : "　",
      commission:
        commission.length > 0
          ? commission.map((c) => `${c.name} ${yen(c.commission)}（${yen(c.salesWithTax)}）`).join("\n")
          : "　",
      month_range: `${monM}/1〜${m}/${d}`,
      month_num: String(m),
      month_sales: yen(monthTotal.total),
      month_expense: yen(monthTotal.expense),
      month_profit: yen(monthTotal.profit),
      month_card: yen(monthTotal.card),
      month_tab_count: String(monthTotal.tabCount),
      month_guest_count: String(monthTotal.guestCount),
      month_coupon50: String(coupon50Month),
      month_hourly:
        monthHourlyLabor.length > 0
          ? monthHourlyLabor.map((h) => `${h.name}  ${h.hours.toFixed(1)}h${yen(h.cost)}`).join("\n")
          : "　",
      month_commission:
        monthCommission.length > 0
          ? monthCommission.map((c) => `${c.name}${yen(c.commission)}（${yen(c.salesWithTax)}）`).join("\n")
          : "　",
      month_unsettled:
        monthUnsettled.length > 0
          ? monthUnsettled
              .map((t) => `${t.name}${yen(tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount))}`)
              .join("\n")
          : "　",
    };

    return renderReportTemplate(reportTemplate ?? DEFAULT_REPORT_TEMPLATE, tokens);
  }

  async function copyReportText() {
    try {
      await navigator.clipboard.writeText(buildReportText());
      setCopyLabel("コピーしました！");
      setTimeout(() => setCopyLabel("コピーする"), 2000);
    } catch {
      setCopyLabel("コピーできませんでした");
      setTimeout(() => setCopyLabel("コピーする"), 2000);
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();

      const GOLD = "FFDCA84E";
      const DARK = "FF11142A";
      const BAND = "FFE0F7FA";
      const ROSE = "FFCE5468";
      const BORDER: import("exceljs").Border = { style: "thin", color: { argb: "FFDDDDDD" } };

      const styleHeaderRow = (row: import("exceljs").Row) => {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
          cell.font = { bold: true, color: { argb: DARK } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
        });
      };

      const styleDataRow = (row: import("exceljs").Row, banded: boolean) => {
        row.eachCell((cell) => {
          if (banded) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
          cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
        });
      };

      // --- 日報サマリー ---
      const summarySheet = wb.addWorksheet("日報サマリー");
      summarySheet.columns = [{ width: 18 }, { width: 16 }];
      const titleRow = summarySheet.addRow(["日報", businessDate]);
      titleRow.font = { bold: true, size: 13, color: { argb: GOLD } };
      summarySheet.addRow([]);
      const summaryData: [string, number][] = [
        ["小計(税抜)", Math.round(summary.subtotal)],
        ["消費税", Math.round(summary.tax)],
        ["合計(税込)", Math.round(summary.total)],
        ["人件費（歩合給+時給）", Math.round(summary.labor)],
        ["経費", Math.round(summary.expense)],
        ["粗利", Math.round(summary.profit)],
      ];
      summaryData.forEach(([label, value]) => {
        const row = summarySheet.addRow([label, value]);
        row.getCell(2).numFmt = '"¥"#,##0';
        if (label === "粗利") row.font = { bold: true, color: { argb: GOLD } };
      });
      summarySheet.addRow([]);
      [
        ["現金", Math.round(summary.cash)],
        ["カード", Math.round(summary.card)],
        ["未会計", Math.round(summary.unsettled)],
      ].forEach(([label, value]) => {
        const row = summarySheet.addRow([label, value]);
        row.getCell(2).numFmt = '"¥"#,##0';
      });

      // --- 伝票別 ---
      const tabSheet = wb.addWorksheet("伝票別");
      tabSheet.columns = [
        { header: "伝票名", key: "name", width: 16 },
        { header: "担当スタッフ", key: "staff", width: 14 },
        { header: "状態", key: "status", width: 10 },
        { header: "会計方法", key: "method", width: 10 },
        { header: "来店", key: "in", width: 10 },
        { header: "退店", key: "out", width: 10 },
        { header: "品数", key: "count", width: 8 },
        { header: "小計", key: "subtotal", width: 12 },
        { header: "消費税", key: "tax", width: 12 },
        { header: "合計", key: "total", width: 12 },
      ];
      styleHeaderRow(tabSheet.getRow(1));
      tabRows.forEach((t, i) => {
        const row = tabSheet.addRow({
          name: t.name,
          staff: staffName(t.staff_id),
          status: t.closed_at ? "会計済み" : "対応中",
          method: t.payment_method ? PAYMENT_METHOD_LABELS[t.payment_method] : "",
          in: new Date(t.created_at).toLocaleTimeString("ja-JP"),
          out: t.closed_at ? new Date(t.closed_at).toLocaleTimeString("ja-JP") : "",
          count: t.tab_items.reduce((a, x) => a + x.qty, 0),
          subtotal: Math.round(tabSubtotal(t.tab_items)),
          tax: Math.round(tabTax(t.tab_items, taxRate)),
          total: Math.round(tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount)),
        });
        row.getCell("subtotal").numFmt = '"¥"#,##0';
        row.getCell("tax").numFmt = '"¥"#,##0';
        row.getCell("total").numFmt = '"¥"#,##0';
        styleDataRow(row, i % 2 === 1);
      });

      // --- スタッフ別歩合 ---
      const staffSheet = wb.addWorksheet("スタッフ別歩合");
      staffSheet.columns = [
        { header: "スタッフ", key: "name", width: 14 },
        { header: "売上税抜", key: "exTax", width: 14 },
        { header: "売上税込", key: "withTax", width: 14 },
        { header: "歩合給", key: "commission", width: 14 },
      ];
      styleHeaderRow(staffSheet.getRow(1));
      commission.forEach((c, i) => {
        const row = staffSheet.addRow({
          name: c.name,
          exTax: Math.round(c.salesExTax),
          withTax: Math.round(c.salesWithTax),
          commission: Math.round(c.commission),
        });
        ["exTax", "withTax", "commission"].forEach((k) => (row.getCell(k).numFmt = '"¥"#,##0'));
        row.getCell("commission").font = { bold: true, color: { argb: GOLD } };
        styleDataRow(row, i % 2 === 1);
      });

      // --- 時給人件費 ---
      if (hourlyLabor.length > 0) {
        const hourlySheet = wb.addWorksheet("時給人件費");
        hourlySheet.columns = [
          { header: "スタッフ", key: "name", width: 14 },
          { header: "勤務時間", key: "hours", width: 12 },
          { header: "人件費", key: "cost", width: 14 },
        ];
        styleHeaderRow(hourlySheet.getRow(1));
        hourlyLabor.forEach((h, i) => {
          const row = hourlySheet.addRow({ name: h.name, hours: Number(h.hours.toFixed(1)), cost: Math.round(h.cost) });
          row.getCell("cost").numFmt = '"¥"#,##0';
          styleDataRow(row, i % 2 === 1);
        });
      }

      // --- 月の売上管理表：日ごとの売上高・原価・粗利益・組数・人数（月内の全日を1〜末日まで表示） ---
      const [monthYear, monthNum] = monthStart.split("-").map(Number);
      const daysInMonth = new Date(monthYear, monthNum, 0).getDate();
      const rowByDate = new Map(monthRows.map((r) => [r.date, r]));

      const monthSheet = wb.addWorksheet(`月次(${monthLabel})`);
      monthSheet.columns = [
        { width: 8 },
        { width: 13 },
        { width: 13 },
        { width: 13 },
        { width: 10 },
        { width: 10 },
      ];
      const titleRow2 = monthSheet.addRow(["月", storeName ?? ""]);
      titleRow2.font = { bold: true, size: 13, color: { argb: GOLD } };
      styleHeaderRow(monthSheet.addRow(["日", "売上高(税込)", "原価", "粗利益", "組数", "人数"]));

      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`;
        const r = rowByDate.get(date);
        const sales = r ? Math.round(r.total) : 0;
        const cost = r ? Math.round(r.expense) : 0;
        const row = monthSheet.addRow([day, sales, cost, sales - cost, r?.tabCount ?? 0, r?.guestCount ?? 0]);
        [2, 3, 4].forEach((c) => (row.getCell(c).numFmt = '"¥"#,##0'));
        styleDataRow(row, day % 2 === 0);
      }
      const ledgerTotalSales = Math.round(monthTotal.total);
      const ledgerTotalCost = Math.round(monthTotal.expense);
      const totalRow = monthSheet.addRow([
        "合計",
        ledgerTotalSales,
        ledgerTotalCost,
        ledgerTotalSales - ledgerTotalCost,
        monthTotal.tabCount,
        monthTotal.guestCount,
      ]);
      totalRow.font = { bold: true };
      totalRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
        cell.font = { bold: true, color: { argb: DARK } };
      });
      [2, 3, 4].forEach((c) => (totalRow.getCell(c).numFmt = '"¥"#,##0'));

      // --- 人件費（人別・今月）：月次シートとは別のシートに独立させる ---
      const monthLaborSheet = wb.addWorksheet(`人件費(${monthLabel})`);
      monthLaborSheet.columns = [
        { header: "スタッフ", key: "name", width: 14 },
        { header: "勤務時間", key: "hours", width: 12 },
        { header: "時給人件費", key: "hourlyCost", width: 14 },
        { header: "歩合給", key: "commission", width: 14 },
        { header: "合計", key: "total", width: 14 },
      ];
      styleHeaderRow(monthLaborSheet.getRow(1));
      monthLaborRows.forEach((r, i) => {
        const row = monthLaborSheet.addRow({
          name: r.name,
          hours: r.hours != null ? Number(r.hours.toFixed(1)) : "",
          hourlyCost: r.hourlyCost != null ? Math.round(r.hourlyCost) : "",
          commission: r.commission != null ? Math.round(r.commission) : "",
          total: Math.round(r.total),
        });
        ["hourlyCost", "commission", "total"].forEach((k) => (row.getCell(k).numFmt = '"¥"#,##0'));
        row.getCell("total").font = { bold: true, color: { argb: GOLD } };
        styleDataRow(row, i % 2 === 1);
      });
      const laborTotalRow = monthLaborSheet.addRow({ name: "合計", total: Math.round(monthTotal.labor) });
      laborTotalRow.font = { bold: true };
      laborTotalRow.getCell("total").numFmt = '"¥"#,##0';
      laborTotalRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
        cell.font = { bold: true, color: { argb: DARK } };
      });

      if (prevMonthSummary) {
        monthSheet.addRow([]);
        const cmpHeader = monthSheet.addRow([`${prevMonthLabel}比`, "今月", "先月", "増減%"]);
        cmpHeader.font = { bold: true };
        (
          [
            ["売上(税込)", monthTotal.total, prevMonthSummary.total],
            ["経費", monthTotal.expense, prevMonthSummary.expense],
            ["粗利", monthTotal.profit, prevMonthSummary.profit],
          ] as const
        ).forEach(([label, now, prev]) => {
          const change = pctChange(now, prev);
          const row = monthSheet.addRow([label, Math.round(now), Math.round(prev), change != null ? Math.round(change) : ""]);
          row.getCell(2).numFmt = '"¥"#,##0';
          row.getCell(3).numFmt = '"¥"#,##0';
          if (change != null) row.getCell(4).font = { color: { argb: change >= 0 ? GOLD : ROSE } };
        });
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `YourManager_${businessDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <OwnerPinGate storeId={storeId} enabled={reportPinRequired} storeLoading={storeLoading}>
    <div className="space-y-6">
      <DateBar />

      <div className="rounded-xl border border-line p-4">
        <SectionHeader icon={<SearchSectionIcon />}>顧客検索</SectionHeader>
        <input
          value={customerQuery}
          onChange={(e) => setCustomerQuery(e.target.value)}
          placeholder="お客様の名前で検索（全期間の来店履歴）"
          className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-sm mb-2"
        />
        {!customerQuery.trim() ? (
          <div className="text-xs text-gray-500 text-center py-4">
            名前を入力すると、日付を問わず全期間の来店履歴から検索します
          </div>
        ) : searchingCustomer ? (
          <div className="text-xs text-gray-500 text-center py-4">検索中...</div>
        ) : customerGroups.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
            該当するお客様が見つかりません
          </div>
        ) : (
          <div className="space-y-2">
            {customerGroups.map((g) => {
              const expanded = expandedCustomer === g.name;
              const visits = customerResults
                .filter((t) => t.name.trim() === g.name)
                .sort((a, b) => b.created_at.localeCompare(a.created_at));
              return (
                <div key={g.name} className="rounded-xl border border-line bg-elevated p-3">
                  <button
                    onClick={() => setExpandedCustomer(expanded ? null : g.name)}
                    className="w-full text-left"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-bold text-gray-200 truncate">{g.name}</span>
                      <span className="text-xs text-gold font-bold shrink-0">{g.visits}回来店</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 font-mono">
                      累計 {yen(g.total)} ・ 平均 {yen(g.avg)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      初回 {new Date(g.firstVisit).toLocaleDateString("ja-JP")} ・ 最終{" "}
                      {new Date(g.lastVisit).toLocaleDateString("ja-JP")}
                    </div>
                    <div className="text-xs text-gold mt-1.5">{expanded ? "▲ 過去の伝票を閉じる" : "▼ 過去の伝票を見る"}</div>
                  </button>
                  {expanded && (
                    <div className="mt-2 pt-2 border-t border-dashed border-line space-y-1.5">
                      {visits.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setViewingTab(t)}
                          className="w-full text-left text-xs bg-bg2 rounded-md px-2 py-1.5 active:bg-line"
                        >
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-gray-300 font-bold shrink-0">
                              {new Date(t.created_at).toLocaleDateString("ja-JP", {
                                year: "numeric",
                                month: "numeric",
                                day: "numeric",
                                weekday: "short",
                              })}
                              {t.closed_at && ` ・${PAYMENT_METHOD_EMOJI[t.payment_method ?? "cash"]}`}
                            </span>
                            <span className="font-mono text-gray-300 shrink-0">
                              {yen(tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount))}
                            </span>
                          </div>
                          <div className="text-gray-500 mt-0.5 truncate">
                            {t.tab_items.length > 0 ? t.tab_items.map((i) => i.name).join("・") : "品目なし"}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {customerResults.length >= 300 && (
              <div className="text-xs text-gray-500 text-center pt-1">
                直近300件のみ表示しています。絞り込むとより正確に集計されます
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-gold/10 border border-gold/30 p-3 space-y-4">
      <div className="rounded-xl border border-line border-l-4 border-l-gold bg-elevated p-4">
        <SectionHeader
          icon={<CalendarSectionIcon />}
          right={
            <button
              onClick={exportExcel}
              disabled={exporting}
              className="text-xs rounded-md bg-gold text-bg px-3 py-1.5 font-bold disabled:opacity-50 shrink-0"
            >
              {exporting ? "出力中..." : "Excel出力"}
            </button>
          }
        >
          {isToday ? "本日" : businessDate}の売上
        </SectionHeader>
        <div className="grid grid-cols-2 gap-y-1 text-sm font-mono mt-3">
          <span className="text-gray-400">売上（税込）</span>
          <span className="text-right">{yen(summary.total)}</span>
          <span className="text-gray-400">経費</span>
          <span className="text-right">−{yen(summary.expense)}</span>
          <span className="text-gray-300 font-bold">売上－経費</span>
          <span className="text-right text-gold font-bold">{yen(summary.total - summary.expense)}</span>
          <span className="col-span-2 text-right text-xs text-gray-500 -mt-0.5">（消費税 {yen(summary.tax)}）</span>
          <span className="text-gray-400 mt-2">現金</span>
          <span className="text-right mt-2">{yen(summary.cash)}</span>
          <span className="text-gray-400">カード</span>
          <span className="text-right">{yen(summary.card)}</span>
          <span className="text-gray-400">未会計</span>
          <span className="text-right">{yen(summary.unsettled)}</span>
          <span className="text-gray-400">平均滞在時間</span>
          <span className="text-right">{todayAvgStay != null ? formatMinutes(todayAvgStay) : "—"}</span>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-elevated p-4">
        <SectionHeader icon={<CashSectionIcon />}>現金精算</SectionHeader>
        <div className="grid grid-cols-2 gap-y-1 text-sm font-mono">
          <span className="text-gray-400">現金売上</span>
          <span className="text-right">{yen(summary.cash)}</span>
          <span className="text-gray-400">経費（現金支払い分）</span>
          <span className="text-right">−{yen(summary.expense)}</span>
          <span className="text-gray-300 font-bold">封筒に入れる現金</span>
          <span className="text-right text-gold font-bold">{yen(summary.cash - summary.expense)}</span>
          <span className="text-gray-400 mt-2">金庫に残す現金（釣り銭元金）</span>
          <span className="text-right mt-2">{yen(cashFloatAmount)}</span>
          <span className="text-gray-400">レジにあるはずの現金合計</span>
          <span className="text-right">{yen(summary.cash - summary.expense + cashFloatAmount)}</span>
        </div>
      </div>

      <div className="rounded-xl border border-line p-4">
        <SectionHeader
          icon={<PeopleSectionIcon />}
          right={<span className="text-sm font-mono text-gold font-bold">計 {yen(summary.labor)}</span>}
        >
          人件費（人別）
        </SectionHeader>
        <div className="mt-3">
        {laborRows.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
            対象者がいません
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
            {laborRows.map((r) => (
              <div key={r.staffId} className="px-3 py-2 text-sm space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 font-bold">{r.name}</span>
                  <span className="font-mono text-gold font-bold">{yen(r.total)}</span>
                </div>
                {r.hours != null && (
                  <div className="text-xs text-gray-400">
                    時間 {r.hours.toFixed(1)}h ・ 時給 {r.wage != null ? yen(r.wage) : "未設定"} ・ 人件費{" "}
                    {yen(r.hourlyCost ?? 0)}
                  </div>
                )}
                {r.salesWithTax != null && (
                  <div className="text-xs text-gray-400">担当売上 {yen(r.salesWithTax)}</div>
                )}
                {r.commission != null &&
                  (commissionScheme === "drink_back" ? (
                    <div className="text-xs text-gray-400">
                      売上バック {yen(r.salesBack ?? 0)} ・ 🍾ドリンクバック {yen(r.drinkBack ?? 0)}（{r.drinkCount ?? 0}
                      杯）
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">売上（歩合給） {yen(r.commission)}</div>
                  ))}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      <div className="rounded-xl border border-line border-l-4 border-l-gold bg-elevated p-3 flex justify-between items-center text-sm font-mono">
        <span className="text-gray-300 font-bold">粗利（売上－経費）</span>
        <span className="text-right text-gold font-bold text-base">{yen(summary.profit)}</span>
      </div>

      {showInsights && insights.length > 0 && (
        <div className="rounded-xl border border-line p-4">
          <SectionHeader icon={<LightbulbSectionIcon />}>気づき</SectionHeader>
          <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                <span className="shrink-0">
                  {ins.level === "warning" ? "⚠️" : ins.level === "positive" ? "✅" : "ℹ️"}
                </span>
                <span className="text-gray-300">{ins.text}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ※ ルールベースの自動判定です。あくまで参考情報としてご活用ください
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line p-4">
        <SectionHeader icon={<ReceiptSectionIcon />}>伝票別</SectionHeader>
        {tabRows.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
            本日の伝票はまだありません
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
            {tabRows.map((t) => {
              const breakdown = tabStaffBreakdown(t);
              const mixed = breakdown.length > 1;
              return (
                <button
                  key={t.id}
                  onClick={() => router.push(`/dashboard?tab=${t.id}`)}
                  className="w-full flex flex-col gap-0.5 px-3 py-2 text-sm text-left active:bg-bg2"
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-gray-300 truncate">
                      {t.closed_at ? (t.payment_method ? PAYMENT_METHOD_EMOJI[t.payment_method] : "💴") : "🕐"} {t.name}
                      <span className="text-xs text-gray-500">
                        {" "}
                        ・👤{mixed ? `複数（${breakdown.length}名）` : staffName(breakdown[0]?.staffId ?? t.staff_id)}
                      </span>
                    </span>
                    <span className="font-mono text-gray-400 shrink-0">
                      {yen(tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount))}
                    </span>
                  </div>
                  {mixed && (
                    <div className="text-[11px] text-gray-500 pl-5">
                      内訳: {breakdown.map((b) => `${b.name} ${yen(b.amount)}`).join(" ・ ")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      </div>

      <div className="rounded-2xl bg-[#6FB3E0]/10 border border-[#6FB3E0]/30 p-3 space-y-4">
        <div className="rounded-xl border border-line border-l-4 border-l-[#6FB3E0] bg-elevated p-4">
          <SectionHeader icon={<CalendarSectionIcon />} tone="blue">
            今月サマリー（{monthLabel}）
          </SectionHeader>
          <div className="grid grid-cols-2 gap-y-1 text-sm font-mono mt-3">
            <span className="text-gray-400">売上（税込）</span>
            <span className="text-right">{yen(monthTotal.total)}</span>
            <span className="text-gray-400">経費</span>
            <span className="text-right">−{yen(monthTotal.expense)}</span>
            <span className="text-gray-300 font-bold">売上－経費</span>
            <span className="text-right text-[#6FB3E0] font-bold">{yen(monthTotal.total - monthTotal.expense)}</span>
            <span className="col-span-2 text-right text-xs text-gray-500 -mt-0.5">（消費税 {yen(monthTotal.tax)}）</span>
            <span className="text-gray-400 mt-2">平均滞在時間</span>
            <span className="text-right mt-2">{monthAvgStay != null ? formatMinutes(monthAvgStay) : "—"}</span>
          </div>
        </div>

        <div className="rounded-xl border border-line p-4">
          <SectionHeader
            icon={<PeopleSectionIcon />}
            tone="blue"
            right={<span className="text-sm font-mono text-[#6FB3E0] font-bold">計 {yen(monthTotal.labor)}</span>}
          >
            人件費（人別・今月）
          </SectionHeader>
          <div className="mt-3">
          {monthLaborRows.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
              対象者がいません
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
              {monthLaborRows.map((r) => (
                <div key={r.staffId} className="px-3 py-2 text-sm space-y-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 font-bold">{r.name}</span>
                    <span className="font-mono text-[#6FB3E0] font-bold">{yen(r.total)}</span>
                  </div>
                  {r.hours != null && (
                    <div className="text-xs text-gray-400">
                      時間 {r.hours.toFixed(1)}h ・ 時給 {r.wage != null ? yen(r.wage) : "未設定"} ・ 人件費{" "}
                      {yen(r.hourlyCost ?? 0)}
                    </div>
                  )}
                  {r.salesWithTax != null && (
                    <div className="text-xs text-gray-400">担当売上 {yen(r.salesWithTax)}</div>
                  )}
                  {r.commission != null &&
                    (commissionScheme === "drink_back" ? (
                      <div className="text-xs text-gray-400">
                        売上バック {yen(r.salesBack ?? 0)} ・ 🍾ドリンクバック {yen(r.drinkBack ?? 0)}（
                        {r.drinkCount ?? 0}杯）
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">売上（歩合給） {yen(r.commission)}</div>
                    ))}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        <div className="rounded-xl border border-line border-l-4 border-l-[#6FB3E0] bg-elevated p-3 flex justify-between items-center text-sm font-mono">
          <span className="text-gray-300 font-bold">粗利合計（売上－経費）</span>
          <span className="text-right text-[#6FB3E0] font-bold text-base">{yen(monthTotal.profit)}</span>
        </div>

        {prevMonthSummary && (
          <div className="rounded-xl border border-line border-l-4 border-l-[#6FB3E0] bg-elevated p-3 mb-2">
            <div className="text-xs text-gray-500 mb-2">{prevMonthLabel}との比較</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm font-mono">
              {(
                [
                  ["売上(税込)", monthTotal.total, prevMonthSummary.total],
                  ["経費", monthTotal.expense, prevMonthSummary.expense],
                  ["粗利", monthTotal.profit, prevMonthSummary.profit],
                ] as const
              ).map(([label, now, prev]) => {
                const change = pctChange(now, prev);
                return (
                  <Fragment key={label}>
                    <span className="text-gray-400">{label}</span>
                    <span className="text-right">
                      {yen(now)}
                      {change != null && (
                        <span className={change >= 0 ? "text-[#6FB3E0]" : "text-rose"}>
                          {" "}
                          ({change >= 0 ? "+" : ""}
                          {change.toFixed(0)}%)
                        </span>
                      )}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowChart((v) => !v)}
          className="w-full rounded-md border border-dashed border-[#6FB3E0] text-[#6FB3E0] py-2 text-sm font-bold mb-2"
        >
          {showChart ? "売上グラフを閉じる" : "月間売上グラフを見る"}
        </button>

        {showChart && (
          <div className="rounded-xl border border-line bg-elevated p-3 mb-2">
            <MonthlySalesChart series={chartSeries} onSelectDate={setSelectedChartDate} />
            {selectedChartDate && (
              <div className="mt-3 pt-3 border-t border-dashed border-line">
                {selectedChartRow ? (
                  <div className="grid grid-cols-2 gap-y-1 text-sm font-mono">
                    <span className="text-gray-400">売上（税込）</span>
                    <span className="text-right">{yen(selectedChartRow.total)}</span>
                    <span className="text-gray-400">経費</span>
                    <span className="text-right">−{yen(selectedChartRow.expense)}</span>
                    <span className="text-gray-300 font-bold">売上－経費</span>
                    <span className="text-right text-[#6FB3E0] font-bold">
                      {yen(selectedChartRow.total - selectedChartRow.expense)}
                    </span>
                    <span className="col-span-2 text-right text-xs text-gray-500 -mt-0.5">
                      （消費税 {yen(selectedChartRow.tax)}）
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 text-center">この日の記録はありません</div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setShowCostChart((v) => !v)}
          className="w-full rounded-md border border-dashed border-rose text-rose py-2 text-sm font-bold mb-2"
        >
          {showCostChart ? "原価グラフを閉じる" : "原価グラフを見る"}
        </button>

        {showCostChart && (
          <div className="rounded-xl border border-line bg-elevated p-3 mb-2">
            <MonthlySalesChart series={costSeries} onSelectDate={setSelectedCostDate} />
            {selectedCostDate && (
              <div className="mt-3 pt-3 border-t border-dashed border-line">
                <div className="text-xs text-gray-400 mb-2">{selectedCostDate}のレシート</div>
                {selectedCostReceipts.length === 0 ? (
                  <div className="text-xs text-gray-500 text-center">この日に添付されたレシート写真はありません</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {selectedCostReceipts.map((e) => (
                      <a key={e.id} href={e.receipt_url!} target="_blank" rel="noreferrer">
                        <img
                          src={e.receipt_url!}
                          alt={e.name}
                          className="w-full aspect-square object-cover rounded-md border border-line"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-line p-4">
          <SectionHeader icon={<ListSectionIcon />} tone="blue">日別</SectionHeader>
          {monthRows.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
              今月の記録はまだありません
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
              {monthRows.map((r) => (
                <div key={r.date} className="flex justify-between items-center px-3 py-2 text-sm">
                  <span className="text-gray-300">{r.date}</span>
                  <span className="font-mono text-gray-400">
                    {yen(r.total)}（粗利 {yen(r.profit)}）
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line p-4">
          <SectionHeader
            icon={<RepeatSectionIcon />}
            tone="blue"
            right={<span className="text-sm font-mono text-[#6FB3E0] font-bold">{repeatCustomers.length}名</span>}
          >
            リピーター分析（今月）
          </SectionHeader>
          {repeatCustomers.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
              今月まだ2回以上来店した名前はありません
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
              {repeatCustomers.slice(0, 10).map((r) => (
                <div key={r.name} className="flex justify-between items-center px-3 py-2 text-sm">
                  <span className="text-gray-300 truncate">{r.name}</span>
                  <span className="font-mono text-gray-400 shrink-0">
                    {r.visits}回 ・ 計{yen(r.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-2">
            伝票名が8割以上一致する表記ゆれ（タイポ等）はまとめて集計しています。全く別の方が偶然まとめられてしまう場合もあるため、参考情報としてご活用ください
          </div>
        </div>

        <div className="rounded-xl border border-line p-4">
          <SectionHeader icon={<GenderSectionIcon />} tone="blue">男女比率（今月）</SectionHeader>
          <GenderRatioBar gender={monthGender} />
        </div>
      </div>

      <button
        onClick={() => setShowReportModal(true)}
        className="w-full rounded-full bg-gradient-to-r from-rose to-gold text-white py-4 text-lg font-bold shadow-lg active:scale-95 transition-transform"
        style={{ fontFamily: "'Hiragino Maru Gothic ProN', 'Rounded Mplus 1c', sans-serif" }}
      >
        報告レポート
      </button>

      {showReportModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowReportModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl border border-line bg-elevated p-4 space-y-3"
          >
            <div className="text-gold font-bold text-base">LINE報告用レポート</div>
            <textarea
              readOnly
              value={buildReportText()}
              className="flex-1 min-h-[300px] rounded-md bg-bg2 border border-line px-3 py-2 text-xs font-mono whitespace-pre-wrap"
            />
            <div className="text-xs text-gray-500">
              ⚪の付いた男女人数・メンション等・クーポン色・家賃・カラオケ・PayPayは自動集計できないため空欄です。コピー後に手入力してください。
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowReportModal(false)}
                className="flex-1 rounded-md border border-line py-2.5 text-sm text-gray-300"
              >
                閉じる
              </button>
              <button
                onClick={copyReportText}
                className="flex-1 rounded-md bg-gold text-bg py-2.5 text-sm font-bold"
              >
                {copyLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingTab && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setViewingTab(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl border border-line bg-elevated p-4 space-y-3"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="text-gold font-bold text-base truncate">{viewingTab.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(viewingTab.created_at).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {viewingTab.closed_at && (
                    <>
                      {" "}
                      〜{" "}
                      {new Date(viewingTab.closed_at).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                </div>
              </div>
              <span
                className={`text-xs rounded-full px-2 py-0.5 font-bold shrink-0 ${
                  viewingTab.closed_at ? "bg-line text-gray-300" : "bg-gold/20 text-gold"
                }`}
              >
                {viewingTab.closed_at ? "会計済み" : "対応中"}
              </span>
            </div>

            <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
              {viewingTab.guest_count != null && (
                <span>
                  人数 {viewingTab.guest_count}名
                  {(viewingTab.guest_count_male != null || viewingTab.guest_count_female != null) &&
                    `（男${viewingTab.guest_count_male ?? 0}・女${viewingTab.guest_count_female ?? 0}）`}
                </span>
              )}
              <span>担当 {staffName(viewingTab.staff_id)}</span>
              {viewingTab.closed_at && viewingTab.payment_method && (
                <span>
                  {PAYMENT_METHOD_EMOJI[viewingTab.payment_method]} {PAYMENT_METHOD_LABELS[viewingTab.payment_method]}
                </span>
              )}
            </div>

            {viewingTab.memo && (
              <div className="text-xs text-gray-400 bg-bg2 rounded-md px-2 py-1.5">📝 {viewingTab.memo}</div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-line divide-y divide-line">
              {viewingTab.tab_items.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">品目がありません</div>
              ) : (
                viewingTab.tab_items.map((i) => (
                  <div key={i.id} className="flex justify-between items-center px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="text-gray-200 truncate">
                        {i.is_cast_drink && "🍾 "}
                        {i.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        ¥{i.price.toLocaleString()} × {i.qty}
                        {i.staff_id && ` ・👤${staffName(i.staff_id)}`}
                      </div>
                    </div>
                    <div className="font-mono text-gray-300 shrink-0">{yen(itemSubtotal(i))}</div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-lg bg-bg2 px-3 py-2 font-mono text-sm space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>小計</span>
                <span>{yen(tabSubtotal(viewingTab.tab_items))}</span>
              </div>
              {!!(viewingTab.discount_percent || viewingTab.discount_amount) && (
                <div className="flex justify-between text-rose">
                  <span>割引{viewingTab.discount_percent ? `（${viewingTab.discount_percent}%OFF）` : ""}</span>
                  <span>
                    -
                    {yen(
                      tabDiscountAmount(
                        viewingTab.tab_items,
                        taxRate,
                        viewingTab.discount_percent,
                        viewingTab.discount_amount
                      )
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-gray-400">
                <span>消費税</span>
                <span>{yen(tabTax(viewingTab.tab_items, taxRate))}</span>
              </div>
              <div className="flex justify-between text-gold font-bold text-base pt-1 border-t border-dashed border-line">
                <span>合計</span>
                <span>
                  {yen(
                    tabTotal(viewingTab.tab_items, taxRate, viewingTab.discount_percent, viewingTab.discount_amount)
                  )}
                </span>
              </div>
            </div>

            <button
              onClick={() => setViewingTab(null)}
              className="w-full rounded-md border border-line py-2.5 text-sm text-gray-300"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
    </OwnerPinGate>
  );
}
