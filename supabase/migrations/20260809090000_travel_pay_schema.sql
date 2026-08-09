-- Travel-vs-on-site pay: schema only. Adds the columns needed to record a
-- per-visit travel allowance alongside on-site hours, and a per-user travel
-- rate distinct from the existing hourly_rate. Deliberately additive-only —
-- existing `select("*")` queries against these tables just gain extra
-- (unused-for-now) fields, nothing existing breaks.
--
-- Design context (see Trade Stack - Wages.md "Travel vs on-site pay" note):
-- - Multi-visit jobs: a `timesheets` row already represents one visit
--   (job_id + shift_date), so travel_hours lives there per-visit rather than
--   needing a new "visit" concept. The client signature (`job_completions`)
--   stays a job-level completion event, decoupled from wage calculation —
--   whichever visit happens to be the last one that's signed doesn't need
--   special handling here.
-- - No wage-generation/timesheet-entry UI is built yet — this migration only
--   lays the columns down. See the "Still open" note on the Wages page.
-- - The depot-distance travel-pay trigger is still an open question (shared
--   with client billing, or independent?) — not modeled here; travel_hours
--   is a plain engineer-entered number for now, no distance logic attached.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS travel_rate numeric;

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS travel_hours numeric;

ALTER TABLE public.wages
  ADD COLUMN IF NOT EXISTS travel_hours numeric,
  ADD COLUMN IF NOT EXISTS travel_wage numeric;

-- No RLS changes needed: users/timesheets/wages already have RLS enabled
-- and tenant-scoped policies from earlier migrations; adding columns to an
-- already-covered table doesn't require new policies.
