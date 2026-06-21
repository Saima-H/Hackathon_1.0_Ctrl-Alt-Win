create extension if not exists "pgcrypto";

create type public.user_role as enum ('citizen', 'ghmc_staff', 'contractor', 'admin');
create type public.ticket_status as enum ('reported', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected');
create type public.severity_level as enum ('low', 'medium', 'high', 'critical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role public.user_role not null default 'citizen',
  department_id uuid,
  locality text,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  ward_no integer,
  civic_score integer not null default 0,
  trusted_citizen boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sla_hours integer not null default 72,
  contact_email text,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_department_id_fkey
  foreign key (department_id) references public.departments(id) on delete set null;

create table public.wards (
  id uuid primary key default gen_random_uuid(),
  ward_no integer not null unique,
  name text not null,
  division text,
  boundary_geojson jsonb,
  created_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default ('RW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  reporter_id uuid references public.profiles(id) on delete set null,
  anonymous boolean not null default false,
  issue_type text not null,
  title text not null,
  description text,
  severity public.severity_level not null default 'medium',
  status public.ticket_status not null default 'reported',
  latitude numeric(10,7),
  longitude numeric(10,7),
  address text,
  locality text,
  ward_id uuid references public.wards(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  contractor_id uuid references public.profiles(id) on delete set null,
  sla_due_at timestamptz,
  estimated_resolution_at timestamptz,
  resolved_at timestamptz,
  ai_classification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_media (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  media_kind text not null check (media_kind in ('report', 'before', 'after', 'completion_proof')),
  storage_path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table public.ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  status public.ticket_status,
  note text,
  internal_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.community_votes (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('confirm', 'duplicate', 'spam')),
  created_at timestamptz not null default now(),
  primary key (ticket_id, voter_id)
);

create table public.ticket_feedback (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  citizen_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table public.safety_scores (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid references public.wards(id) on delete cascade,
  locality text not null,
  score integer not null check (score between 0 and 100),
  factors jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  category text not null,
  severity public.severity_level not null default 'low',
  locality text,
  ward_id uuid references public.wards(id) on delete set null,
  published_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid references public.wards(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  contractor_id uuid references public.profiles(id) on delete set null,
  name text not null,
  budget numeric(14,2) not null default 0,
  spent numeric(14,2) not null default 0,
  completion_percent integer not null default 0 check (completion_percent between 0 and 100),
  approval_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.staff_activity (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, locality, address, latitude, longitude)
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
    nullif(new.raw_user_meta_data ->> 'longitude', '')::numeric
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create index tickets_status_idx on public.tickets(status);
create index tickets_locality_idx on public.tickets(locality);
create index tickets_department_idx on public.tickets(department_id);
create index tickets_created_idx on public.tickets(created_at desc);

insert into storage.buckets (id, name, public)
values ('ticket-media', 'ticket-media', false)
on conflict (id) do nothing;
