"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { useStore } from "@/lib/StoreContext";
import { useBusinessDate } from "@/lib/BusinessDateContext";
import { DateBar } from "@/lib/DateBar";
import {
  categoryColorFor,
  Customer,
  MenuItem,
  PAYMENT_METHOD_EMOJI,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  Staff,
  TabItem,
  TabWithItems,
  tabColorFor,
  tabDiscountAmount,
  tabSubtotal,
  tabTax,
  tabTotal,
  UNCATEGORIZED_LABEL,
} from "@/lib/types";
import { AnimatedNumber } from "@/lib/AnimatedNumber";

const LAST_ORDER_WINDOW_MS = 30 * 60 * 1000;

// クラブモードの伝票詳細に表示する顧客情報（画面表示に必要な項目だけ）
type CustomerBrief = Pick<Customer, "name" | "name_kana" | "phone" | "birthday" | "bottle_keep" | "memo">;
type TabRow = TabWithItems & { customers: CustomerBrief | null };

// クラブモードの伝票作成モーダルで、新規顧客登録フォームの初期値として使う
const EMPTY_CUSTOMER_DRAFT = {
  name: "",
  nameKana: "",
  phone: "",
  birthday: "",
  primaryStaffId: "",
  bottleKeep: "",
  memo: "",
};

// 伝票詳細のセクションは1セクション=1色にして、パッと見でどのブロックか判別できるようにする
type SectionTone = "gold" | "blue" | "purple" | "good" | "warn" | "rose";
const SECTION_TONES: Record<SectionTone, { bg: string; border: string; iconBg: string; iconText: string }> = {
  gold: { bg: "bg-gold/25", border: "border-gold/50", iconBg: "bg-gold/30", iconText: "text-gold" },
  blue: { bg: "bg-[#6FB3E0]/25", border: "border-[#6FB3E0]/50", iconBg: "bg-[#6FB3E0]/30", iconText: "text-[#6FB3E0]" },
  purple: { bg: "bg-[#B78FE0]/25", border: "border-[#B78FE0]/50", iconBg: "bg-[#B78FE0]/30", iconText: "text-[#B78FE0]" },
  good: { bg: "bg-good/25", border: "border-good/50", iconBg: "bg-good/30", iconText: "text-good" },
  warn: { bg: "bg-warn/25", border: "border-warn/50", iconBg: "bg-warn/30", iconText: "text-warn" },
  rose: { bg: "bg-rose/25", border: "border-rose/50", iconBg: "bg-rose/30", iconText: "text-rose" },
};

// カタカナ専用のオンスクリーンキーボード。ひらがな50音表そのままの見た目で全部タップできるようにし、
// 濁点・半濁点は入力後の文字に後付けする方式（か→が）。OSの日本語入力（IME）を経由しないため、
// 変換中の文字がonChangeで消されて入力できなくなる不具合を避けられる。実際に入る文字はカタカナ。
type KanaKey = { hira: string; kata: string } | null;
const GOJUON_ROWS: KanaKey[][] = [
  [
    { hira: "あ", kata: "ア" },
    { hira: "い", kata: "イ" },
    { hira: "う", kata: "ウ" },
    { hira: "え", kata: "エ" },
    { hira: "お", kata: "オ" },
  ],
  [
    { hira: "か", kata: "カ" },
    { hira: "き", kata: "キ" },
    { hira: "く", kata: "ク" },
    { hira: "け", kata: "ケ" },
    { hira: "こ", kata: "コ" },
  ],
  [
    { hira: "さ", kata: "サ" },
    { hira: "し", kata: "シ" },
    { hira: "す", kata: "ス" },
    { hira: "せ", kata: "セ" },
    { hira: "そ", kata: "ソ" },
  ],
  [
    { hira: "た", kata: "タ" },
    { hira: "ち", kata: "チ" },
    { hira: "つ", kata: "ツ" },
    { hira: "て", kata: "テ" },
    { hira: "と", kata: "ト" },
  ],
  [
    { hira: "な", kata: "ナ" },
    { hira: "に", kata: "ニ" },
    { hira: "ぬ", kata: "ヌ" },
    { hira: "ね", kata: "ネ" },
    { hira: "の", kata: "ノ" },
  ],
  [
    { hira: "は", kata: "ハ" },
    { hira: "ひ", kata: "ヒ" },
    { hira: "ふ", kata: "フ" },
    { hira: "へ", kata: "ヘ" },
    { hira: "ほ", kata: "ホ" },
  ],
  [
    { hira: "ま", kata: "マ" },
    { hira: "み", kata: "ミ" },
    { hira: "む", kata: "ム" },
    { hira: "め", kata: "メ" },
    { hira: "も", kata: "モ" },
  ],
  [{ hira: "や", kata: "ヤ" }, null, { hira: "ゆ", kata: "ユ" }, null, { hira: "よ", kata: "ヨ" }],
  [
    { hira: "ら", kata: "ラ" },
    { hira: "り", kata: "リ" },
    { hira: "る", kata: "ル" },
    { hira: "れ", kata: "レ" },
    { hira: "ろ", kata: "ロ" },
  ],
  [{ hira: "わ", kata: "ワ" }, null, null, null, { hira: "を", kata: "ヲ" }],
  [
    { hira: "ん", kata: "ン" },
    { hira: "っ", kata: "ッ" },
    { hira: "ゃ", kata: "ャ" },
    { hira: "ゅ", kata: "ュ" },
    { hira: "ょ", kata: "ョ" },
  ],
];

// 濁点・半濁点の後付け用：まず「今の文字の素（清音）」を求めてから、清音⇄該当の点、でトグルする
const BASE_OF: Record<string, string> = {
  カ: "カ", ガ: "カ", キ: "キ", ギ: "キ", ク: "ク", グ: "ク", ケ: "ケ", ゲ: "ケ", コ: "コ", ゴ: "コ",
  サ: "サ", ザ: "サ", シ: "シ", ジ: "シ", ス: "ス", ズ: "ス", セ: "セ", ゼ: "セ", ソ: "ソ", ゾ: "ソ",
  タ: "タ", ダ: "タ", チ: "チ", ヂ: "チ", ツ: "ツ", ヅ: "ツ", テ: "テ", デ: "テ", ト: "ト", ド: "ト",
  ハ: "ハ", バ: "ハ", パ: "ハ", ヒ: "ヒ", ビ: "ヒ", ピ: "ヒ", フ: "フ", ブ: "フ", プ: "フ",
  ヘ: "ヘ", ベ: "ヘ", ペ: "ヘ", ホ: "ホ", ボ: "ホ", ポ: "ホ",
};
const DAKUTEN_OF: Record<string, string> = {
  カ: "ガ", キ: "ギ", ク: "グ", ケ: "ゲ", コ: "ゴ",
  サ: "ザ", シ: "ジ", ス: "ズ", セ: "ゼ", ソ: "ゾ",
  タ: "ダ", チ: "ヂ", ツ: "ヅ", テ: "デ", ト: "ド",
  ハ: "バ", ヒ: "ビ", フ: "ブ", ヘ: "ベ", ホ: "ボ",
};
const HANDAKUTEN_OF: Record<string, string> = { ハ: "パ", ヒ: "ピ", フ: "プ", ヘ: "ペ", ホ: "ポ" };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// <input type="datetime-local"> はタイムゾーン無しの「YYYY-MM-DDTHH:mm」（ローカル時刻）を要求する
function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CourseTimerBadge({ endsAt, now }: { endsAt: string; now: number }) {
  const remaining = new Date(endsAt).getTime() - now;
  if (remaining <= 0) {
    return (
      <div className="rounded-md bg-rose/20 text-rose text-xs font-bold px-2 py-1.5 inline-block">
        ⏰ コース終了時刻を過ぎています
      </div>
    );
  }
  const mins = Math.floor(remaining / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const lastOrder = remaining <= LAST_ORDER_WINDOW_MS;
  return (
    <div
      className={`rounded-md text-xs font-bold px-2 py-1.5 inline-block ${
        lastOrder ? "bg-rose/20 text-rose" : "bg-gold/20 text-gold"
      }`}
    >
      {lastOrder ? "⏰ ラストオーダー・" : "🍺 コース残り "}
      {h > 0 ? `${h}時間` : ""}
      {m}分（{formatTime(endsAt)}まで）
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={null}>
      <POSPageInner />
    </Suspense>
  );
}

function POSPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const {
    storeId,
    storeName,
    taxRate,
    acceptsCard,
    acceptsPaypay,
    acceptsOtherEpayment,
    enableNameSearch,
    nameInputMode,
    storeMode,
  } = useStore();
  const { date: businessDate } = useBusinessDate();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [justCreatedTabId, setJustCreatedTabId] = useState<string | null>(null);
  const [pendingSettleMethod, setPendingSettleMethod] = useState<PaymentMethod | null>(null);
  const [modalName, setModalName] = useState("");
  const [nameSearchResults, setNameSearchResults] = useState<TabWithItems[]>([]);
  const [searchingName, setSearchingName] = useState(false);
  // クラブモード：顧客検索・選択・新規顧客登録
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerDraft, setNewCustomerDraft] = useState(EMPTY_CUSTOMER_DRAFT);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [modalGuestCount, setModalGuestCount] = useState("");
  const [modalGuestMale, setModalGuestMale] = useState("");
  const [modalGuestFemale, setModalGuestFemale] = useState("");
  const [modalStaffId, setModalStaffId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [editingTabName, setEditingTabName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingTimes, setEditingTimes] = useState(false);
  const [createdAtDraft, setCreatedAtDraft] = useState("");
  const [closedAtDraft, setClosedAtDraft] = useState("");
  const [timesError, setTimesError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");
  const [now, setNow] = useState(Date.now());
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | null>(null);
  const [showEpaymentPicker, setShowEpaymentPicker] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ tabId: string; label: string; run: () => void } | null>(null);
  const lastActionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guestMaleInputRef = useRef<HTMLInputElement>(null);
  const guestFemaleInputRef = useRef<HTMLInputElement>(null);

  function pushUndo(tabId: string, label: string, run: () => void) {
    if (lastActionTimeoutRef.current) clearTimeout(lastActionTimeoutRef.current);
    setLastAction({ tabId, label, run });
    lastActionTimeoutRef.current = setTimeout(() => setLastAction(null), 8000);
  }

  function performUndo() {
    if (!lastAction) return;
    if (lastActionTimeoutRef.current) clearTimeout(lastActionTimeoutRef.current);
    lastAction.run();
    setLastAction(null);
  }

  const enabledEpaymentMethods: { method: PaymentMethod; label: string }[] = [
    ...(acceptsCard ? [{ method: "card" as const, label: PAYMENT_METHOD_LABELS.card }] : []),
    ...(acceptsPaypay ? [{ method: "paypay" as const, label: PAYMENT_METHOD_LABELS.paypay }] : []),
    ...(acceptsOtherEpayment
      ? [{ method: "other_epayment" as const, label: PAYMENT_METHOD_LABELS.other_epayment }]
      : []),
  ];

  const loadData = useCallback(async () => {
    if (!storeId) return;
    const { data: menuData } = await supabase
      .from("menu_items")
      .select("*")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    setMenu(menuData ?? []);

    const { data: staffData } = await supabase
      .from("staff")
      .select("*")
      .eq("store_id", storeId)
      .eq("active", true);
    setStaff(staffData ?? []);

    const { data: tabsData } = await supabase
      .from("tabs")
      .select("*, tab_items(*), customers(name, name_kana, phone, birthday, bottle_keep, memo)")
      .eq("store_id", storeId)
      .eq("business_date", businessDate)
      .order("created_at", { ascending: true })
      .order("created_at", { foreignTable: "tab_items", ascending: true });
    // customer_id -> customersは単一FKだが、PostgRESTの状態によっては配列で返ることがあるため防御的に正規化する
    // （lib/StoreContext.tsxのstoresネスト結果の正規化と同じパターン）
    const normalized = ((tabsData as unknown as Array<TabWithItems & { customers: CustomerBrief | CustomerBrief[] | null }>) ?? []).map(
      (t) => ({
        ...t,
        customers: Array.isArray(t.customers) ? t.customers[0] ?? null : t.customers,
      })
    );
    setTabs(normalized);
  }, [storeId, businessDate]);

  useEffect(() => {
    loadData();
    setActiveTabId(null);
  }, [loadData]);

  // バーモード：伝票作成モーダルで名前を入力した時、同じ名前の過去の伝票をあいまい検索する（デバウンス付き）
  useEffect(() => {
    if (storeMode === "club" || !showCreateModal || !storeId || !enableNameSearch || !modalName.trim()) {
      setNameSearchResults([]);
      setSearchingName(false);
      return;
    }
    const query = modalName.trim();
    setSearchingName(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("tabs")
        .select("*, tab_items(*)")
        .eq("store_id", storeId)
        .ilike("name", `${query}%`)
        .order("created_at", { ascending: false })
        .limit(5);
      setNameSearchResults((data as TabWithItems[]) ?? []);
      setSearchingName(false);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalName, showCreateModal, storeId, enableNameSearch, storeMode]);

  // クラブモード：伝票作成モーダルで顧客名・フリガナをあいまい検索する（デバウンス付き）
  useEffect(() => {
    if (storeMode !== "club" || !showCreateModal || !storeId || selectedCustomer || !modalName.trim()) {
      setCustomerSearchResults([]);
      setSearchingCustomer(false);
      return;
    }
    const query = modalName.trim();
    setSearchingCustomer(true);
    const t = setTimeout(async () => {
      // .or()でのPostgREST文字列組み立ては特殊文字のエスケープが必要で壊れやすいため、
      // 名前検索とフリガナ検索を2本の独立クエリにしてクライアント側でID重複を除いてマージする
      const [byName, byKana] = await Promise.all([
        supabase
          .from("customers")
          .select("*")
          .eq("store_id", storeId)
          .eq("active", true)
          .ilike("name", `${query}%`)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("customers")
          .select("*")
          .eq("store_id", storeId)
          .eq("active", true)
          .ilike("name_kana", `${query}%`)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      const merged = new Map<string, Customer>();
      [...(byName.data ?? []), ...(byKana.data ?? [])].forEach((c) => merged.set(c.id, c as Customer));
      setCustomerSearchResults(Array.from(merged.values()).slice(0, 5));
      setSearchingCustomer(false);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalName, showCreateModal, storeId, storeMode, selectedCustomer]);

  // 集計タブなどから ?tab=<id> で遷移してきた場合、その伝票を自動で開く
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && tabs.some((t) => t.id === tabParam)) {
      setActiveTabId(tabParam);
    }
  }, [searchParams, tabs]);

  // tab_items の連続操作（連打）が競合しないよう、常に最新の状態を同期的に参照するためのref
  const tabsRef = useRef<TabRow[]>([]);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // 書き込み系の操作を1件ずつ順番に実行するためのキュー
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  function enqueue(fn: () => Promise<void>) {
    const run = writeQueueRef.current.then(fn, fn);
    writeQueueRef.current = run.catch(() => {});
    return run;
  }

  function applyLocalTabItems(tabId: string, updater: (items: TabItem[]) => TabItem[]) {
    const updated = tabsRef.current.map((t) => (t.id === tabId ? { ...t, tab_items: updater(t.tab_items) } : t));
    tabsRef.current = updated;
    setTabs(updated);
  }

  function findLocalItem(tabId: string, snapshot: TabItem) {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return null;
    return (
      tab.tab_items.find((i) => i.id === snapshot.id) ??
      tab.tab_items.find(
        (i) =>
          i.name === snapshot.name &&
          i.price === snapshot.price &&
          i.staff_id === snapshot.staff_id &&
          i.source === snapshot.source
      ) ??
      null
    );
  }

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifyPermission(Notification.permission);
  }, []);

  // ラストオーダー判定・タイマー表示のための定期更新
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  // コース終了30分前になったら通知（伝票ごとに1回だけ）
  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (notifyPermission !== "granted") return;
    tabs.forEach((t) => {
      if (!t.course_ends_at || t.closed_at) return;
      const remaining = new Date(t.course_ends_at).getTime() - now;
      if (remaining <= LAST_ORDER_WINDOW_MS && remaining > 0 && !notifiedRef.current.has(t.id)) {
        notifiedRef.current.add(t.id);
        new Notification("ラストオーダーの時間です", { body: `${t.name} のコースがまもなく終了します` });
      }
    });
  }, [tabs, now, notifyPermission]);

  async function requestNotifyPermission() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifyPermission(p);
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // メニューをカテゴリごとに分類。カテゴリ未設定は「その他」扱いで、メニューの並び順（sort_order）通りに出現順でタブ化する
  const menuCategories: string[] = [];
  for (const m of menu) {
    const cat = m.category?.trim() || UNCATEGORIZED_LABEL;
    if (!menuCategories.includes(cat)) menuCategories.push(cat);
  }
  const showCategoryTabs = menuCategories.length > 1;
  const currentCategory = showCategoryTabs ? activeCategory ?? menuCategories[0] : null;
  const quickPickItems = menu.filter((m) => m.is_quick_pick);
  const categoryMenuItems = showCategoryTabs
    ? menu.filter((m) => (m.category?.trim() || UNCATEGORIZED_LABEL) === currentCategory)
    : menu;

  useEffect(() => {
    setMemoDraft(activeTab?.memo ?? "");
  }, [activeTab?.id, activeTab?.memo]);

  // 別の伝票に切り替えたら、直前の「元に戻す」は文脈が変わるので消す
  useEffect(() => {
    setLastAction(null);
    setEditingTabName(false);
    setEditingTimes(false);
    if (lastActionTimeoutRef.current) clearTimeout(lastActionTimeoutRef.current);
  }, [activeTabId]);

  function staffName(staffId: string | null) {
    if (!staffId) return null;
    return staff.find((s) => s.id === staffId)?.name ?? "(元スタッフ)";
  }

  function openCreateModal() {
    setModalName("");
    setModalGuestCount("");
    setModalGuestMale("");
    setModalGuestFemale("");
    setModalStaffId(null);
    setSelectedCustomer(null);
    setCustomerSearchResults([]);
    setShowNewCustomerForm(false);
    setNewCustomerDraft(EMPTY_CUSTOMER_DRAFT);
    setShowCreateModal(true);
  }

  function selectCustomerForTab(customer: Customer) {
    setSelectedCustomer(customer);
    setModalName(customer.name);
    setModalStaffId(customer.primary_staff_id ?? null);
    setCustomerSearchResults([]);
    setShowNewCustomerForm(false);
  }

  async function createCustomerAndProceed() {
    if (!storeId || !newCustomerDraft.name.trim()) return;
    setCreatingCustomer(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        store_id: storeId,
        name: newCustomerDraft.name.trim(),
        name_kana: newCustomerDraft.nameKana.trim() || null,
        phone: newCustomerDraft.phone.trim() || null,
        birthday: newCustomerDraft.birthday || null,
        primary_staff_id: newCustomerDraft.primaryStaffId || null,
        bottle_keep: newCustomerDraft.bottleKeep.trim() || null,
        memo: newCustomerDraft.memo.trim(),
      })
      .select()
      .single();
    setCreatingCustomer(false);
    if (!error && data) {
      selectCustomerForTab(data as Customer);
      setNewCustomerDraft(EMPTY_CUSTOMER_DRAFT);
    }
  }

  function applyDakuten() {
    setModalName((v) => {
      if (!v) return v;
      const last = v.slice(-1);
      const base = BASE_OF[last];
      if (!base) return v;
      const dak = DAKUTEN_OF[base];
      if (!dak) return v;
      return v.slice(0, -1) + (last === dak ? base : dak);
    });
  }

  function applyHandakuten() {
    setModalName((v) => {
      if (!v) return v;
      const last = v.slice(-1);
      const base = BASE_OF[last];
      if (!base) return v;
      const han = HANDAKUTEN_OF[base];
      if (!han) return v;
      return v.slice(0, -1) + (last === han ? base : han);
    });
  }

  async function createTab() {
    if (!storeId) return;
    if (storeMode === "club") {
      if (!selectedCustomer) return;
      return insertTab({ name: selectedCustomer.name, customer_id: selectedCustomer.id });
    }
    if (!modalName.trim()) return;
    return insertTab({ name: modalName.trim(), customer_id: null });
  }

  async function insertTab(payload: { name: string; customer_id: string | null }) {
    if (!storeId) return;
    const { data, error } = await supabase
      .from("tabs")
      .insert({
        store_id: storeId,
        business_date: businessDate,
        name: payload.name,
        customer_id: payload.customer_id,
        guest_count: modalGuestCount.trim() === "" ? null : Number(modalGuestCount),
        guest_count_male: modalGuestMale.trim() === "" ? null : Number(modalGuestMale),
        guest_count_female: modalGuestFemale.trim() === "" ? null : Number(modalGuestFemale),
        staff_id: modalStaffId,
      })
      .select()
      .single();
    if (!error && data) {
      setActiveTabId(data.id);
      setShowCreateModal(false);
      setJustCreatedTabId(data.id);
      setTimeout(() => setJustCreatedTabId((cur) => (cur === data.id ? null : cur)), 400);
      loadData();
      await supabase.from("tab_logs").insert({
        store_id: storeId,
        action: "created",
        tab_name: data.name,
        business_date: businessDate,
        guest_count: data.guest_count,
      });
    }
  }

  function addMenuItem(item: MenuItem) {
    if (!activeTabId) return;
    const tabId = activeTabId;

    enqueue(async () => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;
      // 同じ品目の行がすでにあれば数量+1、なければ新規追加
      const existing = tab.tab_items.find((i) => i.name === item.name && i.price === item.price && i.source === "menu");

      if (existing) {
        const newQty = existing.qty + 1;
        const previousQty = existing.qty;
        applyLocalTabItems(tabId, (items) => items.map((i) => (i.id === existing.id ? { ...i, qty: newQty } : i)));
        await supabase.from("tab_items").update({ qty: newQty }).eq("id", existing.id);
        pushUndo(tabId, `「${item.name}」を1点戻す`, () => setQty({ ...existing, qty: newQty }, previousQty));
      } else {
        const tempId = `temp-${Math.random().toString(36).slice(2)}`;
        const optimisticItem: TabItem = {
          id: tempId,
          tab_id: tabId,
          staff_id: null,
          name: item.name,
          price: item.price,
          qty: 1,
          source: "menu",
          is_cast_drink: item.is_cast_drink,
          created_at: new Date().toISOString(),
        };
        applyLocalTabItems(tabId, (items) => [...items, optimisticItem]);
        const { data } = await supabase
          .from("tab_items")
          .insert({
            tab_id: tabId,
            name: item.name,
            price: item.price,
            qty: 1,
            source: "menu",
            is_cast_drink: item.is_cast_drink,
          })
          .select()
          .single();
        if (data) {
          applyLocalTabItems(tabId, (items) => items.map((i) => (i.id === tempId ? (data as TabItem) : i)));
        }
        pushUndo(tabId, `「${item.name}」を取り消す`, () => deleteTabItem(optimisticItem, { recordUndo: false }));
      }

      // 飲み放題等のコースメニューなら、伝票にタイマーをセット（起点はタップ時点から）
      if (item.course_minutes) {
        const endsAt = new Date(Date.now() + item.course_minutes * 60000).toISOString();
        await supabase.from("tabs").update({ course_ends_at: endsAt }).eq("id", tabId);
        notifiedRef.current.delete(tabId);
      }
      loadData();
    });
  }

  async function renameTab() {
    if (!activeTab || !nameDraft.trim()) return;
    await supabase.from("tabs").update({ name: nameDraft.trim() }).eq("id", activeTab.id);
    setEditingTabName(false);
    loadData();
  }

  function openTimeEditor() {
    if (!activeTab) return;
    setCreatedAtDraft(toDatetimeLocalValue(activeTab.created_at));
    setClosedAtDraft(activeTab.closed_at ? toDatetimeLocalValue(activeTab.closed_at) : "");
    setTimesError(null);
    setEditingTimes(true);
  }

  // 来店・退店時刻を手動で修正する（例：会計取り消し後、日をまたいで再会計すると退店時刻が翌日になってしまう場合の是正用）。
  // 修正内容は tab_logs に残し、不正確な打刻の見える化・追跡ができるようにする
  async function saveTimes() {
    if (!activeTab || !storeId) return;
    setTimesError(null);

    const newCreated = new Date(createdAtDraft);
    if (isNaN(newCreated.getTime())) {
      setTimesError("来店時刻の形式が正しくありません。");
      return;
    }

    let newClosed: Date | null = null;
    if (activeTab.closed_at) {
      if (!closedAtDraft.trim()) {
        setTimesError("退店時刻を入力してください。");
        return;
      }
      newClosed = new Date(closedAtDraft);
      if (isNaN(newClosed.getTime())) {
        setTimesError("退店時刻の形式が正しくありません。");
        return;
      }
      if (newClosed <= newCreated) {
        setTimesError("退店時刻は来店時刻より後にしてください。");
        return;
      }
    }

    const oldCreatedLabel = formatDateTime(activeTab.created_at);
    const oldClosedLabel = activeTab.closed_at ? formatDateTime(activeTab.closed_at) : null;
    const newCreatedLabel = formatDateTime(newCreated.toISOString());
    const newClosedLabel = newClosed ? formatDateTime(newClosed.toISOString()) : null;

    await supabase
      .from("tabs")
      .update({
        created_at: newCreated.toISOString(),
        ...(newClosed ? { closed_at: newClosed.toISOString() } : {}),
      })
      .eq("id", activeTab.id);

    const noteParts: string[] = [];
    if (oldCreatedLabel !== newCreatedLabel) noteParts.push(`来店 ${oldCreatedLabel} → ${newCreatedLabel}`);
    if (newClosed && oldClosedLabel !== newClosedLabel) noteParts.push(`退店 ${oldClosedLabel} → ${newClosedLabel}`);

    if (noteParts.length > 0) {
      await supabase.from("tab_logs").insert({
        store_id: storeId,
        action: "time_edited",
        tab_name: activeTab.name,
        business_date: activeTab.business_date,
        guest_count: activeTab.guest_count,
        note: noteParts.join(" ・ "),
      });
    }

    setEditingTimes(false);
    loadData();
  }

  async function saveGuestCount(count: string) {
    if (!activeTab) return;
    await supabase
      .from("tabs")
      .update({ guest_count: count.trim() === "" ? null : Number(count) })
      .eq("id", activeTab.id);
    loadData();
  }

  async function saveGuestBreakdown(male: string, female: string) {
    if (!activeTab) return;
    await supabase
      .from("tabs")
      .update({
        guest_count_male: male.trim() === "" ? null : Number(male),
        guest_count_female: female.trim() === "" ? null : Number(female),
      })
      .eq("id", activeTab.id);
    loadData();
  }

  async function addManualItem() {
    if (!activeTab || !manualName.trim() || !manualPrice.trim()) return;
    const tabId = activeTab.id;
    const name = manualName.trim();
    const price = Number(manualPrice);
    const { data } = await supabase
      .from("tab_items")
      .insert({ tab_id: tabId, name, price, qty: 1, source: "manual" })
      .select()
      .single();
    setManualName("");
    setManualPrice("");
    loadData();
    if (data) {
      pushUndo(tabId, `「${name}」を取り消す`, () => deleteTabItem(data as TabItem, { recordUndo: false }));
    }
  }

  async function setTabStaff(staffId: string | null) {
    if (!activeTab) return;
    await supabase.from("tabs").update({ staff_id: staffId }).eq("id", activeTab.id);
    loadData();
  }

  function reinsertTabItem(tabId: string, item: TabItem) {
    enqueue(async () => {
      const { data } = await supabase
        .from("tab_items")
        .insert({
          tab_id: tabId,
          staff_id: item.staff_id,
          name: item.name,
          price: item.price,
          qty: item.qty,
          source: item.source,
          is_cast_drink: item.is_cast_drink,
        })
        .select()
        .single();
      if (data) {
        applyLocalTabItems(tabId, (items) => [...items, data as TabItem]);
      }
      loadData();
    });
  }

  // recordUndo=falseは「元に戻す」操作自体からの呼び出し用。取り消した直後にまた
  // 「元に戻す」が出て連鎖してしまう（二重表示に見える）のを防ぐため、この場合は新しい取り消しを積まない
  function deleteTabItem(item: TabItem, opts?: { recordUndo?: boolean }) {
    if (!activeTabId) return;
    const tabId = activeTabId;
    const recordUndo = opts?.recordUndo ?? true;
    enqueue(async () => {
      const current = findLocalItem(tabId, item);
      if (!current) return;
      applyLocalTabItems(tabId, (items) => items.filter((i) => i.id !== current.id));
      if (!current.id.startsWith("temp-")) {
        await supabase.from("tab_items").delete().eq("id", current.id);
      }
      if (recordUndo) {
        pushUndo(tabId, `「${current.name}」を元に戻す`, () => reinsertTabItem(tabId, current));
      }
      loadData();
    });
  }

  function setItemStaff(item: TabItem, staffId: string | null) {
    if (!activeTabId) return;
    const tabId = activeTabId;
    enqueue(async () => {
      const current = findLocalItem(tabId, item);
      if (!current) return;
      applyLocalTabItems(tabId, (items) => items.map((i) => (i.id === current.id ? { ...i, staff_id: staffId } : i)));
      if (!current.id.startsWith("temp-")) {
        await supabase.from("tab_items").update({ staff_id: staffId }).eq("id", current.id);
      }
      loadData();
    });
  }

  function setQty(item: TabItem, qty: number) {
    if (!activeTabId) return;
    if (qty <= 0) {
      deleteTabItem(item);
      return;
    }
    const tabId = activeTabId;
    enqueue(async () => {
      const current = findLocalItem(tabId, item);
      if (!current) return;
      applyLocalTabItems(tabId, (items) => items.map((i) => (i.id === current.id ? { ...i, qty } : i)));
      await supabase.from("tab_items").update({ qty }).eq("id", current.id);
      loadData();
    });
  }

  function changeQty(item: TabItem, delta: number) {
    setQty(item, item.qty + delta);
  }

  async function saveMemo() {
    if (!activeTab) return;
    await supabase.from("tabs").update({ memo: memoDraft }).eq("id", activeTab.id);
    loadData();
  }

  async function setDiscount(percent: number | null) {
    if (!activeTab) return;
    await supabase.from("tabs").update({ discount_percent: percent }).eq("id", activeTab.id);
    loadData();
  }

  async function applyManualDiscount() {
    if (!activeTab || !manualDiscount.trim()) return;
    await supabase
      .from("tabs")
      .update({ discount_amount: Number(manualDiscount) })
      .eq("id", activeTab.id);
    setManualDiscount("");
    loadData();
  }

  async function clearManualDiscount() {
    if (!activeTab) return;
    await supabase.from("tabs").update({ discount_amount: null }).eq("id", activeTab.id);
    loadData();
  }

  function requestSettle(method: PaymentMethod) {
    if (!activeTab) return;
    setShowEpaymentPicker(false);
    setPendingSettleMethod(method);
  }

  async function confirmSettle() {
    if (!activeTab || !pendingSettleMethod) return;
    const method = pendingSettleMethod;
    setPendingSettleMethod(null);
    setOperationError(null);
    const { error } = await supabase
      .from("tabs")
      .update({ payment_method: method, closed_at: new Date().toISOString() })
      .eq("id", activeTab.id);
    if (error) {
      setOperationError("会計を確定できませんでした。通信状態を確認して、もう一度お試しください。");
      return;
    }
    loadData();
    setShowReceipt(true);
  }

  async function reopenTab() {
    if (!activeTab) return;
    await supabase
      .from("tabs")
      .update({ payment_method: null, closed_at: null })
      .eq("id", activeTab.id);
    loadData();
  }

  async function deleteTab() {
    if (!activeTab || !storeId) return;
    if (!confirm(`「${activeTab.name}」の伝票を削除しますか？（元に戻せません）`)) return;
    setOperationError(null);
    // DB関数内で監査ログ作成と伝票削除を同一トランザクションとして実行する。
    const { error } = await supabase.rpc("delete_tab_with_log", { p_tab_id: activeTab.id });
    if (error) {
      setOperationError("伝票を削除できませんでした。データは変更されていません。");
      return;
    }
    setActiveTabId(null);
    loadData();
  }

  const openTabs = tabs.filter((t) => !t.closed_at);
  const closedTabs = tabs.filter((t) => t.closed_at);

  function paymentIcon(method: PaymentMethod) {
    switch (method) {
      case "cash":
        return (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 7h20M2 17h20M6 12h.01M2 5h20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
          </svg>
        );
      case "card":
        return (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
          </svg>
        );
      case "paypay":
        return (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
        );
      case "other_epayment":
        return (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12c1.8-2.6 3.6-2.6 5.4 0s3.6 2.6 5.4 0 3.6-2.6 5.4 0" />
            <path d="M3 17c1.8-2.6 3.6-2.6 5.4 0s3.6 2.6 5.4 0 3.6-2.6 5.4 0" />
          </svg>
        );
    }
  }

  function renderPaymentButtons(tab: TabWithItems) {
    if (tab.closed_at) {
      return (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowReceipt(true)}
            className="rounded-xl border border-gold text-gold py-3 text-sm font-bold"
          >
            🧾 レシートを表示
          </button>
          <button
            onClick={reopenTab}
            className="rounded-xl border border-line py-3 text-sm font-bold text-gray-300"
          >
            会計を取り消す
          </button>
        </div>
      );
    }

    const single = enabledEpaymentMethods.length === 1 ? enabledEpaymentMethods[0] : null;
    const multiple = enabledEpaymentMethods.length > 1;

    return (
      <div className={`grid gap-3 ${single || multiple ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          onClick={() => requestSettle("cash")}
          className="rounded-xl bg-gold text-bg font-bold py-4 text-base flex flex-col items-center gap-1.5 shadow-premium active:scale-[0.97] transition-transform"
        >
          {paymentIcon("cash")}
          現金で会計
        </button>
        {single && (
          <button
            onClick={() => requestSettle(single.method)}
            className="rounded-xl bg-gold text-bg font-bold py-4 text-base flex flex-col items-center gap-1.5 shadow-premium active:scale-[0.97] transition-transform"
          >
            {paymentIcon(single.method)}
            {single.label}で会計
          </button>
        )}
        {multiple && (
          <button
            onClick={() => setShowEpaymentPicker(true)}
            className="rounded-xl bg-gold text-bg font-bold py-4 text-base flex flex-col items-center gap-1.5 shadow-premium active:scale-[0.97] transition-transform"
          >
            {paymentIcon("card")}
            電子決済で会計
          </button>
        )}
      </div>
    );
  }

  function SectionHeader({
    icon,
    tone = "gold",
    children,
  }: {
    icon: React.ReactNode;
    tone?: SectionTone;
    children: React.ReactNode;
  }) {
    const t = SECTION_TONES[tone];
    return (
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-8 h-8 rounded-full ${t.iconBg} ${t.iconText} flex items-center justify-center shrink-0`}>
          {icon}
        </span>
        <span className="font-extrabold text-base">{children}</span>
      </div>
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

  function ReceiptSectionIcon() {
    return (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" />
        <path d="M9 8h6M9 12h6" />
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

  function PlusSectionIcon() {
    return (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
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

  function renderCheckoutSummary(tab: TabWithItems) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-bg2 px-3 py-2 font-mono text-sm space-y-1">
          <div className="flex justify-between text-gray-400">
            <span>小計</span>
            <span>¥{tabSubtotal(tab.tab_items).toLocaleString()}</span>
          </div>
          {!!(tab.discount_percent || tab.discount_amount) && (
            <div className="flex justify-between text-rose">
              <span>
                割引
                {tab.discount_percent ? `（${tab.discount_percent}%OFF）` : ""}
              </span>
              <span>
                -¥
                {tabDiscountAmount(
                  tab.tab_items,
                  taxRate,
                  tab.discount_percent,
                  tab.discount_amount
                ).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between text-gray-400">
            <span>消費税</span>
            <span>¥{tabTax(tab.tab_items, taxRate).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gold font-bold text-lg pt-1 border-t border-dashed border-line">
            <span>合計</span>
            <span>¥{tabTotal(tab.tab_items, taxRate, tab.discount_percent, tab.discount_amount).toLocaleString()}</span>
          </div>
        </div>

        {renderPaymentButtons(tab)}
      </div>
    );
  }

  function renderMenuButton(m: MenuItem, opts: { big?: boolean; disabled: boolean }) {
    const color = categoryColorFor(m.category);
    return (
      <button
        key={m.id}
        onClick={() => addMenuItem(m)}
        disabled={opts.disabled}
        style={{ borderLeftColor: color, borderLeftWidth: 4 }}
        className={`group rounded-lg border border-line bg-elevated text-left disabled:opacity-40 active:bg-gold active:border-gold active:scale-[0.96] transition-transform transition-colors ${
          opts.big ? "p-4" : "p-3.5"
        }`}
      >
        <div className={`font-bold group-active:text-bg ${opts.big ? "text-base" : "text-[15px]"}`}>
          {m.is_quick_pick && "⭐ "}
          {m.is_cast_drink && "🍾 "}
          {m.name}
          {m.course_minutes != null && (
            <span className="text-xs font-normal opacity-70"> ・⏱{m.course_minutes}分</span>
          )}
        </div>
        <div className={`text-gold font-mono group-active:text-bg ${opts.big ? "text-sm" : "text-xs"}`}>
          ¥{m.price.toLocaleString()}
        </div>
      </button>
    );
  }

  const todaySalesTotal = closedTabs.reduce(
    (a, t) => a + tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount),
    0
  );

  return (
    <div className="space-y-4">
      <DateBar />
      {operationError && (
        <div role="alert" className="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">
          {operationError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-line bg-elevated px-3.5 py-3">
          <div className="text-[10.5px] font-semibold text-gray-500">本日の売上（会計済み）</div>
          <AnimatedNumber
            value={todaySalesTotal}
            prefix="¥"
            className="block text-lg font-bold text-gold mt-1 font-mono"
          />
        </div>
        <div className="rounded-xl border border-line bg-elevated px-3.5 py-3">
          <div className="text-[10.5px] font-semibold text-gray-500">対応中テーブル</div>
          <div className="text-lg font-bold mt-1 font-mono">{openTabs.length}卓</div>
        </div>
      </div>

      <button
        onClick={openCreateModal}
        className="w-full rounded-xl px-4 py-4 text-[15px] font-bold bg-gold text-bg shadow-premium active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        新規伝票を作成
      </button>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px] font-bold text-gray-300">対応中のテーブル</span>
          <span className="text-xs text-gray-500">{openTabs.length}卓</span>
        </div>
        {openTabs.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
            対応中の伝票はありません
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {openTabs.map((t) => {
              const active = t.id === activeTabId;
              const remaining = t.course_ends_at ? new Date(t.course_ends_at).getTime() - now : null;
              const lastOrder = remaining !== null && remaining > 0 && remaining <= LAST_ORDER_WINDOW_MS;
              const elapsedMin = Math.max(0, Math.floor((now - new Date(t.created_at).getTime()) / 60000));
              const name = staffName(t.staff_id);
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTabId(t.id)}
                  style={{ borderLeftColor: tabColorFor(t.id), borderLeftWidth: 4 }}
                  className={`text-left rounded-xl px-3.5 py-3 border transition-colors ${
                    active
                      ? "bg-gold/10 border-gold/50 text-gray-200"
                      : "bg-elevated border-line text-gray-200"
                  } ${t.id === justCreatedTabId ? "animate-card-pop-in" : ""}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-bold truncate">{t.name}</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-good shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-good" />
                      対応中
                    </span>
                  </div>
                  <div className="text-xs mt-1 text-gray-400 truncate">
                    {t.guest_count != null ? `${t.guest_count}名 ・ ` : ""}
                    {name ? `${name} ・ ` : ""}
                    {elapsedMin}分経過
                  </div>
                  <div className="text-base font-mono font-bold mt-1.5 text-gold">
                    ¥{tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount).toLocaleString()}
                  </div>
                  {lastOrder && <div className="text-[10.5px] font-bold mt-1 text-rose">⏰ ラストオーダー</div>}
                </button>
              );
            })}
          </div>
        )}
        <button
          onClick={openCreateModal}
          className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-bold border border-dashed border-gold/50 text-gold"
        >
          + 伝票を作る
        </button>

        {closedTabs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-line">
            <div className="text-xs text-gray-500 mb-2">✓ 会計済み（{closedTabs.length}件）</div>
            <div className="grid grid-cols-2 gap-2">
              {closedTabs.map((t) => {
                const active = t.id === activeTabId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTabId(t.id)}
                    style={{ borderLeftColor: tabColorFor(t.id), borderLeftWidth: 5 }}
                    className={`text-left rounded-xl px-3 py-2.5 border-2 opacity-70 ${
                      active ? "border-gold text-gray-200" : "border-line text-gray-400"
                    } bg-elevated`}
                  >
                    <div className="text-sm font-bold truncate">
                      {t.payment_method ? PAYMENT_METHOD_EMOJI[t.payment_method] : "💴"} {t.name}
                    </div>
                    <div className="text-xs font-mono mt-0.5">
                      ¥{tabTotal(t.tab_items, taxRate, t.discount_percent, t.discount_amount).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {activeTab && (
        <>
          <div
            style={{ borderLeftColor: tabColorFor(activeTab.id), borderLeftWidth: 5 }}
            className="rounded-xl border border-gold/50 bg-gold/25 p-4 space-y-3"
          >
            <div className="flex justify-between items-center gap-2">
              {editingTabName ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameTab();
                      if (e.key === "Escape") setEditingTabName(false);
                    }}
                    autoFocus
                    className="flex-1 min-w-0 rounded-md bg-bg2 border border-gold px-2 py-1 text-base font-bold"
                  />
                  <button
                    onClick={renameTab}
                    disabled={!nameDraft.trim()}
                    className="text-gold text-sm font-bold shrink-0 disabled:opacity-40"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingTabName(false)}
                    className="text-xs text-gray-400 shrink-0"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-lg truncate">{activeTab.name}</span>
                  <button
                    onClick={() => {
                      setNameDraft(activeTab.name);
                      setEditingTabName(true);
                    }}
                    className="text-gray-400 shrink-0"
                    aria-label="伝票名を編集"
                  >
                    ✏️
                  </button>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 font-bold shrink-0 ${
                      activeTab.closed_at ? "bg-line text-gray-300" : "bg-gold/20 text-gold"
                    }`}
                  >
                    {activeTab.closed_at ? "会計済み" : "対応中"}
                  </span>
                </div>
              )}
              {!editingTabName && (
                <button onClick={deleteTab} className="text-xs text-rose shrink-0">
                  伝票を削除
                </button>
              )}
            </div>

            {editingTimes ? (
              <div className="rounded-md bg-bg2 border border-gold/50 px-2.5 py-2 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-300">
                  <span className="flex items-center gap-1">
                    来店
                    <input
                      type="datetime-local"
                      value={createdAtDraft}
                      onChange={(e) => setCreatedAtDraft(e.target.value)}
                      className="rounded-md bg-bg border border-line px-1.5 py-0.5 text-xs"
                    />
                  </span>
                  {activeTab.closed_at && (
                    <span className="flex items-center gap-1">
                      退店
                      <input
                        type="datetime-local"
                        value={closedAtDraft}
                        onChange={(e) => setClosedAtDraft(e.target.value)}
                        className="rounded-md bg-bg border border-line px-1.5 py-0.5 text-xs"
                      />
                    </span>
                  )}
                </div>
                {timesError && <p className="text-rose text-[11px]">{timesError}</p>}
                <div className="flex items-center gap-3">
                  <button onClick={saveTimes} className="text-gold text-xs font-bold">
                    保存
                  </button>
                  <button onClick={() => setEditingTimes(false)} className="text-gray-400 text-xs">
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>
                  来店 {formatTime(activeTab.created_at)}
                  {activeTab.closed_at && <> ・退店 {formatTime(activeTab.closed_at)}</>}
                  <button onClick={openTimeEditor} className="ml-1.5 text-gray-500 underline">
                    編集
                  </button>
                </span>
                {!activeTab.closed_at && (
                <span className="flex items-center gap-1">
                  人数
                  <input
                    defaultValue={activeTab.guest_count ?? ""}
                    onBlur={(e) => saveGuestCount(e.target.value)}
                    inputMode="numeric"
                    placeholder="-"
                    className="w-12 rounded-md bg-bg2 border border-line px-1.5 py-0.5 text-xs text-center"
                  />
                  名
                </span>
              )}
              {!activeTab.closed_at && (
                <span className="flex items-center gap-1">
                  内訳
                  <input
                    key={`male-${activeTab.id}-${activeTab.guest_count_male}`}
                    ref={guestMaleInputRef}
                    defaultValue={activeTab.guest_count_male ?? ""}
                    onBlur={() =>
                      saveGuestBreakdown(guestMaleInputRef.current?.value ?? "", guestFemaleInputRef.current?.value ?? "")
                    }
                    inputMode="numeric"
                    placeholder="男"
                    className="w-10 rounded-md bg-bg2 border border-line px-1.5 py-0.5 text-xs text-center"
                  />
                  ／
                  <input
                    key={`female-${activeTab.id}-${activeTab.guest_count_female}`}
                    ref={guestFemaleInputRef}
                    defaultValue={activeTab.guest_count_female ?? ""}
                    onBlur={() =>
                      saveGuestBreakdown(guestMaleInputRef.current?.value ?? "", guestFemaleInputRef.current?.value ?? "")
                    }
                    inputMode="numeric"
                    placeholder="女"
                    className="w-10 rounded-md bg-bg2 border border-line px-1.5 py-0.5 text-xs text-center"
                  />
                  名
                </span>
              )}
              </div>
            )}

            {activeTab.course_ends_at && <CourseTimerBadge endsAt={activeTab.course_ends_at} now={now} />}

            {activeTab.customer_id && activeTab.customers && (
              <div className="rounded-lg border border-line bg-bg2 px-3 py-2 text-xs text-gray-300 space-y-0.5">
                <div className="text-gray-500 font-bold">👤 顧客情報</div>
                {activeTab.customers.phone && <div>📞 {activeTab.customers.phone}</div>}
                {activeTab.customers.birthday && <div>🎂 {activeTab.customers.birthday}</div>}
                {activeTab.customers.bottle_keep && <div>🍾 {activeTab.customers.bottle_keep}</div>}
                {activeTab.customers.memo && <div className="whitespace-pre-wrap">📝 {activeTab.customers.memo}</div>}
              </div>
            )}

            {notifyPermission === "default" && (
              <button
                onClick={requestNotifyPermission}
                className="text-xs rounded-md border border-dashed border-line px-2 py-1 text-gray-400"
              >
                🔔 ラストオーダー通知を有効にする
              </button>
            )}

            <div className="rounded-lg bg-bg2 px-3 py-2 font-mono text-sm space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>小計</span>
                <span>¥{tabSubtotal(activeTab.tab_items).toLocaleString()}</span>
              </div>
              {!!(activeTab.discount_percent || activeTab.discount_amount) && (
                <div className="flex justify-between text-rose">
                  <span>
                    割引
                    {activeTab.discount_percent ? `（${activeTab.discount_percent}%OFF）` : ""}
                  </span>
                  <span>
                    -¥
                    {tabDiscountAmount(
                      activeTab.tab_items,
                      taxRate,
                      activeTab.discount_percent,
                      activeTab.discount_amount
                    ).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-gray-400">
                <span>消費税</span>
                <span>¥{tabTax(activeTab.tab_items, taxRate).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gold font-bold text-lg pt-1 border-t border-dashed border-line">
                <span>合計</span>
                <AnimatedNumber
                  value={tabTotal(
                    activeTab.tab_items,
                    taxRate,
                    activeTab.discount_percent,
                    activeTab.discount_amount
                  )}
                  prefix="¥"
                />
              </div>
            </div>

            {!activeTab.closed_at && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  {[30, 50].map((p) => (
                    <button
                      key={p}
                      onClick={() => setDiscount(activeTab.discount_percent === p ? null : p)}
                      className={`text-xs rounded-md px-3 py-1.5 font-bold border ${
                        activeTab.discount_percent === p
                          ? "bg-rose text-white border-rose"
                          : "border-line text-gray-300"
                      }`}
                    >
                      🎟 {p}%OFF
                    </button>
                  ))}
                  {activeTab.discount_percent != null && (
                    <button
                      onClick={() => setDiscount(null)}
                      className="text-xs rounded-md px-3 py-1.5 border border-line text-gray-400"
                    >
                      割引解除
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={manualDiscount}
                    onChange={(e) => setManualDiscount(e.target.value)}
                    placeholder="値引き額（円）"
                    inputMode="numeric"
                    className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={applyManualDiscount}
                    className="text-xs rounded-md px-3 py-1.5 font-bold border border-dashed border-rose text-rose shrink-0"
                  >
                    値引き適用
                  </button>
                  {activeTab.discount_amount != null && (
                    <button
                      onClick={clearManualDiscount}
                      className="text-xs rounded-md px-3 py-1.5 border border-line text-gray-400 shrink-0"
                    >
                      解除
                    </button>
                  )}
                </div>
              </div>
            )}

            {renderPaymentButtons(activeTab)}

            <div className="flex gap-2 pt-1">
              <input
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                placeholder="補足欄（例：奥のテーブル、常連さん 等）"
                className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-xs"
              />
              <button
                onClick={saveMemo}
                disabled={memoDraft === (activeTab.memo ?? "")}
                className="text-xs rounded-md border border-line px-3 py-1.5 text-gray-300 disabled:opacity-40 shrink-0"
              >
                保存
              </button>
            </div>
          </div>

          {staff.length > 0 && (
            <div className="rounded-xl border border-[#6FB3E0]/50 bg-[#6FB3E0]/25 p-4">
              <SectionHeader icon={<PeopleSectionIcon />} tone="blue">担当スタッフ（この伝票の歩合対象）</SectionHeader>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {staff.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setTabStaff(activeTab.staff_id === s.id ? null : s.id)}
                    className={`shrink-0 rounded-full px-3 py-2 text-sm border ${
                      activeTab.staff_id === s.id
                        ? "bg-gold text-bg border-gold"
                        : "bg-elevated text-gray-300 border-line"
                    }`}
                  >
                    👤 {s.name}
                  </button>
                ))}
              </div>
              <div className="text-sm text-gray-400 mt-2">
                この伝票の売上全体が、選択したスタッフの歩合給の対象になります（もう一度タップで解除、会計済みでも変更できます）
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#B78FE0]/50 bg-[#B78FE0]/25 p-4">
            <SectionHeader icon={<ReceiptSectionIcon />} tone="purple">
              伝票内容（{activeTab.tab_items.reduce((a, i) => a + i.qty, 0)}点）
            </SectionHeader>
            {activeTab.tab_items.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-line rounded-xl">
                まだ商品が記録されていません
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-elevated divide-y divide-line overflow-hidden">
                {activeTab.tab_items.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-3 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">
                        {i.is_cast_drink && "🍾 "}
                        {i.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">¥{i.price.toLocaleString()} / 個</div>
                      {staff.length > 0 &&
                        (!activeTab.closed_at ? (
                          <select
                            value={i.staff_id ?? ""}
                            onChange={(e) => setItemStaff(i, e.target.value || null)}
                            className="mt-1 text-xs rounded-md bg-bg2 border border-line px-1.5 py-0.5 max-w-full"
                          >
                            <option value="">
                              伝票の担当のまま{activeTab.staff_id ? `（${staffName(activeTab.staff_id)}）` : "（未設定）"}
                            </option>
                            {staff.map((s) => (
                              <option key={s.id} value={s.id}>
                                この商品だけ→{s.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          i.staff_id && (
                            <div className="text-xs text-gold mt-0.5">👤{staffName(i.staff_id)}（個別指定）</div>
                          )
                        ))}
                    </div>

                    {!activeTab.closed_at ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => changeQty(i, -1)}
                          className="w-10 h-10 rounded-lg border border-line text-gray-300 text-xl leading-none active:bg-line"
                        >
                          −
                        </button>
                        <input
                          key={`${i.id}-${i.qty}`}
                          defaultValue={i.qty}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n)) setQty(i, Math.floor(n));
                          }}
                          inputMode="numeric"
                          className="w-11 text-center font-mono text-base bg-bg2 border border-line rounded-md py-1.5"
                        />
                        <button
                          onClick={() => changeQty(i, 1)}
                          className="w-10 h-10 rounded-lg border border-line text-gray-300 text-xl leading-none active:bg-line"
                        >
                          ＋
                        </button>
                      </div>
                    ) : (
                      <span className="font-mono text-gray-400 shrink-0">× {i.qty}</span>
                    )}

                    <div className="w-20 text-right font-mono font-bold text-gold shrink-0">
                      ¥{(i.price * i.qty).toLocaleString()}
                    </div>

                    {!activeTab.closed_at && (
                      <button
                        onClick={() => deleteTabItem(i)}
                        className="text-rose text-lg shrink-0 w-6"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-good/50 bg-good/25 p-4">
            <SectionHeader icon={<CupSectionIcon />} tone="good">メニュー</SectionHeader>
            {quickPickItems.length > 0 && (
              <div className="mb-3">
                <div className="text-sm font-extrabold text-gold mb-1.5">⭐ よく出る商品</div>
                <div className="grid grid-cols-2 gap-2.5">
                  {quickPickItems.map((m) => renderMenuButton(m, { big: true, disabled: !!activeTab.closed_at }))}
                </div>
              </div>
            )}
            {showCategoryTabs && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-0.5 px-0.5">
                {menuCategories.map((cat) => {
                  const color = categoryColorFor(cat === UNCATEGORIZED_LABEL ? null : cat);
                  const active = cat === currentCategory;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      style={active ? { backgroundColor: `${color}26`, borderColor: color, color } : { borderColor: color }}
                      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-bold border-2 flex items-center gap-1.5 ${
                        active ? "" : "text-gray-300"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {categoryMenuItems.map((m) => renderMenuButton(m, { disabled: !!activeTab.closed_at }))}
            </div>
          </div>

          {!activeTab.closed_at && (
            <div className="rounded-xl border border-warn/50 bg-warn/25 p-4">
              <SectionHeader icon={<PlusSectionIcon />} tone="warn">自由入力で追加</SectionHeader>
              <div className="flex gap-2">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="品名"
                  className="flex-1 min-w-0 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
                />
                <input
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder="金額"
                  inputMode="numeric"
                  className="w-24 rounded-md bg-bg2 border border-line px-2 py-1.5 text-sm"
                />
                <button
                  onClick={addManualItem}
                  className="rounded-md px-3 py-1.5 text-sm border border-dashed border-gold text-gold shrink-0"
                >
                  ＋ 追加
                </button>
              </div>
            </div>
          )}

          <div
            style={{ borderLeftColor: tabColorFor(activeTab.id), borderLeftWidth: 5 }}
            className="rounded-xl border border-rose/50 bg-rose/25 p-4"
          >
            <SectionHeader icon={<CashSectionIcon />} tone="rose">会計</SectionHeader>
            {renderCheckoutSummary(activeTab)}
          </div>
        </>
      )}

      {!activeTab && (
        <div className="text-sm text-gray-500 text-center py-10 border border-dashed border-line rounded-xl">
          伝票を選択するか、新しく作成してください
        </div>
      )}

      <button
        onClick={openCreateModal}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gold text-bg shadow-premium flex items-center justify-center active:scale-95 transition-transform"
        aria-label="伝票を作る"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      {lastAction && lastAction.tabId === activeTabId && (
        <div className="fixed bottom-36 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-sm">
          <button
            onClick={performUndo}
            className="w-full rounded-xl bg-elevated border border-gold shadow-premium px-4 py-3 flex items-center justify-between gap-3"
          >
            <span className="text-sm text-gray-300 truncate">{lastAction.label}</span>
            <span className="text-gold font-bold text-sm shrink-0">↺ 元に戻す</span>
          </button>
        </div>
      )}

      {showEpaymentPicker && activeTab && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowEpaymentPicker(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-elevated p-4 space-y-2.5"
          >
            <div className="text-gold font-bold text-base mb-1">電子決済の種類を選択</div>
            {enabledEpaymentMethods.map((m) => (
              <button
                key={m.method}
                onClick={() => requestSettle(m.method)}
                className="w-full rounded-xl border border-line py-3.5 text-sm font-bold text-gray-200 flex items-center justify-center gap-2"
              >
                {paymentIcon(m.method)}
                {m.label}で会計
              </button>
            ))}
            <button
              onClick={() => setShowEpaymentPicker(false)}
              className="w-full rounded-md border border-line py-2 text-sm text-gray-400"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {pendingSettleMethod && activeTab && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPendingSettleMethod(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-elevated p-5 space-y-4 text-center animate-card-pop-in"
          >
            <div className="text-[15px] text-gray-200">
              {PAYMENT_METHOD_LABELS[pendingSettleMethod]}で
              <span className="block text-gold font-mono font-bold text-2xl mt-1">
                ¥
                {tabTotal(
                  activeTab.tab_items,
                  taxRate,
                  activeTab.discount_percent,
                  activeTab.discount_amount
                ).toLocaleString()}
              </span>
              を会計しますか？
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingSettleMethod(null)}
                className="flex-1 rounded-xl border border-line py-3 text-sm text-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={confirmSettle}
                className="flex-1 rounded-xl bg-gold text-bg py-3 text-sm font-bold active:scale-[0.97] transition-transform"
              >
                会計する
              </button>
            </div>
          </div>
        </div>
      )}

      {showReceipt && activeTab && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowReceipt(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-elevated p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-card-pop-in"
          >
            <div className="text-center space-y-1">
              <div className="animate-check-pop mx-auto w-12 h-12 rounded-full bg-gold flex items-center justify-center text-bg text-2xl font-bold">
                ✓
              </div>
              <div className="text-gold font-bold text-lg">{storeName ?? "お会計"}</div>
              {activeTab.closed_at && (
                <div className="text-xs text-gray-400">
                  {new Date(activeTab.closed_at).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-line" />

            <div className="space-y-2.5">
              {activeTab.tab_items.map((i) => (
                <div key={i.id} className="flex justify-between gap-3 text-[15px]">
                  <span className="text-gray-200">
                    {i.name}
                    {i.qty > 1 && <span className="text-gray-400"> × {i.qty}</span>}
                  </span>
                  <span className="font-mono font-bold shrink-0">¥{(i.price * i.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-line" />

            <div className="space-y-1.5 text-[15px]">
              <div className="flex justify-between text-gray-400">
                <span>小計</span>
                <span className="font-mono">¥{tabSubtotal(activeTab.tab_items).toLocaleString()}</span>
              </div>
              {!!(activeTab.discount_percent || activeTab.discount_amount) && (
                <div className="flex justify-between text-rose">
                  <span>割引{activeTab.discount_percent ? `（${activeTab.discount_percent}%OFF）` : ""}</span>
                  <span className="font-mono">
                    -¥
                    {tabDiscountAmount(
                      activeTab.tab_items,
                      taxRate,
                      activeTab.discount_percent,
                      activeTab.discount_amount
                    ).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-gray-400">
                <span>消費税</span>
                <span className="font-mono">¥{tabTax(activeTab.tab_items, taxRate).toLocaleString()}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-line" />

            <div className="flex justify-between items-baseline">
              <span className="font-bold text-gray-200">合計</span>
              <span className="font-mono font-bold text-gold text-3xl">
                ¥
                {tabTotal(
                  activeTab.tab_items,
                  taxRate,
                  activeTab.discount_percent,
                  activeTab.discount_amount
                ).toLocaleString()}
              </span>
            </div>

            {activeTab.payment_method && (
              <div className="text-center text-xs text-gray-500">
                {PAYMENT_METHOD_EMOJI[activeTab.payment_method]} {PAYMENT_METHOD_LABELS[activeTab.payment_method]}でお支払い
              </div>
            )}

            <button
              onClick={() => setShowReceipt(false)}
              className="w-full rounded-xl bg-gold text-bg py-3 text-sm font-bold"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-elevated p-4 space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="text-gold font-bold text-base">伝票を作る</div>

            {storeMode === "club" ? (
              <div>
                <label className="block text-xs text-gray-400 mb-1">お客様（登録済みの顧客から選択）</label>
                <input
                  autoFocus
                  value={modalName}
                  onChange={(e) => {
                    setModalName(e.target.value);
                    setSelectedCustomer(null);
                  }}
                  placeholder="名前・フリガナで検索"
                  className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-sm"
                />

                {selectedCustomer && (
                  <div className="mt-1.5 text-xs text-gold">✓ {selectedCustomer.name} を選択中</div>
                )}

                {!selectedCustomer &&
                  modalName.trim() &&
                  (searchingCustomer ? (
                    <div className="text-xs text-gray-500 mt-1.5">検索中...</div>
                  ) : (
                    <div className="mt-1.5 space-y-1.5">
                      {customerSearchResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCustomerForTab(c)}
                          className="w-full text-left rounded-lg border border-line bg-bg2 px-3 py-2"
                        >
                          <div className="text-sm font-bold text-gray-200">{c.name}</div>
                          {c.name_kana && <div className="text-xs text-gray-500">{c.name_kana}</div>}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewCustomerForm(true);
                          setNewCustomerDraft((d) => ({ ...d, name: modalName.trim() }));
                        }}
                        className="w-full text-left rounded-lg border border-dashed border-gold text-gold px-3 py-2 text-sm"
                      >
                        ＋ 新規顧客登録「{modalName.trim()}」
                      </button>
                    </div>
                  ))}

                {showNewCustomerForm && (
                  <div className="mt-2 rounded-lg border border-gold/50 bg-bg2 p-3 space-y-2">
                    <input
                      value={newCustomerDraft.name}
                      onChange={(e) => setNewCustomerDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="お名前"
                      className="w-full rounded-md bg-bg border border-line px-2 py-1.5 text-sm"
                    />
                    <input
                      value={newCustomerDraft.nameKana}
                      onChange={(e) => setNewCustomerDraft((d) => ({ ...d, nameKana: e.target.value }))}
                      placeholder="フリガナ(任意)"
                      className="w-full rounded-md bg-bg border border-line px-2 py-1.5 text-sm"
                    />
                    <input
                      value={newCustomerDraft.phone}
                      onChange={(e) => setNewCustomerDraft((d) => ({ ...d, phone: e.target.value }))}
                      placeholder="電話番号(任意)"
                      className="w-full rounded-md bg-bg border border-line px-2 py-1.5 text-sm"
                    />
                    <input
                      type="date"
                      value={newCustomerDraft.birthday}
                      onChange={(e) => setNewCustomerDraft((d) => ({ ...d, birthday: e.target.value }))}
                      className="w-full rounded-md bg-bg border border-line px-2 py-1.5 text-sm"
                    />
                    {staff.length > 0 && (
                      <select
                        value={newCustomerDraft.primaryStaffId}
                        onChange={(e) => setNewCustomerDraft((d) => ({ ...d, primaryStaffId: e.target.value }))}
                        className="w-full rounded-md bg-bg border border-line px-2 py-1.5 text-sm"
                      >
                        <option value="">担当キャスト未設定</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      value={newCustomerDraft.bottleKeep}
                      onChange={(e) => setNewCustomerDraft((d) => ({ ...d, bottleKeep: e.target.value }))}
                      placeholder="ボトルキープ(任意)"
                      className="w-full rounded-md bg-bg border border-line px-2 py-1.5 text-sm"
                    />
                    <textarea
                      value={newCustomerDraft.memo}
                      onChange={(e) => setNewCustomerDraft((d) => ({ ...d, memo: e.target.value }))}
                      placeholder="メモ(任意)"
                      rows={2}
                      className="w-full rounded-md bg-bg border border-line px-2 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewCustomerForm(false)}
                        className="flex-1 rounded-md border border-line py-1.5 text-xs text-gray-300"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={createCustomerAndProceed}
                        disabled={!newCustomerDraft.name.trim() || creatingCustomer}
                        className="flex-1 rounded-md bg-gold text-bg py-1.5 text-xs font-bold disabled:opacity-50"
                      >
                        {creatingCustomer ? "登録中..." : "登録して続ける"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <div>
              <label className="block text-xs text-gray-400 mb-1">名前・卓番</label>
              <input
                autoFocus
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                placeholder="例：田中様・3卓"
                className="w-full rounded-md bg-bg2 border border-line px-3 py-2 text-sm"
              />

              {nameInputMode === "kana_keypad" && (
                <div className="mt-2 rounded-lg border border-line bg-bg2 p-2">
                  {GOJUON_ROWS.map((row, ri) => (
                    <div key={ri} className="grid grid-cols-5 gap-1 mb-1.5">
                      {row.map((key, ci) =>
                        key ? (
                          <button
                            key={key.hira}
                            type="button"
                            onClick={() => setModalName((v) => v + key.kata)}
                            className="rounded-md bg-elevated border border-line py-1.5 text-sm font-bold text-gray-200"
                          >
                            {key.hira}
                          </button>
                        ) : (
                          <div key={ci} />
                        )
                      )}
                    </div>
                  ))}
                  <div className="grid grid-cols-5 gap-1">
                    <button
                      type="button"
                      onClick={applyDakuten}
                      className="rounded-md border border-line py-1.5 text-sm font-bold text-gray-200"
                    >
                      ゛
                    </button>
                    <button
                      type="button"
                      onClick={applyHandakuten}
                      className="rounded-md border border-line py-1.5 text-sm font-bold text-gray-200"
                    >
                      ゜
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalName((v) => v + "ー")}
                      className="rounded-md border border-line py-1.5 text-sm font-bold text-gray-200"
                    >
                      ー
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalName((v) => v + " ")}
                      className="rounded-md border border-line py-1.5 text-xs text-gray-300"
                    >
                      スペース
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalName((v) => v.slice(0, -1))}
                      className="rounded-md border border-line py-1.5 text-xs text-gray-300"
                    >
                      ⌫削除
                    </button>
                  </div>
                </div>
              )}

              {enableNameSearch && modalName.trim() &&
                (searchingName ? (
                  <div className="text-xs text-gray-500 mt-1.5">検索中...</div>
                ) : nameSearchResults.length > 0 ? (
                  <div className="mt-1.5 space-y-1.5">
                    <div className="text-xs text-gray-500">同じ名前の過去の伝票</div>
                    {nameSearchResults.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setModalName(t.name)}
                        className="w-full text-left rounded-lg border border-line bg-bg2 px-3 py-2"
                      >
                        <div className="flex justify-between items-baseline">
                          <span className="text-sm font-bold text-gray-200 truncate">{t.name}</span>
                          <span className="text-xs text-gray-500 shrink-0 ml-2">{t.business_date}</span>
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-xs text-gray-400">{t.tab_items.length}品</span>
                          <span className="text-xs font-mono text-gold font-bold">
                            ¥
                            {tabTotal(
                              t.tab_items,
                              taxRate,
                              t.discount_percent,
                              t.discount_amount
                            ).toLocaleString()}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 mt-1.5">一致する過去の伝票はありません</div>
                ))}
            </div>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">人数（任意）</label>
              <input
                value={modalGuestCount}
                onChange={(e) => setModalGuestCount(e.target.value)}
                inputMode="numeric"
                placeholder="例：4"
                className="w-24 rounded-md bg-bg2 border border-line px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">内訳・男女（任意・集計の男女比率に反映）</label>
              <div className="flex items-center gap-2">
                <input
                  value={modalGuestMale}
                  onChange={(e) => setModalGuestMale(e.target.value)}
                  inputMode="numeric"
                  placeholder="男性"
                  className="w-20 rounded-md bg-bg2 border border-line px-3 py-2 text-sm"
                />
                <span className="text-xs text-gray-500">名 ／</span>
                <input
                  value={modalGuestFemale}
                  onChange={(e) => setModalGuestFemale(e.target.value)}
                  inputMode="numeric"
                  placeholder="女性"
                  className="w-20 rounded-md bg-bg2 border border-line px-3 py-2 text-sm"
                />
                <span className="text-xs text-gray-500">名</span>
              </div>
            </div>

            {staff.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">担当スタッフ（任意）</label>
                <div className="flex gap-2 flex-wrap">
                  {staff.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setModalStaffId(modalStaffId === s.id ? null : s.id)}
                      className={`rounded-full px-3 py-1.5 text-sm border ${
                        modalStaffId === s.id
                          ? "bg-gold text-bg border-gold"
                          : "bg-bg2 text-gray-300 border-line"
                      }`}
                    >
                      👤 {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 rounded-md border border-line py-2.5 text-sm text-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={createTab}
                disabled={storeMode === "club" ? !selectedCustomer : !modalName.trim()}
                className="flex-1 rounded-md bg-gold text-bg py-2.5 text-sm font-bold disabled:opacity-50"
              >
                作成する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
