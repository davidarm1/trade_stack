-- Allow long tenant settings (e.g. AI master prompts). varchar(n) rejects long values.
alter table public.settings
  alter column field_value type text using field_value::text;
