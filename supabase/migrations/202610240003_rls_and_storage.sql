alter table public.profiles enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.difficulty_settings enable row level security;
alter table public.grading_records enable row level security;
alter table public.point_wallets enable row level security;
alter table public.point_ledger enable row level security;
alter table public.reward_products enable row level security;
alter table public.reward_targets enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.app_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.idempotency_requests enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.profiles,public.assignments,public.submissions,public.submission_files,public.difficulty_settings,public.grading_records,public.point_wallets,public.point_ledger,public.reward_products,public.reward_targets,public.reward_redemptions,public.app_settings,public.notifications to authenticated;
grant insert,update,delete on public.assignments to authenticated;
grant insert,update on public.reward_products to authenticated;
grant update on public.difficulty_settings,public.app_settings,public.notifications to authenticated;
grant insert on public.app_settings to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (id=(select auth.uid()) or (select public.is_teacher()));

create policy assignments_read on public.assignments for select to authenticated using (
  (teacher_id=(select auth.uid()) and (select public.is_teacher())) or status='published'
);
create policy assignments_teacher_insert on public.assignments for insert to authenticated with check (teacher_id=(select auth.uid()) and (select public.is_teacher()));
create policy assignments_teacher_update on public.assignments for update to authenticated using (teacher_id=(select auth.uid()) and (select public.is_teacher())) with check (teacher_id=(select auth.uid()) and (select public.is_teacher()));
create policy assignments_teacher_delete_unused on public.assignments for delete to authenticated using (teacher_id=(select auth.uid()) and (select public.is_teacher()) and not exists(select 1 from public.submissions s where s.assignment_id=assignments.id));

create policy submissions_read on public.submissions for select to authenticated using (student_id=(select auth.uid()) or (select public.is_teacher()));
create policy submission_files_read on public.submission_files for select to authenticated using (exists(select 1 from public.submissions s where s.id=submission_id and (s.student_id=(select auth.uid()) or (select public.is_teacher()))));
create policy grading_read on public.grading_records for select to authenticated using (
  (select public.is_teacher()) or (status='approved' and exists(select 1 from public.submissions s where s.id=submission_id and s.student_id=(select auth.uid())))
);
create policy difficulty_read on public.difficulty_settings for select to authenticated using (true);
create policy difficulty_teacher_update on public.difficulty_settings for update to authenticated using ((select public.is_teacher())) with check ((select public.is_teacher()));

create policy wallets_read on public.point_wallets for select to authenticated using (student_id=(select auth.uid()) or (select public.is_teacher()));
create policy ledger_read on public.point_ledger for select to authenticated using (student_id=(select auth.uid()) or (select public.is_teacher()));

create policy rewards_read on public.reward_products for select to authenticated using (active or (teacher_id=(select auth.uid()) and (select public.is_teacher())));
create policy rewards_teacher_insert on public.reward_products for insert to authenticated with check (teacher_id=(select auth.uid()) and (select public.is_teacher()));
create policy rewards_teacher_update on public.reward_products for update to authenticated using (teacher_id=(select auth.uid()) and (select public.is_teacher())) with check (teacher_id=(select auth.uid()) and (select public.is_teacher()));
create policy targets_read on public.reward_targets for select to authenticated using (student_id=(select auth.uid()) or (select public.is_teacher()));
create policy redemptions_read on public.reward_redemptions for select to authenticated using (student_id=(select auth.uid()) or (select public.is_teacher()));

create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_teacher_insert on public.app_settings for insert to authenticated with check ((select public.is_teacher()));
create policy settings_teacher_update on public.app_settings for update to authenticated using ((select public.is_teacher())) with check ((select public.is_teacher()));
create policy notifications_read on public.notifications for select to authenticated using (user_id=(select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('submission-images','submission-images',false,15728640,array['image/jpeg','image/png','image/webp']),
  ('assignment-images','assignment-images',false,15728640,array['image/jpeg','image/png','image/webp']),
  ('reward-images','reward-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy submission_storage_read on storage.objects for select to authenticated using (
  bucket_id='submission-images' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select public.is_teacher()))
);
create policy submission_storage_student_upload on storage.objects for insert to authenticated with check (
  bucket_id='submission-images' and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.profiles where id=(select auth.uid()) and role='student')
);
create policy submission_storage_cleanup_orphan on storage.objects for delete to authenticated using (
  bucket_id='submission-images' and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.submission_files f where f.storage_path=name)
);

create policy assignment_storage_read on storage.objects for select to authenticated using (bucket_id='assignment-images');
create policy assignment_storage_teacher_insert on storage.objects for insert to authenticated with check (bucket_id='assignment-images' and (select public.is_teacher()));
create policy assignment_storage_teacher_update on storage.objects for update to authenticated using (bucket_id='assignment-images' and (select public.is_teacher())) with check (bucket_id='assignment-images' and (select public.is_teacher()));
create policy assignment_storage_teacher_delete_unused on storage.objects for delete to authenticated using (bucket_id='assignment-images' and (select public.is_teacher()) and not exists(select 1 from public.assignments a where a.image_path=name));

create policy reward_storage_read on storage.objects for select to authenticated using (bucket_id='reward-images');
create policy reward_storage_teacher_insert on storage.objects for insert to authenticated with check (bucket_id='reward-images' and (select public.is_teacher()));
create policy reward_storage_teacher_update on storage.objects for update to authenticated using (bucket_id='reward-images' and (select public.is_teacher())) with check (bucket_id='reward-images' and (select public.is_teacher()));
create policy reward_storage_teacher_delete_unused on storage.objects for delete to authenticated using (bucket_id='reward-images' and (select public.is_teacher()) and not exists(select 1 from public.reward_products p where p.image_path=name));

revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.finalize_submission(uuid,text,jsonb,text) to authenticated;
grant execute on function public.save_grading_draft(uuid,numeric,text,integer,text,text) to authenticated;
grant execute on function public.approve_submission(uuid,numeric,text,integer,text,text,text) to authenticated;
grant execute on function public.set_reward_target(uuid,text) to authenticated;
grant execute on function public.adjust_points(uuid,integer,text,text) to authenticated;
grant execute on function public.adjust_approved_grade(uuid,integer,text,text) to authenticated;
grant execute on function public.allow_resubmission(uuid) to authenticated;
grant execute on function public.mark_reward_delivered(uuid,text) to authenticated;
grant execute on function public.seed_default_rewards() to authenticated;

