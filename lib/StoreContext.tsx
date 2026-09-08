"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  DEFAULT_TAX_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
  DEFAULT_DRINK_BACK_AMOUNT,
  DEFAULT_COMMISSION_TAX_BASIS,
  CommissionScheme,
  CommissionTaxBasis,
  PayCycle,
  StoreMode,
} from "@/lib/types";
import { StoreTheme } from "@/lib/theme";

export type NameInputMode = "keyboard" | "kana_keypad";

type StoreContextValue = {
  storeId: string | null;
  storeName: string | null;
  taxRate: number;
  commissionRate: number;
  cutoffHour: number;
  reportTemplate: string | null;
  cashFloatAmount: number;
  accentColor: string;
  commissionScheme: CommissionScheme;
  drinkBackAmount: number;
  theme: StoreTheme;
  showInsights: boolean;
  acceptsCard: boolean;
  acceptsPaypay: boolean;
  acceptsOtherEpayment: boolean;
  enableNameSearch: boolean;
  nameInputMode: NameInputMode;
  payCycle: PayCycle;
  commissionTaxBasis: CommissionTaxBasis;
  reportPinRequired: boolean;
  settingsPinRequired: boolean;
  storeMode: StoreMode;
  loading: boolean;
  reload: () => void;
};

const DEFAULT_ACCENT_COLOR = "#D4AF6A";

const StoreContext = createContext<StoreContextValue>({
  storeId: null,
  storeName: null,
  taxRate: DEFAULT_TAX_RATE,
  commissionRate: DEFAULT_COMMISSION_RATE,
  cutoffHour: DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
  reportTemplate: null,
  cashFloatAmount: 0,
  accentColor: DEFAULT_ACCENT_COLOR,
  commissionScheme: "simple",
  drinkBackAmount: DEFAULT_DRINK_BACK_AMOUNT,
  theme: "dark",
  showInsights: true,
  acceptsCard: true,
  acceptsPaypay: false,
  acceptsOtherEpayment: false,
  enableNameSearch: true,
  nameInputMode: "keyboard",
  payCycle: "monthly",
  commissionTaxBasis: DEFAULT_COMMISSION_TAX_BASIS,
  reportPinRequired: false,
  settingsPinRequired: false,
  storeMode: "bar",
  loading: true,
  reload: () => {},
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE);
  const [commissionRate, setCommissionRate] = useState(DEFAULT_COMMISSION_RATE);
  const [cutoffHour, setCutoffHour] = useState(DEFAULT_BUSINESS_DAY_CUTOFF_HOUR);
  const [reportTemplate, setReportTemplate] = useState<string | null>(null);
  const [cashFloatAmount, setCashFloatAmount] = useState(0);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [commissionScheme, setCommissionScheme] = useState<CommissionScheme>("simple");
  const [drinkBackAmount, setDrinkBackAmount] = useState(DEFAULT_DRINK_BACK_AMOUNT);
  const [theme, setTheme] = useState<StoreTheme>("dark");
  const [showInsights, setShowInsights] = useState(true);
  const [acceptsCard, setAcceptsCard] = useState(true);
  const [acceptsPaypay, setAcceptsPaypay] = useState(false);
  const [acceptsOtherEpayment, setAcceptsOtherEpayment] = useState(false);
  const [enableNameSearch, setEnableNameSearch] = useState(true);
  const [nameInputMode, setNameInputMode] = useState<NameInputMode>("keyboard");
  const [payCycle, setPayCycle] = useState<PayCycle>("monthly");
  const [commissionTaxBasis, setCommissionTaxBasis] = useState<CommissionTaxBasis>(DEFAULT_COMMISSION_TAX_BASIS);
  const [reportPinRequired, setReportPinRequired] = useState(false);
  const [settingsPinRequired, setSettingsPinRequired] = useState(false);
  const [storeMode, setStoreMode] = useState<StoreMode>("bar");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }
      // ログインユーザーが所属する店舗を1件取得（今は1ユーザー1店舗の想定）
      const { data: member } = await supabase
        .from("store_members")
        .select(
          "store_id, stores(name, tax_rate, commission_rate, business_day_cutoff_hour, report_template, cash_float_amount, accent_color, commission_scheme, drink_back_amount, theme, show_insights, accepts_card, accepts_paypay, accepts_other_epayment, enable_name_search, name_input_mode, pay_cycle, commission_tax_basis, report_pin_required, settings_pin_required, store_mode)"
        )
        .eq("user_id", userData.user.id)
        .limit(1)
        .single();

      if (member) {
        setStoreId(member.store_id);
        type StoreRow = {
          name: string;
          tax_rate: number;
          commission_rate: number;
          business_day_cutoff_hour: number;
          report_template: string | null;
          cash_float_amount: number;
          accent_color: string | null;
          commission_scheme: CommissionScheme | null;
          drink_back_amount: number | null;
          theme: StoreTheme | null;
          show_insights: boolean | null;
          accepts_card: boolean | null;
          accepts_paypay: boolean | null;
          accepts_other_epayment: boolean | null;
          enable_name_search: boolean | null;
          name_input_mode: NameInputMode | null;
          pay_cycle: PayCycle | null;
          commission_tax_basis: CommissionTaxBasis | null;
          report_pin_required: boolean | null;
          settings_pin_required: boolean | null;
          store_mode: StoreMode | null;
        };
        const stores = member.stores as unknown as StoreRow | StoreRow[] | null;
        const store = Array.isArray(stores) ? stores[0] : stores;
        setStoreName(store?.name ?? null);
        setTaxRate(store?.tax_rate ?? DEFAULT_TAX_RATE);
        setCommissionRate(store?.commission_rate ?? DEFAULT_COMMISSION_RATE);
        setCutoffHour(store?.business_day_cutoff_hour ?? DEFAULT_BUSINESS_DAY_CUTOFF_HOUR);
        setReportTemplate(store?.report_template ?? null);
        setCashFloatAmount(store?.cash_float_amount ?? 0);
        setAccentColor(store?.accent_color ?? DEFAULT_ACCENT_COLOR);
        setCommissionScheme(store?.commission_scheme ?? "simple");
        setDrinkBackAmount(store?.drink_back_amount ?? DEFAULT_DRINK_BACK_AMOUNT);
        setTheme(store?.theme ?? "dark");
        setShowInsights(store?.show_insights ?? true);
        setAcceptsCard(store?.accepts_card ?? true);
        setAcceptsPaypay(store?.accepts_paypay ?? false);
        setAcceptsOtherEpayment(store?.accepts_other_epayment ?? false);
        setEnableNameSearch(store?.enable_name_search ?? true);
        setNameInputMode(store?.name_input_mode ?? "keyboard");
        setPayCycle(store?.pay_cycle ?? "monthly");
        setCommissionTaxBasis(store?.commission_tax_basis ?? DEFAULT_COMMISSION_TAX_BASIS);
        setReportPinRequired(store?.report_pin_required ?? false);
        setSettingsPinRequired(store?.settings_pin_required ?? false);
        setStoreMode(store?.store_mode ?? "bar");
      }
      setLoading(false);
    }
    load();
  }, [reloadKey]);

  return (
    <StoreContext.Provider
      value={{
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
        storeMode,
        loading,
        reload,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
