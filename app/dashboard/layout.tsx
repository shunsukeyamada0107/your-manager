"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { StoreProvider, useStore } from "@/lib/StoreContext";
import { BusinessDateProvider } from "@/lib/BusinessDateContext";
import { createClient } from "@/lib/supabaseClient";
import { hexToRgbTriplet } from "@/lib/types";
import { THEME_PRESETS } from "@/lib/theme";

const TABS = [
  {
    href: "/dashboard",
    label: "伝票",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 13h6V4H4v9zM14 20h6V4h-6v16zM4 20h6v-4H4v4z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/expenses",
    label: "経費",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    ),
  },
  {
    href: "/dashboard/report",
    label: "集計",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10M12 20V4M20 20v-7" />
      </svg>
    ),
  },
];

// クラブモードの店舗にだけ表示する「顧客」タブ
const CUSTOMERS_TAB = {
  href: "/dashboard/customers",
  label: "顧客",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="18" cy="9" r="2.3" />
      <path d="M15.3 14.3c2.5.5 4.2 2.5 4.2 5.7" />
    </svg>
  ),
};

const SETTINGS_TAB = {
  href: "/dashboard/settings",
  label: "設定",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </svg>
  ),
};

// 店舗ごとのブランドカラー・テーマ（明/暗）を、CSS変数として:rootに反映する
function ThemeStyle() {
  const { accentColor, theme } = useStore();
  const p = THEME_PRESETS[theme];
  return (
    <style>{`
      :root {
        --gold-rgb: ${hexToRgbTriplet(accentColor)};
        --bg2-rgb: ${p.bg2};
        --elevated-rgb: ${p.elevated};
        --line-rgb: ${p.line};
        --page-bg-rgb: ${p.pageBg};
        --page-text-rgb: ${p.pageText};
        --gray-200-rgb: ${p.gray200};
        --gray-300-rgb: ${p.gray300};
        --gray-400-rgb: ${p.gray400};
        --gray-500-rgb: ${p.gray500};
      }
    `}</style>
  );
}

function HeaderBar() {
  const router = useRouter();
  const supabase = createClient();
  const { storeName, loading } = useStore();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-bg2/80 backdrop-blur-xl px-4 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-gold shrink-0" />
        <span className="font-bold text-[15px] tracking-tight">
          {loading ? "読み込み中..." : storeName ?? "店舗未設定"}
        </span>
      </div>
      <button
        onClick={handleLogout}
        className="text-xs text-gray-400 border border-line rounded-lg px-2.5 py-1.5 hover:text-gray-200 transition-colors"
      >
        ログアウト
      </button>
    </div>
  );
}

// クラブモードの店舗でのみ「顧客」タブを間に挟む
function BottomNav() {
  const pathname = usePathname();
  const { storeMode } = useStore();
  const tabs = storeMode === "club" ? [...TABS, CUSTOMERS_TAB, SETTINGS_TAB] : [...TABS, SETTINGS_TAB];
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t border-line bg-bg2/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      {tabs.map((tab) => {
        const on = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold transition-colors ${
              on ? "text-gold" : "text-gray-500"
            }`}
          >
            <span className={`w-[22px] h-[22px] transition-transform duration-200 ${on ? "scale-110" : "scale-100"}`}>
              {tab.icon}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <StoreProvider>
      <BusinessDateProvider>
        <div className="min-h-screen pb-20">
          <ThemeStyle />
          <HeaderBar />
          <main key={pathname} className="p-4 animate-page-fade-in">
            {children}
          </main>
          <BottomNav />
        </div>
      </BusinessDateProvider>
    </StoreProvider>
  );
}
