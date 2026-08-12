-- Allow mobile engineers to submit completion details and field photos
AND j.assigned_engineer_membership_id = public.current_user_membership_id()

REVOKE ALL ON TABLE public.job_completions FROM PUBLIC;
AND j.assigned_engineer_membership_id = public.current_user_membership_id()

AND j.assigned_engineer_membership_id = public.current_user_membership_id()

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
            AND j.assigned_engineer_membership_id = public.current_user_membership_id()
            AND j.deleted_at IS NULL
        )
      )
    )
  AND j.assigned_engineer_membership_id = public.current_user_membership_id()

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
        AND engineer_membership_id = public.current_user_membership_id()
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_completions.job_id
            AND j.tenant_id = job_completions.tenant_id
            AND j.assigned_engineer_membership_id = public.current_user_membership_id()
            AND j.deleted_at IS NULL
        )
      )
    )
  AND j.assigned_engineer_membership_id = public.current_user_membership_id()

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
        AND engineer_membership_id = public.current_user_membership_id()
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_completions.job_id
            AND j.tenant_id = job_completions.tenant_id
            AND j.assigned_engineer_membership_id = public.current_user_membership_id()
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
        AND engineer_membership_id = public.current_user_membership_id()
        AND EXISTS (
          SELECT 1
          FROM public.jobs j
          WHERE j.id = job_completions.job_id
            AND j.tenant_id = job_completions.tenant_id
            AND j.assigned_engineer_membership_id = public.current_user_membership_id()
            AND j.deleted_at IS NULL
        )
      )
    )
  AND j.assigned_engineer_membership_id = public.current_user_membership_id()

REVOKE ALL ON TABLE public.job_images FROM PUBLIC;
AND j.assigned_engineer_membership_id = public.current_user_membership_id()

AND j.assigned_engineer_membership_id = public.current_user_membership_id()

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
            AND j.assigned_engineer_membership_id = public.current_user_membership_id()
            AND j.deleted_at IS NULL
        )
      )
    )
  AND j.assigned_engineer_membership_id = public.current_user_membership_id()

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
            AND j.assigned_engineer_membership_id = public.current_user_membership_id()
            AND j.deleted_at IS NULL
        )
      )
    )
  AND j.assigned_engineer_membership_id = public.current_user_membership_id()

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
  AND j.assigned_engineer_membership_id = public.current_user_membership_id()
