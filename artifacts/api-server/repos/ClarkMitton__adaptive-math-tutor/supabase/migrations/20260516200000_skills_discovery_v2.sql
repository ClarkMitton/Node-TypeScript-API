
-- Drop old schema
DROP TABLE IF EXISTS public.responses CASCADE;
DROP TABLE IF EXISTS public.questions CASCADE;
DROP TABLE IF EXISTS public.scan_sessions CASCADE;
DROP TABLE IF EXISTS public.student_codes CASCADE;

-- ── Groups ────────────────────────────────────────────────────────────────────
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Students (anonymous – unique_id maps to name externally) ──────────────────
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unique_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Category unlock settings ──────────────────────────────────────────────────
CREATE TABLE public.category_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0
);

INSERT INTO public.category_settings (category_key, display_name, is_active, display_order) VALUES
  ('number',                         'Number',                        true,  1),
  ('algebra',                        'Algebra',                       false, 2),
  ('ratio',                          'Ratio',                         false, 3),
  ('statistics',                     'Statistics',                    false, 4),
  ('probability',                    'Probability',                   false, 5),
  ('geometry',                       'Geometry & Measures',           false, 6),
  ('fractions_decimals_percentages', 'Fractions, Decimals & %',      false, 7);

-- ── Sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE public.scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'studio',
  music_used BOOLEAN NOT NULL DEFAULT false,
  music_track TEXT,
  accessibility_settings JSONB,
  completed BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  restored_at TIMESTAMPTZ
);

-- ── Sub-topic results (one row per sub-topic per session) ─────────────────────
CREATE TABLE public.sub_topic_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.scan_sessions(id) ON DELETE CASCADE,
  sub_topic_key TEXT NOT NULL,
  selection_order INT NOT NULL,
  current_grade INT NOT NULL DEFAULT 2,
  g2_attempts INT NOT NULL DEFAULT 0,
  grade_ceiling INT,
  needed_g2_retry BOOLEAN NOT NULL DEFAULT false,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Individual question attempts ──────────────────────────────────────────────
CREATE TABLE public.question_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.scan_sessions(id) ON DELETE CASCADE,
  sub_topic_result_id UUID NOT NULL REFERENCES public.sub_topic_results(id) ON DELETE CASCADE,
  sub_topic_key TEXT NOT NULL,
  grade INT NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  given_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  seconds_taken NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indices ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_students_group ON public.students(group_id);
CREATE INDEX idx_sessions_student ON public.scan_sessions(student_id);
CREATE INDEX idx_subtopic_results_session ON public.sub_topic_results(session_id);
CREATE INDEX idx_attempts_session ON public.question_attempts(session_id);
CREATE INDEX idx_attempts_subtopic ON public.question_attempts(sub_topic_result_id);

-- ── RLS (all access via service role in server functions) ─────────────────────
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_topic_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
