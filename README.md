# Trade Stack

Trade Stack is a multi-tenant SaaS starter for field-service businesses: jobs, quotes, clients, receipts, timesheets, wages, and team management. It is built with **Next.js (App Router)**, **Supabase** (Auth + PostgreSQL), and is ready to deploy on **Vercel**.

## Local setup

1. **Clone or copy** this project and install dependencies:

   ```bash
   npm install
   ```

2. **Environment variables** — copy `.env.example` to `.env.local` and fill in your Supabase values:

   ```bash
   cp .env.example .env.local
   ```

   Required keys:

   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL from the Supabase dashboard (Settings → API).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `anon` `public` key (same page).
   - `SUPABASE_SERVICE_ROLE_KEY` — `service_role` secret (server-only). Used for trusted bootstrap such as creating the tenant and owner profile after sign-up. **Never expose this in the browser.**

3. **Run the dev server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Unauthenticated visitors are sent to `/login`; after login, they land on `/dashboard`.

4. **Database** — Create tables in Supabase that match `src/types/database.ts` (or generate types from your schema). Enable **Row Level Security** and policies so each tenant only sees rows where `tenant_id` matches the current user’s profile. The app scopes server actions by `tenant_id` in code; RLS is still required for direct API access.

5. **Node.js** — Prefer **Node 20+** (recommended by current Next.js and Supabase packages). The scaffold was generated with Next.js 14 for compatibility with environments on Node 18; you can upgrade to the latest Next.js once you are on Node 20+.

## Supabase setup notes

- In the [Supabase Dashboard](https://supabase.com/dashboard), select your project → **Settings** → **API**.
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`.
- **Project API keys** → use the `anon` `public` key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep server-side only).
- **Auth** → configure email/password (and optional email confirmation). If confirmation is required, adjust the registration flow so users complete onboarding after verifying email.
- **Database** — align tables with `src/types/database.ts`; link `public.users.id` to `auth.users.id` for the owner row created at registration.

## Vercel deployment

1. Push the repository to GitHub/GitLab/Bitbucket.
2. In [Vercel](https://vercel.com), **Import** the repository.
3. Framework preset: **Next.js** (see `vercel.json`).
4. Add the same environment variables as in `.env.local` (including `SUPABASE_SERVICE_ROLE_KEY` as a server-only env var).
5. Deploy. Vercel runs `npm install` and `npm run build` by default.

## Project layout (high level)

- `src/lib/supabase/` — Browser and server Supabase clients (`@supabase/ssr`), middleware session refresh, optional service-role client for bootstrap.
- `src/middleware.ts` — Refreshes sessions; protects app routes; redirects `/login` ↔ `/dashboard` when appropriate.
- `src/actions/` — Server Actions for auth, jobs, clients, quotes, etc., scoped by `tenant_id`.
- `src/app/(auth)/` — Login and register.
- `src/app/(dashboard)/` — Sidebar layout and feature pages.

## Notes

- `@supabase/auth-helpers-nextjs` is installed as requested; session handling uses `@supabase/ssr` (`createBrowserClient` / `createServerClient`) per current Supabase guidance.
- Several UI flows include `TODO` comments where you will wire Storage uploads, PDFs, email, or Supabase invites.
