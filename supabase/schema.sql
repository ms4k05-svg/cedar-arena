-- ============================================================
-- CEDAR ARENA — Supabase schema (tables, RLS, RPC functions)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: uses "if not exists" / "create or replace" everywhere.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- HELPER FUNCTIONS (defined first — RLS policies below reference them)
-- ------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
end $$;

create or replace function public.is_match_participant(p_tournament_id uuid, p_round_idx int, p_match_idx int)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  m jsonb;
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  select (bracket -> 'rounds' -> p_round_idx -> p_match_idx) into m
  from public.tournaments where id = p_tournament_id;
  if m is null then return false; end if;
  return coalesce(m -> 'p1' ->> 'userId', '') = uid::text
      or coalesce(m -> 'p2' ->> 'userId', '') = uid::text;
end $$;

-- ------------------------------------------------------------
-- PROFILES (one row per account, linked to Supabase Auth user)
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null,
  phone text not null,
  player_tag text not null,
  role text not null default 'player' check (role in ('admin','player')),
  must_change_password boolean not null default false,
  language text not null default 'en' check (language in ('en','ar','fr')),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));
create unique index if not exists profiles_player_tag_key on public.profiles (player_tag);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select using (public.is_admin());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;

-- ------------------------------------------------------------
-- TOURNAMENTS (one active row at a time; completed rows = history)
-- ------------------------------------------------------------

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at text not null default '',
  entry_fee text not null default '',
  prize text not null default '',
  max_players int not null check (max_players >= 4 and max_players % 2 = 0),
  mode text not null default 'Mega Draft' check (mode in ('Mega Draft','Triple Draft','Duel')),
  series text not null default 'Bo3' check (series in ('Bo3','Bo5')),
  bo5_from text not null default 'none' check (bo5_from in ('none','final','semis')),
  status text not null default 'open' check (status in ('open','live','completed')),
  confirmed_count int not null default 0,
  bracket jsonb,
  champion jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

drop index if exists one_active_tournament_idx;
create unique index one_active_tournament_idx on public.tournaments ((1)) where status <> 'completed';

alter table public.tournaments enable row level security;
drop policy if exists tournaments_select_all on public.tournaments;
create policy tournaments_select_all on public.tournaments for select using (true);

revoke all on public.tournaments from anon, authenticated;
grant select on public.tournaments to anon, authenticated;

-- ------------------------------------------------------------
-- REGISTRATIONS
-- ------------------------------------------------------------

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  tag text not null,
  status text not null default 'pending' check (status in ('pending','confirmed')),
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

alter table public.registrations enable row level security;
drop policy if exists registrations_select on public.registrations;
create policy registrations_select on public.registrations for select using (
  auth.uid() = user_id or public.is_admin()
);

revoke all on public.registrations from anon, authenticated;
grant select on public.registrations to authenticated;

-- ------------------------------------------------------------
-- MESSAGES (per-match private chat; match = tournament_id + round_idx + match_idx)
-- ------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_idx int not null,
  match_idx int not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  text text,
  image_path text,
  is_noshow boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_text_len check (text is null or char_length(text) <= 300)
);

create index if not exists messages_thread_idx on public.messages (tournament_id, round_idx, match_idx, created_at);

alter table public.messages enable row level security;

-- ------------------------------------------------------------
-- SETTINGS (single row: whish number + contact)
-- ------------------------------------------------------------

create table if not exists public.settings (
  id boolean primary key default true check (id),
  whish_number text not null default '',
  contact text not null default ''
);
insert into public.settings (id) values (true) on conflict (id) do nothing;

alter table public.settings enable row level security;
drop policy if exists settings_select_all on public.settings;
create policy settings_select_all on public.settings for select using (true);

revoke all on public.settings from anon, authenticated;
grant select on public.settings to anon, authenticated;

-- ------------------------------------------------------------
-- STORAGE (match screenshots / battle QR codes)
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('match-images', 'match-images', false)
on conflict (id) do nothing;

-- messages policies (depend on is_admin / is_match_participant, defined at top of file)
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  public.is_admin() or public.is_match_participant(tournament_id, round_idx, match_idx)
);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid()
  and (public.is_admin() or public.is_match_participant(tournament_id, round_idx, match_idx))
);

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;

create or replace function public.cap_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.messages
  where id in (
    select id from public.messages
    where tournament_id = new.tournament_id and round_idx = new.round_idx and match_idx = new.match_idx
    order by created_at desc
    offset 200
  );
  return null;
end $$;

drop trigger if exists messages_cap on public.messages;
create trigger messages_cap after insert on public.messages
for each row execute function public.cap_messages();

-- storage.objects policies — path convention: {tournament_id}/{round}-{match}/{filename}
drop policy if exists match_images_select on storage.objects;
create policy match_images_select on storage.objects for select using (
  bucket_id = 'match-images' and (
    public.is_admin() or public.is_match_participant(
      ((storage.foldername(name))[1])::uuid,
      split_part((storage.foldername(name))[2], '-', 1)::int,
      split_part((storage.foldername(name))[2], '-', 2)::int
    )
  )
);
drop policy if exists match_images_insert on storage.objects;
create policy match_images_insert on storage.objects for insert with check (
  bucket_id = 'match-images' and (
    public.is_admin() or public.is_match_participant(
      ((storage.foldername(name))[1])::uuid,
      split_part((storage.foldername(name))[2], '-', 1)::int,
      split_part((storage.foldername(name))[2], '-', 2)::int
    )
  )
);
drop policy if exists match_images_delete on storage.objects;
create policy match_images_delete on storage.objects for delete using (
  bucket_id = 'match-images' and public.is_admin()
);

-- ------------------------------------------------------------
-- SIGNUP: auto-create a profile row when someone creates an account.
-- First account ever created becomes the admin.
-- ------------------------------------------------------------

create or replace function public.no_accounts_yet()
returns boolean language sql stable security definer set search_path = public as $$
  select not exists(select 1 from public.profiles);
$$;

create or replace function public.check_signup_available(p_username text, p_tag_raw text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  utag text := upper(regexp_replace(coalesce(p_tag_raw, ''), 'O', '0', 'g'));
begin
  if char_length(coalesce(p_username, '')) < 2 or char_length(p_username) > 20 then
    return 'uname_len';
  end if;
  if exists(select 1 from public.profiles where lower(username) = lower(p_username)) then
    return 'uname_taken';
  end if;
  if utag !~ '^#' then utag := '#' || utag; end if;
  if utag !~ '^#[0289PYLQGRJCUV]{3,12}$' then
    return 'tag_invalid';
  end if;
  if exists(select 1 from public.profiles where player_tag = utag) then
    return 'tag_taken';
  end if;
  return null;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
  uname text := new.raw_user_meta_data ->> 'username';
  uphone text := new.raw_user_meta_data ->> 'phone';
  utag text := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'player_tag', ''), 'O', '0', 'g'));
begin
  if utag !~ '^#' then utag := '#' || utag; end if;
  if char_length(coalesce(uname, '')) < 2 or char_length(uname) > 20 then
    raise exception 'uname_len';
  end if;
  if exists(select 1 from public.profiles where lower(username) = lower(uname)) then
    raise exception 'uname_taken';
  end if;
  if utag !~ '^#[0289PYLQGRJCUV]{3,12}$' then
    raise exception 'tag_invalid';
  end if;
  if exists(select 1 from public.profiles where player_tag = utag) then
    raise exception 'tag_taken';
  end if;
  if regexp_replace(coalesce(uphone, ''), '[\s-]', '', 'g') !~ '^\+?[0-9]{7,15}$' then
    raise exception 'phone_invalid';
  end if;
  select not exists(select 1 from public.profiles) into is_first;
  insert into public.profiles (id, email, username, phone, player_tag, role)
  values (new.id, new.email, uname, uphone, utag, case when is_first then 'admin' else 'player' end);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- confirmed_count upkeep
-- ------------------------------------------------------------

create or replace function public.sync_confirmed_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tournaments set confirmed_count = (
    select count(*) from public.registrations
    where tournament_id = coalesce(new.tournament_id, old.tournament_id) and status = 'confirmed'
  )
  where id = coalesce(new.tournament_id, old.tournament_id);
  return null;
end $$;

drop trigger if exists registrations_sync_count on public.registrations;
create trigger registrations_sync_count
  after insert or update or delete on public.registrations
  for each row execute function public.sync_confirmed_count();

-- ------------------------------------------------------------
-- PROFILE ACTIONS (self-service RPCs)
-- ------------------------------------------------------------

create or replace function public.rename_in_bracket(p_bracket jsonb, p_user_id uuid, p_new_name text)
returns jsonb language plpgsql as $$
declare
  rounds jsonb := p_bracket -> 'rounds';
  ri int; mi int; round jsonb; m jsonb; slot text;
begin
  if rounds is null then return p_bracket; end if;
  for ri in 0..jsonb_array_length(rounds) - 1 loop
    round := rounds -> ri;
    for mi in 0..jsonb_array_length(round) - 1 loop
      m := round -> mi;
      foreach slot in array array['p1', 'p2', 'winner'] loop
        if (m -> slot) is not null and (m -> slot) <> 'null'::jsonb
           and (m -> slot ->> 'userId') = p_user_id::text then
          m := jsonb_set(m, array[slot, 'name'], to_jsonb(p_new_name));
        end if;
      end loop;
      round := jsonb_set(round, array[mi::text], m);
    end loop;
    rounds := jsonb_set(rounds, array[ri::text], round);
  end loop;
  return jsonb_set(p_bracket, '{rounds}', rounds);
end $$;

create or replace function public.update_username(p_new_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clash boolean;
  t record;
  new_champion jsonb;
begin
  if char_length(coalesce(p_new_name, '')) < 2 or char_length(p_new_name) > 20 then
    return 'uname_len';
  end if;
  select exists(select 1 from public.profiles where lower(username) = lower(p_new_name) and id <> uid) into clash;
  if clash then return 'uname_taken'; end if;

  update public.profiles set username = p_new_name where id = uid;
  update public.registrations set name = p_new_name
    where user_id = uid and tournament_id in (select id from public.tournaments where status <> 'completed');

  select * into t from public.tournaments where status <> 'completed' limit 1;
  if found and t.bracket is not null then
    new_champion := t.champion;
    if new_champion is not null and new_champion <> 'null'::jsonb and (new_champion ->> 'userId') = uid::text then
      new_champion := jsonb_set(new_champion, '{name}', to_jsonb(p_new_name));
    end if;
    update public.tournaments
      set bracket = public.rename_in_bracket(t.bracket, uid, p_new_name),
          champion = new_champion
      where id = t.id;
  end if;
  return null;
end $$;

create or replace function public.clear_must_change_password()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

create or replace function public.set_language(p_lang text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set language = p_lang where id = auth.uid() and p_lang in ('en','ar','fr');
$$;

-- ------------------------------------------------------------
-- TOURNAMENT ACTIONS (admin RPCs)
-- ------------------------------------------------------------

create or replace function public.create_tournament(
  p_name text, p_starts_at text, p_entry_fee text, p_prize text,
  p_max_players int, p_mode text, p_series text, p_bo5_from text
) returns text language plpgsql security definer set search_path = public as $$
declare
  exists_active boolean;
  series text := coalesce(p_series, 'Bo3');
  bo5 text := coalesce(p_bo5_from, 'none');
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select exists(select 1 from public.tournaments where status <> 'completed') into exists_active;
  if exists_active then return 'exists'; end if;
  if trim(coalesce(p_name, '')) = '' then return 'name'; end if;
  if p_max_players is null or p_max_players < 4 or p_max_players % 2 <> 0 then return 'count'; end if;
  if p_mode = 'Duel' then series := 'Bo3'; end if;
  if series = 'Bo5' then bo5 := 'none'; end if;
  insert into public.tournaments (name, starts_at, entry_fee, prize, max_players, mode, series, bo5_from)
  values (trim(p_name), coalesce(p_starts_at, ''), coalesce(p_entry_fee, ''), coalesce(p_prize, ''),
          p_max_players, coalesce(p_mode, 'Mega Draft'), series, bo5);
  return null;
exception when unique_violation then
  return 'exists';
end $$;

create or replace function public.cancel_tournament(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.messages where tournament_id = p_id;
  delete from public.tournaments where id = p_id and status <> 'completed';
end $$;

create or replace function public.admin_set_registration_status(p_tournament_id uuid, p_user_id uuid, p_status text)
returns text language plpgsql security definer set search_path = public as $$
declare
  max_p int; conf int;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select max_players, confirmed_count into max_p, conf from public.tournaments where id = p_tournament_id;
  if p_status = 'confirmed' and conf >= max_p then return 'full'; end if;
  update public.registrations set status = p_status where tournament_id = p_tournament_id and user_id = p_user_id;
  return null;
end $$;

create or replace function public.admin_remove_registration(p_tournament_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.registrations where tournament_id = p_tournament_id and user_id = p_user_id;
end $$;

create or replace function public.register_for_tournament(p_tournament_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t record;
  already boolean;
  uname text; utag text;
begin
  if uid is null then return 'auth'; end if;
  select * into t from public.tournaments where id = p_tournament_id;
  if not found or t.status <> 'open' then return 'closed'; end if;
  select exists(select 1 from public.registrations where tournament_id = p_tournament_id and user_id = uid) into already;
  if already then return 'already'; end if;
  if t.confirmed_count >= t.max_players then return 'full'; end if;
  select username, player_tag into uname, utag from public.profiles where id = uid;
  insert into public.registrations (tournament_id, user_id, name, tag, status)
  values (p_tournament_id, uid, uname, utag, 'pending');
  return null;
end $$;

create or replace function public.start_bracket(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  confirmed jsonb;
  cnt int; size int := 1; byes int; i int;
  matches jsonb := '[]'::jsonb;
  p1 jsonb; p2 jsonb;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId', r.user_id, 'name', r.name, 'tag', r.tag) order by random()), '[]'::jsonb)
    into confirmed
    from public.registrations r where r.tournament_id = p_id and r.status = 'confirmed';
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

create or replace function public.report_winner(p_tournament_id uuid, p_round_idx int, p_match_idx int, p_winner jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  rounds jsonb; round jsonb; last_idx int; all_done boolean;
  next_round jsonb; winners jsonb; i int;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.bracket is null or (t.champion is not null and t.champion <> 'null'::jsonb) then return; end if;
  rounds := t.bracket -> 'rounds';
  last_idx := jsonb_array_length(rounds) - 1;
  if p_round_idx <> last_idx then return; end if;
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
      return;
    end if;
    select jsonb_agg(round -> i -> 'winner') into winners from generate_series(0, jsonb_array_length(round) - 1) as i;
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
end $$;

create or replace function public.undo_result(p_tournament_id uuid, p_round_idx int, p_match_idx int)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record; rounds jsonb; round jsonb; m jsonb;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.bracket is null then return; end if;
  rounds := t.bracket -> 'rounds';
  round := rounds -> p_round_idx;
  m := round -> p_match_idx;
  if m is null
     or (m -> 'winner') is null or (m -> 'winner') = 'null'::jsonb
     or (m -> 'p1') is null or (m -> 'p1') = 'null'::jsonb
     or (m -> 'p2') is null or (m -> 'p2') = 'null'::jsonb then
    return;
  end if;
  select coalesce(jsonb_agg(elem), '[]'::jsonb) into rounds
  from (
    select elem from jsonb_array_elements(rounds) with ordinality as t(elem, ord)
    where ord - 1 <= p_round_idx
  ) s;
  round := jsonb_set(rounds -> p_round_idx, array[p_match_idx::text, 'winner'], 'null'::jsonb);
  rounds := jsonb_set(rounds, array[p_round_idx::text], round);
  update public.tournaments set bracket = jsonb_set(t.bracket, '{rounds}', rounds), champion = null
  where id = p_tournament_id;
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
  is_participant := (m -> 'p1' ->> 'userId') = me_id::text or (m -> 'p2' ->> 'userId') = me_id::text;
  if not is_participant then return; end if;
  select username into me_name from public.profiles where id = me_id;
  m := jsonb_set(m, '{noShowReport}', jsonb_build_object('by', me_id, 'name', me_name, 'at', floor(extract(epoch from now()) * 1000)));
  round := jsonb_set(round, array[p_match_idx::text], m);
  rounds := jsonb_set(rounds, array[p_round_idx::text], round);
  update public.tournaments set bracket = jsonb_set(t.bracket, '{rounds}', rounds) where id = p_tournament_id;
  insert into public.messages (tournament_id, round_idx, match_idx, sender_id, sender_name, is_noshow)
  values (p_tournament_id, p_round_idx, p_match_idx, me_id, me_name, true);
end $$;

create or replace function public.finish_tournament(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare champ jsonb;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select champion into champ from public.tournaments where id = p_id;
  if champ is null or champ = 'null'::jsonb then return; end if;
  delete from public.messages where tournament_id = p_id;
  update public.tournaments set status = 'completed', completed_at = now() where id = p_id;
end $$;

create or replace function public.delete_past_tournament(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.tournaments where id = p_id and status = 'completed';
end $$;

create or replace function public.save_settings(p_whish text, p_contact text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.settings set whish_number = coalesce(p_whish, ''), contact = coalesce(p_contact, '') where id = true;
end $$;

-- ------------------------------------------------------------
-- GRANTS for all RPC functions
-- ------------------------------------------------------------

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_match_participant(uuid,int,int) to anon, authenticated;
grant execute on function public.no_accounts_yet() to anon, authenticated;
grant execute on function public.check_signup_available(text,text) to anon, authenticated;
grant execute on function public.update_username(text) to authenticated;
grant execute on function public.clear_must_change_password() to authenticated;
grant execute on function public.set_language(text) to authenticated;
grant execute on function public.create_tournament(text,text,text,text,int,text,text,text) to authenticated;
grant execute on function public.cancel_tournament(uuid) to authenticated;
grant execute on function public.admin_set_registration_status(uuid,uuid,text) to authenticated;
grant execute on function public.admin_remove_registration(uuid,uuid) to authenticated;
grant execute on function public.register_for_tournament(uuid) to authenticated;
grant execute on function public.start_bracket(uuid) to authenticated;
grant execute on function public.report_winner(uuid,int,int,jsonb) to authenticated;
grant execute on function public.undo_result(uuid,int,int) to authenticated;
grant execute on function public.report_no_show(uuid,int,int) to authenticated;
grant execute on function public.finish_tournament(uuid) to authenticated;
grant execute on function public.delete_past_tournament(uuid) to authenticated;
grant execute on function public.save_settings(text,text) to authenticated;

-- ------------------------------------------------------------
-- REALTIME: let the site update live without refreshing
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournaments') then
    alter publication supabase_realtime add table public.tournaments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registrations') then
    alter publication supabase_realtime add table public.registrations;
  end if;
end $$;

-- ============================================================
-- Done. Next: Authentication → Providers → Email → turn OFF
-- "Confirm email" so players can sign in immediately after signup.
-- ============================================================
