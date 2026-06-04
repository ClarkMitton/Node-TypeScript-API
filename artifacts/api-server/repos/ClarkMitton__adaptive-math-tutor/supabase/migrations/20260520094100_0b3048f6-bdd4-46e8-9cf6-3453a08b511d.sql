
-- 1. Category updates
UPDATE public.category_settings
SET display_name = 'Fractions, Decimals & Percentages'
WHERE category_key = 'fractions_decimals_percentages';

INSERT INTO public.category_settings (category_key, display_name, is_active, display_order)
VALUES ('exam_questions', 'Exam Questions', false, 8)
ON CONFLICT (category_key) DO NOTHING;

ALTER TABLE public.category_settings
ADD COLUMN IF NOT EXISTS bg_image_url text;

-- 2. Question images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin upload question images" ON storage.objects;
CREATE POLICY "Admin upload question images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'question-images');

DROP POLICY IF EXISTS "Public read question images" ON storage.objects;
CREATE POLICY "Public read question images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'question-images');

DROP POLICY IF EXISTS "Admin update question images" ON storage.objects;
CREATE POLICY "Admin update question images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'question-images');

DROP POLICY IF EXISTS "Admin delete question images" ON storage.objects;
CREATE POLICY "Admin delete question images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'question-images');

-- 3. Sub-topics table
CREATE TABLE IF NOT EXISTS public.sub_topics (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key  text         NOT NULL REFERENCES public.category_settings(category_key) ON DELETE CASCADE,
  sub_topic_key text         NOT NULL,
  display_name  text         NOT NULL,
  display_order int          NOT NULL DEFAULT 0,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  UNIQUE(category_key, sub_topic_key)
);

ALTER TABLE public.sub_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read sub_topics" ON public.sub_topics;
CREATE POLICY "Public read sub_topics" ON public.sub_topics FOR SELECT USING (true);

INSERT INTO public.sub_topics (category_key, sub_topic_key, display_name, display_order) VALUES
  ('number', 'place_value',                 'Place Value',                  1),
  ('number', 'addition',                    'Addition',                     2),
  ('number', 'subtraction',                 'Subtraction',                  3),
  ('number', 'multiplication',              'Multiplication',               4),
  ('number', 'division',                    'Division',                     5),
  ('number', 'negative_numbers',            'Negative Numbers',             6),
  ('number', 'rounding_estimation',         'Rounding & Estimation',        7),
  ('number', 'factors_multiples',           'Factors & Multiples',          8),
  ('number', 'prime_numbers',               'Prime Numbers',                9),
  ('number', 'prime_factor_decomposition',  'Prime Factor Decomposition',  10),
  ('number', 'square_cube_numbers',         'Square & Cube Numbers',       11),
  ('number', 'indices',                     'Indices',                     12),
  ('number', 'ordering_numbers',            'Ordering Numbers',            13),
  ('number', 'significant_figures',         'Significant Figures',         14),
  ('number', 'standard_form',               'Standard Form',               15),
  ('number', 'problem_solving',             'Problem Solving',             16)
ON CONFLICT (category_key, sub_topic_key) DO NOTHING;

-- 4. Questions category_key
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS category_key text NOT NULL DEFAULT 'number';

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_sub_topic_key_grade_key;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_category_sub_topic_grade_key;
ALTER TABLE public.questions ADD CONSTRAINT questions_category_sub_topic_grade_key
  UNIQUE (category_key, sub_topic_key, grade);
