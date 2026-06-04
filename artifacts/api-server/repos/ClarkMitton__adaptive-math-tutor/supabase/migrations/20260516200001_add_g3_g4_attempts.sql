-- Add per-grade attempt counters for G3 and G4 to support 2-attempt logic
ALTER TABLE public.sub_topic_results
  ADD COLUMN IF NOT EXISTS g3_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS g4_attempts INT NOT NULL DEFAULT 0;
