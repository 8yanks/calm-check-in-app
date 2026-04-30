
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own profile delete" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Onboarding preferences
CREATE TABLE public.onboarding_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  best_moments TEXT[] NOT NULL DEFAULT '{}',
  main_goal TEXT,
  notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  theme TEXT NOT NULL DEFAULT 'light',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.onboarding_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs select" ON public.onboarding_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.onboarding_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.onboarding_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own prefs delete" ON public.onboarding_preferences FOR DELETE USING (auth.uid() = user_id);

-- Check-ins
CREATE TABLE public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mental_load TEXT NOT NULL,
  calm_level TEXT NOT NULL,
  blocker TEXT NOT NULL,
  immediate_need TEXT NOT NULL,
  state_label TEXT NOT NULL,
  explanation TEXT NOT NULL,
  micro_action TEXT NOT NULL,
  load_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own checkins select" ON public.checkins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own checkins insert" ON public.checkins FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own checkins update" ON public.checkins FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own checkins delete" ON public.checkins FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_checkins_user_created ON public.checkins(user_id, created_at DESC);

-- Weekly summaries
CREATE TABLE public.weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start DATE NOT NULL,
  average_load NUMERIC,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);
ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own weekly select" ON public.weekly_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own weekly insert" ON public.weekly_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own weekly update" ON public.weekly_summaries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own weekly delete" ON public.weekly_summaries FOR DELETE USING (auth.uid() = user_id);

-- Profile progress
CREATE TABLE public.profile_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  percentage INTEGER NOT NULL DEFAULT 0,
  signals_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress select" ON public.profile_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own progress insert" ON public.profile_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own progress update" ON public.profile_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own progress delete" ON public.profile_progress FOR DELETE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.profile_progress (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
