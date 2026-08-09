-- Cache column for the engineer travel-pay distance rule (see
-- src/lib/postcode-distance.ts, src/lib/travel-distance-settings.ts).
-- Avoids re-geocoding a job's site postcode against the depot on every
-- wage-approval pass. Nullable/additive — nothing existing changes.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS travel_distance_miles numeric;
