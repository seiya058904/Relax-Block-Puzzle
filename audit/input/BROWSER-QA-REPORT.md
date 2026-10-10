# Independent browser QA — Input and viewport fixes

## Summary

The targeted browser checks pass after the root agent's fixes: **42/42 Web matrix checks, 11/11 additional Web keyboard-resize checks, and 43/43 Android packaged-assets browser-host checks**. These total 96 recorded assertions across three runs, including repeated checks across platforms; this is not 96 distinct user flows.

The same browser reproduced the supplied baseline's idle-keyboard, invalid-error, lost-mouse-release and short-viewport faults before the fixes. Baseline Web assets were copied to a separate temporary directory before product changes so the comparison was not contaminated by the active edits.

No production source or repository regression test was edited by this reviewer. The root agent owns the changes. All temporary scripts and evidence are outside the repository.

## Environment and boundaries

- Browser plugin unavailable; used the already-installed Playwright 1.62.1 and existing Chromium Headless Shell **141.0.7390.37**. No dependency installation.
- Each run started a local HTTP server on `127.0.0.1` with an ephemeral port. The exact URL is in each `report.json`.
- The original `game.js` has one `new Main();`; the server only changes that expression to assign its one existing instance to `window.qaMain`. No second Main was instantiated.
- Canvas rendering and JavaScript are the real production modules. Render observations record the values presented to the renderer and the text sent to the real Canvas context.
- Viewports: **1280×900, 390×844, 320×568, 568×320, 640×360**, DPR 1.25; the context supports actual touch and mouse events.
- Web assets: `we xin xiao cheng xu-android-apk/docs`.
- Android-assets host: `we xin xiao cheng xu-android-apk/app/src/main/assets`, served unchanged in Chromium, including its own shim and HTML.
- Android browser-host checks do **not** establish APK, WebView, Kotlin lifecycle or physical device acceptance. WeChat's native environment was not used in these browser runs.
- The container lacks a CJK font, so Chinese glyphs appear as boxes in screenshots. Actual Canvas strings were captured and checked. The screenshots establish layout, visible state, nonblank rendering and lack of overlays; they do not establish native Chinese font rendering quality.

## Baseline evidence

The baseline `report.json` records 27 checks meeting their intentionally expected baseline behavior and one failed health check caused by a real crash. Do not report the baseline as a green acceptance run.

| Finding | Actual baseline result |
|---|---|
| Native keyboard idle refresh | Touching the code field focuses `wxKeyboard`; typing `INVALID-AUDIT` changes game state but the last rendered value remains empty and RAF is 0. |
| Invalid-code error | Real touch confirmation after native typing leaves the membership panel open but clears its error; the error is not visible. |
| Mouse field focus | Clicking the field with the mouse focuses the hidden input inside the handler, then default mousedown behavior removes focus; `document.activeElement.id` is empty. The touch path does not have this problem because touchstart prevents default. |
| Lost mouse release | A real piece pickup followed by a browser blur signal and CDP mousemove with `buttons:0` leaves the drag active. The next ordinary click places the stale piece and changes score 0→40 in the recorded run. |
| 568×320 viewport | Resize invokes `CanvasRenderingContext2D.arcTo` with radius **-11**, producing `IndexSizeError`. The global boot-error handler displays “启动失败” and hides the Canvas. Returning to 390×844 leaves the error visible and Canvas hidden; a reload is required. |
| 640×360 viewport | No exception, but the board is only 10 logical pixels wide and candidates are effectively invisible. |

The mouse focus-loss signal was dispatched to the real browser and followed by real CDP button-state input. A physical desktop OS window focus transition was not automated; that boundary remains explicit.

## Fixes verified

| Check | Result and evidence |
|---|---|
| Page identity | Expected Chinese game title, one Main instance, correct local URL. |
| Nonblank app | Positive Canvas bitmap dimensions and meaningful home/game screenshots. |
| Error overlay | Hidden on all fixed viewports and interaction flows; baseline 568×320 failure no longer occurs. |
| Console health | **0 page errors and 0 console errors** in all three fixed runs. |
| Mouse keyboard focus | A real mouse click now leaves `wxKeyboard` focused. Native DOM input handling remains available. |
| Idle native keyboard | Input text is rendered immediately through the existing path. The renderer still becomes idle afterward. |
| Invalid code | Error is retained and drawn while the panel stays open. |
| Short viewport with native input | Type `INVALID-AUDIT`; shrink to 568×320 with field focused; type `Z`; restore 1280×900. Game state and Canvas both show **`INVALID-AUDITZ`**, and the same membership panel remains open. |
| Stale mouse drag | Blur / zero-button movement cancels the owned drag. A later ordinary click keeps score and board unchanged. |
| Visibility separation | Browser blur leaves `document.hidden=false` and `Main.isPaused=false`; it does not pretend to be a page hide. |
| Normal views | 1280×900, 390×844 and 320×568 keep the normal playable board and three candidate hit areas. |
| Small-view fallback | 568×320 and 640×360 show the existing background and two centered text lines. Captured text includes **“请转为竖屏或增大窗口”**. Rack and tool hit areas are empty and RAF is 0. |
| Round preservation | Clicking the fallback does not change board, score or rack. Returning to 390×844 restores the same game and three candidate hit areas. |
| Live animation freeze | A real drag places the last single cell into a nearly full row. During the 180 ms clear wait, viewport shrinks to 568×320. After waiting 500 ms, pendingClear, board, score and RAF state are identical. |
| Resume exactly once | Returning to 390×844 finishes that original line clear once: score becomes **160** (10 placement + 150 line), the row is empty and input unlocks. |

The live-clear setup uses an explicit test fixture of one row with nine cells filled and three single-cell candidates. The final placement goes through real mouse input and the production scoring/clear path. The fixture does not replace the tested scoring, timing or input implementation.

Recorded remaining clear time in the Web run is **163.3 ms before and after the 500 ms fallback wait**. Android-host results independently pass the same invariant.

## Independent visual review

- The small-view fallback is appropriately limited to the unsupported view. It retains the established blue background and has one centered title plus one instruction, with enough separation and no surviving game controls. It does not introduce a different game layout.
- The 320×568 normal view remains within the viewport, with board, toolbar and rack separated. No new overlap or clipping was observed relative to its baseline; randomized rack contents naturally differ between runs.
- The invalid membership-code state now shows typed text plus a separate error row above the custom keypad. The error and keypad do not overlap in the reviewed desktop screenshot.
- The fallback text content is confirmed from real `fillText` calls. Native CJK glyph quality remains unverified because of the container's missing Chinese fonts; these boxes are an environment limitation, not a newly found product issue.

A separate production Renderer geometry check at **320×568 with top inset 59 and bottom inset 34** confirms the boundary remains enabled on all platforms. WeChat additionally receives a menu capsule at top 48, height 32. Results: WeChat cell 19, rack bottom 520.36; Web/Android cell 18, rack bottom 522.24; all are unblocked and below safe bottom 534.

## Reports, scripts and screenshots

- `browser-qa.mjs`: targeted server + Playwright repro/acceptance script, baseline/fixed mode and input-only option.
- `browser/baseline/report.json`: pre-fix browser evidence.
- `browser/fixed/report.json`: 42/42 fixed Web matrix and live-clear checks.
- `browser/fixed-keyboard-resize/report.json`: 11/11 additional keyboard/resize checks.
- `browser/fixed-android-host/report.json`: 43/43 fixed packaged-assets host checks, including keyboard resize and live clear.
- `browser/baseline/viewport-568x320.png`: actual boot-error overlay with negative-radius stack.
- `browser/fixed/viewport-568x320.png`, `viewport-640x360.png`: corrected fallback.
- `browser/fixed/viewport-320x568.png`: normal minimum-size gameplay.
- `browser/fixed/native-keyboard-invalid-confirm.png`: input text and persistent invalid-code error.
- `browser/fixed-keyboard-resize/keyboard-resize-recovered.png`: preserved text after viewport recovery.
- `browser/fixed/fallback-frozen-clear.png`, `fallback-clear-resumed.png`: same round frozen and resumed.

The temporary `baseline-web` tree contains duplicated full audio solely to preserve the pre-fix reference. **Exclude it from the final source ZIP.**

## Commands

The temporary script was invoked from the project root:

```sh
node /workspace/scratch/7bb2fb03b768/audit/input/browser-qa.mjs --baseline
node /workspace/scratch/7bb2fb03b768/audit/input/browser-qa.mjs --fixed
QA_INPUT_OUTPUT=/workspace/scratch/7bb2fb03b768/audit/input/browser/fixed-keyboard-resize \
  node /workspace/scratch/7bb2fb03b768/audit/input/browser-qa.mjs --fixed --input-only
QA_INPUT_ROOT='/workspace/scratch/7bb2fb03b768/source/relax-block-puzzle/we xin xiao cheng xu-android-apk/app/src/main/assets' \
QA_INPUT_OUTPUT=/workspace/scratch/7bb2fb03b768/audit/input/browser/fixed-android-host \
  node /workspace/scratch/7bb2fb03b768/audit/input/browser-qa.mjs --fixed
```

The artifact is a temporary audit harness with this environment's executable/path defaults, not a new production dependency or replacement repository test command. Existing repository tests remain the repeatable release gate.

## Remaining limits

Physical Android/WeChat input cancellation, real virtual IME resize/pan behavior, native safe areas and CJK font metrics require device testing. These have not been described as passed. No new unresolved product regression was observed in the tested Web and packaged-assets browser paths.
