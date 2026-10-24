create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher','student')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_single_teacher on public.profiles ((role)) where role = 'teacher';

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 10000),
  instructions text check (instructions is null or char_length(instructions) <= 3000),
  due_at timestamptz,
  image_path text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  accepts_submissions boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_status_created_idx on public.assignments(status, created_at desc);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id),
  student_id uuid not null references public.profiles(id),
  version integer not null check (version > 0),
  status text not null default 'submitted' check (status in ('submitted','graded','approved')),
  note text check (note is null or char_length(note) <= 1000),
  resubmission_allowed boolean not null default false,
  idempotency_key text not null unique,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id, version)
);
create index submissions_assignment_student_idx on public.submissions(assignment_id, student_id, version desc);
create index submissions_status_idx on public.submissions(status, submitted_at);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  storage_path text not null unique,
  page_order integer not null check (page_order between 1 and 20),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_at timestamptz not null default now(),
  unique (submission_id, page_order)
);

create table public.difficulty_settings (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null check (char_length(label) between 1 and 60),
  multiplier numeric(5,2) not null check (multiplier > 0 and multiplier <= 10),
  sort_order integer not null unique,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.difficulty_settings(code,label,multiplier,sort_order) values
  ('easy','Dễ',1.00,10),('medium','Trung bình',1.50,20),('hard','Khó',2.00,30),('challenge','Thử thách',3.00,40);

create table public.grading_records (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id),
  math_score numeric(4,2) not null check (math_score >= 0 and math_score <= 10),
  difficulty_code text not null references public.difficulty_settings(code),
  difficulty_label_snapshot text not null,
  difficulty_multiplier_snapshot numeric(5,2) not null check (difficulty_multiplier_snapshot > 0),
  suggested_points integer not null check (suggested_points >= 0),
  approved_points integer not null check (approved_points >= 0 and approved_points <= 10000),
  comment text check (comment is null or char_length(comment) <= 2000),
  adjustment_reason text check (adjustment_reason is null or char_length(adjustment_reason) <= 500),
  status text not null default 'draft' check (status in ('draft','approved')),
  graded_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((approved_points = suggested_points) or (adjustment_reason is not null and char_length(trim(adjustment_reason)) > 0)),
  check ((status = 'draft' and approved_at is null) or (status = 'approved' and approved_at is not null and approved_by is not null))
);

create table public.point_wallets (
  student_id uuid primary key references public.profiles(id),
  earned_points bigint not null default 0 check (earned_points >= 0),
  available_points bigint not null default 0 check (available_points >= 0),
  redeemed_points bigint not null default 0 check (redeemed_points >= 0),
  updated_at timestamptz not null default now()
);

create table public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  transaction_type text not null check (transaction_type in ('assignment_reward','manual_reward','adjustment','reward_redemption')),
  source_type text not null,
  source_id uuid,
  delta integer not null,
  balance_after bigint not null check (balance_after >= 0),
  performed_by uuid not null references public.profiles(id),
  description text not null check (char_length(description) between 1 and 500),
  idempotency_key text not null unique,
  reference_ledger_id uuid references public.point_ledger(id),
  created_at timestamptz not null default now()
);
create unique index point_ledger_one_assignment_reward on public.point_ledger(source_id) where transaction_type = 'assignment_reward';
create index point_ledger_student_created_idx on public.point_ledger(student_id, created_at desc);

create table public.reward_products (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  image_path text,
  price_points integer not null default 200 check (price_points > 0 and price_points <= 100000),
  active boolean not null default true,
  inventory_mode text not null default 'unlimited' check (inventory_mode in ('unlimited','limited')),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((inventory_mode = 'unlimited' and stock_quantity is null) or (inventory_mode = 'limited' and stock_quantity is not null))
);
create index reward_products_active_idx on public.reward_products(active, created_at);

create table public.reward_targets (
  student_id uuid primary key references public.profiles(id),
  product_id uuid not null references public.reward_products(id),
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  product_id uuid not null references public.reward_products(id),
  product_name_snapshot text not null,
  price_points_snapshot integer not null check (price_points_snapshot > 0),
  status text not null default 'pending' check (status in ('pending','delivered','cancelled')),
  redeemed_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancel_reason text,
  redemption_ledger_id uuid unique references public.point_ledger(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'delivered') or (delivered_at is not null and delivered_by is not null)),
  check ((status <> 'cancelled') or (cancelled_at is not null and cancelled_by is not null and cancel_reason is not null))
);
create index reward_redemptions_student_idx on public.reward_redemptions(student_id, redeemed_at desc);
create index reward_redemptions_pending_idx on public.reward_redemptions(status, redeemed_at) where status = 'pending';

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key,value,description) values
  ('default_reward_price','200','Giá mặc định của phần quà mới'),
  ('max_submission_files','10','Số ảnh tối đa mỗi bài nộp'),
  ('max_upload_size_mb','5','Dung lượng tối đa mỗi ảnh sau xử lý');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  kind text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table public.idempotency_requests (
  key text primary key,
  actor_id uuid not null,
  operation text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
do $$ declare t text; begin foreach t in array array['profiles','assignments','submissions','difficulty_settings','grading_records','point_wallets','reward_products','reward_targets','reward_redemptions','app_settings'] loop execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()',t,t); end loop; end $$;

create or replace function public.bootstrap_profile_wallet() returns trigger language plpgsql security definer set search_path = '' as $$
begin if new.role = 'student' then insert into public.point_wallets(student_id) values(new.id) on conflict do nothing; end if; return new; end; $$;
create trigger profiles_create_wallet after insert on public.profiles for each row execute function public.bootstrap_profile_wallet();

