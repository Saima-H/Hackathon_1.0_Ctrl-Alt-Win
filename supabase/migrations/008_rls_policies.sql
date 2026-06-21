alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_media enable row level security;
alter table public.ticket_updates enable row level security;
alter table public.community_votes enable row level security;
alter table public.ticket_feedback enable row level security;
alter table public.safety_scores enable row level security;
alter table public.announcements enable row level security;
alter table public.projects enable row level security;
alter table public.staff_activity enable row level security;

create policy "public civic intelligence is readable" on public.safety_scores for select using (true);
create policy "published announcements are readable" on public.announcements for select using (published_at <= now());
create policy "citizens create reports" on public.tickets for insert to authenticated with check (reporter_id = auth.uid() or anonymous);
create policy "citizens see own or public tickets" on public.tickets for select to authenticated using (reporter_id = auth.uid() or anonymous);
create policy "citizens update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "users see own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "citizens vote once" on public.community_votes for insert to authenticated with check (voter_id = auth.uid());
create policy "citizens read votes" on public.community_votes for select to authenticated using (true);
create policy "citizens add own feedback" on public.ticket_feedback for insert to authenticated with check (citizen_id = auth.uid());
create policy "citizens read own feedback" on public.ticket_feedback for select to authenticated using (citizen_id = auth.uid());
create policy "citizens read report media" on public.ticket_media for select to authenticated using (true);
create policy "citizens upload report media" on public.ticket_media for insert to authenticated with check (uploaded_by = auth.uid());

create policy "authenticated upload ticket media" on storage.objects for insert to authenticated
with check (bucket_id = 'ticket-media');
create policy "authenticated read ticket media" on storage.objects for select to authenticated
using (bucket_id = 'ticket-media');

-- Use server-side service-role operations or add staff-specific JWT claim policies
-- for GHMC mutations such as assignment, escalation and publishing.
