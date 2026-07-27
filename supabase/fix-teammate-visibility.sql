-- Lets teammates see each other's profile (so rosters can show usernames).
-- Safe to run any time.

drop policy if exists profiles_select_teammates on public.profiles;
create policy profiles_select_teammates on public.profiles for select using (
  exists (
    select 1 from public.team_members tm1
    join public.team_members tm2 on tm2.team_id = tm1.team_id
    where tm1.user_id = auth.uid() and tm2.user_id = profiles.id
  )
);
