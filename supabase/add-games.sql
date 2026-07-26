-- Adds multi-game support: a `games` table, per-game player IDs (for games
-- other than Clash Royale), and ties each tournament to a specific game.
-- Safe to run any time.

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  player_id_label text not null,
  player_id_hint text not null default '',
  player_id_regex text,
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;
drop policy if exists games_select_all on public.games;
create policy games_select_all on public.games for select using (true);
revoke all on public.games from anon, authenticated;
grant select on public.games to anon, authenticated;

insert into public.games (slug, name, player_id_label, player_id_hint, player_id_regex)
values
  ('clash-royale', 'Clash Royale', 'Clash Royale player tag',
   'Find it on your in-game profile, under your name.',
   '^#[0289PYLQGRJCUV]{3,12}$'),
  ('cs2', 'Counter-Strike 2', 'Steam profile link',
   'Paste your full Steam profile URL, e.g. https://steamcommunity.com/id/yourname',
   '^https?://steamcommunity\.com/(id|profiles)/[^\s]+$')
on conflict (slug) do nothing;

alter table public.tournaments add column if not exists game_id uuid references public.games(id);
update public.tournaments set game_id = (select id from public.games where slug = 'clash-royale') where game_id is null;
alter table public.tournaments alter column game_id set not null;

create table if not exists public.player_game_ids (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  value text not null,
  created_at timestamptz not null default now(),
  unique (user_id, game_id)
);

alter table public.player_game_ids enable row level security;
drop policy if exists player_game_ids_select on public.player_game_ids;
create policy player_game_ids_select on public.player_game_ids for select using (
  auth.uid() = user_id or public.is_admin()
);
revoke all on public.player_game_ids from anon, authenticated;
grant select on public.player_game_ids to authenticated;

create or replace function public.set_game_id(p_game_id uuid, p_value text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rx text;
  val text := trim(coalesce(p_value, ''));
begin
  if uid is null then return 'auth'; end if;
  if val = '' then return 'empty'; end if;
  select player_id_regex into rx from public.games where id = p_game_id;
  if rx is not null and val !~ rx then return 'invalid'; end if;
  insert into public.player_game_ids (user_id, game_id, value)
  values (uid, p_game_id, val)
  on conflict (user_id, game_id) do update set value = excluded.value;
  return null;
end $$;

grant execute on function public.set_game_id(uuid, text) to authenticated;

drop function if exists public.create_tournament(text,text,text,text,int,text,text,text);

create or replace function public.create_tournament(
  p_name text, p_starts_at text, p_entry_fee text, p_prize text,
  p_max_players int, p_mode text, p_series text, p_bo5_from text, p_game_id uuid
) returns text language plpgsql security definer set search_path = public as $$
declare
  exists_active boolean;
  series text := coalesce(p_series, 'Bo3');
  bo5 text := coalesce(p_bo5_from, 'none');
  game_ok boolean;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select exists(select 1 from public.tournaments where status <> 'completed') into exists_active;
  if exists_active then return 'exists'; end if;
  if trim(coalesce(p_name, '')) = '' then return 'name'; end if;
  if p_max_players is null or p_max_players < 4 or p_max_players % 2 <> 0 then return 'count'; end if;
  select exists(select 1 from public.games where id = p_game_id) into game_ok;
  if not game_ok then return 'game'; end if;
  if p_mode = 'Duel' then series := 'Bo3'; end if;
  if series = 'Bo5' then bo5 := 'none'; end if;
  insert into public.tournaments (name, starts_at, entry_fee, prize, max_players, mode, series, bo5_from, game_id)
  values (trim(p_name), coalesce(p_starts_at, ''), coalesce(p_entry_fee, ''), coalesce(p_prize, ''),
          p_max_players, coalesce(p_mode, 'Mega Draft'), series, bo5, p_game_id);
  return null;
exception when unique_violation then
  return 'exists';
end $$;

grant execute on function public.create_tournament(text,text,text,text,int,text,text,text,uuid) to authenticated;

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
-- Signup no longer collects a game-specific tag up front (since a new
-- account might play any game). It's collected the first time it's
-- actually needed, at registration time, via set_game_id() above.
-- ------------------------------------------------------------

alter table public.profiles alter column player_tag drop not null;

drop function if exists public.check_signup_available(text, text);

create or replace function public.check_signup_available(p_username text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if char_length(coalesce(p_username, '')) < 2 or char_length(p_username) > 20 then
    return 'uname_len';
  end if;
  if exists(select 1 from public.profiles where lower(username) = lower(p_username)) then
    return 'uname_taken';
  end if;
  return null;
end $$;

grant execute on function public.check_signup_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
  uname text := new.raw_user_meta_data ->> 'username';
  uphone text := new.raw_user_meta_data ->> 'phone';
begin
  if char_length(coalesce(uname, '')) < 2 or char_length(uname) > 20 then
    raise exception 'uname_len';
  end if;
  if exists(select 1 from public.profiles where lower(username) = lower(uname)) then
    raise exception 'uname_taken';
  end if;
  if regexp_replace(coalesce(uphone, ''), '[\s-]', '', 'g') !~ '^\+?[0-9]{7,15}$' then
    raise exception 'phone_invalid';
  end if;
  select not exists(select 1 from public.profiles) into is_first;
  insert into public.profiles (id, email, username, phone, role, player_id)
  values (new.id, new.email, uname, uphone, case when is_first then 'admin' else 'player' end, public.generate_player_id());
  return new;
end $$;
