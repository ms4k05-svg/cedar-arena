-- Fixes an "ambiguous column reference" bug that blocked reporting match winners
-- and a matching bug in the undo-result function. Safe to run any time.

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
    select elem from jsonb_array_elements(rounds) with ordinality as x(elem, ord)
    where ord - 1 <= p_round_idx
  ) s;
  round := jsonb_set(rounds -> p_round_idx, array[p_match_idx::text, 'winner'], 'null'::jsonb);
  rounds := jsonb_set(rounds, array[p_round_idx::text], round);
  update public.tournaments set bracket = jsonb_set(t.bracket, '{rounds}', rounds), champion = null
  where id = p_tournament_id;
end $$;
