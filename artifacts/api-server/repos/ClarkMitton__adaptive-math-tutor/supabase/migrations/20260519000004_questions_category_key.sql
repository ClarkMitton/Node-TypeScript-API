-- Add category_key to questions table for multi-category support
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS category_key text NOT NULL DEFAULT 'number';

-- Update UNIQUE constraint to include category_key
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_sub_topic_key_grade_key;
ALTER TABLE public.questions ADD CONSTRAINT questions_category_sub_topic_grade_key
  UNIQUE (category_key, sub_topic_key, grade);
