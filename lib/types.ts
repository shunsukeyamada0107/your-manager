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
  commission_tax_basis_override: CommissionTaxBasis | null; // 歩合の計算基準を店舗設定と別に指定する場合の上書き値。null=店舗設定に従う
  commission_basis: CommissionBasis; // 歩合の対象範囲。own_tabs=自分が担当した伝票の売上（通常）、total_sales=店舗全体の売上
  total_sales_commission_rate: number | null; // commission_basis='total_sales'の場合に使う、その人専用の歩合率
  commission_rate_override: number | null; // commission_basis='own_tabs'の人の歩合率を店舗設定と別に指定する場合の上書き値。null=店舗設定のcommission_rateに従う
  commission_mode: CommissionMode; // standard=通常の按分歩合のみ。primary_customer_flat/primary_customer_slide=担当客の伝票を丸ごと自分の歩合にする
  primary_customer_rate: number | null; // commission_mode='primary_customer_flat'用の固定歩合率
  primary_customer_day_off_rate: number | null; // commission_mode='primary_customer_slide'用、本人が出勤していない日の担当客売上に適用する固定率
  commission_start_date: string | null; // 歩合のみのスタッフとしての起算日（date）。保証額アップ対象月数の判定に使う
  primary_customer_guarantee_amount: number | null; // primary_customer_slide用の月間保証額
  primary_customer_guarantee_startup_rate: number | null; // 起算から一定月数だけ保証額に上乗せする率
  primary_customer_guarantee_startup_months: number | null; // 上記の上乗せが適用される月数
  companion_allowance_amount: number | null; // 同伴1回あたりの手当額（クラブモード用）。nullは手当なし
};

export type Customer = {
  id: string;
  store_id: string;
  name: string;
  name_kana: string | null; // フリガナ（カナ検索用）
  phone: string | null;
  birthday: string | null; // date (YYYY-MM-DD)
  primary_staff_id: string | null; // 担当キャスト・指名
  bottle_keep: string | null; // ボトルキープの棚番号・銘柄など
  memo: string;
  active: boolean;
  created_at: string;
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
  cost_price?: number | null; // 原価（給与計算方法2で、キャスト売上バックの元から酒代として引く額）。null=原価なし
  snack_item_kind?: SnackItemKind | null; // 給与計算方法2での扱い（bottle=抜き物・ボトル、nomination=指名料、companion=同伴料）。null=通常の品目
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

// 1つの伝票を複数の方法で支払う（現金＋カード、一部未収など）ための支払い区分。receivable=未収（後日回収する分）
export type PaymentKind = PaymentMethod | "receivable";

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = { ...PAYMENT_METHOD_LABELS, receivable: "未収" };
export const PAYMENT_KIND_EMOJI: Record<PaymentKind, string> = { ...PAYMENT_METHOD_EMOJI, receivable: "📒" };
export const PAYMENT_KIND_ORDER: PaymentKind[] = ["cash", "card", "paypay", "other_epayment", "receivable"];

export type TabPayment = {
  id: string;
  store_id: string;
  tab_id: string;
  method: PaymentKind;
  amount: number;
  staff_id?: string | null; // この支払いをしたお客様の担当（分割払いで支払った人ごとに担当が違う場合）。null=伝票の指名の子
  created_at: string;
};

export type Tab = {
  id: string;
  store_id: string;
  business_date: string;
  name: string;
  customer_id: string | null; // クラブモードで紐付けた顧客（バーモードでは常にnull）
  memo: string;
  payment_method: PaymentMethod | null;
  guest_count: number | null;
  guest_count_male: number | null;
  guest_count_female: number | null;
  course_ends_at: string | null;
  discount_percent: number | null;
  discount_amount: number | null;
  staff_id: string | null; // この伝票の担当スタッフ（歩合給の対象）
  companion_staff_id: string | null; // 旧・同伴スタッフ（1人分）。companion_staff_idsと同じ内容を保つ。読むときはtabCompanionIds()を使う
  companion_staff_ids: string[]; // この来店を同伴したスタッフ（複数可。歩合対象のstaff_idとは別軸。クラブモード用）
  created_at: string; // 来店
  closed_at: string | null; // 退店・会計
  tab_payments?: TabPayment[]; // 支払い内訳（分割払い・未収）。無い・空なら payment_method の1回払いとして扱う
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
  daily_pay?: number | null; // その日に日払いで渡した額（給料の前渡し。給与明細・集計の人件費から差し引く）。null=日払いなし
};

// 出退勤の記録から、スタッフごとの日払い済み合計を出す
export function dailyPayByStaff(attendance: Pick<Attendance, "staff_id" | "daily_pay">[]): Map<string, number> {
  const map = new Map<string, number>();
  attendance.forEach((a) => {
    if (a.daily_pay) map.set(a.staff_id, (map.get(a.staff_id) ?? 0) + a.daily_pay);
  });
  return map;
}

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
export const DEFAULT_ROUND_UNIT = 100; // 会計時に切り上げる単位（円）

export type CommissionScheme = "simple" | "drink_back";

export type PayCycle = "monthly" | "semimonthly" | "weekly" | "daily"; // semimonthly=半月払い（1〜15日／16〜末日の2期間に分けて支給）

export type StoreMode = "bar" | "club"; // 店舗の運用モード。club=クラブモード（顧客の事前登録必須）

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

// 会計時の端数は指定した単位で切り上げる（例: unit=100なら1120円→1200円、unit=1000なら1120円→2000円）
export function roundUpToUnit(n: number, unit: number = DEFAULT_ROUND_UNIT) {
  return Math.ceil(n / unit) * unit;
}

export function tabTotal(
  items: TabItem[],
  taxRate: number = DEFAULT_TAX_RATE,
  discountPercent: number | null | undefined = null,
  discountAmount: number | null | undefined = null,
  roundUnit: number = DEFAULT_ROUND_UNIT
) {
  const raw = tabPreDiscountTotal(items, taxRate) - tabDiscountAmount(items, taxRate, discountPercent, discountAmount);
  return roundUpToUnit(raw, roundUnit);
}

// 同伴したスタッフのid一覧。companion_staff_ids（複数）を優先し、無ければ旧列companion_staff_id（1人）を使う
export function tabCompanionIds(t: Pick<Tab, "companion_staff_id" | "companion_staff_ids">): string[] {
  if (t.companion_staff_ids?.length) return t.companion_staff_ids;
  return t.companion_staff_id ? [t.companion_staff_id] : [];
}

export type PaymentPart = { method: PaymentKind; amount: number | null };

// 伝票の支払い内訳（表示用）。分割払いの記録があればそれを、無ければpayment_methodの1回払いとして返す
// （1回払いは金額が伝票の合計と同じなのでamount=null）。会計前・支払い方法なしの伝票は空
export function tabPaymentParts(t: Pick<Tab, "closed_at" | "payment_method" | "tab_payments">): PaymentPart[] {
  if (!t.closed_at) return [];
  if (t.tab_payments?.length) {
    return [...t.tab_payments]
      .sort((a, b) => PAYMENT_KIND_ORDER.indexOf(a.method) - PAYMENT_KIND_ORDER.indexOf(b.method))
      .map((p) => ({ method: p.method, amount: p.amount }));
  }
  return t.payment_method ? [{ method: t.payment_method, amount: null }] : [];
}

export type PaymentAllocation = { cash: number; electronic: number; receivable: number };

// 会計済み伝票の合計(total)を、現金・電子決済・未収に振り分ける。分割払いの記録があればその比率で、
// 無ければpayment_methodの1回払いとして全額を振り分ける。会計前や支払い方法の無い伝票はnull（未会計扱い）。
// 会計後に品目や割引が変わって内訳の合計とtotalがずれた場合は、内訳の比率のままtotalに合わせて按分する
// （現金＋カード＋未収＋未会計が常に売上合計と一致するように）
export function tabPaymentAllocation(
  t: Pick<Tab, "closed_at" | "payment_method" | "tab_payments">,
  total: number
): PaymentAllocation | null {
  if (!t.closed_at) return null;
  const alloc: PaymentAllocation = { cash: 0, electronic: 0, receivable: 0 };
  const add = (method: PaymentKind, amount: number) => {
    if (method === "cash") alloc.cash += amount;
    else if (method === "receivable") alloc.receivable += amount;
    else alloc.electronic += amount;
  };
  const payments = t.tab_payments ?? [];
  if (payments.length > 0) {
    const sum = payments.reduce((a, p) => a + p.amount, 0);
    if (sum <= 0) {
      alloc.receivable = total;
    } else {
      const scale = sum === total ? 1 : total / sum;
      payments.forEach((p) => add(p.method, p.amount * scale));
    }
    return alloc;
  }
  if (!t.payment_method) return null;
  add(t.payment_method, total);
  return alloc;
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

// スタッフごとの上書き設定（commission_tax_basis_override）があればそれを、無ければ店舗設定を使う
export function commissionTaxBasisResolver(
  staffList: Staff[],
  storeDefault: CommissionTaxBasis
): (staffId: string) => CommissionTaxBasis {
  return (staffId: string) => staffList.find((s) => s.id === staffId)?.commission_tax_basis_override ?? storeDefault;
}

// スタッフごとの上書き設定（commission_rate_override）があればそれを、無ければ店舗設定の歩合率を使う。
// own_tabsの歩合計算（simpleの一律%、drink_backの売上バック部分）にそのまま使う
export function commissionRateResolver(staffList: Staff[], storeDefault: number): (staffId: string) => number {
  return (staffId: string) => staffList.find((s) => s.id === staffId)?.commission_rate_override ?? storeDefault;
}

// 歩合の対象範囲。own_tabs=自分が担当した伝票の売上（通常）、total_sales=店舗全体の売上（この場合、通常の按分歩合の代わりにこちらだけを使う）
export type CommissionBasis = "own_tabs" | "total_sales";
export const DEFAULT_COMMISSION_BASIS: CommissionBasis = "own_tabs";

// 担当客（customers.primary_staff_id）の売上を丸ごと自分の歩合にするかどうか。standard=しない（通常の按分歩合のみ）。
// primary_customer_flat=固定率で丸ごと帰属。primary_customer_slide=出勤日分は月間スライド歩合、非出勤日分は別建ての固定率
export type CommissionMode = "standard" | "primary_customer_flat" | "primary_customer_slide";
export const DEFAULT_COMMISSION_MODE: CommissionMode = "standard";

// 顧客ごとの指名歩合ルール（実際の接客者とは別のスタッフに、その顧客の売上の一部を加算する）
export type CustomerStaffCommissionRule = {
  id: string;
  store_id: string;
  customer_id: string;
  staff_id: string; // 歩合を受け取るスタッフ
  rate: number; // 通常時（そのスタッフがその伝票の営業日に出勤している場合）の歩合率
  day_off_rate: number; // 本人がその営業日に出勤していない場合の歩合率
  note: string | null;
  created_at: string;
};

// 月間個人売上に対する非マージナル方式のスライド歩合ティア（該当する最大閾値の率を1つだけ適用する）
export type SlideScaleTier = { minAmount: number; rate: number };
export const DEFAULT_SLIDE_SCALE_TIERS: SlideScaleTier[] = [];

// commission_basis='total_sales'のスタッフだけを、専用の歩合率つきで抽出する
export function totalSalesCommissionStaff(staffList: Staff[]): Array<{ staffId: string; rate: number }> {
  return staffList
    .filter((s) => s.commission_basis === "total_sales" && s.total_sales_commission_rate != null)
    .map((s) => ({ staffId: s.id, rate: s.total_sales_commission_rate as number }));
}

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
//
// totalSalesStaff: commission_basis='total_sales'のスタッフ（totalSalesCommissionStaff()で抽出）。
//   このスタッフは、自分の担当伝票の按分歩合の代わりに「歩合対象の伝票（歩合対象スタッフが担当した分の按分売上）」の
//   合計に専用の歩合率を掛けた額をそのまま歩合にする（両方が重複計算されないよう、按分の対象からは除外する）。
//   店舗の生の売上そのものではないため、歩合対象外スタッフの担当分・未設定の伝票分は含まない。
//   なお按分売上は各担当者ごとのtaxBasisFor()（税込/税抜）をそのまま使った額の合計なので、taxBasisFor(このスタッフのid)自体は使わない。
//
// commissionRateFor: own_tabsの人（simpleの一律%、drink_backの売上バック部分）の歩合率を、店舗設定の
//   commissionRateと別に個人ごとに指定したい場合のコールバック（未設定ならcommissionRateをそのまま使う）。
//
// primaryCustomerOwnerOf: 伝票の顧客(tabs.customer_id)が、誰かの「担当客を丸ごと自分の歩合にする」設定
//   （staff.commission_mode='primary_customer_flat'/'primary_customer_slide'）の対象になっている場合、
//   そのスタッフのidを返すコールバック（対象でなければnull）。対象の伝票は、実際の担当（tabs.staff_id/
//   tab_items.staff_id）が誰であっても、この関数の通常の按分・total_sales集計からは完全に除外する
//   （二重計上を避けるため。除外された分の実際の歩合額は、この関数の外＝専用の別関数で計算する）。
export function staffCommissionBreakdown(
  tabs: TabWithItems[],
  staffNameOf: (staffId: string | null) => string,
  taxRate: number = DEFAULT_TAX_RATE,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
  scheme: CommissionScheme = "simple",
  drinkBackAmount: number = DEFAULT_DRINK_BACK_AMOUNT,
  isCommissionEligible: (staffId: string) => boolean = () => true,
  taxBasisFor: (staffId: string) => CommissionTaxBasis = () => DEFAULT_COMMISSION_TAX_BASIS,
  totalSalesStaff: Array<{ staffId: string; rate: number }> = [],
  commissionRateFor: (staffId: string) => number = () => commissionRate,
  primaryCustomerOwnerOf: (customerId: string | null) => string | null = () => null,
  roundUnit: number = DEFAULT_ROUND_UNIT
): StaffCommission[] {
  const map: Record<string, StaffCommission> = {};
  const totalSalesStaffIds = new Set(totalSalesStaff.map((s) => s.staffId));
  totalSalesStaff.forEach(({ staffId }) => {
    map[staffId] = {
      staffId,
      name: staffNameOf(staffId),
      salesExTax: 0,
      salesWithTax: 0,
      drinkCount: 0,
      drinkBack: 0,
      salesBack: 0,
      commission: 0,
    };
  });

  tabs.forEach((t) => {
    if (!t.closed_at) return;
    // 担当客を丸ごと自分の歩合にする設定の対象伝票は、実際の担当が誰でも通常の按分から完全に除外する
    if (t.customer_id && primaryCustomerOwnerOf(t.customer_id)) return;
    const sub = tabSubtotal(t.tab_items);
    if (sub <= 0) return;

    const preDiscountTotal = tabPreDiscountTotal(t.tab_items, taxRate);
    const adjustedTotal =
      preDiscountTotal - tabDiscountAmount(t.tab_items, taxRate, t.discount_percent, t.discount_amount);
    const roundedTotal = tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount, roundUnit);
    const roundUpBonus = roundedTotal - adjustedTotal;
    // 割引後に残る割合（税込ベース）を税抜小計にも適用し、割引の効き方だけは税込・税抜で揃える
    const keepRatio = preDiscountTotal > 0 ? adjustedTotal / preDiscountTotal : 1;
    const preTaxAdjustedTotal = sub * keepRatio;

    // 品目ごとの個別指定があればそれを優先、無ければ伝票の担当スタッフ（未設定・歩合対象外・総売上歩合の人は集計しない）
    const byStaff: Record<string, number> = {};
    const byStaffDrink: Record<string, number> = {};
    const byStaffDrinkQty: Record<string, number> = {};
    t.tab_items.forEach((i) => {
      const effectiveStaffId = i.staff_id ?? t.staff_id;
      if (!effectiveStaffId || !isCommissionEligible(effectiveStaffId) || totalSalesStaffIds.has(effectiveStaffId))
        return;
      byStaff[effectiveStaffId] = (byStaff[effectiveStaffId] ?? 0) + itemSubtotal(i);
      if (i.is_cast_drink) {
        byStaffDrink[effectiveStaffId] = (byStaffDrink[effectiveStaffId] ?? 0) + itemSubtotal(i);
        byStaffDrinkQty[effectiveStaffId] = (byStaffDrinkQty[effectiveStaffId] ?? 0) + i.qty;
      }
    });

    // 総売上歩合スタッフの基準は、店舗の生の売上ではなく「歩合対象の伝票（歩合対象スタッフが担当した分）」の合計にする
    let tabCommissionableRawSub = 0;
    let tabCommissionableSalesWithTax = 0;

    Object.entries(byStaff).forEach(([key, rawSub]) => {
      const shareRatio = rawSub / sub;
      // 歩合の計算基準はスタッフごとに上書き可能（未設定なら店舗設定 taxBasisFor() の既定値を使う）
      const taxBasis = taxBasisFor(key);
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
      tabCommissionableRawSub += rawSub;
      tabCommissionableSalesWithTax += salesWithTax;

      // 歩合率もスタッフごとに上書き可能（未設定なら店舗設定 commissionRateFor() の既定値を使う）
      const rate = commissionRateFor(key);
      if (scheme === "drink_back") {
        const drinkQty = byStaffDrinkQty[key] ?? 0;
        const drinkShareRatio = (byStaffDrink[key] ?? 0) / sub;
        const drinkSalesWithTax = basis * drinkShareRatio;
        const salesBack = Math.max(0, salesWithTax - drinkSalesWithTax) * rate;
        const drinkBack = drinkQty * drinkBackAmount;
        map[key].drinkCount += drinkQty;
        map[key].salesBack += salesBack;
        map[key].drinkBack += drinkBack;
        map[key].commission += salesBack + drinkBack;
      } else {
        map[key].commission += salesWithTax * rate;
      }
    });

    // 総売上歩合スタッフ：店舗の生の売上ではなく、この伝票のうち歩合対象スタッフが担当した分の合計に自分の歩合率を掛ける
    totalSalesStaff.forEach(({ staffId, rate }) => {
      map[staffId].salesExTax += tabCommissionableRawSub;
      map[staffId].salesWithTax += tabCommissionableSalesWithTax;
      map[staffId].commission += tabCommissionableSalesWithTax * rate;
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
  receivable: number; // 未収（会計済みだが後日回収する分）
  unsettled: number; // 未会計（まだ会計していない伝票）
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
  commissionTaxBasisFor: (staffId: string) => CommissionTaxBasis = () => DEFAULT_COMMISSION_TAX_BASIS,
  totalSalesStaff: Array<{ staffId: string; rate: number }> = [],
  commissionRateFor: (staffId: string) => number = () => commissionRate,
  primaryCustomerOwnerOf: (customerId: string | null) => string | null = () => null,
  roundUnit: number = DEFAULT_ROUND_UNIT
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
    commissionTaxBasisFor,
    totalSalesStaff,
    commissionRateFor,
    primaryCustomerOwnerOf,
    roundUnit
  ).reduce(
    (a, c) => a + c.commission,
    0
  );
  const labor = laborHourly + commissionTotal;
  const expense = expenses.reduce((a, e) => a + e.amount, 0);
  let cash = 0,
    card = 0,
    receivable = 0,
    unsettled = 0;
  tabs.forEach((t) => {
    const tot = tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount, roundUnit);
    const alloc = tabPaymentAllocation(t, tot);
    if (!alloc) {
      unsettled += tot;
      return;
    }
    cash += alloc.cash;
    card += alloc.electronic; // カード・PayPay・その他電子決済はまとめて「現金以外」として集計
    receivable += alloc.receivable;
  });
  // 合計は実際に会計する（切り上げ後の）金額を必ず使う：現金＋カード＋未収＋未会計と一致する
  const total = cash + card + receivable + unsettled;
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
    receivable,
    unsettled,
  };
}

export type CustomerStats = {
  visitCount: number; // 来店回数（closed_atがある伝票の数）
  totalSales: number; // 累計売上（tabTotalの合計）
  lastVisitDate: string | null; // 最終来店日（business_dateの最大値）
};

// 顧客ごとの来店回数・累計売上・最終来店日を、その顧客に紐づく会計済み（closed_atがある）伝票から計算する。
// customersテーブルには保存せず、設定タブの顧客管理セクションで都度この関数を呼んで表示する。
// 呼び出し側であらかじめcustomer_idで絞り込んだtabsを渡す想定。
export function customerStats(
  tabs: TabWithItems[],
  taxRate: number = DEFAULT_TAX_RATE,
  roundUnit: number = DEFAULT_ROUND_UNIT
): CustomerStats {
  const closed = tabs.filter((t) => t.closed_at);
  const visitCount = closed.length;
  const totalSales = closed.reduce(
    (a, t) => a + tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount, roundUnit),
    0
  );
  const lastVisitDate = closed.reduce<string | null>(
    (latest, t) => (latest === null || t.business_date > latest ? t.business_date : latest),
    null
  );
  return { visitCount, totalSales, lastVisitDate };
}

// staff_id:business_date の組を1回だけSetにしておき、O(1)で「その日出勤していたか」を判定できるようにする
// （hourlyLaborBreakdownと同じく、出退勤配列を毎回スキャンし直さない）
export function attendanceWorkedSet(attendance: Attendance[]): Set<string> {
  return new Set(attendance.map((a) => `${a.staff_id}:${a.business_date}`));
}

export function didWorkOn(workedSet: Set<string>, staffId: string, businessDate: string): boolean {
  return workedSet.has(`${staffId}:${businessDate}`);
}

// customers.primary_staff_idが、「担当客を丸ごと自分の歩合にする」設定（commission_mode !== 'standard'）を
// 有効にしているスタッフを指している場合だけ、customer_id -> staff_id の解決関数を返す
// （無効なスタッフを指している・primary_staff_id未設定の顧客はnull＝通常どおりの按分歩合のまま）
export function primaryCustomerOwnerResolver(
  customers: Customer[],
  staffList: Staff[]
): (customerId: string | null) => string | null {
  const opted = new Set(staffList.filter((s) => s.commission_mode !== "standard").map((s) => s.id));
  const map: Record<string, string> = {};
  customers.forEach((c) => {
    if (c.primary_staff_id && opted.has(c.primary_staff_id)) map[c.id] = c.primary_staff_id;
  });
  return (customerId) => (customerId ? map[customerId] ?? null : null);
}

export type PrimaryCustomerSales = { staffId: string; name: string; workedSales: number; offDaySales: number };

// primaryCustomerOwnerResolver()で除外対象となった伝票の実会計額（tabTotal）を、オーナースタッフごとに
// 「本人がその営業日に出勤していた分」「出勤していなかった分」に振り分けて集計する。
// これは歩合そのものではなく、後段（固定率 or 月間スライド歩合）が使う元の売上額
export function primaryCustomerSalesBreakdown(
  tabs: TabWithItems[],
  staffNameOf: (staffId: string | null) => string,
  ownerOf: (customerId: string | null) => string | null,
  workedSet: Set<string>,
  taxRate: number = DEFAULT_TAX_RATE,
  roundUnit: number = DEFAULT_ROUND_UNIT
): PrimaryCustomerSales[] {
  const map: Record<string, PrimaryCustomerSales> = {};
  tabs.forEach((t) => {
    if (!t.closed_at || !t.customer_id) return;
    const ownerId = ownerOf(t.customer_id);
    if (!ownerId) return;
    const amount = tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount, roundUnit);
    if (!map[ownerId]) {
      map[ownerId] = { staffId: ownerId, name: staffNameOf(ownerId), workedSales: 0, offDaySales: 0 };
    }
    if (didWorkOn(workedSet, ownerId, t.business_date)) map[ownerId].workedSales += amount;
    else map[ownerId].offDaySales += amount;
  });
  return Object.values(map);
}

// 非マージナル方式のスライド歩合率を返す：月間合計以上の最大min_amountを持つティアの率を1つだけ選ぶ
// （段階的な累進課税のような按分はしない。閾値未満の売上しかなければ0）
export function slideScaleRate(tiers: SlideScaleTier[], monthlyAmount: number): number {
  let rate = 0;
  [...tiers]
    .sort((a, b) => a.minAmount - b.minAmount)
    .forEach((t) => {
      if (monthlyAmount >= t.minAmount) rate = t.rate;
    });
  return rate;
}

// commissionStartDate（歩合制としての起算日、"YYYY-MM-DD"）から見て、periodYearMonth（"YYYY-MM"）が
// 何ヶ月目にあたるかを返す（起算月そのものが1ヶ月目）
export function commissionMonthNumber(commissionStartDate: string, periodYearMonth: string): number {
  const [sy, sm] = commissionStartDate.slice(0, 7).split("-").map(Number);
  const [py, pm] = periodYearMonth.split("-").map(Number);
  return (py - sy) * 12 + (pm - sm) + 1;
}

export type SlideScaleCommissionInput = {
  workedSales: number; // その月・出勤日分の本人の担当客売上（primaryCustomerSalesBreakdownのworkedSales）
  tiers: SlideScaleTier[];
  guaranteeAmount: number;
  guaranteeStartupRate: number;
  guaranteeStartupMonths: number;
  monthNumber: number; // commissionMonthNumber()の結果
};

// max(スライド歩合, 保証額)を返す。起算からguaranteeStartupMonthsヶ月目までは、保証額に
// 「workedSales × guaranteeStartupRate」を上乗せしてから比較する（それ以降は保証額そのまま）
export function slideScaleCommission(input: SlideScaleCommissionInput): number {
  const slideAmount = input.workedSales * slideScaleRate(input.tiers, input.workedSales);
  const guaranteeBase =
    input.monthNumber <= input.guaranteeStartupMonths
      ? input.guaranteeAmount + input.workedSales * input.guaranteeStartupRate
      : input.guaranteeAmount;
  return Math.max(slideAmount, guaranteeBase);
}

// 指名歩合（加算方式）：実際に接客したスタッフとは別のスタッフに、特定の顧客の売上の一部を追加の歩合として渡す。
// 客の実会計額(tabTotal)に、その客に対するルールのrate（受け取るスタッフが出勤している日）/
// day_off_rate（出勤していない日）を掛けてスタッフごとに合算する。
// 同一スタッフが複数の客のルールを持っていても、mapへの加算で自然に合算される
export function namedCustomerCommission(
  tabs: TabWithItems[],
  rules: CustomerStaffCommissionRule[],
  staffNameOf: (staffId: string | null) => string,
  workedSet: Set<string>,
  taxRate: number = DEFAULT_TAX_RATE,
  roundUnit: number = DEFAULT_ROUND_UNIT
): StaffCommission[] {
  const rulesByCustomer: Record<string, CustomerStaffCommissionRule[]> = {};
  rules.forEach((r) => {
    (rulesByCustomer[r.customer_id] ??= []).push(r);
  });

  const map: Record<string, StaffCommission> = {};
  tabs.forEach((t) => {
    if (!t.closed_at || !t.customer_id) return;
    const matching = rulesByCustomer[t.customer_id];
    if (!matching?.length) return;
    const amount = tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount, roundUnit);
    matching.forEach((rule) => {
      const rate = didWorkOn(workedSet, rule.staff_id, t.business_date) ? rule.rate : rule.day_off_rate;
      if (!map[rule.staff_id]) {
        map[rule.staff_id] = {
          staffId: rule.staff_id,
          name: staffNameOf(rule.staff_id),
          salesExTax: 0,
          salesWithTax: 0,
          drinkCount: 0,
          drinkBack: 0,
          salesBack: 0,
          commission: 0,
        };
      }
      map[rule.staff_id].salesWithTax += amount;
      map[rule.staff_id].commission += amount * rate;
    });
  });
  return Object.values(map);
}

export type CompanionStats = { staffId: string; name: string; count: number; amount: number };

// 同伴手当：会計済み（closed_atがある）伝票のうち、同伴スタッフが設定されているものを
// 同伴したスタッフごとに数え、スタッフごとの「1回あたりの同伴手当額」を掛けて金額にする。
// 同伴（来店のきっかけを作った人）は、その伝票を実際に接客したスタッフ（staff_id）とは独立した別軸の集計
export function companionAllowanceBreakdown(
  tabs: TabWithItems[],
  staffNameOf: (staffId: string | null) => string,
  allowanceAmountFor: (staffId: string) => number
): CompanionStats[] {
  const map: Record<string, CompanionStats> = {};
  tabs.forEach((t) => {
    if (!t.closed_at) return;
    // 複数人で同伴した場合は、同伴した全員がそれぞれ1回と数える
    tabCompanionIds(t).forEach((id) => {
      if (!map[id]) map[id] = { staffId: id, name: staffNameOf(id), count: 0, amount: 0 };
      map[id].count += 1;
    });
  });
  Object.values(map).forEach((c) => {
    c.amount = c.count * allowanceAmountFor(c.staffId);
  });
  return Object.values(map);
}

// 複数の内訳（通常按分 + 指名歩合 + 担当客の固定/スライド歩合など）をstaffIdで合算して1つの表示用配列にする
export function mergeStaffCommissions(...groups: StaffCommission[][]): StaffCommission[] {
  const map: Record<string, StaffCommission> = {};
  groups.flat().forEach((c) => {
    if (!c.staffId) return;
    if (!map[c.staffId]) {
      map[c.staffId] = { ...c };
    } else {
      map[c.staffId].salesExTax += c.salesExTax;
      map[c.staffId].salesWithTax += c.salesWithTax;
      map[c.staffId].drinkCount += c.drinkCount;
      map[c.staffId].drinkBack += c.drinkBack;
      map[c.staffId].salesBack += c.salesBack;
      map[c.staffId].commission += c.commission;
    }
  });
  return Object.values(map).sort((a, b) => b.commission - a.commission);
}

// ------------------------------------------------------------
// クラブモードの給与計算方法2（指名売上の段階バック）
// ------------------------------------------------------------
export type SnackItemKind = "bottle" | "nomination" | "companion";

// 店舗ごとの設定（stores.snack_pay_settings）。各項目は設定タブのチェック・数値で切り替える
export type SnackPaySettings = {
  method: number; // 給与計算方法の番号（1=通常の按分歩合、2=この段階バック方式）
  salesBackEnabled: boolean; // キャスト売上バック（指名客の売上に段階率）
  stepAmount: number; // この金額ごとに率が上がる（例: 100000）
  stepRate: number; // 1段ごとに上がる率（例: 0.01）。上限なし
  salesIncludeTax: boolean; // 売上バックの元の売上を、消費税・テーブルチャージ込み（お会計の金額）で数える。false=税・TC抜きの小計
  deductBottleCost: boolean; // 売上バックの元から酒代（ボトルの原価）を引く
  deductCompanion: boolean; // 売上バックの元から同伴代（その期間の同伴手当の合計）を引く
  includeNominationInSales: boolean; // 指名料を売上バックの元の売上に含める
  includeBottleToOthersInSales: boolean; // 指名客が他の子に下ろしたボトルも、指名の子の売上に含める
  bottleBackEnabled: boolean; // 自分の指名客以外からボトルを下ろしてもらった時のバック
  bottleBackRate: number; // そのバック率（例: 0.10。販売価格に掛ける、原価は引かない）
  bottleBackCategories: string[]; // ボトルバックの対象にするメニューのカテゴリ（例: ワイン・シャンパン）。空=ボトル扱いの品目すべて
  nominationFullBack: boolean; // 指名料を全額その子のバックにする
  businessCardFee: number; // 毎月差し引く名刺代（円）
  deductionRate: number; // （支給合計−名刺代）に掛ける控除率（例: 0.10）
};

export const DEFAULT_SNACK_PAY_SETTINGS: SnackPaySettings = {
  method: 1,
  salesBackEnabled: true,
  stepAmount: 100000,
  stepRate: 0.01,
  salesIncludeTax: false,
  deductBottleCost: true,
  deductCompanion: true,
  includeNominationInSales: false,
  includeBottleToOthersInSales: true,
  bottleBackEnabled: true,
  bottleBackRate: 0.1,
  bottleBackCategories: [],
  nominationFullBack: true,
  businessCardFee: 3000,
  deductionRate: 0.1,
};

// DBのjsonb（未設定・一部の項目だけ等）を、既定値で補った完全な設定にする
export function normalizeSnackPaySettings(raw: unknown): SnackPaySettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SNACK_PAY_SETTINGS };
  (Object.keys(DEFAULT_SNACK_PAY_SETTINGS) as (keyof SnackPaySettings)[]).forEach((k) => {
    const v = r[k];
    if (Array.isArray(DEFAULT_SNACK_PAY_SETTINGS[k])) {
      if (Array.isArray(v)) (out as Record<string, unknown>)[k] = v.filter((x) => typeof x === "string");
      return;
    }
    if (typeof v === typeof DEFAULT_SNACK_PAY_SETTINGS[k] && (typeof v !== "number" || Number.isFinite(v))) {
      (out as Record<string, unknown>)[k] = v;
    }
  });
  return out;
}

// 段階率：stepAmountごとにstepRateずつ上がり、到達した率を金額全体に1回だけ掛ける（累進ではない、上限なし）
export function snackSalesBackRate(amount: number, stepAmount: number, stepRate: number): number {
  if (amount <= 0 || stepAmount <= 0) return 0;
  return Math.floor(amount / stepAmount + 1e-9) * stepRate;
}

export type SnackPayBreakdown = {
  nominatedSales: number; // 指名客の売上（割引反映後。salesIncludeTaxなら税・テーブルチャージ込み、それ以外は抜き）
  bottleCost: number; // 引いた酒代
  companionDeduction: number; // 売上から除いた同伴料（伝票の同伴料の品目。同伴手当として別にその子へ渡す）
  salesBackBase: number; // 売上バックの元（上の差し引き後）
  salesBackRate: number;
  salesBack: number;
  bottleBack: number; // 指名客以外から下ろしてもらったボトルのバック
  nominationBack: number; // 指名料の全額バック
};

// 伝票の品目が、メニュー上でボトル/指名料のどれに当たるか・原価はいくらかを、品名（＋金額）でメニューから引く。
// 伝票側には持たせないので、原価を設定し直すと過去の伝票にもその原価が使われる（値上がり時は設定し直す運用）
export function snackMenuResolver(menuItems: MenuItem[]) {
  const byNamePrice = new Map<string, MenuItem>();
  const byName = new Map<string, MenuItem>();
  menuItems.forEach((m) => {
    byNamePrice.set(`${m.name}\u0000${m.price}`, m);
    if (!byName.has(m.name) || m.active) byName.set(m.name, m);
  });
  return (item: Pick<TabItem, "name" | "price">) => byNamePrice.get(`${item.name}\u0000${item.price}`) ?? byName.get(item.name) ?? null;
}

// 伝票の売上を誰の指名売上にするかの割合。分割払いで支払った人ごとに担当（tab_payments.staff_id）が入っていれば、
// その支払い金額の比率で分ける（担当が空の支払いは伝票の指名の子の分）。分割の担当が無ければ指名の子が丸ごと（1）
export function tabSalesShares(
  t: Pick<Tab, "tab_payments">,
  nominator: string | null
): Map<string, number> {
  const shares = new Map<string, number>();
  const payments = (t.tab_payments ?? []).filter((p) => p.amount > 0);
  const total = payments.reduce((a, p) => a + p.amount, 0);
  if (total > 0 && payments.some((p) => p.staff_id)) {
    payments.forEach((p) => {
      const owner = p.staff_id ?? nominator;
      if (owner) shares.set(owner, (shares.get(owner) ?? 0) + p.amount / total);
    });
    return shares;
  }
  if (nominator) shares.set(nominator, 1);
  return shares;
}

// 1人分の給与計算方法2の歩合。指名客＝customers.primary_staff_idがこの人の顧客。
// 伝票の割引は割合で反映（指名料バックだけは値引きに関係なく品目の金額そのまま）。会計済みの伝票だけを数える
export function snackPayBreakdown(
  tabs: TabWithItems[],
  customers: Pick<Customer, "id" | "primary_staff_id">[],
  menuItems: MenuItem[],
  settings: SnackPaySettings,
  staffId: string,
  taxRate: number = DEFAULT_TAX_RATE
): SnackPayBreakdown {
  const primaryOf = new Map(customers.map((c) => [c.id, c.primary_staff_id]));
  const menuOf = snackMenuResolver(menuItems);
  let nominatedSales = 0;
  let bottleCost = 0;
  let bottleBack = 0;
  let nominationBack = 0;
  let companionDeduction = 0;

  tabs.forEach((t) => {
    if (!t.closed_at) return;
    const preDiscount = tabPreDiscountTotal(t.tab_items, taxRate);
    const keepRatio =
      preDiscount > 0 ? (preDiscount - tabDiscountAmount(t.tab_items, taxRate, t.discount_percent, t.discount_amount)) / preDiscount : 1;
    const nominator = t.customer_id ? primaryOf.get(t.customer_id) ?? null : null;
    // 分割払いで支払った人ごとに担当が違えば、その金額の比率で指名売上を分ける
    const shares = tabSalesShares(t, nominator);
    const myShare = shares.get(staffId) ?? 0;

    t.tab_items.forEach((i) => {
      const amount = itemSubtotal(i) * keepRatio;
      // 指名売上に入れる額。設定によりお会計の金額（税・TC込み）で数える（ボトルバックは常に税・TC抜きの販売価格）
      const salesAmount = settings.salesIncludeTax ? amount * (1 + taxRate) : amount;
      const menu = menuOf(i);
      const kind = menu?.snack_item_kind ?? null;

      if (kind === "nomination") {
        // 指名料：品目の担当（無ければ指名の子）に、値引きに関係なく品目の金額をそのまま全額
        if (settings.nominationFullBack && (i.staff_id ?? nominator ?? t.staff_id) === staffId)
          nominationBack += itemSubtotal(i);
        if (settings.includeNominationInSales) nominatedSales += salesAmount * myShare;
        return;
      }

      if (kind === "companion") {
        // 同伴料：同伴手当としてその子に渡すので、設定により売上バックの元から除く（お会計に乗った金額のまま）
        nominatedSales += salesAmount * myShare;
        if (settings.deductCompanion) companionDeduction += salesAmount * myShare;
        return;
      }

      if (kind === "bottle") {
        // その伝票の売上が入る子（指名の子、分割払いなら各支払いの担当）以外に下ろしたボトル
        const toOther = i.staff_id != null && !shares.has(i.staff_id);
        const backTarget =
          settings.bottleBackCategories.length === 0 ||
          settings.bottleBackCategories.includes(menu?.category ?? UNCATEGORIZED_LABEL);
        if (settings.bottleBackEnabled && backTarget && toOther && i.staff_id === staffId)
          bottleBack += amount * settings.bottleBackRate;
        if (!toOther || settings.includeBottleToOthersInSales) {
          nominatedSales += salesAmount * myShare;
          bottleCost += (menu?.cost_price ?? 0) * i.qty * myShare;
        }
        return;
      }

      nominatedSales += salesAmount * myShare;
    });
  });

  const deductedCost = settings.deductBottleCost ? bottleCost : 0;
  const salesBackBase = Math.max(0, nominatedSales - deductedCost - companionDeduction);
  const salesBackRate = settings.salesBackEnabled
    ? snackSalesBackRate(salesBackBase, settings.stepAmount, settings.stepRate)
    : 0;
  return {
    nominatedSales,
    bottleCost: deductedCost,
    companionDeduction,
    salesBackBase,
    salesBackRate,
    salesBack: salesBackBase * salesBackRate,
    bottleBack,
    nominationBack,
  };
}

// 給与計算方法2の同伴回数。伝票に同伴料の品目が入っていれば、その品目の担当（未指定なら伝票の同伴ボタンの人たち
// で分け合い、同伴ボタンが無ければ指名の子→伝票の担当の順）に数量分を数える。同伴料の品目が無い伝票は、従来どおり同伴ボタンで1回と数える。
// 同じ伝票で品目とボタンの両方を使っても二重には数えない
export function snackCompanionCount(
  tabs: TabWithItems[],
  customers: Pick<Customer, "id" | "primary_staff_id">[],
  menuItems: MenuItem[],
  staffId: string
): number {
  const primaryOf = new Map(customers.map((c) => [c.id, c.primary_staff_id]));
  const menuOf = snackMenuResolver(menuItems);
  let count = 0;
  tabs.forEach((t) => {
    if (!t.closed_at) return;
    const companionItems = t.tab_items.filter((i) => menuOf(i)?.snack_item_kind === "companion");
    const companions = tabCompanionIds(t);
    if (companionItems.length === 0) {
      if (companions.includes(staffId)) count += 1;
      return;
    }
    const nominator = t.customer_id ? primaryOf.get(t.customer_id) ?? null : null;
    companionItems.forEach((i) => {
      if (i.staff_id) {
        if (i.staff_id === staffId) count += i.qty;
      } else if (companions.length > 0) {
        // 担当が未指定の同伴料は同伴した全員で数量を分け合う。ただし同伴した人は最低1回と数える
        if (companions.includes(staffId)) count += Math.max(1, i.qty / companions.length);
      } else if ((nominator ?? t.staff_id) === staffId) {
        count += i.qty;
      }
    });
  });
  return count;
}

// 支給合計から名刺代を引き、その残りに控除率を掛けた額を控除する
export function snackDeductions(gross: number, settings: SnackPaySettings) {
  const businessCardFee = Math.min(Math.max(0, gross), settings.businessCardFee);
  const afterFee = gross - businessCardFee;
  const deduction = Math.max(0, afterFee) * settings.deductionRate;
  return { businessCardFee, deduction, net: afterFee - deduction };
}
