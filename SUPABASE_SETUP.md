# Supabase Setup

## 1. Put your keys here

Copy `.env.example` to `apps/web/.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
NEXT_PUBLIC_MAPBOX_TOKEN=YOUR_OPTIONAL_MAPBOX_PUBLIC_TOKEN
AI_DETECTOR_URL=http://localhost:8000
```

Find the Supabase URL and anon key in **Supabase Dashboard → Project Settings → API**.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe for browser use when Row Level Security is enabled. Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code or prefix it with `NEXT_PUBLIC_`. Use it only in server routes, webhooks and edge functions.

## 2. Create the tables

Open **Supabase Dashboard → SQL Editor** and run these files in order:

1. `supabase/migrations/001_init_users.sql`
2. `supabase/migrations/008_rls_policies.sql`
3. `supabase/seed/departments.sql`
4. `supabase/migrations/009_live_app_fixes.sql` if you already ran the first migrations before this update

The migration creates:

| Table | Purpose |
| --- | --- |
| `profiles` | Citizen, GHMC staff, contractor and admin profiles |
| `departments` | Roads, drainage, forestry and electrical teams |
| `wards` | Ward boundaries and division metadata |
| `tickets` | Civic complaints, GPS data, assignment, SLA and AI classification |
| `ticket_media` | Report, before/after and completion-proof uploads |
| `ticket_updates` | Live lifecycle events and internal notes |
| `community_votes` | Confirm, duplicate and spam validation votes |
| `ticket_feedback` | Citizen rating after resolution |
| `safety_scores` | Locality and ward safety score history |
| `announcements` | Emergency alerts, closures and maintenance notices |
| `projects` | Budget, contractor and project completion tracking |
| `staff_activity` | GHMC workforce and contractor activity audit trail |

The migration also creates the private `ticket-media` Storage bucket.

## 3. Authentication

Enable **Email** under **Authentication → Providers**. The UI includes one common login/signup page at `/login` with citizen and GHMC portal selection.

### Production email confirmation

For the deployed app at `https://saimahackathondep.vercel.app`, open **Authentication → URL Configuration** in Supabase and set:

- **Site URL:** `https://saimahackathondep.vercel.app`
- **Redirect URLs:** `https://saimahackathondep.vercel.app/login` (and `http://localhost:3000/login` only for local development)

This prevents confirmation links from opening `localhost`. The app also supplies its current `/login` URL as the confirmation redirect when a user signs up.

Supabase's built-in email sender is intentionally rate-limited. For a public deployment, configure a transactional SMTP provider in **Project Settings → Auth → SMTP Settings** (for example Resend, Postmark, or SendGrid), using a verified sending domain. Until SMTP is configured, wait for the quota window to reset before requesting another confirmation email; repeatedly retrying only extends the outage for testers.

Before production launch, create staff accounts manually and set their `profiles.role` to `ghmc_staff` or `admin`. Keep GHMC assignment, escalation and publishing mutations server-side with the service-role key or add staff JWT claim policies.
