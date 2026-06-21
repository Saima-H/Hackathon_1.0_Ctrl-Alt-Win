insert into public.departments (name, sla_hours, contact_email) values
  ('Roads & Maintenance', 72, 'roads@ghmc.gov.in'),
  ('Drainage Department', 24, 'drainage@ghmc.gov.in'),
  ('Urban Forestry', 48, 'forestry@ghmc.gov.in'),
  ('Electrical Department', 36, 'electrical@ghmc.gov.in')
on conflict (name) do nothing;
