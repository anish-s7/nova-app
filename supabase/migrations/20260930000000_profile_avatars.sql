-- Profile icons: a customizable illustrated face (profiles.avatar, a small settings object) and an
-- optional uploaded photo that overrides it (profiles.avatar_url, a public URL in the `avatars`
-- storage bucket). Mirrors db/contract.md.
--
-- Both columns are readable by every signed-in user through the existing "Authenticated users can
-- view profiles" policy (icons are shown to everyone). Writes only go through app/api/avatar
-- (service role, validated), so no new user grant: `authenticated` still may only update
-- display_name. The service role already has table-wide update on profiles (20260926020000).
--
-- The bucket is public-read (avatars are shown to everyone, by URL). There are no storage policies
-- for users: uploads and deletes go through app/api/avatar/photo with the service role, which checks
-- the image and writes only to <profile id>.jpg.
begin;

alter table public.profiles add column if not exists avatar jsonb;
alter table public.profiles add column if not exists avatar_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_avatar_json_object'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_json_object
      check (
        avatar is null
        or jsonb_typeof(avatar) = 'object'
      );
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

commit;
