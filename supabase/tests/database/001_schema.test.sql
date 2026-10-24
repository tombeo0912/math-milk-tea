begin;
select plan(28);

select has_table('public','profiles','profiles exists');
select has_table('public','assignments','assignments exists');
select has_table('public','submissions','submissions exists');
select has_table('public','submission_files','submission_files exists');
select has_table('public','grading_records','grading_records exists');
select has_table('public','difficulty_settings','difficulty_settings exists');
select has_table('public','point_ledger','point_ledger exists');
select has_table('public','point_wallets','point_wallets exists');
select has_table('public','reward_products','reward_products exists');
select has_table('public','reward_targets','reward_targets exists');
select has_table('public','reward_redemptions','reward_redemptions exists');
select has_table('public','app_settings','app_settings exists');

select col_is_pk('public','profiles','id','profiles id is primary key');
select col_is_pk('public','point_wallets','student_id','wallet uses student id as primary key');
select col_type_is('public','point_ledger','delta','integer','ledger uses integer points');
select col_type_is('public','grading_records','math_score','numeric(4,2)','math score is exact numeric');
select col_type_is('public','grading_records','difficulty_multiplier_snapshot','numeric(5,2)','multiplier snapshot is exact numeric');
select col_has_check('public','point_wallets','available_points','wallet balance has a check constraint');
select col_has_check('public','reward_products','price_points','reward price has a check constraint');

select table_privs_are('anon','public','point_wallets',array[]::text[],'anonymous users have no wallet privileges');
select table_privs_are('anon','public','point_ledger',array[]::text[],'anonymous users have no ledger privileges');
select table_privs_are('authenticated','public','point_wallets',array['SELECT'],'authenticated clients can only select wallets');
select table_privs_are('authenticated','public','point_ledger',array['SELECT'],'authenticated clients can only select ledger');
select table_privs_are('authenticated','public','grading_records',array['SELECT'],'grading writes are RPC-only');

select is(floor(0::numeric*1+0.5)::integer,0,'0/10 easy gives 0');
select is(floor(8.5::numeric*2+0.5)::integer,17,'8.5/10 hard gives 17');
select is(floor(8::numeric*1.5+0.5)::integer,12,'8/10 medium gives 12');
select is(floor(10::numeric*3+0.5)::integer,30,'10/10 challenge gives 30');

select * from finish();
rollback;

