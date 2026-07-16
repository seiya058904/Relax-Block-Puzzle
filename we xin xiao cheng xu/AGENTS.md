# Project Collaboration Guide

## Project Overview

This repository is a native WeChat Mini Game named "轻松俄罗斯方块". It is a canvas-based block puzzle written in plain JavaScript ES modules and uses WeChat runtime APIs (`wx`, `canvas`, animation frames, storage, audio, vibration, login, and CloudBase access). There is no npm dependency installation, framework, command-line build, or automated test runner.

`game.js` is the startup entry. It initializes cloud access and creates `Main` from `js/main.js`. `Main` connects game state, rendering, touch input, sound, settings persistence, and authentication, then runs the update/render loop.

Development, compilation, preview, device debugging, upload, and release are performed through WeChat Developer Tools. `project.config.json` identifies the project as compile type `game`; do not expose its AppID or private project settings in documentation or replies.

## Repository Structure

- `game.js`: Mini Game entry point.
- `game.json`: global Mini Game configuration; currently sets portrait orientation.
- `js/main.js`: application composition, lifecycle hooks, game loop, event-to-sound routing, and startup authentication.
- `js/render.js`: shared canvas, screen, pixel-ratio, menu-button, and safe-area measurements.
- `js/game/`: active puzzle implementation.
  - `GameState.js`: gameplay rules, screens, tools, difficulty, membership/admin state, revives, drag/place flow, and emitted events.
  - `Board.js`, `Piece.js`, `ScoreManager.js`: board rules, piece generation, and scoring.
  - `Renderer.js`: canvas drawing, layout, modal screens, and touch hit areas.
  - `InputManager.js`: touch and keyboard routing into game actions.
  - `SoundManager.js`: effects, background music, and app hide/show audio handling.
  - `constants.js`: gameplay constants and local membership-code configuration. Treat codes as sensitive values.
- `js/utils/storage.js`: WeChat local-storage defaults and read/write helpers for settings and per-difficulty best scores.
- `js/api/AuthClient.js`: silent login, backend requests, CloudBase container access, fallback requests, health checks, and admin verification.
- `js/config/backend.js`: public frontend connection settings only. Never place server secrets here.
- `audio/`: active sound effects and background music only; resource-map verification rejects unmapped audio.
- Deprecated shooting-template directories were removed on 2026-07-16 after static and dynamic reference checks. Do not recreate them in the active entry path.
- `README.md`: gameplay rules, manual run/test checklist, current backend behavior, and security notes.
- `.eslintrc.js`: ESLint settings for ES2018 modules and WeChat globals.
- `project.private.config.json`: local Developer Tools preferences. Do not quote or publish its contents.

No `package.json`, automated test directory, CI/CD configuration, database/migration directory, cloud-function directory, or `.gitignore` is currently present.

## Architecture Notes

The active flow is `game.js` -> `js/main.js` -> `GameState` + `Renderer` + `InputManager` + `SoundManager` + `AuthClient`.

- Keep gameplay rules and mutable game state in `GameState` and the supporting game model classes.
- Keep canvas drawing and hit-area calculation in `Renderer`.
- Keep touch/keyboard interpretation in `InputManager`; it should call state actions instead of duplicating rules.
- Keep persistence behind `js/utils/storage.js`. Existing settings and best-score keys are compatibility contracts; changing them can make stored user data appear lost.
- `Main` owns orchestration: lifecycle, animation loop, settings propagation, and mapping game events to sound/vibration.
- Authentication starts with WeChat login and backend checks. Backend failure must remain non-blocking so local gameplay still works.
- Formal backend access prefers CloudBase container calls; a public request path exists as a development fallback. Do not change transport, domains, environment association, or production access rules without explicit approval.
- Admin verification is server-side. Never move real admin credentials, user identifiers, session data, or server credentials into frontend code.
- Local membership state and codes are separate from server-side admin verification. Do not merge their data or behavior without a clear requirement.

## Development Notes

Open the repository root in WeChat Developer Tools as a **Mini Game** project and click **Compile** to run the simulator. Use **Preview** or real-device debugging for behavior that the simulator cannot reliably prove, especially touch, audio, vibration, safe areas, login, CloudBase access, and app hide/show lifecycle.

Code style observed in the active modules:

- Two-space indentation.
- Semicolons and single-quoted strings.
- ES `import`/`export` modules.
- `PascalCase` for classes and class files, `camelCase` for functions/variables, and `UPPER_SNAKE_CASE` for constants.
- Keep changes small and within the owning module. Avoid broad rewrites of `GameState.js`, `Renderer.js`, or template directories.

When changing one area, check related contracts:

- State or screen changes: update `GameState`, rendering, hit areas, and input routing together where required.
- Settings changes: update defaults, load/save behavior, state application, UI controls, and persistence checks.
- Audio changes: verify asset paths, enable/disable settings, track switching, and hide/show behavior.
- Difficulty/scoring changes: verify all three difficulties and separate saved best scores.
- Login/admin changes: preserve safe errors, backend-failure fallback, and the rule that admin scores do not replace official best scores.
- Layout changes: test different simulator sizes, menu-button position, safe areas, and high pixel density.

## Common Commands

There are no repository-provided install, build, test, format, type-check, deploy, or database commands.

Safe read-only repository checks, when the directory is inside a Git worktree:

```powershell
git status --short --branch
git diff -- AGENTS.md
git diff --stat
```

Current local note: this directory does not contain accessible `.git` metadata, so Git commands report that it is not a repository. Do not invent Git history or claim a clean working tree.

ESLint is configured in `.eslintrc.js`, but no standalone lint script or local dependency is provided. Use the ESLint integration in WeChat Developer Tools if available. Do not install packages merely to run lint unless the user authorizes it.

Developer Tools actions such as **Upload**, release submission, backend deployment, or production configuration changes require explicit user authorization.

## Testing and Verification

There is no automated test framework or coverage target. Follow the manual checklist in `README.md` under "如何测试". At minimum, verify:

- Startup, home screen, help/settings panels, pause, return-home confirmation, and game-over flow.
- Easy, normal, and master difficulty behavior.
- Piece pickup, dragging, valid/invalid placement, rack refill, line clears, combos, scoring, and no-move handling.
- Refresh, clear, and undo tools, including limits and restored state.
- Settings and per-difficulty best scores persist after restarting the Mini Game.
- Sound effects, all selectable background tracks, mute settings, vibration, and app hide/show behavior.
- Membership enable/disable and revive allowance; never print or capture entered codes.
- Admin verification, admin-only unlimited behavior, admin shutdown, and exclusion of admin scores from official best scores.
- Backend success and graceful local play when health checks or login fail.
- Simulator plus real-device checks for touch, safe area, audio, vibration, lifecycle, and CloudBase access when relevant.
- Developer Tools console shows no new errors and no unexpected files were generated.

Report every check actually run. If Developer Tools or a real device is unavailable, say which checks remain manual and unverified.

## Deployment and Backend Rules

- This repository contains the Mini Game frontend only; no backend source, database migrations, or deployment scripts were found.
- Uploading or releasing the Mini Game is a manual WeChat Developer Tools operation and must not be performed without explicit authorization.
- Backend/container deployment, domain configuration, environment sharing, production access changes, and database operations are outside this repository and require explicit authorization.
- Explain production, authentication, data-integrity, availability, and billing risks before changing backend connection or release configuration.
- Do not treat the public request fallback as a confirmed production deployment path; formal production requirements must be verified before release.

## Security Rules

- Do not commit or expose environment files, local private configuration, API keys, tokens, passwords, private keys, connection strings, or production credentials.
- Never place server secrets in `game.js`, `js/`, `project.config.json`, documentation, logs, replies, screenshots, or commit messages.
- Never expose or log user identifiers, session data, admin codes, membership codes, or entered credential values.
- Keep admin verification and server credentials on the backend. Frontend configuration may contain only values intended to be public.
- Do not copy values from `project.private.config.json` or untracked local files into documentation.
- Do not commit temporary logs, local caches, Developer Tools output, or generated directories.
- Before changing permissions, authentication, backend endpoints, cloud environments, database behavior, production settings, or anything that may incur cost, explain the risk and obtain explicit approval.

## Agent Behavior Rules

- The user is a complete beginner. Explain what each step is for, define technical terms on first use, and do not skip prerequisites.
- State assumptions. If a request has multiple reasonable meanings, present them instead of silently choosing one.
- Point out a simpler valid approach when one exists. If requirements remain unclear and the wrong choice could change behavior or data, stop and ask.
- Read the relevant files and describe the plan before editing.
- Prefer the smallest task-focused change. Do not refactor, rename, reformat, or "clean up" unrelated code.
- Preserve existing behavior unless the user explicitly requests a change.
- Do not invent commands, files, APIs, tests, backend capabilities, or release workflows.
- Do not install dependencies, run automatic fixes, or format the whole repository without authorization.
- Do not commit, push, upload, deploy, publish, release, or execute database operations without explicit authorization.
- Report failed or unavailable checks honestly.
- Never bulk-delete files or directories. Do not use recursive deletion commands. If deletion is required, remove only one explicitly named file at a time; ask the user before any multi-file cleanup.

## Pre-Commit Checklist

Before any authorized commit:

1. Run `git status --short --branch` and confirm Git metadata is available.
2. Review `git diff` and `git diff --stat`.
3. Confirm only files related to the current task changed.
4. Check that no secrets, identifiers, credential values, debug logs, caches, or unexpected generated files are included.
5. Run the relevant available checks and complete the applicable manual Developer Tools checklist.
6. State which simulator, device, backend, lint, or other checks were not run.
7. Obtain explicit authorization before commit, push, upload, deployment, publication, release, or database work.
