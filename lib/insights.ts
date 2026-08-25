import {
  TabWithItems,
  Expense,
  DaySummary,
  StaffCommission,
  itemSubtotal,
} from "@/lib/types";

export type Insight = {
  level: "positive" | "warning" | "info";
  text: string;
};

type DayRow = { date: string } & DaySummary;

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function generateInsights(
  summary: DaySummary,
  tabs: TabWithItems[],
  expenses: Expense[],
  commission: StaffCommission[],
  monthRows: DayRow[]
): Insight[] {
  const insights: Insight[] = [];
  if (summary.subtotal <= 0) return insights;

  // 粗利率
  const profitMargin = summary.profit / summary.subtotal;
  if (profitMargin < 0.5) {
    insights.push({
      level: "warning",
      text: `粗利率が${pct(profitMargin)}と低めです。原価や経費のバランスを見直す余地があるかもしれません`,
    });
  } else if (profitMargin >= 0.7) {
    insights.push({ level: "positive", text: `粗利率${pct(profitMargin)}と好調です` });
  }

  // 経費比率
  const expenseRatio = summary.expense / summary.subtotal;
  if (expenseRatio > 0.15) {
    insights.push({
      level: "warning",
      text: `経費が売上の${pct(expenseRatio)}を占めています。仕入れ・消耗品の使い方を確認してみてください`,
    });
  }

  // 人件費比率
  const laborRatio = summary.labor / summary.subtotal;
  if (laborRatio > 0.4) {
    insights.push({
      level: "warning",
      text: `人件費（時給＋歩合）が売上の${pct(laborRatio)}です。稼働人数やシフトを見直す余地があるかもしれません`,
    });
  }

  // 客単価
  const closedTabs = tabs.filter((t) => t.closed_at);
  if (closedTabs.length > 0) {
    const perTab = summary.total / closedTabs.length;
    insights.push({
      level: "info",
      text: `会計済み${closedTabs.length}組・客単価は¥${Math.round(perTab).toLocaleString()}でした`,
    });
  }

  // 対応中の伝票
  const openCount = tabs.filter((t) => !t.closed_at).length;
  if (openCount > 0) {
    insights.push({ level: "info", text: `対応中の伝票が${openCount}件あります` });
  }

  // 一番人気の商品
  const itemMap: Record<string, { qty: number; subtotal: number }> = {};
  tabs.forEach((t) =>
    t.tab_items.forEach((i) => {
      if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, subtotal: 0 };
      itemMap[i.name].qty += i.qty;
      itemMap[i.name].subtotal += itemSubtotal(i);
    })
  );
  const topItem = Object.entries(itemMap).sort((a, b) => b[1].subtotal - a[1].subtotal)[0];
  if (topItem) {
    insights.push({
      level: "info",
      text: `本日の一番人気は「${topItem[0]}」（${topItem[1].qty}点・¥${Math.round(topItem[1].subtotal).toLocaleString()}）でした`,
    });
  }

  // 歩合給トップスタッフ
  const topStaff = commission.filter((c) => c.staffId).sort((a, b) => b.commission - a.commission)[0];
  if (topStaff && topStaff.commission > 0) {
    insights.push({
      level: "positive",
      text: `本日の歩合給トップは${topStaff.name}さん（¥${Math.round(topStaff.commission).toLocaleString()}）でした`,
    });
  }

  // 経費カテゴリの偏り
  const catMap: Record<string, number> = {};
  expenses.forEach((e) => {
    catMap[e.category] = (catMap[e.category] ?? 0) + e.amount;
  });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (topCat && expenses.length > 1) {
    insights.push({
      level: "info",
      text: `本日の経費は「${topCat[0]}」が最も多く¥${Math.round(topCat[1]).toLocaleString()}でした`,
    });
  }

  // 今月平均との比較
  const pastRows = monthRows.filter((r) => r.subtotal > 0);
  if (pastRows.length >= 3) {
    const avgProfit = pastRows.reduce((a, r) => a + r.profit, 0) / pastRows.length;
    if (avgProfit > 0) {
      const diff = (summary.profit - avgProfit) / avgProfit;
      if (Math.abs(diff) >= 0.2) {
        insights.push({
          level: diff > 0 ? "positive" : "warning",
          text: `本日の粗利は今月平均より${diff > 0 ? "+" : ""}${pct(diff)}${diff > 0 ? "高い" : "低い"}です`,
        });
      }
    }
  }

  return insights;
}
