"""Codex rollout ingestion — verified against a synthetic fixture.

There is no live Codex data to test against (the install on the dev machine has
zero sessions), so this fixture is hand-built from the documented OpenAI Codex
rollout schema. If the real format differs, update both the fixture and the
token mapping in scanner.codex_rows / _codex_base_row.
"""
import os
import tempfile
import unittest

from token_dashboard.db import init_db, connect
from token_dashboard.scanner import scan_codex_dir, codex_rows


# One rollout: session_meta → turn_context → user message → token_count event.
_ROLLOUT = "\n".join([
    '{"timestamp":"2026-05-01T10:00:00Z","type":"session_meta","payload":{"id":"sess-codex-1","cwd":"/Users/me/proj"}}',
    '{"timestamp":"2026-05-01T10:00:01Z","type":"turn_context","payload":{"model":"gpt-5-codex","cwd":"/Users/me/proj"}}',
    '{"timestamp":"2026-05-01T10:00:02Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"refactor the parser"}]}}',
    '{"timestamp":"2026-05-01T10:00:09Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":1000,"cached_input_tokens":800,"output_tokens":200,"reasoning_output_tokens":50,"total_tokens":1250}}}}',
]) + "\n"


class CodexScannerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.db = os.path.join(self.tmp, "t.db")
        init_db(self.db)
        # ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
        self.sessions = os.path.join(self.tmp, "sessions", "2026", "05", "01")
        os.makedirs(self.sessions)
        self.rollout = os.path.join(self.sessions, "rollout-2026-05-01T10-00-00-sess-codex-1.jsonl")
        with open(self.rollout, "w", encoding="utf-8") as f:
            f.write(_ROLLOUT)

    def test_absent_dir_is_noop(self):
        n = scan_codex_dir(os.path.join(self.tmp, "does-not-exist"), self.db)
        self.assertEqual(n, {"messages": 0, "tools": 0, "files": 0})

    def test_rows_parsed_with_token_mapping(self):
        base = os.path.join(self.tmp, "sessions")
        n = scan_codex_dir(base, self.db)
        self.assertEqual(n["files"], 1)
        self.assertEqual(n["messages"], 2)  # one user + one assistant

        with connect(self.db) as c:
            rows = [dict(r) for r in c.execute(
                "SELECT type, platform, input_tokens, output_tokens, cache_read_tokens, "
                "prompt_text, parent_uuid, uuid, model, project_slug "
                "FROM messages ORDER BY uuid"
            )]
        self.assertTrue(all(r["platform"] == "codex" for r in rows))

        user = next(r for r in rows if r["type"] == "user")
        asst = next(r for r in rows if r["type"] == "assistant")

        self.assertEqual(user["prompt_text"], "refactor the parser")
        # fresh input = input - cached; reasoning folded into output; cached→cache_read
        self.assertEqual(asst["input_tokens"], 200)
        self.assertEqual(asst["cache_read_tokens"], 800)
        self.assertEqual(asst["output_tokens"], 250)
        self.assertEqual(asst["model"], "gpt-5-codex")
        # assistant links back to the user turn (keeps prompt/cost joins working)
        self.assertEqual(asst["parent_uuid"], user["uuid"])
        # cwd encoded to a project slug like Claude Code
        self.assertEqual(user["project_slug"], "-Users-me-proj")

    def test_rescan_is_idempotent(self):
        base = os.path.join(self.tmp, "sessions")
        scan_codex_dir(base, self.db)
        # unchanged file → skipped; force a re-parse by bumping mtime
        os.utime(self.rollout, (0, 0))
        scan_codex_dir(base, self.db)
        with connect(self.db) as c:
            cnt = c.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        self.assertEqual(cnt, 2)  # deterministic uuids → no duplicates

    def test_codex_rows_direct(self):
        rows = codex_rows(__import__("pathlib").Path(self.rollout))
        self.assertEqual(len(rows), 2)


class PlatformMigrationTests(unittest.TestCase):
    def test_adds_platform_column_without_wipe(self):
        tmp = tempfile.mkdtemp()
        db = os.path.join(tmp, "old.db")
        # Simulate a pre-platform DB: create messages without the column,
        # insert a row, then run init_db (which runs the migration).
        import sqlite3
        c = sqlite3.connect(db)
        c.execute(
            "CREATE TABLE messages (uuid TEXT PRIMARY KEY, session_id TEXT NOT NULL, "
            "project_slug TEXT NOT NULL, type TEXT NOT NULL, timestamp TEXT NOT NULL, "
            "model TEXT, message_id TEXT)"
        )
        c.execute(
            "INSERT INTO messages (uuid, session_id, project_slug, type, timestamp) "
            "VALUES ('u1','s1','p1','user','2026-01-01T00:00:00Z')"
        )
        c.commit()
        c.close()

        init_db(db)  # should ALTER TABLE ADD COLUMN platform, no data wipe

        with connect(db) as c:
            cols = {r[1] for r in c.execute("PRAGMA table_info(messages)")}
            self.assertIn("platform", cols)
            row = c.execute("SELECT platform FROM messages WHERE uuid='u1'").fetchone()
            self.assertIsNotNone(row, "existing row should survive the migration")
            self.assertEqual(row[0], "claude-code")


if __name__ == "__main__":
    unittest.main()
