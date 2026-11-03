import type { SupabaseClient } from "@supabase/supabase-js";
import type { TabWithItems } from "@/lib/types";

// 未収（支払い内訳にreceivableが入っている）伝票を、品目・支払い内訳・回収記録つきで全期間から読み込む。
// customerIdを渡すとそのお客様の伝票だけ、customerId=nullとnameを渡すと顧客に紐づかない同名の伝票だけに絞る
export async function fetchReceivableTabs(
  supabase: SupabaseClient,
  storeId: string,
  filter?: { customerId: string | null; name: string }
): Promise<TabWithItems[]> {
  let q = supabase
    .from("tab_payments")
    .select("tabs!inner(*, tab_items(*), tab_payments(*), receivable_collections(*))")
    .eq("store_id", storeId)
    .eq("method", "receivable");
  if (filter) {
    q = filter.customerId
      ? q.eq("tabs.customer_id", filter.customerId)
      : q.is("tabs.customer_id", null).eq("tabs.name", filter.name.trim());
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const byId = new Map<string, TabWithItems>();
  ((data ?? []) as unknown as { tabs: TabWithItems | TabWithItems[] | null }[]).forEach((row) => {
    const t = Array.isArray(row.tabs) ? row.tabs[0] : row.tabs;
    if (t) byId.set(t.id, t);
  });
  return Array.from(byId.values());
}
