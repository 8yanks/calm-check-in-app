-- =========================================================
-- Marge — schema hardening migration (idempotent)
-- =========================================================

-- ---------- Shared updated_at trigger function ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- profiles
-- =========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "own profile select" ON public.profiles;
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
DROP POLICY IF EXISTS "own profile delete" ON public.profiles;

CREATE POLICY "own profile select" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile delete" ON public.profiles
  FOR DELETE TO authenticated USING (auth.uid() = id);

-- =========================================================
-- onboarding_preferences
-- =========================================================
ALTER TABLE public.onboarding_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_preferences
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- One row per user
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'onboarding_preferences_user_id_key'
  ) THEN
    ALTER TABLE public.onboarding_preferences
      ADD CONSTRAINT onboarding_preferences_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- theme bounded
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'onboarding_preferences_theme_check'
  ) THEN
    ALTER TABLE public.onboarding_preferences
      ADD CONSTRAINT onboarding_preferences_theme_check
      CHECK (theme IN ('light','dark'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_onboarding_preferences_updated_at ON public.onboarding_preferences;
CREATE TRIGGER trg_onboarding_preferences_updated_at
BEFORE UPDATE ON public.onboarding_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "own prefs select" ON public.onboarding_preferences;
DROP POLICY IF EXISTS "own prefs insert" ON public.onboarding_preferences;
DROP POLICY IF EXISTS "own prefs update" ON public.onboarding_preferences;
DROP POLICY IF EXISTS "own prefs delete" ON public.onboarding_preferences;

CREATE POLICY "own prefs select" ON public.onboarding_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.onboarding_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.onboarding_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs delete" ON public.onboarding_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- checkins
-- =========================================================
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.checkins
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- load_score bounded
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'checkins_load_score_check'
  ) THEN
    ALTER TABLE public.checkins
      ADD CONSTRAINT checkins_load_score_check
      CHECK (load_score BETWEEN 0 AND 10);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_checkins_user_created
  ON public.checkins (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_checkins_updated_at ON public.checkins;
CREATE TRIGGER trg_checkins_updated_at
BEFORE UPDATE ON public.checkins
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "own checkins select" ON public.checkins;
DROP POLICY IF EXISTS "own checkins insert" ON public.checkins;
DROP POLICY IF EXISTS "own checkins update" ON public.checkins;
DROP POLICY IF EXISTS "own checkins delete" ON public.checkins;

CREATE POLICY "own checkins select" ON public.checkins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own checkins insert" ON public.checkins
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own checkins update" ON public.checkins
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own checkins delete" ON public.checkins
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- profile_progress
-- =========================================================
ALTER TABLE public.profile_progress ENABLE ROW LEVEL SECURITY;

-- Ensure one row per user (user_id should be primary key already, but enforce uniqueness defensively)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profile_progress_user_id_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profile_progress'::regclass
      AND contype IN ('p','u')
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.profile_progress'::regclass AND attname = 'user_id')]
  ) THEN
    ALTER TABLE public.profile_progress
      ADD CONSTRAINT profile_progress_user_id_key UNIQUE (user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profile_progress_percentage_check'
  ) THEN
    ALTER TABLE public.profile_progress
      ADD CONSTRAINT profile_progress_percentage_check
      CHECK (percentage BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profile_progress_signals_count_check'
  ) THEN
    ALTER TABLE public.profile_progress
      ADD CONSTRAINT profile_progress_signals_count_check
      CHECK (signals_count >= 0);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_profile_progress_updated_at ON public.profile_progress;
CREATE TRIGGER trg_profile_progress_updated_at
BEFORE UPDATE ON public.profile_progress
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "own progress select" ON public.profile_progress;
DROP POLICY IF EXISTS "own progress insert" ON public.profile_progress;
DROP POLICY IF EXISTS "own progress update" ON public.profile_progress;
DROP POLICY IF EXISTS "own progress delete" ON public.profile_progress;

CREATE POLICY "own progress select" ON public.profile_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own progress insert" ON public.profile_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own progress update" ON public.profile_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own progress delete" ON public.profile_progress
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- weekly_summaries
-- =========================================================
ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.weekly_summaries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_summaries_user_week_key'
  ) THEN
    ALTER TABLE public.weekly_summaries
      ADD CONSTRAINT weekly_summaries_user_week_key UNIQUE (user_id, week_start);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_summaries_average_load_check'
  ) THEN
    ALTER TABLE public.weekly_summaries
      ADD CONSTRAINT weekly_summaries_average_load_check
      CHECK (average_load IS NULL OR average_load BETWEEN 0 AND 10);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_weekly_summaries_user_week
  ON public.weekly_summaries (user_id, week_start DESC);

DROP TRIGGER IF EXISTS trg_weekly_summaries_updated_at ON public.weekly_summaries;
CREATE TRIGGER trg_weekly_summaries_updated_at
BEFORE UPDATE ON public.weekly_summaries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "own weekly select" ON public.weekly_summaries;
DROP POLICY IF EXISTS "own weekly insert" ON public.weekly_summaries;
DROP POLICY IF EXISTS "own weekly update" ON public.weekly_summaries;
DROP POLICY IF EXISTS "own weekly delete" ON public.weekly_summaries;

CREATE POLICY "own weekly select" ON public.weekly_summaries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own weekly insert" ON public.weekly_summaries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own weekly update" ON public.weekly_summaries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own weekly delete" ON public.weekly_summaries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- Signup trigger — idempotent
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profile_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
