alter type public.ticket_status add value if not exists 'not_started';
alter type public.ticket_status add value if not exists 'pending';
alter type public.ticket_status add value if not exists 'closed';

alter table public.profiles
  add column if not exists zone text,
  add column if not exists assigned_ghmc_office text;

create index if not exists profiles_zone_idx on public.profiles(zone);
create index if not exists profiles_assigned_ghmc_office_idx on public.profiles(assigned_ghmc_office);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, locality, address, latitude, longitude, zone, assigned_ghmc_office)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' in ('citizen', 'ghmc_staff', 'contractor', 'admin')
      then (new.raw_user_meta_data ->> 'role')::public.user_role
      else 'citizen'::public.user_role
    end,
    nullif(new.raw_user_meta_data ->> 'locality', ''),
    nullif(new.raw_user_meta_data ->> 'address', ''),
    nullif(new.raw_user_meta_data ->> 'latitude', '')::numeric,
    nullif(new.raw_user_meta_data ->> 'longitude', '')::numeric,
    nullif(new.raw_user_meta_data ->> 'zone', ''),
    nullif(new.raw_user_meta_data ->> 'assigned_ghmc_office', '')
  );
  return new;
end;
$$;
