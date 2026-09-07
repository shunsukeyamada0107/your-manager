-- ============================================================
-- BAR TEVER → 複数店舗対応 データベーススキーマ (Supabase/Postgres想定)
-- 店舗ごとにデータを完全に分離するマルチテナント設計
-- ============================================================

-- 拡張機能（UUID生成用。Supabaseではデフォルトで有効なことが多い）
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 0. 組織（複数店舗を運営する企業・グループ単位。任意）
-- ------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 1. 店舗（テナントの単位。TEVERも1店舗として登録する）
-- ------------------------------------------------------------
create table stores (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,                 -- 例: "BAR TEVER"
  plan                      text not null default 'trial' check (plan in ('trial','paid','suspended')),
  tax_rate                  numeric not null default 0.10,  -- 消費税率（0.10=10%）
  commission_rate           numeric not null default 0.20,  -- 歩合率（0.20=20%。ドリンクバック制では売上バックの率として使う）
  commission_scheme         text not null default 'simple' check (commission_scheme in ('simple','drink_back')), -- 歩合の計算方式（simple=売上の一律%、drink_back=売上バック＋ドリンクバック）
  drink_back_amount         numeric not null default 200,   -- ドリンクバック制での、ドリンク1杯あたりの固定バック額
  business_day_cutoff_hour  integer not null default 6,      -- 営業日の切り替え時刻（この時刻より前は前日扱い）
  report_template           text,                            -- LINE報告レポートの自由テンプレート（未設定ならアプリ側の既定形式を使う）
  cash_float_amount         numeric not null default 0,      -- 釣り銭元金（営業終了後に金庫に残す固定額）
  accent_color              text not null default '#DCA84E', -- 店舗ごとのブランドカラー（アプリのゴールド部分に反映）
  theme                     text not null default 'dark' check (theme in ('dark','light')), -- 店舗ごとの画面テーマ
  show_insights             boolean not null default true, -- 集計タブの「気づき」セクションを表示するか
  accepts_card              boolean not null default true,  -- 電子決済としてカードを受け付けるか
  accepts_paypay            boolean not null default false, -- 電子決済としてPayPayを受け付けるか
  accepts_other_epayment    boolean not null default false, -- 電子決済としてその他（PayPay/カード以外）を受け付けるか
  enable_name_search        boolean not null default true,  -- 伝票を作る画面で、同じ名前の過去の伝票を検索表示するか
  name_input_mode           text not null default 'keyboard' check (name_input_mode in ('keyboard','kana_keypad')), -- 伝票の名前欄の入力方法（keyboard=通常のキーボード、kana_keypad=カタカナ専用ボタン）
  organization_id           uuid references organizations(id) on delete set null, -- 複数店舗を運営する組織に属する場合
  owner_pin                 text, -- 設定タブの「オーナー専用」情報を開くための暗証番号。ログインアカウントは店舗で共有するため別途用意（DB上は平文。閲覧はRLSで店舗メンバーのみに制限されるが、あくまで同じ端末を使うスタッフからオーナー情報を隠すためのUI上のロックであり、暗号強度のセキュリティではない）
  pay_cycle                 text not null default 'monthly' check (pay_cycle in ('monthly','weekly','daily')), -- 給与の支払いサイクル（monthly=月払い、weekly=週払い、daily=日払い）。給与明細作成時の対象期間の選び方に反映される
  commission_tax_basis      text not null default 'with_tax' check (commission_tax_basis in ('with_tax','pre_tax')), -- 歩合の計算を消費税込みの金額でやるか(with_tax)、消費税抜きの小計でやるか(pre_tax)
  created_at                timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. 店舗メンバー（ログインユーザーと店舗の紐付け）
--    Supabase Authのauth.usersと連携する
-- ------------------------------------------------------------
create table store_members (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner','staff')),
  created_at  timestamptz not null default now(),
  unique (store_id, user_id)
);

-- ------------------------------------------------------------
-- 2b. 組織メンバー（本部アカウントと組織の紐付け。組織配下の全店舗を横断で閲覧できる）
-- ------------------------------------------------------------
create table organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- ------------------------------------------------------------
-- 3. スタッフ（勤怠・歩合の対象。ログインアカウントとは別概念）
-- ------------------------------------------------------------
create table staff (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  name                text not null,
  hourly_wage         numeric,           -- null = 時給未設定
  active              boolean not null default true,
  commission_eligible boolean not null default true, -- false = 歩合の対象外（伝票を担当してもその分は歩合計算に含めない）
  base_salary         numeric,           -- 基本給（月給制の場合）。設定タブの「オーナー専用」ページの参照情報のみで、歩合・時給の自動計算には含めない
  special_allowance   numeric,           -- 特別手当。同上、参照情報のみ
  special_wage        numeric,           -- 特別時給。対象曜日・祝日に該当する日はhourly_wageの代わりにこちらを出退勤登録時に採用する
  special_wage_days   smallint[],        -- 特別時給の対象曜日（0=日〜6=土）。null/空なら曜日条件なし
  special_wage_holiday boolean not null default false, -- 特別時給を祝日にも適用するか
  commission_tax_basis_override text check (commission_tax_basis_override in ('with_tax','pre_tax')), -- 歩合の計算に使う金額の基準を店舗設定と別に指定する場合の上書き値。null=店舗設定(stores.commission_tax_basis)に従う
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. メニュー
-- ------------------------------------------------------------
create table menu_items (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  name            text not null,
  price           numeric not null check (price >= 0),
  course_minutes  integer,           -- 飲み放題等コースの場合の時間（分）。null=通常メニュー
  active          boolean not null default true,
  sort_order      integer not null default 0,  -- メニュー管理画面での表示順（小さいほど上）
  is_cast_drink   boolean not null default false, -- ドリンクバック制の対象（お客様がキャストに奢るドリンク）
  category        text,              -- 伝票画面でのカテゴリタブ分け。null=「その他」扱い
  is_quick_pick   boolean not null default false, -- よく出る商品として伝票画面の最上部に固定表示
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. 伝票（お客様・卓ごとの単位）
--    来店時間 = created_at / 退店時間 = closed_at
-- ------------------------------------------------------------
create table tabs (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  business_date   date not null,      -- 朝6時基準の営業日
  name            text not null,      -- お客様名・卓番
  memo            text not null default '',
  payment_method  text check (payment_method in ('cash','card','paypay','other_epayment')),
  guest_count     integer,                             -- 人数（任意）
  guest_count_male   integer,                          -- 内訳・男性人数（任意。集計タブの男女比率に反映）
  guest_count_female integer,                          -- 内訳・女性人数（任意）
  course_ends_at  timestamptz,                          -- 飲み放題等コースの終了予定時刻（任意）
  discount_percent numeric,                             -- 割引率（例: 30 = 30%OFF、任意）
  discount_amount  numeric,                             -- 自由入力の値引き額（円、任意）
  staff_id        uuid references staff(id) on delete set null, -- この伝票の担当スタッフ（歩合給の対象）
  created_at      timestamptz not null default now(),  -- 来店
  closed_at       timestamptz                          -- 退店・会計
);

-- ------------------------------------------------------------
-- 6. 伝票の明細（注文品目。担当スタッフを紐付け）
-- ------------------------------------------------------------
create table tab_items (
  id          uuid primary key default gen_random_uuid(),
  tab_id      uuid not null references tabs(id) on delete cascade,
  staff_id    uuid references staff(id) on delete set null,
  name        text not null,
  price       numeric not null check (price >= 0),
  qty         integer not null default 1 check (qty > 0),
  source      text not null default 'manual' check (source in ('menu','manual')),
  is_cast_drink boolean not null default false, -- 追加時点のメニューのキャストドリンク設定を引き継ぐ（後でメニュー側が変わっても過去分は変わらない）
  created_at  timestamptz not null default now()
);

-- 伝票の作成・削除・来店退店時刻の修正ログ（設定タブで確認用。特に削除・時刻修正は
-- 不正やデータ修正の見える化が目的なので、変更内容をスナップショットとして残す）
create table tab_logs (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  action        text not null check (action in ('created', 'deleted', 'time_edited')),
  tab_name      text not null,
  business_date date not null,
  guest_count   integer,
  item_count    integer,   -- 削除時点の点数（作成時・時刻修正時はnull）
  total_amount  numeric,   -- 削除時点の合計金額（作成時・時刻修正時はnull）
  note          text,      -- 自由記述の補足（time_editedでは「来店 8/10 23:05 → 8/11 00:15」等の変更内容）
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. 出退勤
-- ------------------------------------------------------------
create table attendance (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  staff_id       uuid not null references staff(id) on delete cascade,
  business_date  date not null,
  clock_in       timestamptz not null,
  clock_out      timestamptz,
  wage_snapshot  numeric   -- 出勤時点の時給を記録（後で時給を変更しても過去分は変わらない）
);

-- ------------------------------------------------------------
-- 8. 経費
-- ------------------------------------------------------------
create table expenses (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  business_date  date not null,
  category       text not null,
  name           text not null,
  amount         numeric not null check (amount >= 0),
  receipt_url    text,          -- 撮影したレシート画像のURL（任意）
  created_at     timestamptz not null default now()
);

-- 監査ログと伝票削除を同一トランザクションで行う。
-- security invokerのまま実行し、呼び出しユーザーのRLS権限を必ず適用する。
create or replace function delete_tab_with_log(p_tab_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_tab tabs%rowtype;
  item_count_value integer;
  subtotal_value numeric;
  pre_discount_total numeric;
  discount_value numeric;
  total_value numeric;
begin
  select * into target_tab from tabs where id = p_tab_id for update;
  if not found then
    raise exception '伝票が見つからないか、削除権限がありません。';
  end if;

  select coalesce(sum(qty), 0), coalesce(sum(price * qty), 0)
  into item_count_value, subtotal_value
  from tab_items
  where tab_id = p_tab_id;

  pre_discount_total := subtotal_value + round(subtotal_value * (select tax_rate from stores where id = target_tab.store_id));
  discount_value := least(
    pre_discount_total,
    case
      when coalesce(target_tab.discount_percent, 0) <> 0
        then round(pre_discount_total * target_tab.discount_percent / 100)
      else 0
    end + coalesce(target_tab.discount_amount, 0)
  );
  total_value := ceil((pre_discount_total - discount_value) / 100) * 100;

  insert into tab_logs (
    store_id, action, tab_name, business_date, guest_count, item_count, total_amount
  ) values (
    target_tab.store_id, 'deleted', target_tab.name, target_tab.business_date,
    target_tab.guest_count, item_count_value, total_value
  );

  delete from tabs where id = p_tab_id;
end;
$$;

revoke all on function delete_tab_with_log(uuid) from public;
grant execute on function delete_tab_with_log(uuid) to authenticated;

-- ============================================================
-- Row Level Security（店舗間のデータ漏洩を防ぐ最重要設定）
-- 「自分がstore_membersに登録されている店舗のデータしか見えない」ようにする
-- ============================================================

alter table organizations        enable row level security;
alter table organization_members enable row level security;
alter table stores        enable row level security;
alter table store_members enable row level security;
alter table staff         enable row level security;
alter table menu_items    enable row level security;
alter table tabs          enable row level security;
alter table tab_items     enable row level security;
alter table tab_logs      enable row level security;
alter table attendance    enable row level security;
alter table expenses      enable row level security;

-- 自分が所属する店舗IDの一覧を返すヘルパー関数
create or replace function my_store_ids()
returns setof uuid
language sql stable
as $$
  select store_id from store_members where user_id = auth.uid();
$$;

-- 自分が本部メンバーとして所属する組織配下の、全店舗IDを返すヘルパー関数（閲覧専用アクセスの起点）
-- security definer必須: storesを内部で参照するため、invoker権限のままだとstores自身のRLSポリシーが
-- 再びこの関数を呼び出し無限再帰になる（"stack depth limit exceeded"で必ず失敗する）
create or replace function my_org_store_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select s.id
  from stores s
  join organization_members om on om.organization_id = s.organization_id
  where om.user_id = auth.uid();
$$;

-- 各テーブル共通：自分の店舗のデータだけ read/write できる
create policy "users can see their own membership"
  on store_members for select using (user_id = auth.uid());

create policy "users can see their own org membership"
  on organization_members for select using (user_id = auth.uid());

create policy "org members can see their organization"
  on organizations for select using (
    id in (select organization_id from organization_members where user_id = auth.uid())
  );

create policy "store members can access their store"
  on stores for select using (id in (select my_store_ids()));

create policy "org members can view their organization's stores"
  on stores for select using (id in (select my_org_store_ids()));

create policy "store owners can update their store"
  on stores for update using (
    id in (select store_id from store_members where user_id = auth.uid() and role = 'owner')
  );

create policy "store members can access their staff"
  on staff for all using (store_id in (select my_store_ids()));

create policy "org members can view their organization's staff"
  on staff for select using (store_id in (select my_org_store_ids()));

create policy "store members can access their menu"
  on menu_items for all using (store_id in (select my_store_ids()));

create policy "store members can access their tabs"
  on tabs for all using (store_id in (select my_store_ids()));

create policy "org members can view their organization's tabs"
  on tabs for select using (store_id in (select my_org_store_ids()));

create policy "store members can access their tab items"
  on tab_items for all using (
    tab_id in (select id from tabs where store_id in (select my_store_ids()))
  );

create policy "org members can view their organization's tab items"
  on tab_items for select using (
    tab_id in (select id from tabs where store_id in (select my_org_store_ids()))
  );

create policy "store members can view their tab logs"
  on tab_logs for select to authenticated
  using (store_id in (select my_store_ids()));

create policy "store members can create their tab logs"
  on tab_logs for insert to authenticated
  with check (store_id in (select my_store_ids()));

create policy "store members can access their attendance"
  on attendance for all using (store_id in (select my_store_ids()));

create policy "org members can view their organization's attendance"
  on attendance for select using (store_id in (select my_org_store_ids()));

create policy "store members can access their expenses"
  on expenses for all using (store_id in (select my_store_ids()));

create policy "org members can view their organization's expenses"
  on expenses for select using (store_id in (select my_org_store_ids()));

-- ============================================================
-- Storage（レシート画像の保存先）
-- receiptsバケットを作成し、ログイン済みユーザーのアップロードを許可する
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "authenticated users can upload receipts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (select id::text from my_store_ids() as id)
  );

create policy "store members can view their receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (select id::text from my_store_ids() as id)
  );

create policy "authenticated users can delete their receipts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (select id::text from my_store_ids() as id)
  );

-- ============================================================
-- インデックス（店舗数・データ量が増えても検索を高速に保つため）
-- ============================================================

-- my_store_ids()が全RLSポリシーの起点になるため、これが最重要
create index if not exists idx_store_members_user_id on store_members(user_id);

create index if not exists idx_staff_store_id on staff(store_id);
create index if not exists idx_menu_items_store_id on menu_items(store_id);

create index if not exists idx_tabs_store_business_date on tabs(store_id, business_date);
create index if not exists idx_attendance_store_business_date on attendance(store_id, business_date);
create index if not exists idx_expenses_store_business_date on expenses(store_id, business_date);

-- tab_itemsはstore_idを持たないため、tabs経由のRLS/joinを速くする
create index if not exists idx_tab_items_tab_id on tab_items(tab_id);

-- my_org_store_ids()が組織側RLSポリシーの起点になるため重要
create index if not exists idx_organization_members_user_id on organization_members(user_id);
create index if not exists idx_stores_organization_id on stores(organization_id);

-- ============================================================
-- 自己サインアップ：新規ユーザー登録時に自動で店舗を作成
-- auth.usersにレコードが作られたタイミングで発火し、
-- サインアップ時に渡したstore_nameでstoresを作成、そのユーザーをownerとして紐付ける
-- ただし account_type='organization' で作成されたアカウント（組織の本部アカウント）は
-- 店舗を自動作成しない（/admin側で組織メンバーとして別途登録する）
-- ============================================================
create or replace function handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_store_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'account_type', 'store') = 'organization' then
    return new;
  end if;

  insert into stores (name)
  values (coalesce(new.raw_user_meta_data->>'store_name', '新しい店舗'))
  returning id into new_store_id;

  insert into store_members (store_id, user_id, role)
  values (new_store_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user_signup();

-- ============================================================
-- 初期データ：TEVERを1店舗目として登録
-- ============================================================
insert into stores (name) values ('BAR TEVER');
