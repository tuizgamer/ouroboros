# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Match Modes**: Distinction between `ai`, `quick`, and `ranked` matches.
- **Match History UI**: Badges for match modes and improved stat display.
- **llms.txt**: AI-discoverability file for agent orchestration.
- **Comprehensive Documentation**: Detailed mechanics, API, and architectural guides in `/docs`.

### Fixed
- **AI Rewards**: Restricted XP, ELO, and Mission progress for matches against AI.
- **Stat Aggregation**: Fixed 0-value stats (damage, turns) in match history for Solo mode.
- **Security**: Prevented character duplication via URL manipulation in Arena.
- **Security**: Hardened Presets API with character uniqueness validation.

## [0.8.0] - 2026-02-15
### Added
- **AFK Timer**: 45-second turn timeout with auto-pass and forfeit logic.
- **Rate Limiting**: Protection for reward and matchmaking endpoints.
- **Engine Purity**: Extracted engine logic from React hooks for server-side authority.

## [0.7.0] - 2026-02-01
### Added
- **PvP Core**: Realtime matchmaking with Supabase Broadcast.
- **Lobby 3-Button Layout**: Integrated Quick Match, Ranked, and Vs AI entries.
- **Team Presets**: Ability to save, load, and favorite character combinations.

## [0.6.0] - 2026-01-15
### Added
- **Economy System**: XP system, Fragments currency, and Mission Rewards.
- **ELO Ranking**: Competitive rating system and global leaderboard.
- **Admin Dashboard**: Initial tools for monitoring match health and player stats.

## [0.1.0] - 2025-12-25
### Added
- **Initial Engine**: Ouroboros combat engine (3v3 turn-based).
- **Core Characters**: First 9 characters across 3 lineages.
- **Basic Lobby**: Character selection and team drafting.
