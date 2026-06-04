ALTER TABLE public.slots DROP CONSTRAINT IF EXISTS slots_end_behaviour_check;
DELETE FROM public.slots WHERE id = '00000000-0000-0000-0000-000000000abc';