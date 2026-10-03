CREATE TABLE IF NOT EXISTS app_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  next_id INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO app_meta (id) VALUES (1);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  friend_code TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES profiles(id),
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id), PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES profiles(id),
  group_id TEXT REFERENCES groups(id), visibility TEXT NOT NULL CHECK (visibility IN ('public','friends','group')),
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS applications (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','expired')),
  payload TEXT NOT NULL CHECK (json_valid(payload)), PRIMARY KEY (match_id, user_id)
);
CREATE TABLE IF NOT EXISTS results (
  match_id TEXT PRIMARY KEY REFERENCES matches(id),
  recorded_by TEXT NOT NULL REFERENCES profiles(id), payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY, from_id TEXT NOT NULL REFERENCES profiles(id), to_id TEXT NOT NULL REFERENCES profiles(id),
  payload TEXT NOT NULL CHECK (json_valid(payload)), CHECK (from_id <> to_id)
);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id),
  from_id TEXT NOT NULL REFERENCES profiles(id), to_id TEXT NOT NULL REFERENCES profiles(id),
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id), payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS daily_notes (
  user_id TEXT NOT NULL REFERENCES profiles(id), date TEXT NOT NULL, text TEXT NOT NULL CHECK (length(text) <= 140),
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS ratings (
  match_id TEXT NOT NULL REFERENCES results(match_id), from_id TEXT NOT NULL REFERENCES profiles(id),
  to_id TEXT NOT NULL REFERENCES profiles(id), value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
  PRIMARY KEY (match_id, from_id, to_id), CHECK (from_id <> to_id)
);
CREATE TABLE IF NOT EXISTS command_receipts (
  user_id TEXT NOT NULL REFERENCES profiles(id), request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
  result_id TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS matches_visibility ON matches(visibility, group_id);
CREATE INDEX IF NOT EXISTS applications_user ON applications(user_id);
