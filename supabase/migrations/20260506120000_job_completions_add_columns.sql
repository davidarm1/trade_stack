-- Adds a dedicated recommendations column to job_completions.
-- Previously, engineer recommendations were concatenated into work_carried_out
-- with a "\n\nRecommendations:\n" prefix by the mobile app. This column stores
-- them separately so both fields remain independently editable.

ALTER TABLE public.job_completions
  ADD COLUMN IF NOT EXISTS recommendations text;
