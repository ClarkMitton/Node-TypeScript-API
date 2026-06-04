
-- Sessions table
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID,
  host_code TEXT NOT NULL UNIQUE,
  screen1_code TEXT NOT NULL UNIQUE,
  screen2_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','ended')),
  current_slot_index INTEGER NOT NULL DEFAULT 0,
  screen1_connected BOOLEAN NOT NULL DEFAULT false,
  screen2_connected BOOLEAN NOT NULL DEFAULT false,
  one_screen_mode BOOLEAN NOT NULL DEFAULT false,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- Slots table
CREATE TABLE public.slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  lesson_id UUID,
  order_index INTEGER NOT NULL,
  duration_mins NUMERIC NOT NULL DEFAULT 5,
  end_behaviour TEXT NOT NULL DEFAULT 'manual' CHECK (end_behaviour IN ('timed','submission','manual')),
  pause_before_advance BOOLEAN NOT NULL DEFAULT false,
  lead_phase TEXT,
  host_content JSONB NOT NULL DEFAULT '{"type":"waiting"}'::jsonb,
  screen1_content JSONB NOT NULL DEFAULT '{"type":"waiting"}'::jsonb,
  screen2_content JSONB NOT NULL DEFAULT '{"type":"waiting"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Responses table
CREATE TABLE public.responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES public.slots(id) ON DELETE CASCADE,
  screen_role TEXT NOT NULL,
  response_type TEXT NOT NULL,
  response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lessons table
CREATE TABLE public.lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  estimated_duration_mins INTEGER NOT NULL DEFAULT 30,
  ms_form_url TEXT,
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  resource_bucket JSONB NOT NULL DEFAULT '[]'::jsonb,
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sessions_host_code ON public.sessions(host_code);
CREATE INDEX idx_sessions_screen1_code ON public.sessions(screen1_code);
CREATE INDEX idx_sessions_screen2_code ON public.sessions(screen2_code);
CREATE INDEX idx_slots_session ON public.slots(session_id, order_index);
CREATE INDEX idx_responses_session ON public.responses(session_id);

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- Open policies (kiosk model — codes gate access at app level)
CREATE POLICY "anyone read sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "anyone write sessions" ON public.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone update sessions" ON public.sessions FOR UPDATE USING (true);
CREATE POLICY "anyone delete sessions" ON public.sessions FOR DELETE USING (true);

CREATE POLICY "anyone read slots" ON public.slots FOR SELECT USING (true);
CREATE POLICY "anyone write slots" ON public.slots FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone update slots" ON public.slots FOR UPDATE USING (true);
CREATE POLICY "anyone delete slots" ON public.slots FOR DELETE USING (true);

CREATE POLICY "anyone read responses" ON public.responses FOR SELECT USING (true);
CREATE POLICY "anyone write responses" ON public.responses FOR INSERT WITH CHECK (true);

CREATE POLICY "anyone read lessons" ON public.lessons FOR SELECT USING (true);
CREATE POLICY "anyone write lessons" ON public.lessons FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone update lessons" ON public.lessons FOR UPDATE USING (true);
CREATE POLICY "anyone delete lessons" ON public.lessons FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.slots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.responses;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.slots REPLICA IDENTITY FULL;
ALTER TABLE public.responses REPLICA IDENTITY FULL;

-- Storage bucket: lesson-media (public, 500MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-media',
  'lesson-media',
  true,
  524288000,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif','video/mp4','video/webm','video/quicktime','text/html']
);

CREATE POLICY "public read lesson-media" ON storage.objects FOR SELECT USING (bucket_id = 'lesson-media');
CREATE POLICY "public upload lesson-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'lesson-media');
CREATE POLICY "public update lesson-media" ON storage.objects FOR UPDATE USING (bucket_id = 'lesson-media');
CREATE POLICY "public delete lesson-media" ON storage.objects FOR DELETE USING (bucket_id = 'lesson-media');
