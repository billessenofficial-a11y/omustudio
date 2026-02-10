/*
  # Video Editor Schema

  1. New Tables
    - `projects`
      - `id` (uuid, primary key) - unique project identifier
      - `name` (text) - project display name
      - `width` (integer) - canvas width in pixels
      - `height` (integer) - canvas height in pixels
      - `fps` (integer) - frames per second
      - `created_at` (timestamptz) - creation timestamp
      - `updated_at` (timestamptz) - last update timestamp

    - `timeline_tracks`
      - `id` (uuid, primary key) - unique track identifier
      - `project_id` (uuid, foreign key) - reference to project
      - `type` (text) - track type: video, audio, or text
      - `sort_order` (integer) - vertical ordering of tracks
      - `name` (text) - display name of track
      - `is_muted` (boolean) - whether track output is muted
      - `created_at` (timestamptz) - creation timestamp

    - `timeline_clips`
      - `id` (uuid, primary key) - unique clip identifier
      - `track_id` (uuid, foreign key) - reference to track
      - `project_id` (uuid, foreign key) - reference to project
      - `type` (text) - clip type: video, audio, text, or image
      - `file_name` (text) - original source file name
      - `start_time` (float8) - position on timeline in seconds
      - `duration` (float8) - clip duration on timeline in seconds
      - `trim_start` (float8) - trim offset from source start in seconds
      - `trim_end` (float8) - trim offset from source end in seconds
      - `properties` (jsonb) - extensible clip properties (opacity, volume, text content, font, etc.)
      - `created_at` (timestamptz) - creation timestamp

  2. Security
    - RLS enabled on all tables
    - Policies allow authenticated users to manage their own data
    - Projects are scoped by user_id column
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'Untitled Project',
  width integer NOT NULL DEFAULT 1920,
  height integer NOT NULL DEFAULT 1080,
  fps integer NOT NULL DEFAULT 30,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS timeline_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL DEFAULT 'video',
  sort_order integer NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT 'Track',
  is_muted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE timeline_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tracks"
  ON timeline_tracks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_tracks.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tracks in own projects"
  ON timeline_tracks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_tracks.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tracks in own projects"
  ON timeline_tracks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_tracks.project_id
      AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_tracks.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tracks in own projects"
  ON timeline_tracks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_tracks.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS timeline_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid REFERENCES timeline_tracks(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL DEFAULT 'video',
  file_name text NOT NULL DEFAULT '',
  start_time float8 NOT NULL DEFAULT 0,
  duration float8 NOT NULL DEFAULT 0,
  trim_start float8 NOT NULL DEFAULT 0,
  trim_end float8 NOT NULL DEFAULT 0,
  properties jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE timeline_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clips"
  ON timeline_clips FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_clips.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create clips in own projects"
  ON timeline_clips FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_clips.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update clips in own projects"
  ON timeline_clips FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_clips.project_id
      AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_clips.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete clips in own projects"
  ON timeline_clips FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = timeline_clips.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_tracks_project ON timeline_tracks(project_id);
CREATE INDEX IF NOT EXISTS idx_clips_track ON timeline_clips(track_id);
CREATE INDEX IF NOT EXISTS idx_clips_project ON timeline_clips(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
