-- Create storage bucket for teaching videos
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('teaching-videos', 'teaching-videos', false, 524288000)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload videos (for future auth)
-- For now, allow anonymous uploads with service role validation in edge functions
CREATE POLICY "Allow public uploads to teaching-videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'teaching-videos');

-- Allow reading own uploads (using folder path as identifier)
CREATE POLICY "Allow public read from teaching-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'teaching-videos');

-- Allow deletion (cleanup after processing)
CREATE POLICY "Allow public delete from teaching-videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'teaching-videos');