/*
  # Create waitlist table for beta user signups

  1. New Tables
    - `waitlist`
      - `id` (uuid, primary key)
      - `email` (text, unique, not null) - the beta user's email address
      - `created_at` (timestamptz, default now()) - when they joined the waitlist

  2. Security
    - Enable RLS on `waitlist` table
    - Add policy allowing anonymous/unauthenticated inserts (so beta users can submit without an account)
    - No select/update/delete policies for public access -- data is only readable via service role
*/

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join the waitlist"
  ON waitlist
  FOR INSERT
  TO anon
  WITH CHECK (email IS NOT NULL AND email <> '');
