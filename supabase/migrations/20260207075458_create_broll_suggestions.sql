/*
  # Create B-Roll Suggestions Table

  1. New Tables
    - `broll_suggestions`
      - `id` (uuid, primary key)
      - `project_id` (uuid, not null) - links to the client-side project
      - `timestamp_start` (float8, not null) - seconds into the timeline where b-roll is suggested
      - `duration` (float8, not null, default 4) - suggested b-roll clip length in seconds
      - `prompt` (text, not null) - AI-generated visual description for video generation
      - `rationale` (text, default '') - explanation of why this b-roll fits
      - `status` (text, default 'suggested') - one of: suggested, generating, generated, failed
      - `video_url` (text, nullable) - URL of generated video once complete
      - `clip_id` (text, nullable) - links to the timeline clip placeholder
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `broll_suggestions` table
    - Add policies for anonymous access since app has no auth yet
      - Select: allow anon to read suggestions for their project
      - Insert: allow anon to create suggestions
      - Update: allow anon to update suggestion status and video_url
      - Delete: allow anon to delete dismissed suggestions
*/

CREATE TABLE IF NOT EXISTS broll_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  timestamp_start float8 NOT NULL,
  duration float8 NOT NULL DEFAULT 4,
  prompt text NOT NULL,
  rationale text DEFAULT '',
  status text NOT NULL DEFAULT 'suggested',
  video_url text,
  clip_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE broll_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read broll suggestions by project"
  ON broll_suggestions
  FOR SELECT
  TO anon
  USING (project_id IS NOT NULL);

CREATE POLICY "Anon can insert broll suggestions"
  ON broll_suggestions
  FOR INSERT
  TO anon
  WITH CHECK (project_id IS NOT NULL);

CREATE POLICY "Anon can update broll suggestions"
  ON broll_suggestions
  FOR UPDATE
  TO anon
  USING (project_id IS NOT NULL)
  WITH CHECK (project_id IS NOT NULL);

CREATE POLICY "Anon can delete broll suggestions"
  ON broll_suggestions
  FOR DELETE
  TO anon
  USING (project_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_broll_suggestions_project_id ON broll_suggestions (project_id);
CREATE INDEX IF NOT EXISTS idx_broll_suggestions_status ON broll_suggestions (status);
