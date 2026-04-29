alter table public.settings
  alter column field_value type text using field_value::text;
