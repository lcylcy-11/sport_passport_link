CREATE TABLE IF NOT EXISTS chat_rooms (
 id TEXT PRIMARY KEY, context_key TEXT NOT NULL UNIQUE,
 payload TEXT NOT NULL CHECK(json_valid(payload)), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 room_id TEXT NOT NULL REFERENCES chat_rooms(id),
 sender_id TEXT NOT NULL REFERENCES profiles(id),
 client_message_id TEXT NOT NULL,
 text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 1000),
 created_at TEXT NOT NULL,
 UNIQUE(sender_id,client_message_id)
);
CREATE INDEX IF NOT EXISTS chat_messages_room_cursor ON chat_messages(room_id,id);
CREATE TABLE IF NOT EXISTS appointment_proposals (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES chat_rooms(id),
 proposed_by TEXT NOT NULL REFERENCES profiles(id),
 payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE TABLE IF NOT EXISTS result_proposals (
 id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id),
 proposed_by TEXT NOT NULL REFERENCES profiles(id),
 payload TEXT NOT NULL CHECK(json_valid(payload))
);
