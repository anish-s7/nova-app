-- Google and Apple sign-ins put the person's name in `full_name` / `name`, not the
-- `display_name` key email signup sends. Read all three before falling back to the
-- email prefix, so OAuth users don't show up as "jsmith42".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Song Galaxy user'
      ),
      80
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
