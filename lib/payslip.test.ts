process.env.TZ = "Asia/Tokyo";

import { describe, it, expect } from "vitest";
import { computePayslip, PayslipConfig } from "./payslip";
import { Attendance, Staff, TabWithItems, normalizeSnackPaySettings } from "./types";

const config: PayslipConfig = {
  storeMode: "bar",
  tieredPayMethod: false,
  taxRate: 0.1,
  commissionRate: 0.1,
  commissionScheme: "simple",
  drinkBackAmount: 200,
  commissionTaxBasis: "pre_tax",
  slideScaleTiers: [],
  roundUnit: 1,
  snackSettings: normalizeSnackPaySettings(null),
};

function staff(overrides: Partial<Staff>): Staff {
  return {
    id: "a",
    store_id: "store-1",
    name: "Aさん",
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
    companion_allowance_amount: null,
    ...overrides,
  };
}

function tab(overrides: Partial<TabWithItems>): TabWithItems {
  return {
    id: "t1",
    store_id: "store-1",
    business_date: "2026-10-05",
    name: "卓",
    customer_id: null,
    memo: "",
    payment_method: "cash",
    guest_count: null,
    guest_count_male: null,
    guest_count_female: null,
    course_ends_at: null,
    discount_percent: null,
    discount_amount: null,
    staff_id: "a",
    companion_staff_id: null,
    companion_staff_ids: [],
    created_at: "2026-10-05T20:00:00+09:00",
    closed_at: "2026-10-05T23:00:00+09:00",
    tab_items: [
      {
        id: "i1",
        tab_id: "t1",
        staff_id: null,
        name: "セット",
        price: 100000,
        qty: 1,
        source: "menu",
        is_cast_drink: false,
        created_at: "2026-10-05T20:00:00+09:00",
      },
    ],
    ...overrides,
  };
}

function attendance(overrides: Partial<Attendance>): Attendance {
  return {
    id: "att1",
    store_id: "store-1",
    staff_id: "a",
    business_date: "2026-10-05",
    clock_in: "2026-10-05T20:00:00+09:00",
    clock_out: "2026-10-06T00:00:00+09:00",
    wage_snapshot: 1500,
    ...overrides,
  };
}

function pay(s: Staff, staffList: Staff[], tabs: TabWithItems[], att: Attendance[]) {
  return computePayslip({
    staff: s,
    staffList,
    tabs,
    attendance: att,
    customers: [],
    namedRules: [],
    menu: [],
    periodStart: "2026-10-01",
    config,
  });
}

describe("computePayslip", () => {
  it("月給の人は基本給・特別手当が歩合給に加わった額になる", () => {
    const a = staff({ base_salary: 300000, special_allowance: 20000 });
    const r = pay(a, [a], [tab({})], []);
    expect(r.myCommission?.commission).toBeGreaterThan(0);
    expect(r.gross).toBe(300000 + 20000 + (r.myCommission?.commission ?? 0));
    expect(r.payable).toBe(r.gross);
  });

  it("時給の人は時給分が入り、他のスタッフの出勤は混ざらない", () => {
    const a = staff({ hourly_wage: 1500 });
    const b = staff({ id: "b", name: "Bさん" });
    const r = pay(a, [a, b], [], [attendance({}), attendance({ id: "att2", staff_id: "b", wage_snapshot: 3000 })]);
    expect(r.hourlyHours).toBeCloseTo(4);
    expect(r.hourlyCost).toBeCloseTo(6000);
    expect(r.gross).toBeCloseTo(6000);
  });

  it("基本給と時給の両方がある人は両方が足される", () => {
    const a = staff({ base_salary: 100000, hourly_wage: 1500 });
    const r = pay(a, [a], [], [attendance({})]);
    expect(r.gross).toBeCloseTo(106000);
  });

  it("会計前の伝票は歩合に入らない", () => {
    const a = staff({ base_salary: 300000 });
    const r = pay(a, [a], [tab({ closed_at: null })], []);
    expect(r.gross).toBe(300000);
  });
});
