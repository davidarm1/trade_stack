-- Public bucket for company logos: object path `{tenant_id}/logo.{ext}` (max size enforced in app: 2MB).
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Each tenant only manages objects under their own folder (first path segment = tenant_id).
DROP POLICY IF EXISTS "tenant_logos_select_own" ON storage.objects;
CREATE POLICY "tenant_logos_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tenant-logos'
    AND split_part(name, '/', 1) = (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_logos_insert_own" ON storage.objects;
CREATE POLICY "tenant_logos_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-logos'
    AND split_part(name, '/', 1) = (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_logos_update_own" ON storage.objects;
CREATE POLICY "tenant_logos_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'tenant-logos'
    AND split_part(name, '/', 1) = (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'tenant-logos'
    AND split_part(name, '/', 1) = (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_logos_delete_own" ON storage.objects;
CREATE POLICY "tenant_logos_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tenant-logos'
    AND split_part(name, '/', 1) = (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );
