create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'teacher');
$$;

create or replace function public.assert_teacher() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists(select 1 from public.profiles where id = v_user and role = 'teacher') then
    raise exception 'Chỉ giáo viên được phép thực hiện thao tác này.' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

create or replace function public.process_auto_redemptions(p_student_id uuid, p_actor_id uuid, p_key_prefix text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_wallet public.point_wallets%rowtype;
  v_target public.reward_targets%rowtype;
  v_product public.reward_products%rowtype;
  v_redemption_id uuid;
  v_ledger_id uuid;
  v_count integer := 0;
begin
  select * into v_wallet from public.point_wallets where student_id = p_student_id for update;
  select * into v_target from public.reward_targets where student_id = p_student_id for update;
  if not found then return 0; end if;
  select * into v_product from public.reward_products where id = v_target.product_id for update;
  if not found or not v_product.active then return 0; end if;

  while v_wallet.available_points >= v_product.price_points
    and (v_product.inventory_mode = 'unlimited' or coalesce(v_product.stock_quantity,0) > 0)
    and v_count < 100
  loop
    v_count := v_count + 1;
    v_redemption_id := gen_random_uuid();
    update public.point_wallets
      set available_points = available_points - v_product.price_points,
          redeemed_points = redeemed_points + v_product.price_points
      where student_id = p_student_id
      returning * into v_wallet;

    insert into public.reward_redemptions(id,student_id,product_id,product_name_snapshot,price_points_snapshot)
      values(v_redemption_id,p_student_id,v_product.id,v_product.name,v_product.price_points);
    insert into public.point_ledger(student_id,transaction_type,source_type,source_id,delta,balance_after,performed_by,description,idempotency_key)
      values(p_student_id,'reward_redemption','reward_redemption',v_redemption_id,-v_product.price_points,v_wallet.available_points,p_actor_id,
        'Đổi phần quà: '||v_product.name,p_key_prefix||':redemption:'||v_count)
      returning id into v_ledger_id;
    update public.reward_redemptions set redemption_ledger_id = v_ledger_id where id = v_redemption_id;
    if v_product.inventory_mode = 'limited' then
      update public.reward_products set stock_quantity = stock_quantity - 1 where id = v_product.id returning * into v_product;
    end if;
  end loop;

  if v_count > 0 then
    insert into public.notifications(user_id,title,message,kind)
      values(p_student_id,'Đổi quà thành công','Chúc mừng! Em đã đổi thành công '||v_count||' phần quà '||v_product.name||'.','reward_redeemed');
    insert into public.notifications(user_id,title,message,kind)
      select id,'Có quà chờ trao',v_count||' phần quà '||v_product.name||' đang chờ được trao.','reward_pending'
      from public.profiles where role = 'teacher';
  end if;
  return v_count;
end;
$$;

create or replace function public.finalize_submission(p_assignment_id uuid, p_note text, p_files jsonb, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  if v_student is null or not exists(select 1 from public.profiles where id=v_student and role='student') then
    raise exception 'Chỉ học sinh được nộp bài.' using errcode='42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) > 200 then raise exception 'Mã chống trùng không hợp lệ.'; end if;
  select * into v_assignment from public.assignments where id=p_assignment_id and status='published' for share;
  if not found or not v_assignment.accepts_submissions then raise exception 'Bài tập hiện không nhận bài nộp.'; end if;
  v_max_files := coalesce((select value::text::integer from public.app_settings where key='max_submission_files'),10);
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) < 1 or jsonb_array_length(p_files) > v_max_files then
    raise exception 'Số lượng ảnh phải từ 1 đến %.',v_max_files;
  end if;
  select * into v_previous from public.submissions where assignment_id=p_assignment_id and student_id=v_student order by version desc limit 1 for update;
  if found and not v_previous.resubmission_allowed then raise exception 'Giáo viên chưa cho phép nộp lại bài này.'; end if;
  v_version := coalesce(v_previous.version,0)+1;
  if v_previous.id is not null then update public.submissions set resubmission_allowed=false where id=v_previous.id; end if;
  insert into public.submissions(assignment_id,student_id,version,note,idempotency_key)
    values(p_assignment_id,v_student,v_version,nullif(trim(p_note),''),p_idempotency_key)
    returning id into v_submission_id;
  for v_file in select * from jsonb_array_elements(p_files) loop
    v_path := v_file->>'storage_path'; v_order := (v_file->>'page_order')::integer; v_type := v_file->>'mime_type'; v_size := (v_file->>'size_bytes')::bigint;
    if v_path is null or left(v_path,char_length(v_student::text)+1) <> v_student::text||'/' then raise exception 'Đường dẫn ảnh không hợp lệ.'; end if;
    if v_order < 1 or v_order > v_max_files or v_type not in ('image/jpeg','image/png','image/webp') or v_size < 1 or v_size > 15728640 then raise exception 'Thông tin ảnh không hợp lệ.'; end if;
    if not exists(select 1 from storage.objects where bucket_id='submission-images' and name=v_path and owner_id=v_student::text) then raise exception 'Không tìm thấy ảnh đã tải lên: %',v_path; end if;
    insert into public.submission_files(submission_id,storage_path,page_order,mime_type,size_bytes) values(v_submission_id,v_path,v_order,v_type,v_size);
  end loop;
  insert into public.notifications(user_id,title,message,kind)
    select id,'Có bài nộp mới','Học sinh vừa nộp bài '||v_assignment.title||'.','submission_created' from public.profiles where role='teacher';
  return v_submission_id;
exception when unique_violation then
  select id into v_submission_id from public.submissions where idempotency_key=p_idempotency_key and student_id=v_student;
  if v_submission_id is not null then return v_submission_id; end if;
  raise;
end;
$$;

create or replace function public.save_grading_draft(p_submission_id uuid,p_math_score numeric,p_difficulty_code text,p_approved_points integer,p_comment text,p_adjustment_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_teacher uuid := public.assert_teacher(); v_difficulty public.difficulty_settings%rowtype; v_suggested integer; v_id uuid;
begin
  if p_math_score < 0 or p_math_score > 10 or round(p_math_score,2) <> p_math_score then raise exception 'Điểm bài làm phải từ 0 đến 10 và có tối đa hai chữ số thập phân.'; end if;
  if p_approved_points < 0 or p_approved_points > 10000 then raise exception 'Điểm thưởng không hợp lệ.'; end if;
  select * into v_difficulty from public.difficulty_settings where code=p_difficulty_code and active;
  if not found then raise exception 'Độ khó không hợp lệ.'; end if;
  v_suggested := floor(p_math_score*v_difficulty.multiplier+0.5);
  if p_approved_points <> v_suggested and nullif(trim(p_adjustment_reason),'') is null then raise exception 'Cần nhập lý do điều chỉnh điểm thưởng.'; end if;
  if exists(select 1 from public.grading_records where submission_id=p_submission_id and status='approved') then raise exception 'Bài này đã được duyệt. Hãy dùng quy trình điều chỉnh sau duyệt.'; end if;
  insert into public.grading_records(submission_id,math_score,difficulty_code,difficulty_label_snapshot,difficulty_multiplier_snapshot,suggested_points,approved_points,comment,adjustment_reason,status,graded_by)
    values(p_submission_id,p_math_score,p_difficulty_code,v_difficulty.label,v_difficulty.multiplier,v_suggested,p_approved_points,nullif(trim(p_comment),''),nullif(trim(p_adjustment_reason),''),'draft',v_teacher)
  on conflict(submission_id) do update set math_score=excluded.math_score,difficulty_code=excluded.difficulty_code,difficulty_label_snapshot=excluded.difficulty_label_snapshot,difficulty_multiplier_snapshot=excluded.difficulty_multiplier_snapshot,suggested_points=excluded.suggested_points,approved_points=excluded.approved_points,comment=excluded.comment,adjustment_reason=excluded.adjustment_reason,graded_by=excluded.graded_by
  returning id into v_id;
  update public.submissions set status='graded' where id=p_submission_id;
  return v_id;
end;
$$;

create or replace function public.approve_submission(p_submission_id uuid,p_math_score numeric,p_difficulty_code text,p_approved_points integer,p_comment text,p_adjustment_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_teacher uuid := public.assert_teacher(); v_submission public.submissions%rowtype; v_grade public.grading_records%rowtype; v_diff public.difficulty_settings%rowtype;
  v_suggested integer; v_balance bigint; v_ledger uuid; v_redeemed integer;
begin
  select * into v_submission from public.submissions where id=p_submission_id for update;
  if not found then raise exception 'Không tìm thấy bài nộp.'; end if;
  select * into v_grade from public.grading_records where submission_id=p_submission_id for update;
  if found and v_grade.status='approved' then return jsonb_build_object('already_approved',true,'approved_points',v_grade.approved_points); end if;
  if p_math_score < 0 or p_math_score > 10 or round(p_math_score,2)<>p_math_score then raise exception 'Điểm bài làm không hợp lệ.'; end if;
  select * into v_diff from public.difficulty_settings where code=p_difficulty_code and active;
  if not found then raise exception 'Độ khó không hợp lệ.'; end if;
  v_suggested:=floor(p_math_score*v_diff.multiplier+0.5);
  if p_approved_points<0 or p_approved_points>10000 then raise exception 'Điểm thưởng không hợp lệ.'; end if;
  if p_approved_points<>v_suggested and nullif(trim(p_adjustment_reason),'') is null then raise exception 'Cần nhập lý do điều chỉnh điểm thưởng.'; end if;
  insert into public.grading_records(submission_id,math_score,difficulty_code,difficulty_label_snapshot,difficulty_multiplier_snapshot,suggested_points,approved_points,comment,adjustment_reason,status,graded_by,approved_by,approved_at)
    values(p_submission_id,p_math_score,p_difficulty_code,v_diff.label,v_diff.multiplier,v_suggested,p_approved_points,nullif(trim(p_comment),''),nullif(trim(p_adjustment_reason),''),'approved',v_teacher,v_teacher,now())
  on conflict(submission_id) do update set math_score=excluded.math_score,difficulty_code=excluded.difficulty_code,difficulty_label_snapshot=excluded.difficulty_label_snapshot,difficulty_multiplier_snapshot=excluded.difficulty_multiplier_snapshot,suggested_points=excluded.suggested_points,approved_points=excluded.approved_points,comment=excluded.comment,adjustment_reason=excluded.adjustment_reason,status='approved',graded_by=v_teacher,approved_by=v_teacher,approved_at=now();
  insert into public.point_wallets(student_id) values(v_submission.student_id) on conflict do nothing;
  select available_points into v_balance from public.point_wallets where student_id=v_submission.student_id for update;
  update public.point_wallets set earned_points=earned_points+p_approved_points,available_points=available_points+p_approved_points where student_id=v_submission.student_id returning available_points into v_balance;
  insert into public.point_ledger(student_id,transaction_type,source_type,source_id,delta,balance_after,performed_by,description,idempotency_key)
    values(v_submission.student_id,'assignment_reward','submission',p_submission_id,p_approved_points,v_balance,v_teacher,'Thưởng bài tập đã duyệt',p_idempotency_key) returning id into v_ledger;
  update public.submissions set status='approved' where id=p_submission_id;
  insert into public.notifications(user_id,title,message,kind) values(v_submission.student_id,'Bài đã được chấm','Giỏi lắm! Em vừa nhận thêm '||p_approved_points||' điểm thưởng! 🎉','points_earned');
  v_redeemed:=public.process_auto_redemptions(v_submission.student_id,v_teacher,p_idempotency_key);
  return jsonb_build_object('already_approved',false,'approved_points',p_approved_points,'redemptions_created',v_redeemed);
exception when unique_violation then
  if exists(select 1 from public.point_ledger where transaction_type='assignment_reward' and source_id=p_submission_id) then return jsonb_build_object('already_approved',true); end if;
  raise;
end;
$$;

create or replace function public.set_reward_target(p_product_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_student uuid:=auth.uid();v_claim text;v_existing jsonb;v_product public.reward_products%rowtype;v_count integer;v_result jsonb;
begin
  if v_student is null or not exists(select 1 from public.profiles where id=v_student and role='student') then raise exception 'Chỉ học sinh được chọn mục tiêu.' using errcode='42501';end if;
  insert into public.idempotency_requests(key,actor_id,operation) values(p_idempotency_key,v_student,'set_reward_target') on conflict do nothing returning key into v_claim;
  if v_claim is null then select result into v_existing from public.idempotency_requests where key=p_idempotency_key and actor_id=v_student;return coalesce(v_existing,'{"replayed":true}'::jsonb);end if;
  select * into v_product from public.reward_products where id=p_product_id for update;
  if not found or not v_product.active then raise exception 'Phần quà không còn hoạt động.';end if;
  if v_product.inventory_mode='limited' and coalesce(v_product.stock_quantity,0)=0 then raise exception 'Phần quà đang hết hàng.';end if;
  insert into public.reward_targets(student_id,product_id) values(v_student,p_product_id) on conflict(student_id) do update set product_id=excluded.product_id,activated_at=now();
  v_count:=public.process_auto_redemptions(v_student,v_student,p_idempotency_key);
  v_result:=jsonb_build_object('product_id',p_product_id,'redemptions_created',v_count);
  update public.idempotency_requests set result=v_result where key=p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.adjust_points(p_student_id uuid,p_delta integer,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_teacher uuid:=public.assert_teacher();v_wallet public.point_wallets%rowtype;v_balance bigint;v_ledger uuid;v_count integer:=0;
begin
  if p_delta=0 or abs(p_delta)>10000 then raise exception 'Số điểm điều chỉnh không hợp lệ.';end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Cần nhập lý do điều chỉnh.';end if;
  select * into v_wallet from public.point_wallets where student_id=p_student_id for update;
  if not found then raise exception 'Không tìm thấy ví điểm của học sinh.';end if;
  if v_wallet.available_points+p_delta<0 then raise exception 'Số dư không đủ để thực hiện điều chỉnh này.';end if;
  update public.point_wallets set earned_points=earned_points+greatest(p_delta,0),available_points=available_points+p_delta where student_id=p_student_id returning available_points into v_balance;
  insert into public.point_ledger(student_id,transaction_type,source_type,delta,balance_after,performed_by,description,idempotency_key)
    values(p_student_id,case when p_delta>0 then 'manual_reward' else 'adjustment' end,'manual_adjustment',p_delta,v_balance,v_teacher,trim(p_reason),p_idempotency_key) returning id into v_ledger;
  insert into public.notifications(user_id,title,message,kind) values(p_student_id,'Điểm thưởng được điều chỉnh',trim(p_reason)||' ('||(case when p_delta>0 then '+' else '' end)||p_delta||' điểm)','points_adjusted');
  if p_delta>0 then v_count:=public.process_auto_redemptions(p_student_id,v_teacher,p_idempotency_key);end if;
  return jsonb_build_object('ledger_id',v_ledger,'balance',v_balance,'redemptions_created',v_count);
exception when unique_violation then
  select id,balance_after into v_ledger,v_balance from public.point_ledger where idempotency_key=p_idempotency_key;
  if v_ledger is not null then return jsonb_build_object('ledger_id',v_ledger,'balance',v_balance,'replayed',true);end if;raise;
end;
$$;

create or replace function public.adjust_approved_grade(p_submission_id uuid,p_new_approved_points integer,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_teacher uuid:=public.assert_teacher();v_grade public.grading_records%rowtype;v_submission public.submissions%rowtype;v_original_ledger uuid;v_delta integer;v_balance bigint;v_new_ledger uuid;v_count integer:=0;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'Cần nhập lý do điều chỉnh.';end if;
  select * into v_grade from public.grading_records where submission_id=p_submission_id and status='approved' for update;
  if not found then raise exception 'Bài chưa được duyệt.';end if;
  select * into v_submission from public.submissions where id=p_submission_id;
  v_delta:=p_new_approved_points-v_grade.approved_points;
  if v_delta=0 then raise exception 'Điểm mới không thay đổi.';end if;
  select id into v_original_ledger from public.point_ledger where transaction_type='assignment_reward' and source_id=p_submission_id;
  select available_points into v_balance from public.point_wallets where student_id=v_submission.student_id for update;
  if v_balance+v_delta<0 then raise exception 'Điểm khả dụng không đủ để trừ toàn bộ chênh lệch. Không tự thu hồi quà đã trao.';end if;
  update public.point_wallets set available_points=available_points+v_delta,earned_points=earned_points+greatest(v_delta,0) where student_id=v_submission.student_id returning available_points into v_balance;
  insert into public.point_ledger(student_id,transaction_type,source_type,source_id,delta,balance_after,performed_by,description,idempotency_key,reference_ledger_id)
    values(v_submission.student_id,'adjustment','grade_adjustment',p_submission_id,v_delta,v_balance,v_teacher,trim(p_reason),p_idempotency_key,v_original_ledger) returning id into v_new_ledger;
  update public.grading_records set approved_points=p_new_approved_points,adjustment_reason=trim(p_reason) where id=v_grade.id;
  if v_delta>0 then v_count:=public.process_auto_redemptions(v_submission.student_id,v_teacher,p_idempotency_key);end if;
  return jsonb_build_object('ledger_id',v_new_ledger,'delta',v_delta,'balance',v_balance,'redemptions_created',v_count);
end;
$$;

create or replace function public.allow_resubmission(p_submission_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin perform public.assert_teacher();update public.submissions set resubmission_allowed=true where id=p_submission_id and status='approved';if not found then raise exception 'Chỉ có thể cho phép nộp lại bài đã duyệt.';end if;end;
$$;

create or replace function public.mark_reward_delivered(p_redemption_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_teacher uuid:=public.assert_teacher();v_row public.reward_redemptions%rowtype;
begin
  select * into v_row from public.reward_redemptions where id=p_redemption_id for update;
  if not found then raise exception 'Không tìm thấy phần quà.';end if;
  if v_row.status='delivered' then return jsonb_build_object('already_delivered',true);end if;
  if v_row.status<>'pending' then raise exception 'Phần quà không ở trạng thái chờ trao.';end if;
  update public.reward_redemptions set status='delivered',delivered_at=now(),delivered_by=v_teacher where id=p_redemption_id;
  insert into public.notifications(user_id,title,message,kind) values(v_row.student_id,'Giáo viên đã trao quà','Phần quà '||v_row.product_name_snapshot||' đã được đánh dấu là đã trao.','reward_delivered');
  return jsonb_build_object('already_delivered',false,'id',p_redemption_id,'idempotency_key',p_idempotency_key);
end;
$$;

create or replace function public.seed_default_rewards()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_teacher uuid:=public.assert_teacher();v_price integer;v_tea uuid;v_count integer;
begin
  v_price:=coalesce((select value::text::integer from public.app_settings where key='default_reward_price'),200);
  insert into public.reward_products(teacher_id,name,description,price_points,inventory_mode,stock_quantity)
  select v_teacher,x.name,x.description,v_price,'unlimited',null from (values
    ('Một cốc trà sữa','Một ly trà sữa yêu thích để mừng em hoàn thành mục tiêu.'),
    ('Một phần bánh ngọt','Một phần bánh nhỏ thật ngon cho giờ nghỉ vui vẻ.'),
    ('Một món đồ dùng học tập','Một món đồ xinh xắn đồng hành cùng em khi học.'),
    ('Một món quà bí mật','Một bất ngờ nho nhỏ do giáo viên chuẩn bị.')
  ) as x(name,description)
  where not exists(select 1 from public.reward_products p where p.teacher_id=v_teacher and p.name=x.name);
  get diagnostics v_count=row_count;
  select id into v_tea from public.reward_products where teacher_id=v_teacher and name='Một cốc trà sữa' and active limit 1;
  if v_tea is not null then insert into public.reward_targets(student_id,product_id) select id,v_tea from public.profiles where role='student' on conflict(student_id) do nothing;end if;
  return v_count;
end;
$$;

