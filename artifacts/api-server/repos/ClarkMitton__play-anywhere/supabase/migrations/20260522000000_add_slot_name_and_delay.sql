-- Add slot name and side-screen delay to slots table
ALTER TABLE public.slots ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.slots ADD COLUMN IF NOT EXISTS screen_delay_secs INTEGER NOT NULL DEFAULT 0;
