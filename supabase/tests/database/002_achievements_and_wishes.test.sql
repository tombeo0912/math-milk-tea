begin;
select plan(22);

select has_table('public','achievement_submissions','achievement submissions exists');
select has_table('public','achievement_files','achievement evidence files exists');
select has_table('public','reward_wishes','reward wishes exists');

select col_type_is('public','achievement_submissions','score','numeric(8,2)','reported score is exact numeric');
select col_type_is('public','achievement_submissions','max_score','numeric(8,2)','reported score scale is exact numeric');
select col_has_check('public','achievement_submissions','awarded_points','achievement rewards are constrained');
select col_has_check('public','reward_wishes','status','wish status is constrained');

select table_privs_are('anon','public','achievement_submissions',array[]::text[],'anonymous users cannot read achievements');
select table_privs_are('anon','public','achievement_files',array[]::text[],'anonymous users cannot read evidence files');
select table_privs_are('anon','public','reward_wishes',array[]::text[],'anonymous users cannot read wishes');
select table_privs_are('authenticated','public','achievement_submissions',array['SELECT'],'authenticated achievement writes are RPC-only');
select table_privs_are('authenticated','public','achievement_files',array['SELECT'],'authenticated evidence writes are RPC-only');
select table_privs_are('authenticated','public','reward_wishes',array['SELECT'],'authenticated wish writes are RPC-only');

select has_function('public','submit_achievement',array['text','text','text','numeric','numeric','date','text','jsonb','text'],'submit achievement RPC exists');
select has_function('public','review_achievement',array['uuid','text','integer','text','text'],'review achievement RPC exists');
select has_function('public','submit_reward_wish',array['text','text','text','text'],'submit wish RPC exists');
select has_function('public','create_reward_from_wish',array['uuid','text','text','integer','text','integer','text','text','text'],'create reward from wish RPC exists');
select has_function('public','reject_reward_wish',array['uuid','text','text'],'reject wish RPC exists');

select is((select public from storage.buckets where id='achievement-evidence'),false,'achievement evidence bucket is private');
select is((select file_size_limit from storage.buckets where id='achievement-evidence'),15728640::bigint,'achievement evidence files are limited to 15 MB');
select has_index('public','reward_wishes','reward_wishes_one_pending_per_student','one pending wish per student is enforced');
select has_index('public','point_ledger','point_ledger_one_achievement_reward','an achievement can only be rewarded once');

select * from finish();
rollback;
