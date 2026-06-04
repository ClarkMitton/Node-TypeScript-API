-- Sub-topics table for multi-category support
CREATE TABLE IF NOT EXISTS public.sub_topics (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key  text         NOT NULL REFERENCES public.category_settings(category_key) ON DELETE CASCADE,
  sub_topic_key text         NOT NULL,
  display_name  text         NOT NULL,
  display_order int          NOT NULL DEFAULT 0,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  UNIQUE(category_key, sub_topic_key)
);

-- Pre-populate with all 16 Number sub-topics (matching NUMBER_SUB_TOPICS keys exactly)
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
