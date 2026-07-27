-- Adds team registration, check-in, player-reportable scores, and a
-- required-screenshot option. Safe to run any time.

-- ------------------------------------------------------------
-- New tournament settings
-- ------------------------------------------------------------

alter table public.tournaments add column if not exists format text not null default 'solo' check (format in ('solo','team'));
alter table public.tournaments add column if not exists min_team_size int;
alter table public.tournaments add column if not exists max_team_size int;
alter table public.tournaments add column if not exists check_in_required boolean not null default false;
alter table public.tournaments add column if not exists score_reporting text not null default 'admin' check (score_reporting in ('admin','players'));
alter table public.tournaments add column if not exists require_screenshot boolean not null default false;

-- ------------------------------------------------------------
-- TEAMS
-- ------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_members where team_id = p_team_id and user_id = auth.uid());
$$;

alter table public.teams enable row level security;
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select using (
  public.is_admin() or captain_id = auth.uid() or public.is_team_member(id)
);
revoke all on public.teams from anon, authenticated;
grant select on public.teams to authenticated;

alter table public.team_members enable row level security;
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select using (
  public.is_admin() or public.is_team_member(team_id)
);
revoke all on public.team_members from anon, authenticated;
grant select on public.team_members to authenticated;

-- ------------------------------------------------------------
-- REGISTRATIONS: allow a row to belong to a team instead of a single user
-- ------------------------------------------------------------

alter table public.registrations alter column user_id drop not null;
alter table public.registrations add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.registrations add column if not exists checked_in boolean not null default false;
alter table public.registrations drop constraint if exists registrations_exactly_one_owner;
alter table public.registrations add constraint registrations_exactly_one_owner
  check ((user_id is not null and team_id is null) or (user_id is null and team_id is not null));
drop index if exists registrations_tournament_id_team_id_key;
create unique index registrations_tournament_id_team_id_key on public.registrations (tournament_id, team_id) where team_id is not null;

drop policy if exists registrations_select on public.registrations;
create policy registrations_select on public.registrations for select using (
  auth.uid() = user_id or public.is_admin() or (team_id is not null and public.is_team_member(team_id))
);

-- confirmed_count needs to fire on team registrations too (already keys off tournament_id, unaffected)

-- ------------------------------------------------------------
-- TEAM RPCs
-- ------------------------------------------------------------

create or replace function public.create_team(p_tournament_id uuid, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t record;
  already boolean;
  tid uuid;
  name text := trim(coalesce(p_name, ''));
begin
  if uid is null then return 'auth'; end if;
  select * into t from public.tournaments where id = p_tournament_id;
  if not found or t.status <> 'open' then return 'closed'; end if;
  if t.format <> 'team' then return 'format'; end if;
  if name = '' then return 'name'; end if;
  if t.confirmed_count >= t.max_players then return 'full'; end if;
  select exists(
    select 1 from public.team_members tm join public.teams tt on tt.id = tm.team_id
    where tm.user_id = uid and tt.tournament_id = p_tournament_id
  ) into already;
  if already then return 'already'; end if;
  insert into public.teams (tournament_id, name, captain_id) values (p_tournament_id, name, uid) returning id into tid;
  insert into public.team_members (team_id, user_id) values (tid, uid);
  insert into public.registrations (tournament_id, team_id, name, tag, status) values (p_tournament_id, tid, name, '', 'pending');
  return null;
exception when unique_violation then
  return 'name_taken';
end $$;

create or replace function public.add_team_member(p_team_id uuid, p_identifier text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  team record;
  t record;
  target_id uuid;
  cnt int;
  already boolean;
  ident text := trim(coalesce(p_identifier, ''));
begin
  select * into team from public.teams where id = p_team_id;
  if not found then return 'not_found'; end if;
  if team.captain_id <> uid then return 'not_captain'; end if;
  select * into t from public.tournaments where id = team.tournament_id;
  select id into target_id from public.profiles
    where lower(username) = lower(ident) or player_id = ident
    limit 1;
  if target_id is null then return 'no_user'; end if;
  select exists(
    select 1 from public.team_members tm join public.teams tt on tt.id = tm.team_id
    where tm.user_id = target_id and tt.tournament_id = team.tournament_id
  ) into already;
  if already then return 'already_on_team'; end if;
  select count(*) into cnt from public.team_members where team_id = p_team_id;
  if t.max_team_size is not null and cnt >= t.max_team_size then return 'team_full'; end if;
  insert into public.team_members (team_id, user_id) values (p_team_id, target_id);
  return null;
end $$;

create or replace function public.leave_team(p_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cap uuid;
begin
  select captain_id into cap from public.teams where id = p_team_id;
  if cap is null or cap = uid then return; end if;
  delete from public.team_members where team_id = p_team_id and user_id = uid;
end $$;

create or replace function public.remove_team_member(p_team_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cap uuid;
begin
  select captain_id into cap from public.teams where id = p_team_id;
  if cap is null or cap <> uid or p_user_id = cap then return; end if;
  delete from public.team_members where team_id = p_team_id and user_id = p_user_id;
end $$;

create or replace function public.admin_set_team_status(p_tournament_id uuid, p_team_id uuid, p_status text)
returns text language plpgsql security definer set search_path = public as $$
declare max_p int; conf int;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select max_players, confirmed_count into max_p, conf from public.tournaments where id = p_tournament_id;
  if p_status = 'confirmed' and conf >= max_p then return 'full'; end if;
  update public.registrations set status = p_status where tournament_id = p_tournament_id and team_id = p_team_id;
  return null;
end $$;

create or replace function public.admin_remove_team(p_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.teams where id = p_team_id;
end $$;

-- ------------------------------------------------------------
-- CHECK-IN
-- ------------------------------------------------------------

create or replace function public.check_in(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  update public.registrations r set checked_in = true
  where r.tournament_id = p_tournament_id and r.status = 'confirmed'
    and (
      r.user_id = uid
      or (r.team_id is not null and exists(select 1 from public.teams tt where tt.id = r.team_id and tt.captain_id = uid))
    );
end $$;

-- ------------------------------------------------------------
-- register_for_tournament: bail out for team-format tournaments
-- ------------------------------------------------------------

create or replace function public.register_for_tournament(p_tournament_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t record;
  already boolean;
  uname text; utag text; gslug text;
begin
  if uid is null then return 'auth'; end if;
  select * into t from public.tournaments where id = p_tournament_id;
  if not found or t.status <> 'open' then return 'closed'; end if;
  if t.format = 'team' then return 'wrong_format'; end if;
  select exists(select 1 from public.registrations where tournament_id = p_tournament_id and user_id = uid) into already;
  if already then return 'already'; end if;
  if t.confirmed_count >= t.max_players then return 'full'; end if;
  select username into uname from public.profiles where id = uid;
  select slug into gslug from public.games where id = t.game_id;
  if gslug = 'clash-royale' then
    select player_tag into utag from public.profiles where id = uid;
    if utag is null then
      select value into utag from public.player_game_ids where user_id = uid and game_id = t.game_id;
    end if;
  else
    select value into utag from public.player_game_ids where user_id = uid and game_id = t.game_id;
  end if;
  if utag is null then return 'need_game_id'; end if;
  insert into public.registrations (tournament_id, user_id, name, tag, status)
  values (p_tournament_id, uid, uname, utag, 'pending');
  return null;
end $$;

-- ------------------------------------------------------------
-- start_bracket: team-aware + check-in-aware
-- ------------------------------------------------------------

create or replace function public.start_bracket(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  t record;
  confirmed jsonb;
  cnt int; size int := 1; byes int; i int;
  matches jsonb := '[]'::jsonb;
  p1 jsonb; p2 jsonb;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select * into t from public.tournaments where id = p_id;

  if t.format = 'team' then
    select coalesce(jsonb_agg(jsonb_build_object('userId', tt.id, 'name', tt.name, 'tag', '') order by random()), '[]'::jsonb)
    into confirmed
    from public.registrations r join public.teams tt on tt.id = r.team_id
    where r.tournament_id = p_id and r.status = 'confirmed' and (not t.check_in_required or r.checked_in);
  else
    select coalesce(jsonb_agg(jsonb_build_object('userId', r.user_id, 'name', r.name, 'tag', r.tag) order by random()), '[]'::jsonb)
    into confirmed
    from public.registrations r
    where r.tournament_id = p_id and r.status = 'confirmed' and (not t.check_in_required or r.checked_in);
  end if;

  cnt := jsonb_array_length(confirmed);
  if cnt < 2 then return 'need2'; end if;
  while size < cnt loop size := size * 2; end loop;
  byes := size - cnt;
  i := 0;
  while i < byes loop
    p1 := confirmed -> i;
    matches := matches || jsonb_build_array(jsonb_build_object('p1', p1, 'p2', null, 'winner', p1));
    i := i + 1;
  end loop;
  while i < cnt loop
    p1 := confirmed -> i;
    p2 := confirmed -> (i + 1);
    matches := matches || jsonb_build_array(jsonb_build_object('p1', p1, 'p2', p2, 'winner', null));
    i := i + 2;
  end loop;
  select coalesce(jsonb_agg(elem order by random()), '[]'::jsonb) into matches
    from jsonb_array_elements(matches) as elem;
  update public.tournaments
    set bracket = jsonb_build_object('rounds', jsonb_build_array(matches)),
        status = 'live'
    where id = p_id;
  return null;
end $$;

-- ------------------------------------------------------------
-- is_match_participant / report_no_show: team-aware
-- ------------------------------------------------------------

create or replace function public.is_match_participant(p_tournament_id uuid, p_round_idx int, p_match_idx int)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  m jsonb; uid uuid := auth.uid(); fmt text; p1id uuid; p2id uuid;
begin
  if uid is null then return false; end if;
  select format into fmt from public.tournaments where id = p_tournament_id;
  select (bracket -> 'rounds' -> p_round_idx -> p_match_idx) into m from public.tournaments where id = p_tournament_id;
  if m is null then return false; end if;
  if fmt = 'team' then
    p1id := nullif(m -> 'p1' ->> 'userId', '')::uuid;
    p2id := nullif(m -> 'p2' ->> 'userId', '')::uuid;
    return exists(select 1 from public.team_members where user_id = uid and team_id in (p1id, p2id));
  end if;
  return coalesce(m -> 'p1' ->> 'userId', '') = uid::text
      or coalesce(m -> 'p2' ->> 'userId', '') = uid::text;
end $$;

create or replace function public.report_no_show(p_tournament_id uuid, p_round_idx int, p_match_idx int)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record; rounds jsonb; round jsonb; m jsonb; last_idx int;
  me_id uuid := auth.uid(); me_name text; is_participant boolean;
begin
  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.bracket is null or t.status <> 'live' then return; end if;
  rounds := t.bracket -> 'rounds';
  last_idx := jsonb_array_length(rounds) - 1;
  if p_round_idx <> last_idx then return; end if;
  round := rounds -> p_round_idx;
  m := round -> p_match_idx;
  if m is null then return; end if;
  if (m -> 'winner') is not null and (m -> 'winner') <> 'null'::jsonb then return; end if;
  if (m -> 'p1') is null or (m -> 'p1') = 'null'::jsonb or (m -> 'p2') is null or (m -> 'p2') = 'null'::jsonb then return; end if;
  if t.format = 'team' then
    is_participant := exists(
      select 1 from public.team_members
      where user_id = me_id and team_id in (nullif(m->'p1'->>'userId','')::uuid, nullif(m->'p2'->>'userId','')::uuid)
    );
  else
    is_participant := (m -> 'p1' ->> 'userId') = me_id::text or (m -> 'p2' ->> 'userId') = me_id::text;
  end if;
  if not is_participant then return; end if;
  select username into me_name from public.profiles where id = me_id;
  m := jsonb_set(m, '{noShowReport}', jsonb_build_object('by', me_id, 'name', me_name, 'at', floor(extract(epoch from now()) * 1000)));
  round := jsonb_set(round, array[p_match_idx::text], m);
  rounds := jsonb_set(rounds, array[p_round_idx::text], round);
  update public.tournaments set bracket = jsonb_set(t.bracket, '{rounds}', rounds) where id = p_tournament_id;
  insert into public.messages (tournament_id, round_idx, match_idx, sender_id, sender_name, is_noshow)
  values (p_tournament_id, p_round_idx, p_match_idx, me_id, me_name, true);
end $$;

-- ------------------------------------------------------------
-- report_winner (admin) + player_report_winner: require-screenshot aware
-- ------------------------------------------------------------

drop function if exists public.report_winner(uuid,int,int,jsonb);

create or replace function public.report_winner(p_tournament_id uuid, p_round_idx int, p_match_idx int, p_winner jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  t record;
  rounds jsonb; round jsonb; last_idx int; all_done boolean;
  next_round jsonb; winners jsonb; i int; has_shot boolean;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.bracket is null or (t.champion is not null and t.champion <> 'null'::jsonb) then return null; end if;
  rounds := t.bracket -> 'rounds';
  last_idx := jsonb_array_length(rounds) - 1;
  if p_round_idx <> last_idx then return null; end if;
  if t.require_screenshot then
    select exists(
      select 1 from public.messages
      where tournament_id = p_tournament_id and round_idx = p_round_idx and match_idx = p_match_idx and image_path is not null
    ) into has_shot;
    if not has_shot then return 'need_screenshot'; end if;
  end if;
  round := rounds -> p_round_idx;
  round := jsonb_set(round, array[p_match_idx::text, 'winner'], p_winner);
  rounds := jsonb_set(rounds, array[p_round_idx::text], round);

  all_done := true;
  for i in 0..jsonb_array_length(round) - 1 loop
    if (round -> i -> 'winner') is null or (round -> i -> 'winner') = 'null'::jsonb then
      all_done := false;
    end if;
  end loop;

  if all_done then
    if jsonb_array_length(round) = 1 then
      update public.tournaments set bracket = jsonb_set(t.bracket, '{rounds}', rounds), champion = round -> 0 -> 'winner'
      where id = p_tournament_id;
      return null;
    end if;
    select jsonb_agg(round -> gs.idx -> 'winner') into winners from generate_series(0, jsonb_array_length(round) - 1) as gs(idx);
    next_round := '[]'::jsonb;
    i := 0;
    while i < jsonb_array_length(winners) loop
      if i + 1 < jsonb_array_length(winners) then
        next_round := next_round || jsonb_build_array(jsonb_build_object('p1', winners -> i, 'p2', winners -> (i + 1), 'winner', null));
      else
        next_round := next_round || jsonb_build_array(jsonb_build_object('p1', winners -> i, 'p2', null, 'winner', winners -> i));
      end if;
      i := i + 2;
    end loop;
    rounds := rounds || jsonb_build_array(next_round);
  end if;

  update public.tournaments set bracket = jsonb_set(t.bracket, '{rounds}', rounds) where id = p_tournament_id;
  return null;
end $$;

create or replace function public.player_report_winner(p_tournament_id uuid, p_round_idx int, p_match_idx int, p_winner jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  t record;
  rounds jsonb; round jsonb; last_idx int; all_done boolean;
  next_round jsonb; winners jsonb; i int; has_shot boolean;
begin
  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.score_reporting <> 'players' then return 'not_allowed'; end if;
  if not public.is_match_participant(p_tournament_id, p_round_idx, p_match_idx) then return 'not_allowed'; end if;
  if t.bracket is null or (t.champion is not null and t.champion <> 'null'::jsonb) then return null; end if;
  rounds := t.bracket -> 'rounds';
  last_idx := jsonb_array_length(rounds) - 1;
  if p_round_idx <> last_idx then return null; end if;
  if t.require_screenshot then
    select exists(
      select 1 from public.messages
      where tournament_id = p_tournament_id and round_idx = p_round_idx and match_idx = p_match_idx and image_path is not null
    ) into has_shot;
    if not has_shot then return 'need_screenshot'; end if;
  end if;
  round := rounds -> p_round_idx;
  round := jsonb_set(round, array[p_match_idx::text, 'winner'], p_winner);
  rounds := jsonb_set(rounds, array[p_round_idx::text], round);

  all_done := true;
  for i in 0..jsonb_array_length(round) - 1 loop
    if (round -> i -> 'winner') is null or (round -> i -> 'winner') = 'null'::jsonb then
      all_done := false;
    end if;
  end loop;

  if all_done then
    if jsonb_array_length(round) = 1 then
      update public.tournaments set bracket = jsonb_set(t.bracket, '{rounds}', rounds), champion = round -> 0 -> 'winner'
      where id = p_tournament_id;
      return null;
    end if;
    select jsonb_agg(round -> gs.idx -> 'winner') into winners from generate_series(0, jsonb_array_length(round) - 1) as gs(idx);
    next_round := '[]'::jsonb;
    i := 0;
    while i < jsonb_array_length(winners) loop
      if i + 1 < jsonb_array_length(winners) then
        next_round := next_round || jsonb_build_array(jsonb_build_object('p1', winners -> i, 'p2', winners -> (i + 1), 'winner', null));
      else
        next_round := next_round || jsonb_build_array(jsonb_build_object('p1', winners -> i, 'p2', null, 'winner', winners -> i));
      end if;
      i := i + 2;
    end loop;
    rounds := rounds || jsonb_build_array(next_round);
  end if;

  update public.tournaments set bracket = jsonb_set(t.bracket, '{rounds}', rounds) where id = p_tournament_id;
  return null;
end $$;

-- ------------------------------------------------------------
-- create_tournament: new settings
-- ------------------------------------------------------------

drop function if exists public.create_tournament(text,text,text,text,int,text,text,text,uuid);

create or replace function public.create_tournament(
  p_name text, p_starts_at text, p_entry_fee text, p_prize text,
  p_max_players int, p_mode text, p_series text, p_bo5_from text, p_game_id uuid,
  p_format text, p_min_team_size int, p_max_team_size int,
  p_check_in_required boolean, p_score_reporting text, p_require_screenshot boolean
) returns text language plpgsql security definer set search_path = public as $$
declare
  exists_active boolean;
  series text := coalesce(p_series, 'Bo3');
  bo5 text := coalesce(p_bo5_from, 'none');
  gslug text;
  final_mode text;
  fmt text := coalesce(p_format, 'solo');
  scoring text := coalesce(p_score_reporting, 'admin');
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select exists(select 1 from public.tournaments where status <> 'completed') into exists_active;
  if exists_active then return 'exists'; end if;
  if trim(coalesce(p_name, '')) = '' then return 'name'; end if;
  if p_max_players is null or p_max_players < 4 or p_max_players % 2 <> 0 then return 'count'; end if;
  select slug into gslug from public.games where id = p_game_id;
  if gslug is null then return 'game'; end if;
  if gslug = 'clash-royale' then
    final_mode := coalesce(p_mode, 'Mega Draft');
    if final_mode = 'Duel' then series := 'Bo3'; end if;
  else
    final_mode := null;
  end if;
  if series = 'Bo5' then bo5 := 'none'; end if;
  insert into public.tournaments (
    name, starts_at, entry_fee, prize, max_players, mode, series, bo5_from, game_id,
    format, min_team_size, max_team_size, check_in_required, score_reporting, require_screenshot
  )
  values (
    trim(p_name), coalesce(p_starts_at, ''), coalesce(p_entry_fee, ''), coalesce(p_prize, ''),
    p_max_players, final_mode, series, bo5, p_game_id,
    fmt, p_min_team_size, p_max_team_size, coalesce(p_check_in_required, false), scoring, coalesce(p_require_screenshot, false)
  );
  return null;
exception when unique_violation then
  return 'exists';
end $$;

-- ------------------------------------------------------------
-- grants
-- ------------------------------------------------------------

grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.create_team(uuid, text) to authenticated;
grant execute on function public.add_team_member(uuid, text) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.admin_set_team_status(uuid, uuid, text) to authenticated;
grant execute on function public.admin_remove_team(uuid) to authenticated;
grant execute on function public.check_in(uuid) to authenticated;
grant execute on function public.player_report_winner(uuid, int, int, jsonb) to authenticated;
grant execute on function public.report_winner(uuid, int, int, jsonb) to authenticated;
grant execute on function public.create_tournament(text,text,text,text,int,text,text,text,uuid,text,int,int,boolean,text,boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams') then
    alter publication supabase_realtime add table public.teams;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_members') then
    alter publication supabase_realtime add table public.team_members;
  end if;
end $$;
