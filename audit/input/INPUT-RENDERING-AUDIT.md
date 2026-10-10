# Input / Rendering / Cross-platform independent audit

Baseline: supplied 4d1c308 source handoff. This review did not edit product source, generated files, or repository tests. Repro scripts live outside the project. Root agent owns fixes/integration.

## Scope and evidence

Read root and both platform AGENTS.md, UNIFIED_SPEC.md, PLATFORM_SYNC.md, platform-manifest.json. Inspected the real three-platform InputManager, Main, Renderer, LayoutMetrics, FrameInputQueue, DragModel, browser/WebView shims and the relevant GameState paths. Inspected independent platform adapters rather than demanding textual equality.

Existing focused regression run: 24/24 passed (touch-session, modal-closing-input, main-runtime, wechat-runtime, viewport-events, render-scheduler, frame-input-queue, drag-model). This is recorded in `existing-targeted-tests.log`. The new paths below are absent from that test selection. A passing existing suite does not disprove them.

New reproducible evidence:

- `repro-input.mjs`, output `repro-input-results.jsonl`: real imported production GameState/InputManager and, for the first two cases, real Main + browser shim; minimal event targets and fake Canvas/audio/RAF only.
- `repro-short-viewport.mjs`: real production Renderer → GameState → InputManager, fake Canvas context only.
- `repro-audio-redteam.mjs`: real production SoundManager, observable fake native audio contexts; independently challenges root agent audio findings.

No Chromium binary, Android device or WeChat Developer Tools acceptance was available during this review. Do not label the above as physical device or browser rendering verification.

## Confirmed findings

### INPUT-01 — P2 — Native/physical membership-code keyboard updates never wake the idle Canvas

**Platforms:** Web and Android WebView; WeChat is unaffected by this exact omission.

**Baseline code:** Web `docs/js/game/InputManager.js:536–562` and byte-identical Android `app/src/main/assets/js/game/InputManager.js`. Setter at `GameState.js:547–550`. Native DOM input is hidden with `opacity:0` in both HTML entries. Web Renderer draws the text at `Renderer.js:1788–1797`.

**User path:** Open Settings → account → membership/welfare code; allow its open motion to finish; focus the code field and type with the native/physical keyboard, then press Enter or dismiss the native keyboard.

**Actual:** `membershipInput` changes but neither a render nor a frame is requested. Evidence after input: value `TEST-AUDIT`, `renderDelta=0`, `pendingFrames=0`. Canvas continues to show its old text until another unrelated interaction redraws it. The custom drawn keypad requests immediate renders and therefore does not reproduce this omission. During the panel's opening animation the ongoing frames temporarily mask it.

**Root cause:** All three keyboard callbacks call only `setMembershipInput`; unlike the WeChat callbacks, none invokes the existing render callback. GameState setters intentionally do not own scheduling.

**Minimal fix:** Request the existing immediate render after accepted input, confirm and complete callbacks. Preserve the hidden/paused guards in Main and do not add an always-on loop.

**Regression:** Let the real Main settle to zero RAF, invoke each keyboard callback while the panel is open, assert the updated text was rendered or exactly one normal frame was requested; assert no rendered frames while paused, and normal redraw on foreground. Include a panel-closed no-op counterexample.

**Confidence:** High, deterministic production adapter repro. Native IME appearance requires device QA.

### INPUT-02 — P2 — Lost mouse release after window focus loss keeps a stale drag alive

**Platforms:** Web desktop; Android only when using an attached mouse. WeChat native touch ownership/cancel path is unaffected.

**Baseline code:** Web `browser-wx-shim.js:111–134`; Android shim `:111–131`. The Web shim accepts only primary mouse down; Android additionally lacks that primary-button guard. Neither handles stale `mouseDown` on lost focus or `mousemove.buttons === 0`. Visibility callbacks deliberately track actual visibility, not focus.

**User path:** Start dragging a piece; switch focus to another still-visible desktop window; release the mouse outside the game so the page does not receive mouseup; return without a button held; later make an ordinary click.

**Actual:** A `mousemove` with `buttons:0` still updates the drag. The next click can place the old piece and change score. The production Main+shim repro starts from an empty board and records >0 occupied cells and 30/40 points after the unrelated click. The exact piece cell count is random, not the cause of the failure.

**Root cause:** `mouseDown` is only cleared by window mouseup, and InputManager cannot distinguish the synthesized stale mouse movement from a valid owned touch. `document.hidden` remains false during focus changes to a second window, so lifecycle cancellation does not run.

**Minimal fix:** Cancel just the pointer session on focus loss and on a move that proves the primary button is no longer down; clear the shim mouse state. Preserve BGM and actual page hide/show semantics. Also reject non-primary mousedown on Android for matching conventional input semantics.

**Regression caution:** `tests/parity/web-audio-stability.test.mjs:67–74` currently forbids any literal window blur/focus listener, a source-text overconstraint meant to protect music. Do not weaken the intended guarantee: replace it with behavioral evidence that focus loss cancels input but does not notify lifecycle/BGM pause. Test actual hide still cancels and stops audio; test next unrelated click does not commit the stale piece.

**Confidence:** High for adapter behavior; physical OS lost-release sequence was not run in an actual browser.

### INPUT-03 — P2 — Dismissing the native keyboard during invalid-code confirmation clears the validation error

**Platforms:** Web and Android WebView. WeChat does not run the explicit submit-then-hide sequence; do not claim native WeChat reproduction.

**Baseline code:** Web/Android `InputManager.js:397–402` submits first then calls `wx.hideKeyboard`; shim Web `:380–383,496–499` / Android `:377–380,493–496` synchronously blurs and emits complete; `InputManager.js:556–559` calls the setter; `GameState.js:547–550` unconditionally clears `membershipError`.

**User path:** Open the native code keyboard, type an invalid code, tap the Canvas Confirm button while the hidden DOM input still has focus.

**Actual:** Submission sets `福利码无效`; explicit keyboard blur emits complete with the unchanged value; the setter resets that error to empty before the requested render. The action appears to do nothing. Repro records `initialError='福利码无效'`, `afterConfirm=''`.

**Minimal fix:** Ensure the final keyboard commit happens before validation, or have completion skip a setter call when the value has not changed. Either approach must retain normal error clearing when the user actually edits the code. Simply adding a render to INPUT-01 does not fix this sequencing bug.

**Regression:** Real submit callback + synchronous complete/blur; invalid input must leave the panel open and retain its error; editing the text must clear the old error; valid submission must still close the panel; closed-panel completions must do nothing.

**Confidence:** High for browser adapter event order; exact native keyboard UI ordering remains manual QA.

### INPUT-04 — P3 — Touch cancellation erases unrelated ongoing feedback on Web/Android

**Platforms:** Web and Android. WeChat already uses the narrower correct cancellation.

**Baseline code:** Web/Android `GameState.js:1370–1374` calls `clearFeedbackState` then `clearDrag`; WeChat `GameState.js:1402–1406` only calls `clearDrag`.

**User path:** Successfully place one piece, immediately pick up the next while the preceding score-gain feedback is active, then receive TouchCancel, resize or background cancellation.

**Actual:** Score and board remain correct, but the preceding score-gain/high-score/other feedback is discarded. A separate reconciliation repro also demonstrates erasure of a newly created modal animation if a stale physical session is reconciled after a state transition. The direct physical path repro reports score stays 10 on all platforms; gain remains active on WeChat but becomes inactive on Web/Android.

**Minimal fix:** Cancel only drag/model/preview/queued input; retain unrelated feedback. Full feedback reset belongs to restart/undo/other existing explicit reset paths.

**Regression:** Complete one real placement, start a second real drag, cancel it, assert board/score unchanged and previous score feedback retained while drag is gone. Also preserve existing undo's complete feedback clear.

**Confidence:** High; visual-only P3, no data corruption claim.

### INPUT-05 — P2 Web; conditional native exposure — Short viewport creates a nonpositive cell size and throws on pickup

**Platforms:** Web is directly exposed to browser resize/orientation. Android Manifest explicitly has `screenOrientation=portrait`; WeChat `game.json` has `deviceOrientation=portrait`. The same formulas on native adapters fail if the host does supply a sufficiently short usable window, but this audit does not assert native rotation bypasses those orientation settings.

**Baseline code:** Web/Android `Renderer.js:242–256`; WeChat `Renderer.js:204–220`; shared `DragModel.js:39–42` correctly rejects nonpositive cell size.

**User path:** Start a game in a normal portrait view; resize the web page to 568×320 / rotate a short device. Tap a candidate slot.

**Actual production-class evidence:**

| Platform / viewport | Cell size | Board width | Rack center hit | Pickup result |
|---|---:|---:|---|---|
| Web / Android 568×320 | -3 | -30 | yes | throws positive-cellSize TypeError |
| Web / Android 360×300 | -5 | -50 | yes | throws positive-cellSize TypeError |
| WeChat 360×300 | -1 | -10 | yes | throws positive-cellSize TypeError |
| Web / Android 640×360 | 1 | 10 | yes | no exception, board practically unusable |
| Web / Android 844×390 | 4 | 40 | yes | no exception, very small board |

The repro uses real Renderer and InputManager, not a manual direct DragModel injection. Candidate hit slop still hits negative-sized pieces, triggering the constructor guard. The shim catches touch-handler exceptions, so do not label it a browser-wide crash; this is invalid board geometry and failed game input. Canvas raster output itself has not been checked.

**Minimal-scope conclusion:** Do not change the shared DragModel guard or loosen parity tests. A focused short-viewport fallback can prevent invalid geometry without altering the ordinary portrait layout, but it needs deliberate layout/device verification. Clamping to 1 alone avoids the throw and does not establish playable landscape support. Root agent should either implement and verify a constrained fallback or carry this as a clearly documented limitation; do not claim an untested redesign fixes it.

**Confidence:** High for negative geometry and failed pickup; native-host reachability conditional.

## Independent audio Red-Team results

Root agent requested separate verification of three audio findings. `repro-audio-redteam.mjs` confirms them without accessing actual account data or changing storage.

1. **P2 WeChat effect lifecycle:** `SoundManager.js:244–247` hides only BGM; an already-playing effect receives zero stop calls. `playEffect:158–161` ignores `appHidden`, so another request while hidden adds a play. Web/Android `stopAllEffects` and appHidden guard provide counterexamples and behave correctly. UNIFIED_SPEC lines 139,163,219 explicitly require all audio to stop. Native WeChat may provide additional OS behavior; not tested and not a justification for omitting the adapter contract.
2. **P2 all-platform mute:** `setSettings:45–69` never stops active effect contexts on soundEnabled true→false; new effects are gated, current ones continue. All three probes show zero added stop calls and `playing=true`. UNIFIED_SPEC lines 226,229 require disabled effects and immediate application. Root should verify actual sound durations before overstating how long residual audio remains.
3. **P3 WeChat BGM restart on unrelated setting change:** unchanged track and enabled BGM enter syncBgm→playBgm (`:191–212`) which stop/seek(0)/play. Toggling vibration deterministically produces stops+1,seeks+1,plays+1. Web/Android only call play with no stop/seek, preserving the current stream. Avoid replacing WeChat native audio with the browser adapter; make unchanged-setting application idempotent locally and keep intentional restart on actual foreground/track changes.

## Counterexamples and areas with no additional confirmed defect

- Owner identifier 0 is accepted; reordered two-finger lists and another finger's end/cancel do not end the owned session.
- Missing malformed end coordinates cancel rather than placing; final touchend coordinates are flushed before endDrag.
- Viewport changes and actual app background cancel owned sessions and clear queued input, with unchanged board.
- Closing modal animation blocks underlying touches; no reproducible close-animation click-through found in the covered flows.
- Main's existing render path returns to idle; paused/hidden guards stop frame work; delayed auth and best-score callbacks already use the normal render path. The native-code keyboard omission is a separate uncovered callback source.
- An undo during the explicit pending-clear input lock is rejected consistently; undo after allowed placement restores the existing snapshot and clears transient effects as specified. No alternate race proven here.
- FrameInputQueue retains only the newest point, schedules one request, and clears pending state on cancel. DragModel hysteresis and last-valid tolerance have direct branch coverage in the existing tests.
- Canvas surface caches are bounded and invalidated on viewport changes; no reproducible leak from normal cache reuse found.
- Canvas context-restoration, IME viewport behavior, unusual safe-area changes without dimension changes, and real native device integration require manual/device evidence. They are not counted as discovered product bugs.

No P0 or P1 finding is established by this input/rendering review. All findings preserve the fixed game rules and platform-specific adapter boundaries.

## Subsequent actual-browser verification

After the initial read-only review, an existing Chromium Headless Shell binary was found. The independent real-browser before/after pass is documented in `BROWSER-QA-REPORT.md`; its evidence supersedes the earlier statement that no browser binary was available.

The browser confirms INPUT-01/02/03 and strengthens INPUT-05: at 568×320 the real Canvas renderer throws a negative-radius arcTo `IndexSizeError` before candidate pickup, producing a persistent boot-error overlay. It also confirms a related mouse-native-keyboard focus issue from the canvas mousedown default action. The root agent's fixes pass 42 Web matrix assertions, 11 additional Web keyboard/resize assertions and 43 Android packaged-assets Chromium-host assertions, including freezing a real pending line clear in fallback and completing it once after restoration. Native APK, WeChat device and real mobile IME acceptance remain separate and unclaimed.
