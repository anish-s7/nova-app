-- AI listening portraits: Gemini's reading of a profile's public picks
-- (lib/gemini/generatePortrait.ts). Its own table, not a profiles column, because every
-- signed-in user can read every profiles column; a portrait is only readable by its owner.
-- Other people's portraits are used server-side (service role) to assess connections and
-- only ever reach another user through a Connection Card.
begin;

create table if not exists public.profile_portraits (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  portrait jsonb not null,
  pick_count int not null,
  model text not null,
  updated_at timestamptz not null default now(),
  constraint profile_portraits_json_object check (jsonb_typeof(portrait) = 'object')
);

alter table public.profile_portraits enable row level security;

create policy "Owners can view their own portrait"
  on public.profile_portraits for select
  to authenticated
  using (profile_id = auth.uid());

revoke all on table public.profile_portraits from anon, authenticated;
grant select on table public.profile_portraits to authenticated;
grant select, insert, update on table public.profile_portraits to service_role;

commit;
