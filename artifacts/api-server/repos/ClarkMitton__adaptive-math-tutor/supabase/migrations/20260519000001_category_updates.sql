-- Fix fractions display name
UPDATE public.category_settings
SET display_name = 'Fractions, Decimals & Percentages'
WHERE category_key = 'fractions_decimals_percentages';

-- Add 8th category: Exam Questions
INSERT INTO public.category_settings (category_key, display_name, is_active, display_order)
VALUES ('exam_questions', 'Exam Questions', false, 8)
ON CONFLICT (category_key) DO NOTHING;

-- Add bg_image_url column for per-category background override
ALTER TABLE public.category_settings
ADD COLUMN IF NOT EXISTS bg_image_url text;
