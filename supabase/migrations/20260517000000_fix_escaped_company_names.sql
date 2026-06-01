-- Fix legacy import artefact: company names stored with spurious backslash escaping
-- e.g. "Belushi\\'s" (two backslashes before apostrophe) should be "Belushi's"
--
-- DRY-RUN query to preview affected rows before the update runs:
-- SELECT id, company_name,
--        regexp_replace(company_name, E'\\\\+''', E'\\'', 'g') AS fixed_name
-- FROM clients
-- WHERE company_name ~ E'\\\\';

-- Fix all rows where company_name contains one or more backslashes before an apostrophe
UPDATE clients
SET company_name = regexp_replace(company_name, E'\\\\+('')', E'\\1', 'g')
WHERE company_name ~ E'\\\\';

-- Also fix contact_name in clients table if affected
UPDATE clients
SET contact_name = regexp_replace(contact_name, E'\\\\+('')', E'\\1', 'g')
WHERE contact_name ~ E'\\\\';
