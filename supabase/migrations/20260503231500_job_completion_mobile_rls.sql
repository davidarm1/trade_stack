-- Allow mobile engineers to submit completion details and field photos
-- for jobs assigned to them.

REVOKE ALL ON TABLE public.job_completions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.job_completions TO authenticated;

ALTER TABLE public.job_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_completions_select_by_role" ON public.job_completions;
CREATE POLICY "job_completions_select_by_role"
  ON public.job_completions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_role() IN ('owner', 'office', 'viewer')
      OR (
        public.current_user_role() = 'engineer'
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_completions.job_id
            AND j.tenant_id = job_completions.tenant_id
            AND j.assigned_engineer_id = auth.uid()
            AND j.deleted_at IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "job_completions_insert_by_role" ON public.job_completions;
CREATE POLICY "job_completions_insert_by_role"
  ON public.job_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_role() IN ('owner', 'office')
      OR (
        public.current_user_role() = 'engineer'
        AND engineer_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_completions.job_id
            AND j.tenant_id = job_completions.tenant_id
            AND j.assigned_engineer_id = auth.uid()
            AND j.deleted_at IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "job_completions_update_by_role" ON public.job_completions;
CREATE POLICY "job_completions_update_by_role"
  ON public.job_completions
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_role() IN ('owner', 'office')
      OR (
        public.current_user_role() = 'engineer'
        AND engineer_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_completions.job_id
            AND j.tenant_id = job_completions.tenant_id
            AND j.assigned_engineer_id = auth.uid()
            AND j.deleted_at IS NULL
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_role() IN ('owner', 'office')
      OR (
        public.current_user_role() = 'engineer'
        AND engineer_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_completions.job_id
            AND j.tenant_id = job_completions.tenant_id
            AND j.assigned_engineer_id = auth.uid()
            AND j.deleted_at IS NULL
        )
      )
    )
  );

REVOKE ALL ON TABLE public.job_images FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.job_images TO authenticated;

ALTER TABLE public.job_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_images_select_by_role" ON public.job_images;
CREATE POLICY "job_images_select_by_role"
  ON public.job_images
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_role() IN ('owner', 'office', 'viewer')
      OR (
        public.current_user_role() = 'engineer'
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_images.job_id
            AND j.tenant_id = job_images.tenant_id
            AND j.assigned_engineer_id = auth.uid()
            AND j.deleted_at IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "job_images_insert_by_role" ON public.job_images;
CREATE POLICY "job_images_insert_by_role"
  ON public.job_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_role() IN ('owner', 'office')
      OR (
        public.current_user_role() = 'engineer'
        AND uploaded_by_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_images.job_id
            AND j.tenant_id = job_images.tenant_id
            AND j.assigned_engineer_id = auth.uid()
            AND j.deleted_at IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "job_images_update_by_role" ON public.job_images;
CREATE POLICY "job_images_update_by_role"
  ON public.job_images
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office')
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office')
  );
