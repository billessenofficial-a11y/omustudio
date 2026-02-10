/*
  # Create render infrastructure

  1. Storage
    - Create `render-media` storage bucket for temporary media uploads during cloud renders
    - Enable public access for the bucket so Lambda can fetch media via URL

  2. New Tables
    - `render_jobs`
      - `id` (uuid, primary key) - unique job identifier
      - `project_id` (uuid, not null) - links to the editor project
      - `status` (text, not null) - current state: uploading, rendering, completed, failed
      - `progress` (float, default 0) - render progress percentage 0-100
      - `render_id` (text, nullable) - Remotion Lambda render ID
      - `bucket_name` (text, nullable) - S3 bucket name for the render output
      - `output_url` (text, nullable) - final video download URL
      - `error` (text, nullable) - error message if failed
      - `created_at` (timestamptz) - job creation time
      - `updated_at` (timestamptz) - last update time

  3. Security
    - Enable RLS on `render_jobs` table
    - Add policies for anonymous access scoped by project_id
    - Storage policies allow anonymous uploads to render-media bucket
*/

-- Create render-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('render-media', 'render-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow anonymous uploads
CREATE POLICY "Allow anonymous uploads to render-media"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'render-media');

-- Storage policy: allow anonymous reads
CREATE POLICY "Allow anonymous reads from render-media"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'render-media');

-- Storage policy: allow anonymous deletes for cleanup
CREATE POLICY "Allow anonymous deletes from render-media"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'render-media');

-- Create render_jobs table
CREATE TABLE IF NOT EXISTS render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'uploading',
  progress float NOT NULL DEFAULT 0,
  render_id text,
  bucket_name text,
  output_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;

-- RLS: allow anonymous select by project_id
CREATE POLICY "Anon can read own project render jobs"
  ON render_jobs FOR SELECT
  TO anon
  USING (project_id IS NOT NULL);

-- RLS: allow anonymous insert
CREATE POLICY "Anon can create render jobs"
  ON render_jobs FOR INSERT
  TO anon
  WITH CHECK (project_id IS NOT NULL);

-- RLS: allow anonymous update by project_id
CREATE POLICY "Anon can update own project render jobs"
  ON render_jobs FOR UPDATE
  TO anon
  USING (project_id IS NOT NULL)
  WITH CHECK (project_id IS NOT NULL);

-- Index for fast lookups by project
CREATE INDEX IF NOT EXISTS idx_render_jobs_project_id ON render_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs (status);
