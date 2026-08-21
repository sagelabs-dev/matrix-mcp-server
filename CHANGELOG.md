# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-21

### Added
- 15 MCP tools: messaging (send_message, send_html_message, send_reaction, send_dm)
- Room management (join_room, leave_room, get_joined_rooms, get_room_messages)
- User management (get_presence, invite_user, kick_user)
- ID resolution (set_room_alias, set_user_alias, resolve_room, resolve_user)
- Hybrid ID resolver with confidence scoring (aliases → exact → partial → ambiguity)
- E2EE support via Rust crypto backend (Megolm v1)
- Composition-Root IoC architecture — all deps wired in index.js
- `withErrorHandling` DRY wrapper for standardized error responses
- JSON persistence for aliases and DM room cache
- Environment variable configuration overrides (MATRIX_MCP_*)
- 65 tests (5 unit suites + 1 E2E suite)
- Graceful shutdown with state persistence (SIGINT/SIGTERM)

### Fixed
- `fullUserId` latent bug in resolveRoomInput (undefined variable reference)
- `SimpleFsStorageProvider` requires file path, not directory path
- Matrix sync loop must start before crypto initialization
