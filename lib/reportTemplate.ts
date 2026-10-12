// LINE報告レポートの既定テンプレート（{{タグ}}に実際の値が差し込まれる）
export const DEFAULT_REPORT_TEMPLATE = `⚪日にち {{date}}
⚪売上 {{sales}}
⚪経費 {{expense}}
⚪純利益{{profit}}
⚪カード {{card}}
⚪{{tab_count}}組男　人女　人（計{{guest_count}}人）
⚪メンション　件フォロー　件写真　件
⚪ｸｰﾎﾟﾝ金　枚 銀　枚
⚪ｸｰﾎﾟﾝ返ってきた枚数金　枚銀　枚
50%OFFクーポン {{coupon50}}枚

⚪バイト時間
{{hourly_hours}}
⚪バイト人件費
{{hourly_cost}}

⚪バック
{{commission}}


日にち {{month_range}}
⚪売上 {{month_sales}}
⚪経費　{{month_expense}}
⚪純利益  {{month_profit}}
⚪家賃　¥
⚪カラオケ¥
⚪カード {{month_card}}
⚪PayPay¥
⚪{{month_tab_count}}組計{{month_guest_count}}人
⚪ｸｰﾎﾟﾝ金　枚銀　枚
⚪ｸｰﾎﾟﾝ返ってきた枚数金　枚銀　枚
50%OFFクーポン {{month_coupon50}}枚

⚪バイト時間&人件費
{{month_hourly}}

⚪バック
{{month_commission}}

{{month_num}}月未収
{{month_unsettled}}`;

// 利用できる差し込みタグと説明（設定画面での案内用）
export const REPORT_TEMPLATE_TOKENS: { token: string; label: string }[] = [
  { token: "date", label: "本日の日付（例: 7/18）" },
  { token: "sales", label: "本日の売上(税込)" },
  { token: "expense", label: "本日の経費" },
  { token: "profit", label: "本日の純利益（売上-経費）" },
  { token: "card", label: "本日のカード決済額" },
  { token: "receivable", label: "本日の未収額（後日回収する分）" },
  { token: "tab_count", label: "本日の組数" },
  { token: "guest_count", label: "本日の人数(合計)" },
  { token: "coupon50", label: "本日の50%OFFクーポン枚数" },
  { token: "hourly_hours", label: "本日の時給スタッフ勤務時間(スタッフごと改行)" },
  { token: "hourly_cost", label: "本日の時給スタッフ人件費(スタッフごと改行)" },
  { token: "commission", label: "本日のスタッフ別歩合給(スタッフごと改行)" },
  { token: "month_range", label: "今月の期間（例: 7/1〜7/18）" },
  { token: "month_num", label: "今月の月番号（例: 7）" },
  { token: "month_sales", label: "今月の売上(税込)" },
  { token: "month_expense", label: "今月の経費" },
  { token: "month_profit", label: "今月の純利益" },
  { token: "month_card", label: "今月のカード決済額" },
  { token: "month_receivable", label: "今月の未収額（後日回収する分）" },
  { token: "month_tab_count", label: "今月の組数" },
  { token: "month_guest_count", label: "今月の人数(合計)" },
  { token: "month_coupon50", label: "今月の50%OFFクーポン枚数" },
  { token: "month_hourly", label: "今月の時給スタッフ時間&人件費(スタッフごと改行)" },
  { token: "month_commission", label: "今月のスタッフ別歩合給(スタッフごと改行)" },
  { token: "month_unsettled", label: "今月の未収一覧(伝票ごと改行。未会計の伝票と、会計済みで未収が残っている伝票)" },
];

export function renderReportTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => tokens[key] ?? "");
}
