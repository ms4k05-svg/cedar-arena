-- "Mode" (Mega Draft / Triple Draft / Duel) is a Clash Royale-only concept.
-- Make it optional so other games' tournaments don't need one.

alter table public.tournaments alter column mode drop not null;
alter table public.tournaments alter column mode drop default;
alter table public.tournaments drop constraint if exists tournaments_mode_check;
alter table public.tournaments add constraint tournaments_mode_check
  check (mode is null or mode in ('Mega Draft','Triple Draft','Duel'));

create or replace function public.create_tournament(
  p_name text, p_starts_at text, p_entry_fee text, p_prize text,
  p_max_players int, p_mode text, p_series text, p_bo5_from text, p_game_id uuid
) returns text language plpgsql security definer set search_path = public as $$
declare
  exists_active boolean;
  series text := coalesce(p_series, 'Bo3');
  bo5 text := coalesce(p_bo5_from, 'none');
  gslug text;
  final_mode text;
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
  insert into public.tournaments (name, starts_at, entry_fee, prize, max_players, mode, series, bo5_from, game_id)
  values (trim(p_name), coalesce(p_starts_at, ''), coalesce(p_entry_fee, ''), coalesce(p_prize, ''),
          p_max_players, final_mode, series, bo5, p_game_id);
  return null;
exception when unique_violation then
  return 'exists';
end $$;
