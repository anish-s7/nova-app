begin;

grant select, insert, update
  on table public.profiles
  to service_role;

grant select, insert
  on table public.songs
  to service_role;

grant select, insert
  on table public.song_picks
  to service_role;

grant select, insert, update
  on table public.connection_cards
  to service_role;

grant select, insert
  on table public.messages
  to service_role;

grant execute
  on function public.match_picks(uuid, integer)
  to service_role;

commit;
