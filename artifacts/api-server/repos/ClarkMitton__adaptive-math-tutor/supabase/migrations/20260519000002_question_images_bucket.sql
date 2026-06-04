-- Create public storage bucket for question images
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admin uploads (no auth restriction — admin password is enforced server-side)
CREATE POLICY IF NOT EXISTS "Admin upload question images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'question-images');

-- Allow public read
CREATE POLICY IF NOT EXISTS "Public read question images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'question-images');
