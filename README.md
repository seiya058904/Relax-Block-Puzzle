# Relax Block Puzzle / 轻松俄罗斯方块

Relax Block Puzzle is a lightweight casual block puzzle game for Android. Drag blocks onto a 10x10 board, fill complete rows or columns, and enjoy a clean, relaxing puzzle experience.

轻松俄罗斯方块是一款轻量级休闲方块消除游戏。玩家拖动方块放入 10x10 棋盘，填满整行或整列即可消除，适合碎片时间轻松游玩。

## Features

- 10x10 block puzzle board
- Three difficulty levels: Easy, Normal, Master
- Local best scores saved by difficulty
- Refresh, Clear, and Undo tools
- Four BGM tracks with sound and vibration settings
- Welfare code based local member benefits
- Hidden local admin mode for internal testing only
- Lightweight offline Android play

## Gameplay

- Drag one of the available blocks onto the board.
- Fill a full row or column to clear it.
- Choose a suitable difficulty before starting a run.
- Use tools carefully to recover from difficult board states.
- Local welfare benefits can grant extra revive chances in offline play.

## Android APK Release

Source code and project files are stored in this repository. APK files should be attached through GitHub Releases instead of being committed to the repository root.

Suggested release:

- Tag: `v1.0.1`
- Title: `Relax Block Puzzle Android v1.0.1`

## Installation

1. Download the APK from the latest GitHub Release.
2. Transfer it to an Android device if needed.
3. Allow installation from unknown sources when Android asks for permission.
4. Install and open the game.

## Screenshots

Screenshot placeholders can be added here later:

- Home screen
- Gameplay screen
- Settings screen

## Tech Notes

- Android shell built with Kotlin and WebView.
- Core gameplay runs from local HTML, JavaScript, and audio assets bundled inside the app.
- Designed as an offline Android version and does not require WeChat login or cloud hosting.

## Version

- Current public repository baseline: `v1.0.1`

`v1.0.1`

- Improved Android drag responsiveness
- Fixed background transition jank when entering recent apps
- Stabilized Android WebView canvas rendering
- Limited Android canvas DPR for better performance
- Kept APK as an offline debug/preview build

## Security Note

- Signing keys, keystores, local environment files, and build caches are intentionally excluded from version control.
- APK build output is not stored in the repository root.

## Disclaimer

This is an independent casual block puzzle project and is not affiliated with any official game brand.
