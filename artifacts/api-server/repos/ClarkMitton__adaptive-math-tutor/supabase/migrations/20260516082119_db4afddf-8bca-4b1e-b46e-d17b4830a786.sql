ALTER TABLE public.sub_topic_results
  ADD COLUMN IF NOT EXISTS g3_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS g4_attempts integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_topic_key text NOT NULL,
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 4),
  question_text text NOT NULL,
  accepted_answers text[] NOT NULL DEFAULT '{}',
  image_search_term text,
  custom_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_subtopic_grade
  ON public.questions (sub_topic_key, grade);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;