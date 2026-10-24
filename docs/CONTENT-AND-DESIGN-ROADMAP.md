# Content, database, and design roadmap

This document records the next architectural direction without enabling a database or changing the current visual interface.

## What changed now

Built-in content is now split into one JSON bundle per game under `server/data/games/`:

- each file contains a `gameId` and a `collections` object;
- a game may own more than one collection, as `truth-or-dare.json` does;
- `contentStore.js` merges those bundles into the same collection map used by every engine;
- the host content API and the writable `server/data/content.json` format remain unchanged;
- the loader has a one-release fallback to the old `default-content.json` for safer operator upgrades.

This is a file-boundary change only. There is still no database, no migration command, and no new runtime dependency.

## Database migration plan — not implemented yet

The eventual database should solve specific needs rather than merely replace JSON:

1. **Content management.** Store reusable content items with a stable ID, game ownership, type, fields, aliases, moderation state, and revision history.
2. **Game-specific configuration.** Keep the current schema-driven fields while allowing future games to add fields without forcing one giant table.
3. **Publishing.** Separate draft edits from the active content snapshot. A host should be able to publish a validated revision atomically.
4. **Room isolation.** Keep rooms, players, scores, submissions, and used-content references separate from the public content bank. Room data should have explicit retention and deletion rules.
5. **Auditability.** Record who changed a content revision, when it changed, and why, without storing unnecessary player content forever.
6. **Operational safety.** Support optimistic version checks, backups, imports/exports, and a read-only fallback if the database is unavailable.

### Proposed logical structure

The names are deliberately implementation-neutral until the database choice is made:

```text
content_games
  id, slug, name, status, created_at, updated_at

content_collections
  id, game_id, key, kind, schema_version, status, created_at, updated_at

content_items
  id, collection_id, external_id, payload_json, status, created_at, updated_at

content_revisions
  id, collection_id, revision_number, payload_json, created_by, created_at,
  published_at, validation_summary_json

content_aliases (optional normalized index)
  id, item_id, normalized_value, display_value

rooms (future, only if persistence is explicitly wanted)
  id, code, host_session_id, phase, expires_at, created_at, updated_at

room_players
  id, room_id, display_name, reconnect_token_hash, connected_at, left_at

room_events or round_submissions (future, retention-controlled)
  id, room_id, round_id, player_id, event_type, payload_json, created_at
```

### Boundary and adapter plan

Before choosing PostgreSQL, SQLite, Supabase, or another provider, keep the application boundary small:

- `contentStore` remains the domain-facing interface (`getCollection`, replace, reset, snapshot, status);
- a future `ContentRepository` can implement that interface from a database;
- JSON remains a supported import/export format and emergency seed source;
- game engines continue to receive plain content items and do not know where they came from;
- room persistence is a separate repository decision and must not be coupled to content migration;
- secrets, reconnect tokens, and unrevealed game assignments are never stored in public content payloads.

### Decisions required before migration

The team still needs to decide whether content is global or per-host, whether multiple hosts need accounts, how long room history should live, whether collaborative editing is needed, the target deployment's backup/restore guarantees, and whether database unavailability should block new games. No schema or provider should be selected until those answers are known.

### Safe migration sequence

When the needs are clear, the intended sequence is: freeze the JSON contract; add repository interfaces; import the split JSON bundles into a staging database; compare collection counts and normalized payloads; run the API and engine suites against both repositories; add an explicit read-only fallback; switch reads behind a feature flag; then switch writes and retain JSON export for rollback. Existing rooms should not be migrated as part of the content cutover.

## Deferred page-first design philosophy — not implemented yet

The current card-based interface stays in place for now. The next visual direction should move from a stack of form cards to a full-page game stage that makes the room's current moment obvious.

### Design movement

**Arcade Night Stagecraft:** a dark, theatrical game-room interface with a large central play surface, persistent orientation rails, and focused action zones rather than a dashboard of cards.

### Principles

- **Stage before controls:** the prompt, drawing, statements, or vote is the dominant object; controls support it instead of competing with it.
- **One moment per screen:** writing, voting, waiting, and results each get a clear page state with no mixed-phase form clutter.
- **Room awareness:** player progress and host status remain visible as a lightweight edge treatment, not a second content grid.
- **Responsive by composition:** phone screens get a vertical stage and bottom action dock; wide screens get a stage plus side rails without shrinking the main prompt.

### Proposed page anatomy

```text
┌ room rail ┐  ┌──────────── game stage / prompt / canvas ────────────┐  ┌ progress rail ┐
│ room code │  │                                                     │  │ 3 / 5 done    │
│ players   │  │                 primary game moment                 │  │ waiting…      │
│ sound     │  │                                                     │  │ round 2       │
└───────────┘  └─────────────────────────────────────────────────────┘  └───────────────┘
                         ┌────── action dock / answer area ──────┐
                         └───────────────────────────────────────┘
```

This is a design target, not a request to rewrite `web/games.js` or the CSS in this change.

### Interaction and typography direction

Use large expressive display type only for the game prompt, calm readable text for instructions, and a single unmistakable primary action. Waiting states should feel intentional with a progress indicator and the submitted player's acknowledgement. Motion should be short and directional—stage transitions, reveal emphasis, and progress updates—with reduced-motion fallbacks.

### Implementation guardrail

Do not begin the visual migration until the page anatomy has been reviewed against all thirteen games, especially Draw It's canvas, Spyfall's hidden roles, Two Truths' statement phase, and the host console. The future design should be implemented as shared layout primitives rather than another game-specific card renderer.
