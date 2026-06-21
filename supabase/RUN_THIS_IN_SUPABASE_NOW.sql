alter table public.profiles
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists address text,
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, department_id, locality, address, latitude, longitude)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' in ('citizen', 'ghmc_staff', 'contractor', 'admin')
      then (new.raw_user_meta_data ->> 'role')::public.user_role
      else 'citizen'::public.user_role
    end,
    (select id from public.departments where name = new.raw_user_meta_data ->> 'department_name' limit 1),
    nullif(new.raw_user_meta_data ->> 'locality', ''),
    nullif(new.raw_user_meta_data ->> 'address', ''),
    nullif(new.raw_user_meta_data ->> 'latitude', '')::numeric,
    nullif(new.raw_user_meta_data ->> 'longitude', '')::numeric
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    department_id = coalesce(public.profiles.department_id, excluded.department_id),
    locality = excluded.locality,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "staff can read profiles" on public.profiles;

drop policy if exists "staff read tickets" on public.tickets;
create policy "staff read tickets" on public.tickets for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('ghmc_staff', 'admin'))
);

drop policy if exists "staff manage announcements" on public.announcements;
create policy "staff manage announcements" on public.announcements for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('ghmc_staff', 'admin'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('ghmc_staff', 'admin'))
);
