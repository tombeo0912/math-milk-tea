alter table public.submission_files
  drop constraint if exists submission_files_mime_type_check;

alter table public.submission_files
  add constraint submission_files_mime_type_check
  check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf'));

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
where id in ('submission-images','assignment-images');

update public.app_settings
set description = 'Số tệp tối đa cho mỗi bài nộp'
where key = 'max_submission_files';

create or replace function public.finalize_submission(
  p_assignment_id uuid,
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
  v_assignment public.assignments%rowtype;
  v_previous public.submissions%rowtype;
  v_submission_id uuid;
  v_version integer;
  v_file jsonb;
  v_path text;
  v_order integer;
  v_type text;
  v_size bigint;
  v_max_files integer;
begin
  if v_student is null or not exists(
    select 1 from public.profiles where id = v_student and role = 'student'
  ) then
    raise exception 'Chỉ học sinh được nộp bài.' using errcode = '42501';
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) > 200 then
    raise exception 'Mã chống trùng không hợp lệ.';
  end if;

  select * into v_assignment
  from public.assignments
  where id = p_assignment_id and status = 'published'
  for share;

  if not found or not v_assignment.accepts_submissions then
    raise exception 'Bài tập hiện không nhận bài nộp.';
  end if;

  v_max_files := coalesce(
    (select value::text::integer from public.app_settings where key = 'max_submission_files'),
    10
  );

  if p_files is null
    or jsonb_typeof(p_files) <> 'array'
    or jsonb_array_length(p_files) < 1
    or jsonb_array_length(p_files) > v_max_files
  then
    raise exception 'Số lượng tệp phải từ 1 đến %.', v_max_files;
  end if;

  select * into v_previous
  from public.submissions
  where assignment_id = p_assignment_id and student_id = v_student
  order by version desc
  limit 1
  for update;

  if found and not v_previous.resubmission_allowed then
    raise exception 'Giáo viên chưa cho phép nộp lại bài này.';
  end if;

  v_version := coalesce(v_previous.version, 0) + 1;
  if v_previous.id is not null then
    update public.submissions
    set resubmission_allowed = false
    where id = v_previous.id;
  end if;

  insert into public.submissions(
    assignment_id,
    student_id,
    version,
    note,
    idempotency_key
  ) values (
    p_assignment_id,
    v_student,
    v_version,
    nullif(trim(p_note), ''),
    p_idempotency_key
  ) returning id into v_submission_id;

  for v_file in select * from jsonb_array_elements(p_files) loop
    v_path := v_file->>'storage_path';
    v_order := (v_file->>'page_order')::integer;
    v_type := v_file->>'mime_type';
    v_size := (v_file->>'size_bytes')::bigint;

    if v_path is null
      or left(v_path, char_length(v_student::text) + 1) <> (v_student::text || '/')
    then
      raise exception 'Đường dẫn tệp không hợp lệ.';
    end if;

    if v_order < 1
      or v_order > v_max_files
      or v_type not in ('image/jpeg','image/png','image/webp','application/pdf')
      or v_size < 1
      or v_size > 15728640
    then
      raise exception 'Thông tin tệp không hợp lệ.';
    end if;

    if not exists(
      select 1
      from storage.objects
      where bucket_id = 'submission-images'
        and name = v_path
        and owner_id = v_student::text
    ) then
      raise exception 'Không tìm thấy tệp đã tải lên: %', v_path;
    end if;

    insert into public.submission_files(
      submission_id,
      storage_path,
      page_order,
      mime_type,
      size_bytes
    ) values (
      v_submission_id,
      v_path,
      v_order,
      v_type,
      v_size
    );
  end loop;

  insert into public.notifications(user_id, title, message, kind)
  select
    id,
    'Có bài nộp mới',
    'Học sinh vừa nộp bài ' || v_assignment.title || '.',
    'submission_created'
  from public.profiles
  where role = 'teacher';

  return v_submission_id;
exception
  when unique_violation then
    select id into v_submission_id
    from public.submissions
    where idempotency_key = p_idempotency_key and student_id = v_student;

    if v_submission_id is not null then
      return v_submission_id;
    end if;
    raise;
end;
$$;

grant execute on function public.finalize_submission(uuid,text,jsonb,text)
to authenticated;
