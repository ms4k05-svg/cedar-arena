-- Adds a permanent, universal 10-digit Player ID to every account.
-- Safe to run any time; backfills existing accounts too.

alter table public.profiles add column if not exists player_id text;

create or replace function public.generate_player_id()
returns text language plpgsql as $$
declare
  candidate text;
  clash boolean;
begin
  loop
    candidate := lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
    select exists(select 1 from public.profiles where player_id = candidate) into clash;
    exit when not clash;
  end loop;
  return candidate;
end $$;

update public.profiles set player_id = public.generate_player_id() where player_id is null;

alter table public.profiles alter column player_id set not null;
drop index if exists profiles_player_id_key;
create unique index profiles_player_id_key on public.profiles (player_id);
alter table public.profiles drop constraint if exists profiles_player_id_format;
alter table public.profiles add constraint profiles_player_id_format check (player_id ~ '^[0-9]{10}$');

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
  insert into public.profiles (id, email, username, phone, player_tag, role, player_id)
  values (new.id, new.email, uname, uphone, utag, case when is_first then 'admin' else 'player' end, public.generate_player_id());
  return new;
end $$;
