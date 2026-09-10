// Date計算はローカル時刻に依存するため、日本時間で固定して検証する
process.env.TZ = "Asia/Tokyo";

import { describe, it, expect } from "vitest";
import {
  roundUpTo100,
  tabSubtotal,
  tabDiscountAmount,
  tabTax,
  tabTotal,
  customerStats,
  businessDateFor,
  attHours,
  dayLaborCost,
  effectiveHourlyWage,
  hourlyLaborBreakdown,
  staffCommissionBreakdown,
  daySummary,
  hexToRgbTriplet,
  SlideScaleTier,
  attendanceWorkedSet,
  didWorkOn,
  primaryCustomerOwnerResolver,
  primaryCustomerSalesBreakdown,
  slideScaleRate,
  commissionMonthNumber,
  slideScaleCommission,
  namedCustomerCommission,
  mergeStaffCommissions,
  TabItem,
  TabWithItems,
  Attendance,
  Expense,
  Customer,
  Staff,
  CustomerStaffCommissionRule,
} from "./types";

function item(overrides: Partial<TabItem> = {}): TabItem {
  return {
    id: overrides.id ?? Math.random().toString(36),
    tab_id: "tab-1",
    staff_id: null,
    name: "テスト品目",
    price: 1000,
    qty: 1,
    source: "menu",
    is_cast_drink: false,
    created_at: "2026-07-01T20:00:00+09:00",
    ...overrides,
  };
}

function tab(overrides: Partial<TabWithItems> = {}): TabWithItems {
  return {
    id: overrides.id ?? Math.random().toString(36),
    store_id: "store-1",
    business_date: "2026-07-01",
    name: "テスト卓",
    customer_id: null,
    memo: "",
    payment_method: "cash",
    guest_count: null,
    guest_count_male: null,
    guest_count_female: null,
    course_ends_at: null,
    discount_percent: null,
    discount_amount: null,
    staff_id: null,
    created_at: "2026-07-01T20:00:00+09:00",
    closed_at: "2026-07-01T23:00:00+09:00",
    tab_items: [],
    ...overrides,
  };
}

const staffNameOf = (id: string | null) => (id === "a" ? "Aさん" : id === "b" ? "Bさん" : "未設定");

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: overrides.id ?? Math.random().toString(36),
    store_id: "store-1",
    name: "テスト客",
    name_kana: null,
    phone: null,
    birthday: null,
    primary_staff_id: null,
    bottle_keep: null,
    memo: "",
    active: true,
    created_at: "2026-07-01T00:00:00+09:00",
    ...overrides,
  };
}

function staff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: overrides.id ?? Math.random().toString(36),
    store_id: "store-1",
    name: "テストスタッフ",
    hourly_wage: null,
    active: true,
    commission_eligible: true,
    base_salary: null,
    special_allowance: null,
    special_wage: null,
    special_wage_days: null,
    special_wage_holiday: false,
    commission_tax_basis_override: null,
    commission_basis: "own_tabs",
    total_sales_commission_rate: null,
    commission_rate_override: null,
    commission_mode: "standard",
    primary_customer_rate: null,
    primary_customer_day_off_rate: null,
    commission_start_date: null,
    primary_customer_guarantee_amount: null,
    primary_customer_guarantee_startup_rate: null,
    primary_customer_guarantee_startup_months: null,
    ...overrides,
  };
}

function rule(overrides: Partial<CustomerStaffCommissionRule> = {}): CustomerStaffCommissionRule {
  return {
    id: overrides.id ?? Math.random().toString(36),
    store_id: "store-1",
    customer_id: "customer-1",
    staff_id: "a",
    rate: 0.1,
    day_off_rate: 0,
    note: null,
    created_at: "2026-07-01T00:00:00+09:00",
    ...overrides,
  };
}

function attendanceRow(staffId: string, businessDate: string): Attendance {
  return {
    id: Math.random().toString(36),
    store_id: "store-1",
    staff_id: staffId,
    business_date: businessDate,
    clock_in: `${businessDate}T19:00:00+09:00`,
    clock_out: `${businessDate}T23:00:00+09:00`,
    wage_snapshot: null,
  };
}

describe("roundUpTo100", () => {
  it("rounds up to the nearest 100 yen", () => {
    expect(roundUpTo100(1120)).toBe(1200);
    expect(roundUpTo100(1200)).toBe(1200);
    expect(roundUpTo100(1)).toBe(100);
    expect(roundUpTo100(0)).toBe(0);
  });
});

describe("tab subtotal / discount / tax / total", () => {
  it("computes subtotal from items", () => {
    const items = [item({ price: 1000, qty: 2 }), item({ price: 500, qty: 1 })];
    expect(tabSubtotal(items)).toBe(2500);
  });

  it("applies percent discount against the tax-included total, capped there", () => {
    // 小計1000・消費税100・割引前合計1100 に対して割引をかける（小計に対してではない）
    const items = [item({ price: 1000, qty: 1 })];
    expect(tabDiscountAmount(items, 0.1, 30, null)).toBe(330); // 1100 * 30% = 330
    expect(tabDiscountAmount(items, 0.1, 150, null)).toBe(1100); // 割引が割引前合計を超えない
  });

  it("combines percent and fixed discount against the total", () => {
    // 小計10000・消費税1000・割引前合計11000
    const items = [item({ price: 10000, qty: 1 })];
    expect(tabDiscountAmount(items, 0.1, 30, 500)).toBe(3800); // 11000*30% + 500
    expect(tabTotal(items, 0.1, 30, 500)).toBe(7200); // roundUpTo100(11000-3800)
  });

  it("rounds tax to the nearest yen and total up to 100 yen", () => {
    const items = [item({ price: 333, qty: 1 })];
    expect(tabTax(items, 0.1)).toBe(33); // 333*0.1=33.3 -> 33
    expect(tabTotal(items, 0.1)).toBe(400); // 333+33=366 -> 400
  });

  it("matches the no-discount, round-number case exactly", () => {
    const items = [item({ price: 1000, qty: 2 })]; // 2000
    expect(tabTax(items, 0.1)).toBe(200);
    expect(tabTotal(items, 0.1)).toBe(2200);
  });
});

describe("businessDateFor", () => {
  // 2026-07-24 の実際のバグ: toISOString()でUTC変換していたため、切り替え時刻(6時)より前の
  // 深夜帯で余分に1日ズレていた（2026-07-23になるべきところが2026-07-22になっていた）
  it("stays on the previous business day for hours before the cutoff", () => {
    const d = new Date("2026-07-24T02:00:00+09:00");
    expect(businessDateFor(d, 6)).toBe("2026-07-23");
  });

  it("rolls over to the new business day exactly at the cutoff hour", () => {
    const d = new Date("2026-07-24T06:00:00+09:00");
    expect(businessDateFor(d, 6)).toBe("2026-07-24");
  });

  it("keeps the calendar date for ordinary evening hours", () => {
    const d = new Date("2026-07-24T20:30:00+09:00");
    expect(businessDateFor(d, 6)).toBe("2026-07-24");
  });

  it("handles a cutoff of 0 (midnight) as a no-op", () => {
    const d = new Date("2026-07-24T00:30:00+09:00");
    expect(businessDateFor(d, 0)).toBe("2026-07-24");
  });
});

describe("attHours / dayLaborCost / hourlyLaborBreakdown", () => {
  it("computes elapsed hours between clock in/out", () => {
    const a: Attendance = {
      id: "1",
      store_id: "s",
      staff_id: "a",
      business_date: "2026-07-01",
      clock_in: "2026-07-01T19:00:00+09:00",
      clock_out: "2026-07-01T23:30:00+09:00",
      wage_snapshot: 1500,
    };
    expect(attHours(a)).toBeCloseTo(4.5, 5);
  });

  it("uses now() when still clocked in", () => {
    const a: Attendance = {
      id: "1",
      store_id: "s",
      staff_id: "a",
      business_date: "2026-07-01",
      clock_in: "2026-07-01T19:00:00+09:00",
      clock_out: null,
      wage_snapshot: 1500,
    };
    const now = new Date("2026-07-01T21:00:00+09:00").getTime();
    expect(attHours(a, now)).toBeCloseTo(2, 5);
  });

  it("sums hourly labor cost across staff, skipping unset wages", () => {
    const attendance: Attendance[] = [
      {
        id: "1",
        store_id: "s",
        staff_id: "a",
        business_date: "2026-07-01",
        clock_in: "2026-07-01T19:00:00+09:00",
        clock_out: "2026-07-01T23:00:00+09:00",
        wage_snapshot: 1500,
      },
      {
        id: "2",
        store_id: "s",
        staff_id: "b",
        business_date: "2026-07-01",
        clock_in: "2026-07-01T19:00:00+09:00",
        clock_out: "2026-07-01T21:00:00+09:00",
        wage_snapshot: null, // 時給未設定は人件費に含めない
      },
    ];
    expect(dayLaborCost(attendance)).toBe(4 * 1500);

    const rows = hourlyLaborBreakdown(attendance, staffNameOf);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staffId: "a", hours: 4, cost: 6000 });
  });
});

describe("effectiveHourlyWage", () => {
  const base = { hourly_wage: 1200, special_wage: 1600, special_wage_days: [6], special_wage_holiday: false };

  it("uses the special wage on a matching weekday", () => {
    expect(effectiveHourlyWage(base, "2024-01-06")).toBe(1600); // 土曜日
  });

  it("uses the normal wage on a non-matching weekday", () => {
    expect(effectiveHourlyWage(base, "2024-01-10")).toBe(1200); // 水曜日
  });

  it("uses the special wage on a national holiday when holiday flag is set, even off the configured weekday", () => {
    const staff = { ...base, special_wage_days: [], special_wage_holiday: true };
    expect(effectiveHourlyWage(staff, "2024-11-03")).toBe(1600); // 文化の日（日曜以外の祝日）
  });

  it("ignores holidays when the holiday flag is off", () => {
    const staff = { ...base, special_wage_days: [], special_wage_holiday: false };
    expect(effectiveHourlyWage(staff, "2024-11-03")).toBe(1200);
  });

  it("falls back to the normal wage when no special wage is configured", () => {
    const staff = { ...base, special_wage: null };
    expect(effectiveHourlyWage(staff, "2024-01-06")).toBe(1200);
  });
});

describe("staffCommissionBreakdown — simple scheme", () => {
  it("gives 100% of the tab's actual total to the assigned staff, times the rate", () => {
    const t = tab({
      staff_id: "a",
      discount_percent: null,
      tab_items: [item({ price: 1000, qty: 3 })], // 3000 -> tax 300 -> total 3300 (no rounding needed)
    });
    const result = staffCommissionBreakdown([t], staffNameOf, 0.1, 0.2, "simple");
    expect(result).toHaveLength(1);
    expect(result[0].staffId).toBe("a");
    expect(result[0].salesWithTax).toBeCloseTo(3300, 5);
    expect(result[0].commission).toBeCloseTo(660, 5); // 3300 * 0.2
  });

  it("gives the sole assignee the tab's actual rounded checkout total, round-up included", () => {
    const t = tab({
      staff_id: "a",
      tab_items: [item({ price: 910, qty: 1 })], // 910 -> tax 91 -> 1001（レジ会計では1100円に切り上げ）
    });
    const result = staffCommissionBreakdown([t], staffNameOf, 0.1, 0.2, "simple");
    // 1人で丸ごと担当しているので、実際にレジを通った1100円がそのまま歩合の元になる
    expect(result[0].salesWithTax).toBeCloseTo(1100, 5);
    expect(result[0].commission).toBeCloseTo(220, 5);
  });

  it("does not hand the tab's round-up bonus to just one person when it's shared", () => {
    const t = tab({
      staff_id: null,
      tab_items: [
        item({ price: 455, qty: 1, staff_id: "a" }),
        item({ price: 455, qty: 1, staff_id: "b" }), // 910 -> tax 91 -> 1001（会計は1100円に切り上げ）
      ],
    });
    const result = staffCommissionBreakdown([t], staffNameOf, 0.1, 0.2, "simple");
    const a = result.find((r) => r.staffId === "a")!;
    const b = result.find((r) => r.staffId === "b")!;
    // 半々で担当。切り上げ後の1100円を折半すると550円ずつになってしまうが、
    // 切り上げ前の1001円を折半した500.5円ずつが正しい（切り上げ分は誰か1人だけの取り分にはしない）
    expect(a.salesWithTax).toBeCloseTo(500.5, 5);
    expect(b.salesWithTax).toBeCloseTo(500.5, 5);
  });

  it("gives the tab's round-up remainder to its default staff, not to whoever got an item override", () => {
    const t = tab({
      staff_id: "a", // 伝票そのものの担当（デフォルト）
      tab_items: [
        item({ price: 8800, qty: 1 }), // 個別指定なし -> デフォルト担当(a)のまま
        item({ price: 20000, qty: 1, staff_id: "b" }), // bに個別指定
      ], // 小計28800 -> 税込31680（会計は31700に切り上げ）
    });
    const result = staffCommissionBreakdown([t], staffNameOf, 0.1, 0.2, "simple");
    const a = result.find((r) => r.staffId === "a")!;
    const b = result.find((r) => r.staffId === "b")!;
    // a: 31680の11/36(=9680) + 切り上げ差額20 = 9700 / b: 31680の25/36(=22000)そのまま
    expect(a.salesWithTax).toBeCloseTo(9700, 5);
    expect(b.salesWithTax).toBeCloseTo(22000, 5);
    expect(a.salesWithTax + b.salesWithTax).toBeCloseTo(31700, 5); // 合計は実際の会計額と一致する
  });

  it("lets a per-item staff override split commission between two staff", () => {
    const t = tab({
      staff_id: "a",
      tab_items: [item({ price: 2000, qty: 1 }), item({ price: 2000, qty: 1, staff_id: "b" })],
    });
    const result = staffCommissionBreakdown([t], staffNameOf, 0.1, 0.2, "simple");
    const a = result.find((r) => r.staffId === "a")!;
    const b = result.find((r) => r.staffId === "b")!;
    // 4000 subtotal -> tax 400 -> total 4400、半々の按分
    expect(a.salesWithTax).toBeCloseTo(2200, 5);
    expect(b.salesWithTax).toBeCloseTo(2200, 5);
  });

  it("excludes commission-ineligible staff from the payout", () => {
    const t = tab({ staff_id: "a", tab_items: [item({ price: 3000, qty: 1 })] });
    const result = staffCommissionBreakdown([t], staffNameOf, 0.1, 0.2, "simple", 200, (id) => id !== "a");
    expect(result).toHaveLength(0);
  });

  it("ignores tabs that are still open (no closed_at)", () => {
    const t = tab({ staff_id: "a", closed_at: null, tab_items: [item({ price: 3000, qty: 1 })] });
    expect(staffCommissionBreakdown([t], staffNameOf)).toHaveLength(0);
  });
});

describe("staffCommissionBreakdown — taxBasis='pre_tax'", () => {
  it("uses the tax-excluded subtotal as the commission base, ignoring the round-up entirely", () => {
    const t = tab({
      staff_id: "a",
      tab_items: [item({ price: 1000, qty: 3 })], // 小計3000 -> 税込3300
    });
    const result = staffCommissionBreakdown([t], staffNameOf, 0.1, 0.2, "simple", 200, () => true, () => "pre_tax");
    expect(result[0].salesWithTax).toBeCloseTo(3000, 5);
    expect(result[0].commission).toBeCloseTo(600, 5); // 3000 * 0.2
  });

  it("still applies the discount's keep-ratio (税込ベースで見た割引後の残存割合) to the pre-tax subtotal", () => {
    const t = tab({
      staff_id: "a",
      discount_amount: 500,
      tab_items: [item({ price: 2400, qty: 1 })], // 小計2400 -> 税込2640 -> 割引後2140
    });
    const result = staffCommissionBreakdown([t], staffNameOf, 0.1, 0.2, "simple", 200, () => true, () => "pre_tax");
    const keepRatio = 2140 / 2640;
    expect(result[0].salesWithTax).toBeCloseTo(2400 * keepRatio, 5);
  });

  it("lets taxBasisFor() vary the basis per staff on the same tab", () => {
    const t = tab({
      staff_id: "a",
      tab_items: [item({ price: 2000, qty: 1 }), item({ price: 2000, qty: 1, staff_id: "b" })],
      // 小計4000 -> 税込4400（丸ごと按分なら切り上げなし）
    });
    const result = staffCommissionBreakdown(
      [t],
      staffNameOf,
      0.1,
      0.2,
      "simple",
      200,
      () => true,
      (staffId) => (staffId === "b" ? "pre_tax" : "with_tax")
    );
    const a = result.find((r) => r.staffId === "a")!;
    const b = result.find((r) => r.staffId === "b")!;
    expect(a.salesWithTax).toBeCloseTo(2200, 5); // with_tax: 4400の半分
    expect(b.salesWithTax).toBeCloseTo(2000, 5); // pre_tax: 4000（税抜小計）の半分
  });
});

describe("staffCommissionBreakdown — totalSalesStaff (commission_basis='total_sales')", () => {
  it("pays the total-sales staff on the sum of commission-eligible tabs, not the store's raw sales", () => {
    const t1 = tab({ staff_id: "a", tab_items: [item({ price: 3000, qty: 1 })] }); // 税込3300、歩合対象
    const t2 = tab({
      staff_id: "c", // cは総売上歩合の対象。担当していても、その伝票自体は歩合対象の合計には含まれない
      tab_items: [item({ price: 1000, qty: 1 })], // 税込1100
    });
    const t3 = tab({ staff_id: "b", tab_items: [item({ price: 2000, qty: 1 })] }); // 税込2200、bは歩合対象外
    const result = staffCommissionBreakdown(
      [t1, t2, t3],
      staffNameOf,
      0.1,
      0.2,
      "simple",
      200,
      (id) => id !== "b",
      () => "with_tax",
      [{ staffId: "c", rate: 0.05 }]
    );
    const a = result.find((r) => r.staffId === "a")!;
    const c = result.find((r) => r.staffId === "c")!;
    const b = result.find((r) => r.staffId === "b");
    // aは通常どおり自分の担当分（3300）だけが対象
    expect(a.salesWithTax).toBeCloseTo(3300, 5);
    expect(a.commission).toBeCloseTo(660, 5);
    // bは歩合対象外なので歩合が発生しない
    expect(b).toBeUndefined();
    // cは自分が担当したt2（歩合対象の合計には含まれない）でも、bの担当分（歩合対象外）でもなく、
    // 歩合対象スタッフ(a)が担当したt1の3300だけに専用の歩合率(5%)を掛けた額になる
    expect(c.salesWithTax).toBeCloseTo(3300, 5);
    expect(c.commission).toBeCloseTo(165, 5);
  });

  it("still shows up with zero commission when there are no closed tabs", () => {
    const result = staffCommissionBreakdown(
      [],
      staffNameOf,
      0.1,
      0.2,
      "simple",
      200,
      () => true,
      () => "with_tax",
      [{ staffId: "c", rate: 0.05 }]
    );
    expect(result.find((r) => r.staffId === "c")?.commission).toBe(0);
  });
});

describe("staffCommissionBreakdown — commissionRateFor (per-staff commission_rate_override)", () => {
  it("lets an own_tabs staff use their own rate instead of the store's commissionRate", () => {
    const t1 = tab({ staff_id: "a", tab_items: [item({ price: 3000, qty: 1 })] }); // 税込3300
    const t2 = tab({ staff_id: "b", tab_items: [item({ price: 3000, qty: 1 })] }); // 税込3300
    const result = staffCommissionBreakdown(
      [t1, t2],
      staffNameOf,
      0.1,
      0.1, // 店舗の歩合率は10%
      "simple",
      200,
      () => true,
      () => "with_tax",
      [],
      (staffId) => (staffId === "a" ? 0.42 : 0.1)
    );
    const a = result.find((r) => r.staffId === "a")!;
    const b = result.find((r) => r.staffId === "b")!;
    expect(a.commission).toBeCloseTo(3300 * 0.42, 5);
    expect(b.commission).toBeCloseTo(3300 * 0.1, 5);
  });
});

describe("staffCommissionBreakdown — drink_back scheme (matches the spec example)", () => {
  it("30,000円の売上・5,000円のドリンク・5杯で 売上バック2,500円+ドリンクバック1,000円=3,500円になる", () => {
    const t = tab({
      staff_id: "a",
      tab_items: [
        item({ price: 25000, qty: 1 }), // 通常売上分
        item({ price: 1000, qty: 5, is_cast_drink: true }), // キャストドリンク5杯 x¥1,000 = 5,000円
      ],
    });
    // 割引なし・税率0%相当にして、サンプルの生数字とそのまま突き合わせられるようにする
    const result = staffCommissionBreakdown([t], staffNameOf, 0, 0.1, "drink_back", 200);
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.drinkCount).toBe(5);
    expect(r.drinkBack).toBe(1000); // 200円 x 5杯
    expect(r.salesBack).toBeCloseTo(2500, 5); // (30000-5000)*10%
    expect(r.commission).toBeCloseTo(3500, 5);
  });
});

describe("daySummary reconciliation", () => {
  it("keeps cash+card+unsettled equal to total, and profit = total - labor - expense", () => {
    const tabs: TabWithItems[] = [
      tab({
        staff_id: "a",
        payment_method: "cash",
        tab_items: [item({ price: 1000, qty: 3 })], // total 3300
      }),
      tab({
        staff_id: "b",
        payment_method: "card",
        tab_items: [item({ price: 2000, qty: 2 })], // total 4400
      }),
      tab({
        staff_id: "a",
        closed_at: null, // 未会計
        tab_items: [item({ price: 500, qty: 1 })], // total 550
      }),
    ];
    const attendance: Attendance[] = [
      {
        id: "1",
        store_id: "s",
        staff_id: "a",
        business_date: "2026-07-01",
        clock_in: "2026-07-01T19:00:00+09:00",
        clock_out: "2026-07-01T23:00:00+09:00",
        wage_snapshot: 1500,
      },
    ];
    const expenses: Expense[] = [
      { id: "1", store_id: "s", business_date: "2026-07-01", category: "仕入れ", name: "氷", amount: 2000, receipt_url: null, created_at: "2026-07-01T20:00:00+09:00" },
    ];

    const summary = daySummary(tabs, attendance, expenses, staffNameOf, 0.1, 0.2, "simple");

    expect(summary.cash + summary.card + summary.unsettled).toBeCloseTo(summary.total, 5);
    expect(summary.profit).toBeCloseTo(summary.total - summary.expense, 8);
    expect(summary.labor).toBeCloseTo(summary.laborHourly + summary.commissionTotal, 8);
  });

  it("excludes ineligible staff's sales from commissionTotal but keeps their hourly cost", () => {
    const tabs: TabWithItems[] = [tab({ staff_id: "kitchen", tab_items: [item({ price: 3000, qty: 1 })] })];
    const attendance: Attendance[] = [
      {
        id: "1",
        store_id: "s",
        staff_id: "kitchen",
        business_date: "2026-07-01",
        clock_in: "2026-07-01T19:00:00+09:00",
        clock_out: "2026-07-01T23:00:00+09:00",
        wage_snapshot: 1300,
      },
    ];
    const summary = daySummary(tabs, attendance, [], staffNameOf, 0.1, 0.2, "simple", 200, (id) => id !== "kitchen");
    expect(summary.commissionTotal).toBe(0);
    expect(summary.laborHourly).toBe(4 * 1300);
    expect(summary.labor).toBe(4 * 1300);
  });
});

describe("hexToRgbTriplet", () => {
  it("converts a hex color to an R G B triplet", () => {
    expect(hexToRgbTriplet("#DCA84E")).toBe("220 168 78");
    expect(hexToRgbTriplet("6FB3E0")).toBe("111 179 224");
  });

  it("falls back to the default gold for invalid input", () => {
    expect(hexToRgbTriplet("not-a-color")).toBe("212 175 106");
    expect(hexToRgbTriplet("#fff")).toBe("212 175 106");
  });
});

describe("customerStats", () => {
  it("only counts closed tabs toward visitCount and totalSales", () => {
    const tabs: TabWithItems[] = [
      tab({ tab_items: [item({ price: 1000, qty: 3 })] }), // closed, total 3300
      tab({ closed_at: null, tab_items: [item({ price: 5000, qty: 1 })] }), // 未会計、除外される
    ];
    const stats = customerStats(tabs, 0.1);
    expect(stats.visitCount).toBe(1);
    expect(stats.totalSales).toBe(tabTotal(tabs[0].tab_items, 0.1, null, null));
  });

  it("sums totalSales across multiple closed tabs, including discounts", () => {
    const tabs: TabWithItems[] = [
      tab({ tab_items: [item({ price: 1000, qty: 3 })] }), // total 3300
      tab({ discount_percent: 30, tab_items: [item({ price: 2000, qty: 1 })] }), // 2200 - 30% = 1540 → 切り上げ1600
    ];
    const stats = customerStats(tabs, 0.1);
    expect(stats.visitCount).toBe(2);
    expect(stats.totalSales).toBe(
      tabTotal(tabs[0].tab_items, 0.1, null, null) + tabTotal(tabs[1].tab_items, 0.1, 30, null)
    );
  });

  it("returns the latest business_date among closed tabs as lastVisitDate", () => {
    const tabs: TabWithItems[] = [
      tab({ business_date: "2026-07-01" }),
      tab({ business_date: "2026-07-15" }),
      tab({ business_date: "2026-07-10" }),
    ];
    expect(customerStats(tabs).lastVisitDate).toBe("2026-07-15");
  });

  it("returns zeros/null for an empty tab list", () => {
    expect(customerStats([])).toEqual({ visitCount: 0, totalSales: 0, lastVisitDate: null });
  });
});

describe("attendanceWorkedSet / didWorkOn", () => {
  it("hits for a staff/date pair present in attendance, misses otherwise", () => {
    const set = attendanceWorkedSet([attendanceRow("a", "2026-07-01"), attendanceRow("b", "2026-07-02")]);
    expect(didWorkOn(set, "a", "2026-07-01")).toBe(true);
    expect(didWorkOn(set, "a", "2026-07-02")).toBe(false);
    expect(didWorkOn(set, "c", "2026-07-01")).toBe(false);
  });
});

describe("primaryCustomerOwnerResolver", () => {
  it("resolves a customer to its primary staff only if that staff opted in (commission_mode !== 'standard')", () => {
    const customers = [
      customer({ id: "c1", primary_staff_id: "a" }),
      customer({ id: "c2", primary_staff_id: "b" }),
      customer({ id: "c3", primary_staff_id: null }),
    ];
    const staffList = [
      staff({ id: "a", commission_mode: "primary_customer_flat" }),
      staff({ id: "b", commission_mode: "standard" }),
    ];
    const resolve = primaryCustomerOwnerResolver(customers, staffList);
    expect(resolve("c1")).toBe("a");
    expect(resolve("c2")).toBeNull();
    expect(resolve("c3")).toBeNull();
    expect(resolve(null)).toBeNull();
  });
});

describe("staffCommissionBreakdown — primaryCustomerOwnerOf exclusion", () => {
  it("excludes a primary-customer tab from the substitute server's commission entirely", () => {
    const excludedTab = tab({
      customer_id: "c1",
      staff_id: "b", // 代行スタッフ
      tab_items: [item({ price: 10000, qty: 1, staff_id: null })],
    });
    const ownerOf = (customerId: string | null) => (customerId === "c1" ? "a" : null);

    const withExclusion = staffCommissionBreakdown(
      [excludedTab], staffNameOf, 0.1, 0.2, "simple", 200,
      () => true, () => "with_tax", [], () => 0.2, ownerOf
    );
    expect(withExclusion.find((c) => c.staffId === "b")).toBeUndefined();

    const withoutExclusion = staffCommissionBreakdown(
      [excludedTab], staffNameOf, 0.1, 0.2, "simple", 200,
      () => true, () => "with_tax", [], () => 0.2
    );
    expect(withoutExclusion.find((c) => c.staffId === "b")?.commission).toBeGreaterThan(0);
  });

  it("does not affect tabs without a primary-customer owner (regression check)", () => {
    const normalTab = tab({ staff_id: "b", tab_items: [item({ price: 10000, qty: 1 })] });
    const result = staffCommissionBreakdown(
      [normalTab], staffNameOf, 0.1, 0.2, "simple", 200,
      () => true, () => "with_tax", [], () => 0.2, () => null
    );
    expect(result.find((c) => c.staffId === "b")?.commission).toBeGreaterThan(0);
  });

  it("excludes the tab from total_sales aggregation too, avoiding double counting", () => {
    const excludedTab = tab({ customer_id: "c1", staff_id: "b", tab_items: [item({ price: 10000, qty: 1 })] });
    const ownerOf = (customerId: string | null) => (customerId === "c1" ? "a" : null);
    const result = staffCommissionBreakdown(
      [excludedTab], staffNameOf, 0.1, 0.2, "simple", 200,
      () => true, () => "with_tax",
      [{ staffId: "x", rate: 0.05 }],
      () => 0.2, ownerOf
    );
    expect(result.find((c) => c.staffId === "x")?.salesWithTax ?? 0).toBe(0);
  });
});

describe("primaryCustomerSalesBreakdown", () => {
  it("splits an owner's tabs into worked-day and off-day sales", () => {
    const tabs = [
      tab({ customer_id: "c1", business_date: "2026-07-01", staff_id: "a", tab_items: [item({ price: 10000, qty: 1 })] }),
      tab({ customer_id: "c1", business_date: "2026-07-02", staff_id: "b", tab_items: [item({ price: 5000, qty: 1 })] }),
    ];
    const ownerOf = (customerId: string | null) => (customerId === "c1" ? "a" : null);
    const workedSet = attendanceWorkedSet([attendanceRow("a", "2026-07-01")]); // aは7/1のみ出勤
    const result = primaryCustomerSalesBreakdown(tabs, staffNameOf, ownerOf, workedSet, 0.1);
    const row = result.find((r) => r.staffId === "a")!;
    expect(row.workedSales).toBe(tabTotal(tabs[0].tab_items, 0.1, null, null));
    expect(row.offDaySales).toBe(tabTotal(tabs[1].tab_items, 0.1, null, null));
  });
});

describe("slideScaleRate", () => {
  const tiers: SlideScaleTier[] = [
    { minAmount: 0, rate: 0.2 },
    { minAmount: 300000, rate: 0.22 },
    { minAmount: 400000, rate: 0.25 },
    { minAmount: 500000, rate: 0.27 },
    { minAmount: 700000, rate: 0.3 },
  ];

  it("picks the highest matching tier, applied non-marginally", () => {
    expect(slideScaleRate(tiers, 299999)).toBe(0.2);
    expect(slideScaleRate(tiers, 300000)).toBe(0.22);
    expect(slideScaleRate(tiers, 399999)).toBe(0.22);
    expect(slideScaleRate(tiers, 400000)).toBe(0.25);
    expect(slideScaleRate(tiers, 500000)).toBe(0.27);
    expect(slideScaleRate(tiers, 700000)).toBe(0.3);
    expect(slideScaleRate(tiers, 1000000)).toBe(0.3);
  });

  it("returns 0 when no tier matches", () => {
    expect(slideScaleRate([{ minAmount: 300000, rate: 0.22 }], 100000)).toBe(0);
  });
});

describe("commissionMonthNumber", () => {
  it("counts the start month itself as month 1", () => {
    expect(commissionMonthNumber("2026-06-15", "2026-06")).toBe(1);
    expect(commissionMonthNumber("2026-06-15", "2026-08")).toBe(3);
    expect(commissionMonthNumber("2026-06-15", "2026-09")).toBe(4);
  });

  it("handles a year boundary", () => {
    expect(commissionMonthNumber("2026-11-01", "2027-02")).toBe(4);
  });
});

describe("slideScaleCommission — matches the client's confirmed worked examples", () => {
  const tiers: SlideScaleTier[] = [
    { minAmount: 0, rate: 0.2 },
    { minAmount: 300000, rate: 0.22 },
    { minAmount: 400000, rate: 0.25 },
    { minAmount: 500000, rate: 0.27 },
    { minAmount: 700000, rate: 0.3 },
  ];

  it("month <=3, 200,000円 sales -> 60,000円 (guarantee+10% beats slide 20%)", () => {
    const result = slideScaleCommission({
      workedSales: 200000, tiers, guaranteeAmount: 40000,
      guaranteeStartupRate: 0.1, guaranteeStartupMonths: 3, monthNumber: 2,
    });
    expect(result).toBeCloseTo(60000, 5);
  });

  it("month <=3, 500,000円 sales -> 135,000円 (slide 27% beats guarantee+10%)", () => {
    const result = slideScaleCommission({
      workedSales: 500000, tiers, guaranteeAmount: 40000,
      guaranteeStartupRate: 0.1, guaranteeStartupMonths: 3, monthNumber: 3,
    });
    expect(result).toBeCloseTo(135000, 5);
  });

  it("month 4+, 200,000円 sales -> 40,000円 (flat guarantee only, no startup bonus)", () => {
    const result = slideScaleCommission({
      workedSales: 200000, tiers, guaranteeAmount: 40000,
      guaranteeStartupRate: 0.1, guaranteeStartupMonths: 3, monthNumber: 4,
    });
    expect(result).toBeCloseTo(40000, 5);
  });
});

describe("namedCustomerCommission", () => {
  it("applies the normal rate on a day the earning staff worked", () => {
    const tabs = [tab({ customer_id: "shimachan", business_date: "2026-07-01", tab_items: [item({ price: 10000, qty: 1 })] })];
    const rules = [rule({ customer_id: "shimachan", staff_id: "maasa", rate: 0.21, day_off_rate: 0.15 })];
    const workedSet = attendanceWorkedSet([attendanceRow("maasa", "2026-07-01")]);
    const result = namedCustomerCommission(tabs, rules, () => "まあさ", workedSet, 0.1);
    expect(result[0].commission).toBeCloseTo(tabTotal(tabs[0].tab_items, 0.1, null, null) * 0.21, 5);
  });

  it("applies the day-off rate when the earning staff did not work that day", () => {
    const tabs = [tab({ customer_id: "shimachan", business_date: "2026-07-02", tab_items: [item({ price: 10000, qty: 1 })] })];
    const rules = [rule({ customer_id: "shimachan", staff_id: "maasa", rate: 0.21, day_off_rate: 0.15 })];
    const workedSet = attendanceWorkedSet([attendanceRow("maasa", "2026-07-01")]); // 7/2は出勤なし
    const result = namedCustomerCommission(tabs, rules, () => "まあさ", workedSet, 0.1);
    expect(result[0].commission).toBeCloseTo(tabTotal(tabs[0].tab_items, 0.1, null, null) * 0.15, 5);
  });

  it("sums multiple rules crediting the same staff from different customers", () => {
    const tabs = [
      tab({ customer_id: "yuukun", business_date: "2026-07-01", tab_items: [item({ price: 10000, qty: 1 })] }),
      tab({ customer_id: "shimachan", business_date: "2026-07-01", tab_items: [item({ price: 20000, qty: 1 })] }),
    ];
    const rules = [
      rule({ customer_id: "yuukun", staff_id: "maasa", rate: 0.1, day_off_rate: 0 }),
      rule({ customer_id: "shimachan", staff_id: "maasa", rate: 0.21, day_off_rate: 0.15 }),
    ];
    const workedSet = attendanceWorkedSet([attendanceRow("maasa", "2026-07-01")]);
    const result = namedCustomerCommission(tabs, rules, () => "まあさ", workedSet, 0.1);
    const expected =
      tabTotal(tabs[0].tab_items, 0.1, null, null) * 0.1 + tabTotal(tabs[1].tab_items, 0.1, null, null) * 0.21;
    expect(result.find((c) => c.staffId === "maasa")?.commission).toBeCloseTo(expected, 5);
  });
});

describe("mergeStaffCommissions", () => {
  function commissionRow(staffId: string, commission: number) {
    return {
      staffId,
      name: staffId,
      salesExTax: 0,
      salesWithTax: commission * 5,
      drinkCount: 0,
      drinkBack: 0,
      salesBack: 0,
      commission,
    };
  }

  it("sums commission fields for the same staffId across groups", () => {
    const groupA = [commissionRow("a", 1000)];
    const groupB = [commissionRow("a", 500), commissionRow("b", 300)];
    const result = mergeStaffCommissions(groupA, groupB);
    expect(result.find((c) => c.staffId === "a")?.commission).toBe(1500);
    expect(result.find((c) => c.staffId === "b")?.commission).toBe(300);
  });
});
