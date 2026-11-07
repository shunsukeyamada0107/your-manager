import {
  Attendance,
  CommissionScheme,
  CommissionTaxBasis,
  Customer,
  CustomerStaffCommissionRule,
  MenuItem,
  SlideScaleTier,
  SnackPaySettings,
  Staff,
  StaffCommission,
  StoreMode,
  TabWithItems,
  attendanceWorkedSet,
  commissionMonthNumber,
  commissionRateResolver,
  commissionTaxBasisResolver,
  companionAllowanceBreakdown,
  hourlyLaborBreakdown,
  namedCustomerCommission,
  primaryCustomerOwnerResolver,
  primaryCustomerSalesBreakdown,
  slideScaleCommission,
  snackCompanionCount,
  snackDeductions,
  snackPayBreakdown,
  staffCommissionBreakdown,
  totalSalesCommissionStaff,
} from "./types";

export type PayslipConfig = {
  storeMode: StoreMode;
  tieredPayMethod: boolean; // クラブモードの給与計算方法2（口座売上の段階バック）か
  taxRate: number;
  commissionRate: number;
  commissionScheme: CommissionScheme;
  drinkBackAmount: number;
  commissionTaxBasis: CommissionTaxBasis;
  slideScaleTiers: SlideScaleTier[];
  roundUnit: number;
  snackSettings: SnackPaySettings;
};

export type PayslipInput = {
  staff: Staff;
  staffList: Staff[];
  tabs: TabWithItems[]; // 対象期間の伝票（会計済みだけが集計対象）
  attendance: Attendance[]; // 対象期間の出退勤（他のスタッフ分が混ざっていてもよい）
  customers: Customer[]; // クラブモードのみ。それ以外は空でよい
  namedRules: CustomerStaffCommissionRule[]; // クラブモードのみ。他のスタッフ分が混ざっていてもよい
  menu: MenuItem[];
  periodStart: string; // 対象期間の開始日（YYYY-MM-DD）。スライド歩合の起算月数の判定に使う
  config: PayslipConfig;
};

// 給与明細の支給合計とその内訳。設定タブの給与明細と、集計タブの月次人件費が同じ額になるよう、計算はここ1か所に置く
export function computePayslip({
  staff: s,
  staffList,
  tabs,
  attendance,
  customers,
  namedRules,
  menu,
  periodStart,
  config,
}: PayslipInput) {
  const closedTabs = tabs.filter((t) => t.closed_at);
  const myAttendance = attendance.filter((a) => a.staff_id === s.id);
  const myRules = namedRules.filter((r) => r.staff_id === s.id);

  const isEligible = (staffId: string) => staffList.find((x) => x.id === staffId)?.commission_eligible ?? true;
  const nameOf = (id: string | null) => staffList.find((x) => x.id === id)?.name ?? "(元スタッフ)";
  const workedSet = attendanceWorkedSet(myAttendance);
  const ownerOf = primaryCustomerOwnerResolver(customers, staffList);

  const myCommission: StaffCommission | undefined = staffCommissionBreakdown(
    closedTabs,
    nameOf,
    config.taxRate,
    config.commissionRate,
    config.commissionScheme,
    config.drinkBackAmount,
    isEligible,
    commissionTaxBasisResolver(staffList, config.commissionTaxBasis),
    totalSalesCommissionStaff(staffList),
    commissionRateResolver(staffList, config.commissionRate),
    ownerOf,
    config.roundUnit
  ).find((c) => c.staffId === s.id);
  const isSnack = config.tieredPayMethod;
  // 給与計算方法2は通常の按分歩合を使わず、下の専用計算（売上バック・ボトルバック・指名料）に置き換える
  const commission = isSnack ? 0 : myCommission?.commission ?? 0;
  const personalSales = isSnack ? 0 : myCommission?.salesWithTax ?? 0;
  const hourly = hourlyLaborBreakdown(myAttendance, nameOf)[0] ?? null;

  // 仕組み1：指名歩合（実際の接客者とは別に、指名された分だけ加算）
  const namedCommission = myRules.length
    ? namedCustomerCommission(closedTabs, myRules, nameOf, workedSet, config.taxRate, config.roundUnit).find(
        (c) => c.staffId === s.id
      )?.commission ?? 0
    : 0;

  // 仕組み2：担当客の指名固定/スライド歩合（丸ごと帰属）
  let primaryCustomerCommission = 0;
  if (s.commission_mode !== "standard") {
    const sales = primaryCustomerSalesBreakdown(
      closedTabs,
      nameOf,
      ownerOf,
      workedSet,
      config.taxRate,
      config.roundUnit
    ).find((r) => r.staffId === s.id) ?? {
      staffId: s.id,
      name: s.name,
      workedSales: 0,
      offDaySales: 0,
    };

    if (s.commission_mode === "primary_customer_flat") {
      primaryCustomerCommission = (sales.workedSales + sales.offDaySales) * (s.primary_customer_rate ?? 0);
    } else if (s.commission_mode === "primary_customer_slide") {
      const monthNumber = commissionMonthNumber(s.commission_start_date ?? periodStart, periodStart.slice(0, 7));
      const slide = slideScaleCommission({
        workedSales: sales.workedSales,
        tiers: config.slideScaleTiers,
        guaranteeAmount: s.primary_customer_guarantee_amount ?? 0,
        guaranteeStartupRate: s.primary_customer_guarantee_startup_rate ?? 0,
        guaranteeStartupMonths: s.primary_customer_guarantee_startup_months ?? 0,
        monthNumber,
      });
      const offDayFlat = sales.offDaySales * (s.primary_customer_day_off_rate ?? 0);
      primaryCustomerCommission = slide + offDayFlat;
    }
  }

  // 同伴手当：この来店を同伴したスタッフとして指名された回数×本人の同伴手当単価（クラブモードのみ）。
  // 給与計算方法2は伝票の同伴料の品目でも数える（品目が無い伝票は同伴ボタンで数える）
  const snackCompanions = config.tieredPayMethod ? snackCompanionCount(closedTabs, customers, menu, s.id) : 0;
  const companionAllowance = config.tieredPayMethod
    ? snackCompanions *
      // 同伴料は全額その子へ。スタッフごとの単価が未設定ならメニューの同伴料の金額を使う
      (s.companion_allowance_amount ?? menu.find((m) => m.snack_item_kind === "companion")?.price ?? 0)
    : config.storeMode === "club"
      ? companionAllowanceBreakdown(
          closedTabs,
          nameOf,
          (id) => staffList.find((x) => x.id === id)?.companion_allowance_amount ?? 0
        ).find((c) => c.staffId === s.id)?.amount ?? 0
      : 0;

  const base = s.base_salary ?? 0;
  const allowance = s.special_allowance ?? 0;
  const hourlyHours = hourly?.hours ?? 0;
  const hourlyCost = hourly?.cost ?? 0;

  const snackPay = isSnack
    ? snackPayBreakdown(closedTabs, customers, menu, config.snackSettings, s.id, companionAllowance, config.taxRate, {
        workDays: new Set(myAttendance.map((a) => a.business_date)).size,
        companionCount: snackCompanions,
      })
    : null;
  const snackBacks = snackPay ? snackPay.salesBack + snackPay.bottleBack + snackPay.nominationBack : 0;
  const gross =
    base +
    allowance +
    commission +
    namedCommission +
    primaryCustomerCommission +
    companionAllowance +
    hourlyCost +
    snackBacks;

  const snack = snackPay ? { ...snackPay, ...snackDeductions(gross, config.snackSettings, snackPay.cardFee) } : null;

  return {
    base,
    allowance,
    commission,
    personalSales,
    namedCommission,
    primaryCustomerCommission,
    companionAllowance,
    hourlyHours,
    hourlyCost,
    snackBacks,
    gross,
    snack,
    // 日払いを引く前の、実際にお渡しする額（給与計算方法2は名刺代・控除後）
    payable: snack ? snack.net : gross,
    myCommission,
    workedSet,
    ownerOf,
    namedRules: myRules,
  };
}
