# Repository Guidelines

## Project Overview

This directory is the WeChat Mini Game platform copy of Relax Block Puzzle. It is a Canvas 2D game written in plain JavaScript ES modules and runs through WeChat Developer Tools. The unified workspace is the formal source of truth; this directory keeps WeChat APIs, lifecycle behavior, Canvas setup, light audio, and platform resources independent.

## Structure & Architecture

- `game.js`: startup entry.
- `js/main.js`: orchestration, lifecycle, update loop, settings, and event routing.
- `js/game/GameState.js`: screens, gameplay state, tools, difficulty, drag/place flow, and emitted events.
- `js/game/Board.js`, `Piece.js`, `ScoreManager.js`: board rules, pieces, and scoring.
- `js/game/Renderer.js`, `InputManager.js`, `LayoutMetrics.js`: Canvas drawing, input routing, layout, and hit areas.
- `js/game/SoundManager.js`, `js/utils/storage.js`, `js/api/AuthClient.js`: audio, local persistence, and optional authentication.
- `audio/`: WeChat light audio only; do not replace it with Android/Web full-quality audio.

Shared gameplay modules are generated into platform copies by the root synchronization scripts. Edit `shared/js/` and run the root synchronization check; do not hand-edit generated copies or change gameplay values in one platform only.

## Development & Testing

Open this directory as a Mini Game project in WeChat Developer Tools and use Compile, Preview, or real-device debugging. There is no package manager or local build command in this directory. Manually verify startup, screens, drag pickup and placement, tools, line clears, audio, vibration, safe areas, persistence, and hide/show lifecycle. Do not expose private project settings, backend credentials, admin codes, or user/session data.

## Agent Rules

Read the owning modules first, state a short plan, and make the smallest change possible. Preserve touch behavior, scoring, difficulty, storage keys, audio quality, and platform boundaries unless explicitly requested. Do not install dependencies, reformat broadly, overwrite existing changes, or invent backend/release workflows. Report manual checks and failures honestly. Commit, push, upload, deploy, publish, release/tag creation, backend/auth changes, and database operations require explicit authorization.
