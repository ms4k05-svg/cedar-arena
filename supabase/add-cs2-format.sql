-- Adds Best-of-1 support (with two-tier escalation Bo1 -> Bo3 -> Bo5)
-- and a map pool field, for games like CS2 that don't fit the
-- Clash-Royale-only Bo3/Bo5 model. Safe to run any time.

alter table public.tournaments drop constraint if exists tournaments_series_check;
alter table public.tournaments add constraint tournaments_series_check check (series in ('Bo1','Bo3','Bo5'));

alter table public.tournaments add column if not exists bo3_from text not null default 'none' check (bo3_from in ('none','final','semis'));
alter table public.tournaments add column if not exists map_pool text[];

drop function if exists public.create_tournament(text,text,text,text,int,text,text,text,uuid,text,int,int,boolean,text,boolean);

create or replace function public.create_tournament(
  p_name text, p_starts_at text, p_entry_fee text, p_prize text,
  p_max_players int, p_mode text, p_series text, p_bo5_from text, p_game_id uuid,
  p_format text, p_min_team_size int, p_max_team_size int,
  p_check_in_required boolean, p_score_reporting text, p_require_screenshot boolean,
  p_bo3_from text, p_map_pool text[]
) returns text language plpgsql security definer set search_path = public as $$
declare
  exists_active boolean;
  series text := coalesce(p_series, 'Bo3');
  bo5 text := coalesce(p_bo5_from, 'none');
  bo3 text := coalesce(p_bo3_from, 'none');
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
  if series <> 'Bo1' then bo3 := 'none'; end if;
  if series = 'Bo5' then bo5 := 'none'; end if;
  insert into public.tournaments (
    name, starts_at, entry_fee, prize, max_players, mode, series, bo5_from, game_id,
    format, min_team_size, max_team_size, check_in_required, score_reporting, require_screenshot,
    bo3_from, map_pool
  )
  values (
    trim(p_name), coalesce(p_starts_at, ''), coalesce(p_entry_fee, ''), coalesce(p_prize, ''),
    p_max_players, final_mode, series, bo5, p_game_id,
    fmt, p_min_team_size, p_max_team_size, coalesce(p_check_in_required, false), scoring, coalesce(p_require_screenshot, false),
    bo3, p_map_pool
  );
  return null;
exception when unique_violation then
  return 'exists';
end $$;

grant execute on function public.create_tournament(text,text,text,text,int,text,text,text,uuid,text,int,int,boolean,text,boolean,text,text[]) to authenticated;
