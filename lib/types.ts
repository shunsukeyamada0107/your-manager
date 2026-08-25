import holidayJp from "@holiday-jp/holiday_jp";

export type Staff = {
  id: string;
  store_id: string;
  name: string;
  hourly_wage: number | null;
  active: boolean;
  commission_eligible: boolean;
  base_salary: number | null;
  special_allowance: number | null;
  special_wage: number | null; // 特別時給（対象曜日・祝日に該当する日はhourly_wageの代わりにこちらを使う）
  special_wage_days: number[] | null; // 対象曜日（0=日〜6=土）。null/空なら曜日条件なし
  special_wage_holiday: boolean; // 祝日も対象にするか
};

export type MenuItem = {
  id: string;
  store_id: string;
  name: string;
  price: number;
  course_minutes: number | null;
  active: boolean;
  sort_order: number;
  is_cast_drink: boolean;
  category: string | null;
  is_quick_pick: boolean;
};

export const UNCATEGORIZED_LABEL = "その他";

// カテゴリごとに見分けやすいよう、カテゴリ名から決定的に色を割り当てる（伝票色と同じ手法）
const CATEGORY_COLOR_PALETTE = ["#DCA84E", "#6FB3E0", "#7FCB8F", "#E08A6F", "#B78FE0", "#E0C36F", "#6FCBC0", "#E06F9E"];

export function categoryColorFor(category: string | null): string {
  const key = category ?? UNCATEGORIZED_LABEL;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length];
}

export type PaymentMethod = "cash" | "card" | "paypay" | "other_epayment";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "現金",
  card: "カード",
  paypay: "PayPay",
  other_epayment: "その他電子決済",
};

export const PAYMENT_METHOD_EMOJI: Record<PaymentMethod, string> = {
  cash: "💴",
  card: "💳",
  paypay: "📱",
  other_epayment: "🔷",
};

export type Tab = {
  id: string;
  store_id: string;
  business_date: string;
  name: string;
  memo: string;
  payment_method: PaymentMethod | null;
  guest_count: number | null;
  guest_count_male: number | null;
  guest_count_female: number | null;
  course_ends_at: string | null;
  discount_percent: number | null;
  discount_amount: number | null;
  staff_id: string | null; // この伝票の担当スタッフ（歩合給の対象）
  created_at: string; // 来店
  closed_at: string | null; // 退店・会計
};

export type TabItem = {
  id: string;
  tab_id: string;
  staff_id: string | null;
  name: string;
  price: number;
  qty: number;
  source: "menu" | "manual";
  is_cast_drink: boolean;
  created_at: string;
};

export type TabWithItems = Tab & { tab_items: TabItem[] };

export type TabLogAction = "created" | "deleted" | "time_edited";

export type TabLog = {
  id: string;
  store_id: string;
  action: TabLogAction;
  tab_name: string;
  business_date: string;
  guest_count: number | null;
  item_count: number | null;
  total_amount: number | null;
  note: string | null;
  created_at: string;
};

export type Attendance = {
  id: string;
  store_id: string;
  staff_id: string;
  business_date: string;
  clock_in: string;
  clock_out: string | null;
  wage_snapshot: number | null;
};

export type Expense = {
  id: string;
  store_id: string;
  business_date: string;
  category: string;
  name: string;
  amount: number;
  receipt_url: string | null;
  created_at: string;
};

export const EXPENSE_CATEGORIES = ["仕入れ", "消耗品", "雑費", "その他"];

export const EXPENSE_CATEGORY_ICONS: Record<string, string> = {
  仕入れ: "📦",
  消耗品: "🧻",
  雑費: "🧾",
  その他: "📌",
};

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  仕入れ: "#DCA84E",
  消耗品: "#6FB3E0",
  雑費: "#7FCB8F",
  その他: "#B78FE0",
};

// 店舗設定が未取得の場合のフォールバック値
export const DEFAULT_TAX_RATE = 0.10;
export const DEFAULT_COMMISSION_RATE = 0.20;
export const DEFAULT_BUSINESS_DAY_CUTOFF_HOUR = 6;
export const DEFAULT_DRINK_BACK_AMOUNT = 200;

export type CommissionScheme = "simple" | "drink_back";

export type PayCycle = "monthly" | "weekly" | "daily";

export function itemSubtotal(item: Pick<TabItem, "price" | "qty">) {
  return item.price * item.qty;
}

export function tabSubtotal(items: TabItem[]) {
  return items.reduce((a, i) => a + itemSubtotal(i), 0);
}

// 消費税は割引前の小計に対して計算する（割引は合計から差し引く方式のため）
export function tabTax(items: TabItem[], taxRate: number = DEFAULT_TAX_RATE) {
  return Math.round(tabSubtotal(items) * taxRate);
}

// 割引前の合計（税込）＝ 小計＋消費税
export function tabPreDiscountTotal(items: TabItem[], taxRate: number = DEFAULT_TAX_RATE) {
  return tabSubtotal(items) + tabTax(items, taxRate);
}

// 割引額（％割引 + 自由入力の値引き額の合計。割引前の合計（税込）を超えない）
export function tabDiscountAmount(
  items: TabItem[],
  taxRate: number = DEFAULT_TAX_RATE,
  discountPercent: number | null | undefined = null,
  discountAmount: number | null | undefined = null
) {
  const preDiscountTotal = tabPreDiscountTotal(items, taxRate);
  const percentPart = discountPercent ? Math.round(preDiscountTotal * (discountPercent / 100)) : 0;
  const fixedPart = discountAmount ?? 0;
  return Math.min(preDiscountTotal, percentPart + fixedPart);
}

// 会計時の端数は100円単位で切り上げる（例: 1120円→1200円）
export function roundUpTo100(n: number) {
  return Math.ceil(n / 100) * 100;
}

export function tabTotal(
  items: TabItem[],
  taxRate: number = DEFAULT_TAX_RATE,
  discountPercent: number | null | undefined = null,
  discountAmount: number | null | undefined = null
) {
  const raw = tabPreDiscountTotal(items, taxRate) - tabDiscountAmount(items, taxRate, discountPercent, discountAmount);
  return roundUpTo100(raw);
}

// "#RRGGBB" → "R G B"（TailwindのCSS変数カラーに渡すための形式）。不正な値なら既定のゴールドにフォールバック
export function hexToRgbTriplet(hex: string, fallback = "212 175 106"): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return fallback;
  const n = parseInt(match[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// 伝票ごとに見分けやすいよう、IDから決定的に色を割り当てる
const TAB_COLOR_PALETTE = ["#DCA84E", "#6FB3E0", "#7FCB8F", "#E08A6F", "#B78FE0", "#E0C36F", "#6FCBC0", "#E06F9E"];

export function tabColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TAB_COLOR_PALETTE[hash % TAB_COLOR_PALETTE.length];
}

// 営業日：指定した切り替え時刻より前は前日扱い（深夜0時をまたいでも同じ営業日として扱う）
// ローカル日時のまま組み立てる（toISOString()はUTC変換されるため、日本時間の深夜0時〜切り替え時刻の間で
// 余分に1日ズレてしまうバグがあった）
export function businessDateFor(d: Date, cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR): string {
  const dd = new Date(d);
  if (dd.getHours() < cutoffHour) dd.setDate(dd.getDate() - 1);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, "0");
  const day = String(dd.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// その営業日に適用すべき時給を返す（対象曜日・祝日に該当すればspecial_wage、それ以外はhourly_wage）
export function effectiveHourlyWage(
  staff: Pick<Staff, "hourly_wage" | "special_wage" | "special_wage_days" | "special_wage_holiday">,
  businessDate: string
): number | null {
  if (staff.special_wage != null) {
    const d = new Date(`${businessDate}T00:00:00`);
    const dayMatch = staff.special_wage_days?.includes(d.getDay()) ?? false;
    const holidayMatch = staff.special_wage_holiday && holidayJp.isHoliday(d);
    if (dayMatch || holidayMatch) return staff.special_wage;
  }
  return staff.hourly_wage;
}

// 出勤からの経過時間（時間単位）
export function attHours(a: Pick<Attendance, "clock_in" | "clock_out">, nowMs = Date.now()) {
  const inMs = new Date(a.clock_in).getTime();
  const outMs = a.clock_out ? new Date(a.clock_out).getTime() : nowMs;
  return Math.max(0, (outMs - inMs) / 3600000);
}

// 時給ベースの人件費
export function dayLaborCost(attendance: Attendance[], nowMs = Date.now()) {
  return attendance.reduce((a, att) => a + attHours(att, nowMs) * (att.wage_snapshot ?? 0), 0);
}

export type HourlyLaborRow = { staffId: string; name: string; hours: number; cost: number };

// 時給が設定されている出退勤記録だけを対象に、スタッフ別の勤務時間・人件費を集計する
export function hourlyLaborBreakdown(
  attendance: Attendance[],
  staffNameOf: (staffId: string | null) => string,
  nowMs = Date.now()
): HourlyLaborRow[] {
  const map: Record<string, HourlyLaborRow> = {};
  attendance.forEach((a) => {
    if (a.wage_snapshot == null) return;
    if (!map[a.staff_id]) map[a.staff_id] = { staffId: a.staff_id, name: staffNameOf(a.staff_id), hours: 0, cost: 0 };
    const hrs = attHours(a, nowMs);
    map[a.staff_id].hours += hrs;
    map[a.staff_id].cost += hrs * a.wage_snapshot;
  });
  return Object.values(map).sort((a, b) => b.cost - a.cost);
}

export type StaffCommission = {
  staffId: string | null;
  name: string;
  salesExTax: number;
  salesWithTax: number;
  drinkCount: number;
  drinkBack: number;
  salesBack: number;
  commission: number;
};

export type CommissionTaxBasis = "with_tax" | "pre_tax";
export const DEFAULT_COMMISSION_TAX_BASIS: CommissionTaxBasis = "with_tax";

// 歩合給: 会計済み（closed_atがある）伝票の売上を、品目ごとの担当（tab_items.staff_id で個別指定があればそれ、
// 無ければ伝票の担当 tabs.staff_id）で按分する。
// 例: 伝票の担当はAさんだが、シャンパンだけBさんに個別指定した場合、シャンパン分だけBさんの歩合になる。
//
// taxBasis="with_tax"（既定）: 消費税込みの金額を歩合の元にする。按分の元にする金額は2パターンある:
// ・伝票を1人で丸ごと担当している場合（按分比率100%）: 実際にレジを通った金額（100円切り上げ後の会計額）そのもの。
//   全額その人が集めたお金なので、切り上げ分も含めて実際に入った額を歩合の元にする。
// ・複数人で分け合っている場合: 切り上げ前の金額（税込・割引後）を按分比率で分けた額に、
//   その伝票の「デフォルト担当」（tabs.staff_id）にだけ切り上げ差額（会計額－切り上げ前）を上乗せする。
//   一部の品目だけ他のスタッフに個別指定されていても、伝票そのものの責任者はデフォルト担当なので、
//   端数（切り上げのおまけ）はその人に寄せる。デフォルト担当が未設定の伝票では、この差額は誰にも乗らない。
// taxBasis="pre_tax": 消費税抜きの小計を歩合の元にする。割引が入っている場合は、税込ベースで見た「割引後に残る割合」
//   （割引後金額÷割引前金額）を税抜小計にもそのままかけて、割引の影響だけは税込・税抜どちらでも同じ比率になるようにする。
//   レジの100円切り上げは会計時の端数処理であって税抜の売上そのものではないため、この場合は反映しない。
//
// scheme="simple"（既定）: 按分した売上にcommissionRateを掛けるだけ。
// scheme="drink_back": 按分した売上のうち、is_cast_drinkな品目分を除いた額にcommissionRateを掛けたもの（売上バック）に、
//   is_cast_drink品目の数量×drinkBackAmount（ドリンクバック）を足す。
export function staffCommissionBreakdown(
  tabs: TabWithItems[],
  staffNameOf: (staffId: string | null) => string,
  taxRate: number = DEFAULT_TAX_RATE,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
  scheme: CommissionScheme = "simple",
  drinkBackAmount: number = DEFAULT_DRINK_BACK_AMOUNT,
  isCommissionEligible: (staffId: string) => boolean = () => true,
  taxBasis: CommissionTaxBasis = DEFAULT_COMMISSION_TAX_BASIS
): StaffCommission[] {
  const map: Record<string, StaffCommission> = {};
  tabs.forEach((t) => {
    if (!t.closed_at) return;
    const sub = tabSubtotal(t.tab_items);
    if (sub <= 0) return;

    const preDiscountTotal = tabPreDiscountTotal(t.tab_items, taxRate);
    const adjustedTotal =
      preDiscountTotal - tabDiscountAmount(t.tab_items, taxRate, t.discount_percent, t.discount_amount);
    const roundedTotal = tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount);
    const roundUpBonus = roundedTotal - adjustedTotal;
    // 割引後に残る割合（税込ベース）を税抜小計にも適用し、割引の効き方だけは税込・税抜で揃える
    const keepRatio = preDiscountTotal > 0 ? adjustedTotal / preDiscountTotal : 1;
    const preTaxAdjustedTotal = sub * keepRatio;

    // 品目ごとの個別指定があればそれを優先、無ければ伝票の担当スタッフ（未設定・歩合対象外は集計しない）
    const byStaff: Record<string, number> = {};
    const byStaffDrink: Record<string, number> = {};
    const byStaffDrinkQty: Record<string, number> = {};
    t.tab_items.forEach((i) => {
      const effectiveStaffId = i.staff_id ?? t.staff_id;
      if (!effectiveStaffId || !isCommissionEligible(effectiveStaffId)) return;
      byStaff[effectiveStaffId] = (byStaff[effectiveStaffId] ?? 0) + itemSubtotal(i);
      if (i.is_cast_drink) {
        byStaffDrink[effectiveStaffId] = (byStaffDrink[effectiveStaffId] ?? 0) + itemSubtotal(i);
        byStaffDrinkQty[effectiveStaffId] = (byStaffDrinkQty[effectiveStaffId] ?? 0) + i.qty;
      }
    });

    Object.entries(byStaff).forEach(([key, rawSub]) => {
      const shareRatio = rawSub / sub;
      // 税抜モード：割引後の税抜小計をそのまま按分（切り上げの概念自体がないので分岐なし）。
      // 税込モード：1人で丸ごと担当なら実際の会計額を、複数人で分け合うなら切り上げ前の金額を按分し、
      //   分け合う場合は伝票のデフォルト担当にだけ切り上げ差額を上乗せする（伝票そのものの責任者のため）
      const basis = taxBasis === "pre_tax" ? preTaxAdjustedTotal : shareRatio === 1 ? roundedTotal : adjustedTotal;
      const roundUpForThis = taxBasis === "with_tax" && shareRatio < 1 && key === t.staff_id ? roundUpBonus : 0;
      const salesWithTax = basis * shareRatio + roundUpForThis;

      if (!map[key]) {
        map[key] = {
          staffId: key,
          name: staffNameOf(key),
          salesExTax: 0,
          salesWithTax: 0,
          drinkCount: 0,
          drinkBack: 0,
          salesBack: 0,
          commission: 0,
        };
      }
      map[key].salesExTax += rawSub;
      map[key].salesWithTax += salesWithTax;

      if (scheme === "drink_back") {
        const drinkQty = byStaffDrinkQty[key] ?? 0;
        const drinkShareRatio = (byStaffDrink[key] ?? 0) / sub;
        const drinkSalesWithTax = basis * drinkShareRatio;
        const salesBack = Math.max(0, salesWithTax - drinkSalesWithTax) * commissionRate;
        const drinkBack = drinkQty * drinkBackAmount;
        map[key].drinkCount += drinkQty;
        map[key].salesBack += salesBack;
        map[key].drinkBack += drinkBack;
        map[key].commission += salesBack + drinkBack;
      } else {
        map[key].commission += salesWithTax * commissionRate;
      }
    });
  });
  return Object.values(map).sort((a, b) => b.commission - a.commission);
}

export type DaySummary = {
  subtotal: number;
  tax: number;
  roundingAdjustment: number;
  total: number;
  laborHourly: number;
  commissionTotal: number;
  labor: number;
  expense: number;
  profit: number;
  cash: number;
  card: number;
  unsettled: number;
};

export function daySummary(
  tabs: TabWithItems[],
  attendance: Attendance[],
  expenses: Expense[],
  staffNameOf: (staffId: string | null) => string,
  taxRate: number = DEFAULT_TAX_RATE,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
  commissionScheme: CommissionScheme = "simple",
  drinkBackAmount: number = DEFAULT_DRINK_BACK_AMOUNT,
  isCommissionEligible: (staffId: string) => boolean = () => true,
  commissionTaxBasis: CommissionTaxBasis = DEFAULT_COMMISSION_TAX_BASIS
): DaySummary {
  const subtotal = tabs.reduce((a, t) => a + tabSubtotal(t.tab_items), 0);
  const tax = tabs.reduce((a, t) => a + tabTax(t.tab_items, taxRate), 0);
  const laborHourly = dayLaborCost(attendance);
  const commissionTotal = staffCommissionBreakdown(
    tabs,
    staffNameOf,
    taxRate,
    commissionRate,
    commissionScheme,
    drinkBackAmount,
    isCommissionEligible,
    commissionTaxBasis
  ).reduce(
    (a, c) => a + c.commission,
    0
  );
  const labor = laborHourly + commissionTotal;
  const expense = expenses.reduce((a, e) => a + e.amount, 0);
  let cash = 0,
    card = 0,
    unsettled = 0;
  tabs.forEach((t) => {
    const tot = tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount);
    if (t.closed_at && t.payment_method === "cash") cash += tot;
    else if (t.closed_at && t.payment_method) card += tot; // カード・PayPay・その他電子決済はまとめて「現金以外」として集計
    else unsettled += tot;
  });
  // 合計は実際に会計する（100円単位切り上げ後の）金額を必ず使う：現金＋カード＋未会計と一致する
  const total = cash + card + unsettled;
  const roundingAdjustment = total - (subtotal + tax);
  return {
    subtotal,
    tax,
    roundingAdjustment,
    total,
    laborHourly,
    commissionTotal,
    labor,
    expense,
    // 粗利は人件費を差し引かない（売上－経費）。人件費は別建てのlaborで確認する
    profit: total - expense,
    cash,
    card,
    unsettled,
  };
}
