alter table public.point_ledger
  drop constraint if exists point_ledger_transaction_type_check;

alter table public.point_ledger
  add constraint point_ledger_transaction_type_check
  check (transaction_type in (
    'assignment_reward',
    'achievement_reward',
    'manual_reward',
    'adjustment',
    'reward_redemption'
  ));

create unique index point_ledger_one_achievement_reward
  on public.point_ledger(source_id)
  where transaction_type = 'achievement_reward';

create table public.achievement_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  achievement_type text not null
    check (achievement_type in ('class_score', 'test_score')),
  subject text not null
    check (char_length(trim(subject)) between 1 and 100),
  assessment_name text not null
    check (char_length(trim(assessment_name)) between 1 and 160),
  score numeric(8,2) not null,
  max_score numeric(8,2) not null,
  occurred_on date not null,
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  awarded_points integer not null default 0
    check (awarded_points between 0 and 10000),
  teacher_comment text
    check (teacher_comment is null or char_length(teacher_comment) <= 1000),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  reward_ledger_id uuid unique references public.point_ledger(id),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 1 and 200),
  review_idempotency_key text unique
    check (review_idempotency_key is null or char_length(review_idempotency_key) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    max_score > 0
    and max_score <= 100000
    and score >= 0
    and score <= max_score
  ),
  check (
    (
      status = 'pending'
      and awarded_points = 0
      and reviewed_by is null
      and reviewed_at is null
      and reward_ledger_id is null
      and review_idempotency_key is null
    )
    or (
      status = 'approved'
      and awarded_points > 0
      and reviewed_by is not null
      and reviewed_at is not null
      and reward_ledger_id is not null
      and review_idempotency_key is not null
    )
    or (
      status = 'rejected'
      and awarded_points = 0
      and reviewed_by is not null
      and reviewed_at is not null
      and reward_ledger_id is null
      and review_idempotency_key is not null
    )
  )
);

create index achievement_submissions_student_created_idx
  on public.achievement_submissions(student_id, created_at desc);

create index achievement_submissions_pending_idx
  on public.achievement_submissions(created_at)
  where status = 'pending';

create table public.achievement_files (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null
    references public.achievement_submissions(id) on delete cascade,
  storage_path text not null unique,
  page_order integer not null check (page_order between 1 and 5),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null
    check (size_bytes between 1 and 15728640),
  created_at timestamptz not null default now(),
  unique (achievement_id, page_order)
);

create table public.reward_wishes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text
    check (description is null or char_length(description) <= 1000),
  reference_url text
    check (reference_url is null or char_length(reference_url) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'created', 'rejected')),
  teacher_comment text
    check (teacher_comment is null or char_length(teacher_comment) <= 1000),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_product_id uuid unique references public.reward_products(id),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 1 and 200),
  decision_idempotency_key text unique
    check (decision_idempotency_key is null or char_length(decision_idempotency_key) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
      and created_product_id is null
      and decision_idempotency_key is null
    )
    or (
      status = 'created'
      and reviewed_by is not null
      and reviewed_at is not null
      and created_product_id is not null
      and decision_idempotency_key is not null
    )
    or (
      status = 'rejected'
      and reviewed_by is not null
      and reviewed_at is not null
      and created_product_id is null
      and decision_idempotency_key is not null
    )
  )
);

create index reward_wishes_student_created_idx
  on public.reward_wishes(student_id, created_at desc);

create index reward_wishes_pending_idx
  on public.reward_wishes(created_at)
  where status = 'pending';

create unique index reward_wishes_one_pending_per_student
  on public.reward_wishes(student_id)
  where status = 'pending';

create trigger achievement_submissions_touch
  before update on public.achievement_submissions
  for each row execute function public.touch_updated_at();

create trigger reward_wishes_touch
  before update on public.reward_wishes
  for each row execute function public.touch_updated_at();

alter table public.achievement_submissions enable row level security;
alter table public.achievement_files enable row level security;
alter table public.reward_wishes enable row level security;

revoke all on public.achievement_submissions from anon, authenticated;
revoke all on public.achievement_files from anon, authenticated;
revoke all on public.reward_wishes from anon, authenticated;

grant select on public.achievement_submissions to authenticated;
grant select on public.achievement_files to authenticated;
grant select on public.reward_wishes to authenticated;

create policy achievement_submissions_read
  on public.achievement_submissions
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select public.is_teacher())
  );

create policy achievement_files_read
  on public.achievement_files
  for select to authenticated
  using (
    exists (
      select 1
      from public.achievement_submissions a
      where a.id = achievement_id
        and (
          a.student_id = (select auth.uid())
          or (select public.is_teacher())
        )
    )
  );

create policy reward_wishes_read
  on public.reward_wishes
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select public.is_teacher())
  );

insert into storage.buckets(
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'achievement-evidence',
  'achievement-evidence',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict(id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy achievement_storage_read
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'achievement-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_teacher())
    )
  );

create policy achievement_storage_student_upload
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'achievement-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'student'
    )
  );

create policy achievement_storage_cleanup_orphan
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'achievement-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1
      from public.achievement_files f
      where f.storage_path = name
    )
  );

create or replace function public.submit_achievement(
  p_achievement_type text,
  p_subject text,
  p_assessment_name text,
  p_score numeric,
  p_max_score numeric,
  p_occurred_on date,
  p_note text,
  p_files jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_achievement_id uuid;
  v_file jsonb;
  v_path text;
  v_order integer;
  v_type text;
  v_size bigint;
begin
  if v_student is null or not exists (
    select 1
    from public.profiles
    where id = v_student and role = 'student'
  ) then
    raise exception 'Chỉ học sinh được gửi thành tích.' using errcode = '42501';
  end if;

  if p_idempotency_key is null
    or char_length(trim(p_idempotency_key)) < 1
    or char_length(p_idempotency_key) > 200
  then
    raise exception 'Mã chống trùng không hợp lệ.';
  end if;

  if p_achievement_type not in ('class_score', 'test_score') then
    raise exception 'Loại thành tích không hợp lệ.';
  end if;

  if p_subject is null
    or char_length(trim(p_subject)) not between 1 and 100
  then
    raise exception 'Môn học không hợp lệ.';
  end if;

  if p_assessment_name is null
    or char_length(trim(p_assessment_name)) not between 1 and 160
  then
    raise exception 'Tên bài kiểm tra hoặc thành tích không hợp lệ.';
  end if;

  if p_score is null
    or p_max_score is null
    or p_max_score <= 0
    or p_max_score > 100000
    or p_score < 0
    or p_score > p_max_score
    or round(p_score, 2) <> p_score
    or round(p_max_score, 2) <> p_max_score
  then
    raise exception 'Điểm số không hợp lệ.';
  end if;

  if p_occurred_on is null or p_occurred_on > current_date then
    raise exception 'Ngày đạt thành tích không hợp lệ.';
  end if;

  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Ghi chú không được vượt quá 1000 ký tự.';
  end if;

  if p_files is null
    or jsonb_typeof(p_files) <> 'array'
    or jsonb_array_length(p_files) < 1
    or jsonb_array_length(p_files) > 5
  then
    raise exception 'Minh chứng phải có từ 1 đến 5 tệp.';
  end if;

  insert into public.achievement_submissions(
    student_id,
    achievement_type,
    subject,
    assessment_name,
    score,
    max_score,
    occurred_on,
    note,
    idempotency_key
  ) values (
    v_student,
    p_achievement_type,
    trim(p_subject),
    trim(p_assessment_name),
    p_score,
    p_max_score,
    p_occurred_on,
    nullif(trim(p_note), ''),
    p_idempotency_key
  ) returning id into v_achievement_id;

  for v_file in select value from jsonb_array_elements(p_files) loop
    v_path := v_file->>'storage_path';
    v_order := (v_file->>'page_order')::integer;
    v_type := v_file->>'mime_type';
    v_size := (v_file->>'size_bytes')::bigint;

    if v_path is null
      or left(v_path, char_length(v_student::text) + 1)
        <> v_student::text || '/'
    then
      raise exception 'Đường dẫn tệp minh chứng không hợp lệ.';
    end if;

    if v_order < 1
      or v_order > 5
      or v_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      or v_size < 1
      or v_size > 15728640
    then
      raise exception 'Thông tin tệp minh chứng không hợp lệ.';
    end if;

    if not exists (
      select 1
      from storage.objects
      where bucket_id = 'achievement-evidence'
        and name = v_path
        and owner_id = v_student::text
    ) then
      raise exception 'Không tìm thấy tệp minh chứng đã tải lên: %', v_path;
    end if;

    insert into public.achievement_files(
      achievement_id,
      storage_path,
      page_order,
      mime_type,
      size_bytes
    ) values (
      v_achievement_id,
      v_path,
      v_order,
      v_type,
      v_size
    );
  end loop;

  insert into public.notifications(user_id, title, message, kind)
  select
    id,
    'Có thành tích mới chờ duyệt',
    'Học sinh vừa gửi ' || trim(p_assessment_name) || ' (' ||
      trim(p_subject) || ').',
    'achievement_submitted'
  from public.profiles
  where role = 'teacher';

  return v_achievement_id;
exception
  when unique_violation then
    select id into v_achievement_id
    from public.achievement_submissions
    where idempotency_key = p_idempotency_key
      and student_id = v_student;

    if v_achievement_id is not null then
      return v_achievement_id;
    end if;
    raise;
end;
$$;

create or replace function public.review_achievement(
  p_achievement_id uuid,
  p_decision text,
  p_awarded_points integer,
  p_teacher_comment text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := public.assert_teacher();
  v_achievement public.achievement_submissions%rowtype;
  v_balance bigint;
  v_ledger_id uuid;
  v_redemptions integer := 0;
begin
  if p_idempotency_key is null
    or char_length(trim(p_idempotency_key)) < 1
    or char_length(p_idempotency_key) > 200
  then
    raise exception 'Mã chống trùng không hợp lệ.';
  end if;

  if p_teacher_comment is not null and char_length(p_teacher_comment) > 1000 then
    raise exception 'Nhận xét không được vượt quá 1000 ký tự.';
  end if;

  select * into v_achievement
  from public.achievement_submissions
  where id = p_achievement_id
  for update;

  if not found then
    raise exception 'Không tìm thấy thành tích.';
  end if;

  if v_achievement.status <> 'pending' then
    return jsonb_build_object(
      'status', v_achievement.status,
      'awarded_points', v_achievement.awarded_points,
      'ledger_id', v_achievement.reward_ledger_id,
      'replayed', true
    );
  end if;

  if p_decision = 'rejected' then
    if coalesce(p_awarded_points, 0) <> 0 then
      raise exception 'Thành tích bị từ chối không thể nhận điểm thưởng.';
    end if;

    update public.achievement_submissions
    set status = 'rejected',
        awarded_points = 0,
        teacher_comment = nullif(trim(p_teacher_comment), ''),
        reviewed_by = v_teacher,
        reviewed_at = now(),
        review_idempotency_key = p_idempotency_key
    where id = p_achievement_id;

    insert into public.notifications(user_id, title, message, kind)
    values (
      v_achievement.student_id,
      'Minh chứng thành tích đã được xem',
      coalesce(
        nullif(trim(p_teacher_comment), ''),
        'Giáo viên chưa thể duyệt thành tích này.'
      ),
      'achievement_rejected'
    );

    return jsonb_build_object(
      'status', 'rejected',
      'awarded_points', 0,
      'replayed', false
    );
  end if;

  if p_decision <> 'approved' then
    raise exception 'Quyết định duyệt không hợp lệ.';
  end if;

  if p_awarded_points is null
    or p_awarded_points < 1
    or p_awarded_points > 10000
  then
    raise exception 'Điểm thưởng phải từ 1 đến 10000.';
  end if;

  insert into public.point_wallets(student_id)
  values (v_achievement.student_id)
  on conflict do nothing;

  select available_points into v_balance
  from public.point_wallets
  where student_id = v_achievement.student_id
  for update;

  update public.point_wallets
  set earned_points = earned_points + p_awarded_points,
      available_points = available_points + p_awarded_points
  where student_id = v_achievement.student_id
  returning available_points into v_balance;

  insert into public.point_ledger(
    student_id,
    transaction_type,
    source_type,
    source_id,
    delta,
    balance_after,
    performed_by,
    description,
    idempotency_key
  ) values (
    v_achievement.student_id,
    'achievement_reward',
    'achievement',
    p_achievement_id,
    p_awarded_points,
    v_balance,
    v_teacher,
    'Thưởng thành tích: ' || v_achievement.assessment_name,
    p_idempotency_key
  ) returning id into v_ledger_id;

  update public.achievement_submissions
  set status = 'approved',
      awarded_points = p_awarded_points,
      teacher_comment = nullif(trim(p_teacher_comment), ''),
      reviewed_by = v_teacher,
      reviewed_at = now(),
      reward_ledger_id = v_ledger_id,
      review_idempotency_key = p_idempotency_key
  where id = p_achievement_id;

  insert into public.notifications(user_id, title, message, kind)
  values (
    v_achievement.student_id,
    'Thành tích đã được duyệt',
    'Giỏi lắm! Em vừa nhận thêm ' || p_awarded_points ||
      ' điểm thưởng cho ' || v_achievement.assessment_name || '.',
    'achievement_approved'
  );

  v_redemptions := public.process_auto_redemptions(
    v_achievement.student_id,
    v_teacher,
    p_idempotency_key
  );

  return jsonb_build_object(
    'status', 'approved',
    'awarded_points', p_awarded_points,
    'ledger_id', v_ledger_id,
    'balance', v_balance,
    'redemptions_created', v_redemptions,
    'replayed', false
  );
exception
  when unique_violation then
    select * into v_achievement
    from public.achievement_submissions
    where id = p_achievement_id;

    if found and v_achievement.status <> 'pending' then
      return jsonb_build_object(
        'status', v_achievement.status,
        'awarded_points', v_achievement.awarded_points,
        'ledger_id', v_achievement.reward_ledger_id,
        'replayed', true
      );
    end if;
    raise;
end;
$$;

create or replace function public.submit_reward_wish(
  p_name text,
  p_description text,
  p_reference_url text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_wish_id uuid;
begin
  if v_student is null or not exists (
    select 1
    from public.profiles
    where id = v_student and role = 'student'
  ) then
    raise exception 'Chỉ học sinh được gửi mong muốn phần thưởng.' using errcode = '42501';
  end if;

  if p_idempotency_key is null
    or char_length(trim(p_idempotency_key)) < 1
    or char_length(p_idempotency_key) > 200
  then
    raise exception 'Mã chống trùng không hợp lệ.';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Tên phần thưởng mong muốn không hợp lệ.';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Mô tả không được vượt quá 1000 ký tự.';
  end if;

  if p_reference_url is not null
    and nullif(trim(p_reference_url), '') is not null
    and (
      char_length(p_reference_url) > 1000
      or trim(p_reference_url) !~* '^https?://'
    )
  then
    raise exception 'Đường dẫn tham khảo phải bắt đầu bằng http:// hoặc https://.';
  end if;

  insert into public.reward_wishes(
    student_id,
    name,
    description,
    reference_url,
    idempotency_key
  ) values (
    v_student,
    trim(p_name),
    nullif(trim(p_description), ''),
    nullif(trim(p_reference_url), ''),
    p_idempotency_key
  ) returning id into v_wish_id;

  insert into public.notifications(user_id, title, message, kind)
  select
    id,
    'Có mong muốn phần thưởng mới',
    'Học sinh mong muốn: ' || trim(p_name) || '.',
    'reward_wish_submitted'
  from public.profiles
  where role = 'teacher';

  return v_wish_id;
exception
  when unique_violation then
    select id into v_wish_id
    from public.reward_wishes
    where idempotency_key = p_idempotency_key
      and student_id = v_student;

    if v_wish_id is not null then
      return v_wish_id;
    end if;
    raise;
end;
$$;

create or replace function public.create_reward_from_wish(
  p_wish_id uuid,
  p_name text,
  p_description text,
  p_price_points integer,
  p_inventory_mode text,
  p_stock_quantity integer,
  p_image_path text,
  p_teacher_comment text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := public.assert_teacher();
  v_wish public.reward_wishes%rowtype;
  v_product_id uuid;
begin
  if p_idempotency_key is null
    or char_length(trim(p_idempotency_key)) < 1
    or char_length(p_idempotency_key) > 200
  then
    raise exception 'Mã chống trùng không hợp lệ.';
  end if;

  select * into v_wish
  from public.reward_wishes
  where id = p_wish_id
  for update;

  if not found then
    raise exception 'Không tìm thấy mong muốn phần thưởng.';
  end if;

  if v_wish.status = 'created' then
    return jsonb_build_object(
      'status', 'created',
      'product_id', v_wish.created_product_id,
      'replayed', true
    );
  end if;

  if v_wish.status = 'rejected' then
    raise exception 'Mong muốn này đã bị từ chối.';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Tên phần thưởng không hợp lệ.';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Mô tả không được vượt quá 1000 ký tự.';
  end if;

  if p_price_points is null
    or p_price_points < 1
    or p_price_points > 100000
  then
    raise exception 'Giá phần thưởng không hợp lệ.';
  end if;

  if p_inventory_mode not in ('unlimited', 'limited')
    or (p_inventory_mode = 'unlimited' and p_stock_quantity is not null)
    or (
      p_inventory_mode = 'limited'
      and (p_stock_quantity is null or p_stock_quantity < 0)
    )
  then
    raise exception 'Chế độ tồn kho không hợp lệ.';
  end if;

  if p_teacher_comment is not null and char_length(p_teacher_comment) > 1000 then
    raise exception 'Nhận xét không được vượt quá 1000 ký tự.';
  end if;

  if nullif(trim(p_image_path), '') is not null
    and not exists (
      select 1
      from storage.objects
      where bucket_id = 'reward-images'
        and name = trim(p_image_path)
    )
  then
    raise exception 'Không tìm thấy ảnh phần thưởng đã tải lên.';
  end if;

  insert into public.reward_products(
    teacher_id,
    name,
    description,
    image_path,
    price_points,
    active,
    inventory_mode,
    stock_quantity
  ) values (
    v_teacher,
    trim(p_name),
    nullif(trim(p_description), ''),
    nullif(trim(p_image_path), ''),
    p_price_points,
    true,
    p_inventory_mode,
    p_stock_quantity
  ) returning id into v_product_id;

  update public.reward_wishes
  set status = 'created',
      teacher_comment = nullif(trim(p_teacher_comment), ''),
      reviewed_by = v_teacher,
      reviewed_at = now(),
      created_product_id = v_product_id,
      decision_idempotency_key = p_idempotency_key
  where id = p_wish_id;

  insert into public.notifications(user_id, title, message, kind)
  values (
    v_wish.student_id,
    'Mong muốn đã có trong cửa hàng',
    'Phần thưởng ' || trim(p_name) || ' đã được giáo viên tạo trong cửa hàng.',
    'reward_wish_created'
  );

  return jsonb_build_object(
    'status', 'created',
    'product_id', v_product_id,
    'replayed', false
  );
exception
  when unique_violation then
    select * into v_wish
    from public.reward_wishes
    where id = p_wish_id;

    if found and v_wish.status = 'created' then
      return jsonb_build_object(
        'status', 'created',
        'product_id', v_wish.created_product_id,
        'replayed', true
      );
    end if;
    raise;
end;
$$;

create or replace function public.reject_reward_wish(
  p_wish_id uuid,
  p_teacher_comment text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher uuid := public.assert_teacher();
  v_wish public.reward_wishes%rowtype;
begin
  if p_idempotency_key is null
    or char_length(trim(p_idempotency_key)) < 1
    or char_length(p_idempotency_key) > 200
  then
    raise exception 'Mã chống trùng không hợp lệ.';
  end if;

  if p_teacher_comment is null
    or char_length(trim(p_teacher_comment)) < 1
    or char_length(p_teacher_comment) > 1000
  then
    raise exception 'Cần nhập lý do từ chối từ 1 đến 1000 ký tự.';
  end if;

  select * into v_wish
  from public.reward_wishes
  where id = p_wish_id
  for update;

  if not found then
    raise exception 'Không tìm thấy mong muốn phần thưởng.';
  end if;

  if v_wish.status = 'rejected' then
    return jsonb_build_object('status', 'rejected', 'replayed', true);
  end if;

  if v_wish.status = 'created' then
    raise exception 'Mong muốn này đã được tạo thành phần thưởng.';
  end if;

  update public.reward_wishes
  set status = 'rejected',
      teacher_comment = trim(p_teacher_comment),
      reviewed_by = v_teacher,
      reviewed_at = now(),
      decision_idempotency_key = p_idempotency_key
  where id = p_wish_id;

  insert into public.notifications(user_id, title, message, kind)
  values (
    v_wish.student_id,
    'Giáo viên đã phản hồi mong muốn',
    trim(p_teacher_comment),
    'reward_wish_rejected'
  );

  return jsonb_build_object('status', 'rejected', 'replayed', false);
end;
$$;

revoke all on function public.submit_achievement(
  text, text, text, numeric, numeric, date, text, jsonb, text
) from public, anon, authenticated;

revoke all on function public.review_achievement(
  uuid, text, integer, text, text
) from public, anon, authenticated;

revoke all on function public.submit_reward_wish(
  text, text, text, text
) from public, anon, authenticated;

revoke all on function public.create_reward_from_wish(
  uuid, text, text, integer, text, integer, text, text, text
) from public, anon, authenticated;

revoke all on function public.reject_reward_wish(
  uuid, text, text
) from public, anon, authenticated;

grant execute on function public.submit_achievement(
  text, text, text, numeric, numeric, date, text, jsonb, text
) to authenticated;

grant execute on function public.review_achievement(
  uuid, text, integer, text, text
) to authenticated;

grant execute on function public.submit_reward_wish(
  text, text, text, text
) to authenticated;

grant execute on function public.create_reward_from_wish(
  uuid, text, text, integer, text, integer, text, text, text
) to authenticated;

grant execute on function public.reject_reward_wish(
  uuid, text, text
) to authenticated;
