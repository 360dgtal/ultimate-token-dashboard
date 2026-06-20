"""JSONL transcript walker + parser."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import List, Optional, Tuple, Union

from .db import connect, _encode_slug


INSERT_MSG = """
INSERT OR REPLACE INTO messages (
  uuid, parent_uuid, session_id, project_slug, platform, cwd, git_branch, cc_version, entrypoint,
  type, is_sidechain, agent_id, timestamp, model, stop_reason, prompt_id, message_id,
  input_tokens, output_tokens, cache_read_tokens, cache_create_5m_tokens, cache_create_1h_tokens,
  prompt_text, prompt_chars, tool_calls_json
) VALUES (
  :uuid, :parent_uuid, :session_id, :project_slug, :platform, :cwd, :git_branch, :cc_version, :entrypoint,
  :type, :is_sidechain, :agent_id, :timestamp, :model, :stop_reason, :prompt_id, :message_id,
  :input_tokens, :output_tokens, :cache_read_tokens, :cache_create_5m_tokens, :cache_create_1h_tokens,
  :prompt_text, :prompt_chars, :tool_calls_json
)
"""

INSERT_TOOL = """
INSERT INTO tool_calls (message_uuid, session_id, project_slug, tool_name, target, result_tokens, is_error, timestamp)
VALUES (:message_uuid, :session_id, :project_slug, :tool_name, :target, :result_tokens, :is_error, :timestamp)
"""


_TARGET_FIELDS = {
    "Read":      "file_path",
    "Edit":      "file_path",
    "Write":     "file_path",
    "Glob":      "pattern",
    "Grep":      "pattern",
    "Bash":      "command",
    "WebFetch":  "url",
    "WebSearch": "query",
    "Task":      "subagent_type",
    "Skill":     "skill",
}


def _usage(rec: dict) -> dict:
    u = (rec.get("message") or {}).get("usage") or {}
    cc = u.get("cache_creation") or {}
    return {
        "input_tokens":           int(u.get("input_tokens") or 0),
        "output_tokens":          int(u.get("output_tokens") or 0),
        "cache_read_tokens":      int(u.get("cache_read_input_tokens") or 0),
        "cache_create_5m_tokens": int(cc.get("ephemeral_5m_input_tokens") or 0),
        "cache_create_1h_tokens": int(cc.get("ephemeral_1h_input_tokens") or 0),
    }


def _prompt_text(rec: dict) -> Tuple[Optional[str], Optional[int]]:
    if rec.get("type") != "user":
        return None, None
    content = (rec.get("message") or {}).get("content")
    if isinstance(content, str):
        return content, len(content)
    if isinstance(content, list):
        parts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        text = "".join(parts) if parts else None
        return text, (len(text) if text else None)
    return None, None


def _target(name: str, inp: dict) -> Optional[str]:
    field = _TARGET_FIELDS.get(name)
    if field and isinstance(inp, dict):
        v = inp.get(field)
        if isinstance(v, str):
            return v[:500]
    return None


def _extract_tools(rec: dict) -> List[dict]:
    out = []
    content = (rec.get("message") or {}).get("content")
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        name = block.get("name") or "unknown"
        target = _target(name, block.get("input") or {})
        out.append({
            "tool_name":     name,
            "target":        target,
            "result_tokens": None,
            "is_error":      0,
            "timestamp":     rec.get("timestamp") or rec.get("_audit_timestamp"),
        })
    return out


def _extract_results(rec: dict) -> List[dict]:
    out = []
    content = (rec.get("message") or {}).get("content")
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "tool_result":
            continue
        body = block.get("content")
        if isinstance(body, str):
            chars = len(body)
        elif isinstance(body, list):
            chars = sum(len(p.get("text", "")) for p in body if isinstance(p, dict))
        else:
            chars = 0
        out.append({
            "tool_name":     "_tool_result",
            "target":        block.get("tool_use_id"),
            "result_tokens": chars // 4,
            "is_error":      1 if block.get("is_error") else 0,
            "timestamp":     rec.get("timestamp") or rec.get("_audit_timestamp"),
        })
    return out


def parse_record(rec: dict, project_slug: str, platform: str = "claude-code") -> Tuple[dict, List[dict]]:
    """Return (message_row, [tool_call_rows]).

    Handles both standard Claude Code JSONL (camelCase keys, ``timestamp``)
    and Cowork audit.jsonl (snake_case keys, ``_audit_timestamp``).
    """
    msg_obj = rec.get("message") or {}
    text, chars = _prompt_text(rec)
    msg = {
        "uuid":         rec.get("uuid"),
        "parent_uuid":  rec.get("parentUuid"),
        "session_id":   rec.get("sessionId") or rec.get("session_id"),
        "project_slug": project_slug,
        "platform":     platform,
        "cwd":          rec.get("cwd"),
        "git_branch":   rec.get("gitBranch"),
        "cc_version":   rec.get("version"),
        "entrypoint":   rec.get("entrypoint"),
        "type":         rec.get("type"),
        "is_sidechain": 1 if rec.get("isSidechain") else 0,
        "agent_id":     rec.get("agentId"),
        "timestamp":    rec.get("timestamp") or rec.get("_audit_timestamp"),
        "model":        msg_obj.get("model"),
        "stop_reason":  msg_obj.get("stop_reason"),
        "prompt_id":    rec.get("promptId"),
        "message_id":   msg_obj.get("id"),
        "prompt_text":  text,
        "prompt_chars": chars,
        "tool_calls_json": None,
        **_usage(rec),
    }
    tools = _extract_tools(rec)
    tools.extend(_extract_results(rec))
    if tools:
        msg["tool_calls_json"] = json.dumps(
            [{"name": t["tool_name"], "target": t["target"]} for t in tools if t["tool_name"] != "_tool_result"]
        )
    for t in tools:
        t["message_uuid"] = msg["uuid"]
        t["session_id"]   = msg["session_id"]
        t["project_slug"] = project_slug
    return msg, tools


def _project_slug(file_path: Path, projects_root: Path) -> str:
    rel = file_path.relative_to(projects_root)
    return rel.parts[0]


def _evict_prior_snapshots(conn, session_id: str, message_id: str,
                           parent_uuid: str, keep_uuid: str) -> None:
    """Remove older streaming snapshots for the same (session_id, message_id, parent).

    Claude Code writes 2–3 JSONL lines per assistant response (partial → final)
    with identical message.id but distinct top-level uuids. Only the final
    tally matches billing, so earlier snapshots must be replaced, not summed.

    CRITICAL: must also match parent_uuid. A multi-segment response (text →
    tool_use → continuation) emits multiple records sharing message_id but
    with different parents — those are NOT snapshots and must not be evicted.
    """
    old = [r[0] for r in conn.execute(
        "SELECT uuid FROM messages "
        "WHERE session_id=? AND message_id=? AND parent_uuid IS ? AND uuid!=?",
        (session_id, message_id, parent_uuid, keep_uuid),
    )]
    if not old:
        return
    placeholders = ",".join("?" * len(old))
    conn.execute(f"DELETE FROM tool_calls WHERE message_uuid IN ({placeholders})", old)
    conn.execute(f"DELETE FROM messages WHERE uuid IN ({placeholders})", old)


def scan_file(path: Path, project_slug: str, conn, start_byte: int = 0,
              session_id_override: str = None, platform: str = "claude-code") -> dict:
    """Ingest new lines from a JSONL file starting at ``start_byte``.

    Returns message/tool counts plus ``end_offset`` — the byte offset just
    past the last fully-parsed line. Callers persist ``end_offset`` as the
    file's high-water mark so a line partially flushed at EOF gets re-read
    once it completes.
    """
    msgs = tools = 0
    end_offset = start_byte
    with open(path, "rb") as fb:
        if start_byte:
            fb.seek(start_byte)
        while True:
            raw = fb.readline()
            if not raw:
                break  # EOF
            if not raw.endswith(b"\n"):
                # Partial line — Claude Code is mid-flush. Leave the
                # high-water mark behind the line start so we re-read it
                # once the write completes.
                break
            line_end = fb.tell()
            try:
                line = raw.decode("utf-8", errors="replace").strip()
            except Exception:
                end_offset = line_end
                continue
            if not line:
                end_offset = line_end
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                end_offset = line_end
                continue
            if not isinstance(rec, dict) or "uuid" not in rec or "type" not in rec:
                end_offset = line_end
                continue
            msg, tlist = parse_record(rec, project_slug, platform)
            if session_id_override:
                msg["session_id"] = session_id_override
                for t in tlist:
                    t["session_id"] = session_id_override
            if not msg["session_id"] or not msg["timestamp"]:
                end_offset = line_end
                continue
            if msg["message_id"]:
                _evict_prior_snapshots(
                    conn, msg["session_id"], msg["message_id"],
                    msg["parent_uuid"], msg["uuid"],
                )
            conn.execute(INSERT_MSG, msg)
            # tool_calls has no natural unique key; clear any prior rows for
            # this uuid so full rescans stay idempotent instead of
            # duplicating rows.
            conn.execute("DELETE FROM tool_calls WHERE message_uuid=?", (msg["uuid"],))
            for t in tlist:
                conn.execute(INSERT_TOOL, t)
                tools += 1
            msgs += 1
            end_offset = line_end
    return {"messages": msgs, "tools": tools, "end_offset": end_offset}


_COWORK_DEFAULT = (
    Path.home() / "Library" / "Application Support" / "Claude" / "local-agent-mode-sessions"
)


def scan_cowork_dir(base: Union[str, Path], db_path: Union[str, Path]) -> dict:
    """Scan Cowork local-agent-mode-sessions/ for both audit.jsonl transcripts
    and the nested .claude/projects/ subagent sessions they spawn."""
    base = Path(base)
    totals: dict = {"messages": 0, "tools": 0, "files": 0}
    if not base.is_dir():
        return totals

    # --- session metadata (local_*.json → human-readable titles) ---
    with connect(db_path) as conn:
        for meta in base.rglob("local_*.json"):
            try:
                data = json.loads(meta.read_text(encoding="utf-8", errors="replace"))
                title  = data.get("title")
                cli_id = data.get("cliSessionId")
                if title and cli_id:
                    conn.execute(
                        "INSERT OR REPLACE INTO session_titles (session_id, title) VALUES (?, ?)",
                        (cli_id, title),
                    )
            except Exception:
                pass
        conn.commit()

    # --- main conversation transcripts (audit.jsonl) ---
    with connect(db_path) as conn:
        for audit in base.rglob("audit.jsonl"):
            try:
                stat = audit.stat()
            except OSError:
                continue
            row = conn.execute(
                "SELECT mtime, bytes_read FROM files WHERE path=?", (str(audit),)
            ).fetchone()
            if row and row["mtime"] == stat.st_mtime and row["bytes_read"] == stat.st_size:
                continue
            offset = row["bytes_read"] if row and stat.st_size > row["bytes_read"] else 0
            agent_dir = audit.parent.name
            session_id = agent_dir[6:] if agent_dir.startswith("local_") else agent_dir
            sub = scan_file(audit, "cowork", conn, start_byte=offset,
                            session_id_override=session_id)
            conn.execute(
                "INSERT OR REPLACE INTO files (path, mtime, bytes_read, scanned_at) VALUES (?, ?, ?, ?)",
                (str(audit), stat.st_mtime, sub["end_offset"], time.time()),
            )
            totals["messages"] += sub["messages"]
            totals["tools"]    += sub["tools"]
            totals["files"]    += 1
        conn.commit()

    # --- subagent sessions inside each sandbox's .claude/projects/ ---
    for dot_claude in base.rglob(".claude"):
        projects_dir = dot_claude / "projects"
        if projects_dir.is_dir():
            sub = scan_dir(projects_dir, db_path)
            for k in totals:
                totals[k] += sub[k]

    return totals


def scan_dir(projects_root: Union[str, Path], db_path: Union[str, Path]) -> dict:
    root = Path(projects_root)
    totals = {"messages": 0, "tools": 0, "files": 0}
    if not root.is_dir():
        return totals
    with connect(db_path) as conn:
        for p in root.rglob("*.jsonl"):
            try:
                stat = p.stat()
            except OSError:
                continue
            row = conn.execute(
                "SELECT mtime, bytes_read FROM files WHERE path=?", (str(p),)
            ).fetchone()
            offset = 0
            if row and row["mtime"] == stat.st_mtime and row["bytes_read"] == stat.st_size:
                continue
            if row and stat.st_size > row["bytes_read"]:
                offset = row["bytes_read"]
            slug = _project_slug(p, root)
            sub = scan_file(p, slug, conn, start_byte=offset)
            # Persist the byte offset of the last fully-parsed line (not
            # st_size) so a partial line mid-flush is retried on the next
            # scan instead of being skipped over.
            conn.execute(
                "INSERT OR REPLACE INTO files (path, mtime, bytes_read, scanned_at) VALUES (?, ?, ?, ?)",
                (str(p), stat.st_mtime, sub["end_offset"], time.time()),
            )
            totals["messages"] += sub["messages"]
            totals["tools"]    += sub["tools"]
            totals["files"]    += 1
        conn.commit()
    return totals


# ── Codex (OpenAI) rollout ingestion ─────────────────────────────────────────
# GROUNDWORK / BEST-EFFORT. The OpenAI Codex CLI writes per-session transcripts
# to ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl when actively used.
# Each line is {"timestamp": ISO, "type": <kind>, "payload": {...}}. Usage lives
# in `event_msg` records whose payload.type == "token_count". This reader is
# inert until such files exist; it is verified against a synthetic fixture
# (tests/test_codex_scanner.py) rather than live data, so treat the token
# mapping below as best-effort until validated against a real rollout.

_CODEX_DEFAULT = Path.home() / ".codex" / "sessions"


def _codex_base_row(session_id: str, slug: str, cwd, model, ts: str, seq: int) -> dict:
    """A messages-table row pre-filled with Codex defaults; deterministic uuid
    (codex:<session>:<seq>) keeps full re-parses idempotent via INSERT OR REPLACE."""
    return {
        "uuid":         f"codex:{session_id}:{seq}",
        "parent_uuid":  None,
        "session_id":   session_id,
        "project_slug": slug,
        "platform":     "codex",
        "cwd":          cwd,
        "git_branch":   None,
        "cc_version":   None,
        "entrypoint":   "codex",
        "type":         "user",
        "is_sidechain": 0,
        "agent_id":     None,
        "timestamp":    ts,
        "model":        model,
        "stop_reason":  None,
        "prompt_id":    None,
        "message_id":   None,
        "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0,
        "cache_create_5m_tokens": 0, "cache_create_1h_tokens": 0,
        "prompt_text":  None, "prompt_chars": None, "tool_calls_json": None,
    }


def codex_rows(path: Path) -> List[dict]:
    """Parse one Codex rollout JSONL into messages-table rows (best-effort).

    Emits a 'user' row per user message item and an 'assistant' row per
    token_count event (carrying that turn's usage). Assistant rows link to the
    most recent user row so the prompt/cost joins keep working.

    Usage handling (verified against the documented Codex format):
      - token_count.info.total_token_usage is CUMULATIVE across the session; we
        prefer the per-call last_token_usage and otherwise diff against the
        previous total to recover this turn's delta (summing totals overcounts).
      - Fields: input_tokens (includes cached), cached_input_tokens,
        output_tokens, reasoning_output_tokens. We map fresh input = input -
        cached, cache_read = cached, output = output + reasoning.

    KNOWN LIMITATION: when Codex spawns subagents (thread_spawn), the subagent's
    rollout replays the parent's full token history re-timestamped, which can
    inflate totals ~91x (openai/codex; ccusage#950). We do not yet detect/skip
    those replays — to be addressed against real data before Codex is surfaced.
    """
    rows: List[dict] = []
    session_id = path.stem  # fallback; overridden by session_meta if present
    cwd = None
    model = None
    last_user_uuid = None
    seq = 0
    prev = {"input": 0, "cached": 0, "output": 0, "reasoning": 0}  # cumulative tracker
    try:
        fh = open(path, "r", encoding="utf-8", errors="replace")
    except OSError:
        return rows
    with fh:
        for raw in fh:
            line = raw.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(rec, dict):
                continue
            kind = rec.get("type")
            payload = rec.get("payload") or {}
            ts = rec.get("timestamp") or ""

            if kind == "session_meta":
                session_id = payload.get("id") or session_id
                cwd = payload.get("cwd") or cwd
                continue
            if kind == "turn_context":
                model = payload.get("model") or model
                cwd = payload.get("cwd") or cwd
                continue

            if kind == "response_item" and payload.get("type") == "message":
                if payload.get("role") != "user":
                    continue
                parts = payload.get("content") or []
                text = "".join(
                    p.get("text", "") for p in parts
                    if isinstance(p, dict) and p.get("type") in ("input_text", "text")
                )
                if not text:
                    continue
                slug = _encode_slug(cwd) if cwd else "codex"
                row = _codex_base_row(session_id, slug, cwd, model, ts, seq); seq += 1
                row["type"] = "user"
                row["prompt_text"] = text
                row["prompt_chars"] = len(text)
                rows.append(row)
                last_user_uuid = row["uuid"]
                continue

            if kind == "event_msg" and payload.get("type") == "token_count":
                info = payload.get("info") or {}
                last = info.get("last_token_usage")
                total = info.get("total_token_usage") or {}
                if last:
                    inp    = int(last.get("input_tokens") or 0)
                    cached = int(last.get("cached_input_tokens") or 0)
                    out    = int(last.get("output_tokens") or 0)
                    reason = int(last.get("reasoning_output_tokens") or 0)
                else:
                    # No per-call usage — diff the cumulative total against the
                    # previous event to recover this turn's delta.
                    inp    = max(0, int(total.get("input_tokens") or 0)            - prev["input"])
                    cached = max(0, int(total.get("cached_input_tokens") or 0)     - prev["cached"])
                    out    = max(0, int(total.get("output_tokens") or 0)           - prev["output"])
                    reason = max(0, int(total.get("reasoning_output_tokens") or 0) - prev["reasoning"])
                if total:  # advance cumulative tracker whenever totals are present
                    prev = {
                        "input":     int(total.get("input_tokens")            or prev["input"]),
                        "cached":    int(total.get("cached_input_tokens")     or prev["cached"]),
                        "output":    int(total.get("output_tokens")          or prev["output"]),
                        "reasoning": int(total.get("reasoning_output_tokens") or prev["reasoning"]),
                    }
                if inp == 0 and out == 0 and cached == 0:
                    continue
                slug = _encode_slug(cwd) if cwd else "codex"
                row = _codex_base_row(session_id, slug, cwd, model, ts, seq); seq += 1
                row["type"] = "assistant"
                row["parent_uuid"] = last_user_uuid
                row["input_tokens"] = max(0, inp - cached)  # fresh (non-cached) input
                row["cache_read_tokens"] = cached
                row["output_tokens"] = out + reason          # reasoning billed as output
                rows.append(row)
                continue
    return rows


def scan_codex_dir(base: Union[str, Path] = None,
                   db_path: Union[str, Path] = None) -> dict:
    """Ingest OpenAI Codex rollout transcripts (platform='codex').

    No-op when the sessions directory is absent — which is the case until the
    user actually runs Codex. Incremental per file via the `files` table; on
    change a rollout is fully re-parsed (deterministic uuids keep it idempotent).
    """
    base = Path(base) if base else _CODEX_DEFAULT
    totals = {"messages": 0, "tools": 0, "files": 0}
    if not base.is_dir():
        return totals
    with connect(db_path) as conn:
        for p in base.rglob("rollout-*.jsonl"):
            try:
                stat = p.stat()
            except OSError:
                continue
            row = conn.execute(
                "SELECT mtime, bytes_read FROM files WHERE path=?", (str(p),)
            ).fetchone()
            if row and row["mtime"] == stat.st_mtime and row["bytes_read"] == stat.st_size:
                continue
            rows = codex_rows(p)
            for msg in rows:
                if not msg["session_id"] or not msg["timestamp"]:
                    continue
                conn.execute(INSERT_MSG, msg)
                totals["messages"] += 1
            conn.execute(
                "INSERT OR REPLACE INTO files (path, mtime, bytes_read, scanned_at) VALUES (?, ?, ?, ?)",
                (str(p), stat.st_mtime, stat.st_size, time.time()),
            )
            totals["files"] += 1
        conn.commit()
    return totals
