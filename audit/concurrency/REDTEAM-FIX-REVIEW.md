# Red-team review of concurrency/state repairs

Final review status (2026-10-10): **accepted within the reviewed scope**. The first repair pass required changes: R1 exposed a stale same-difficulty home display; R2 and R3 were confirmed uncovered variants of the original feedback/reset issues. All three, the unrelated-difficulty reset feedback regression, and the additional equal-cache reset counterexamples now pass independent verification. The initial counterexamples below remain as a record of why the follow-up repairs were necessary. This is not a claim of exhaustive failure-proof behavior or native device acceptance.

## Scope and constraints

Read-only review of shared storage/ScoreManager, the three GameState reset/eligibility boundaries, Web/Android Main storage listeners, WeChat asynchronous admin tokens, and `tests/parity/state-race-regressions.test.mjs`. The source of truth / generated file boundary remains intact. No source or test was edited by this reviewer; all extra evidence remains under `audit/concurrency`.

## Improvements independently accepted

- Final repository state-race and reset-reconciliation suites: **34/34 passed** in this review. These include the normal successful reset whose display was already refreshed before its completion callback, and reset of a next-round difficulty while an active-round save is pending.
- Independent reset fault/ordering boundary tests: **13/13 passed**; four additional equal-cache counterexamples: **4/4 passed**. The repository suites incorporate these cases, so the counts overlap and must not be added as distinct coverage.
- Original storage fault matrix continued passing across three platforms.
- Return home / switching to a different difficulty no longer applies an old round's score to the wrong selected difficulty.
- Successful reset with a new round started while the lock is pending reconciles correctly.
- Additional case: new-round scoring is queued before reset completion; reset completes first, then the new valid score is retained, with no false first-round celebration.
- Reset of the next selected difficulty while the active round remains on another difficulty preserves active score and other stored difficulties.
- Storage write/read failures preserve trustworthy cache instead of claiming an unsuccessful clear.
- An injected coordinator rejection after its synchronous update already wrote storage is reconciled from the actual stored record; no assumption that rejection proves rollback remains.
- Stale or superseded WeChat admin verification cannot affect another panel or round; current valid verification can still complete while the app background path cancels dragging, and the next administrator game remains excluded from formal records.
- Undo eligibility is monotonic within a round, and shared ScoreManager rejects an inconsistent active-admin state independently.
- Lock acquisition, complete read/merge/write coordination, legacy migration, key formats and platform-specific synchronous WeChat semantics remain unchanged.

## Final counterexample outcomes

| Review item | Affected platform path | Final result and evidence |
| --- | --- | --- |
| R1, old round completes after return home | Web and Android browser modules; native WeChat writes synchronously | Same-difficulty home now reads 10 after an earned 10 commits over stored 5. Verified in actual Chromium with both actual Web Locks and the actual IndexedDB fallback; `browser/results.json` has zero page errors for both. |
| R2, delayed unrelated storage event sees newer own commit | Web storage listener; Android shared browser listener where same-origin contexts share storage; native WeChat has no browser storage-event path | Actual two-page Chromium/IndexedDB event tests captured five critical natural interleavings in each of three modes. Unrelated easy event retains normal threshold 0 despite fresh own 10; external normal event 0→20 retains threshold 20 despite fresh own 30; external normal reset 100→0 retains threshold 0 despite fresh own 10. All settled outcomes passed. |
| R3, reset read fails transiently | All three adapters for a synchronous read fault; delayed coordinator variants additionally apply to Web/Android | Confirmed reset, rejection before update, rejection after update, next own save, and already queued own save recover correctly. Failure-before-update retains stored/displayed 100; update-before-failure recovers stored/displayed 10 and threshold 0. Reads remain authoritative; no default-zero full-object write was added. |
| Equal-cache reset follow-ups | Web/Android asynchronous reset completion; three GameState implementations share the reconciliation design | Display-only refresh to 0 no longer prevents a pending threshold from falling from 100 to 0. Both next and already queued score callbacks pass. Ordinary successful reset also explicitly reconciles its current target threshold when the display already equals the new stored value. |
| RQ01, reset selected next difficulty | Web/Android delayed active-round saves | Resetting easy while active normal has a pending save does not advance normal's generation or turn its own first score into an external record threshold. Both repository platform tests pass. |
| Admin request/eligibility | WeChat delayed UI verification; shared record guard on all three platforms | Canceled/superseded results remain inert. A still-current valid WeChat response remains accepted during background cancellation, and the following administrator round stays excluded from formal records. |

### Why the final reconciliation is accepted

`ScoreManager` keeps legitimate historical writes while preventing an obsolete generation or difficulty from directly overwriting current UI state. Obsolete successful completions perform a trusted refresh of the current selection. Current completions still use the value returned by the coordinated read/merge/write; no unlocked write path was introduced.

After a reset read fails, `pendingBestScoreRefresh` records the target difficulty, generation, and whether its feedback threshold has already been reconciled. Confirmed successful reset can establish the affected current threshold at zero while leaving the last trustworthy display intact. An uncertain coordinator result does not assume rollback: a later own save can provide `saved.previous`, the value read under the original lock before that save, as the threshold source. A recovered trusted read updates the display and resolves an unresolved threshold explicitly, even when that display was already refreshed to the same value by another event. A pending entry is retained when reads still fail. The next scoring attempt and foreground lifecycle retry the pending read; there is no permanent polling loop.

The transient-read tests are deliberate adapter fault injection. They establish how the code responds to those faults; they are not evidence that Chromium spontaneously produced the injected exception or transaction abort during browser testing.

## R1 — P2 — Return-home completion still renders the old same-difficulty record

The old-generation apply is correctly dropped, but the completion callback only redraws. A home screen initialized before persistence completes never reloads the newly earned historical score.

Actual sequence: stored normal=5 → legal placement earns 10 while another page holds the lock → return home with normal still selected → release lock → wait for `pendingBestScoreWrites=0`.

Observed: storage normal=10, selected normal home display=5. This was reproduced with **actual Chromium and actual Web Locks, then actual IndexedDB coordination**, using two pages on the same local origin. There is no replacement of the product coordinator or scoring logic in the browser proof.

Suggested repair: obsolete completion should trigger a trusted current-state refresh, not apply an old saved value to whichever difficulty is now displayed. Failed refresh must retain existing trustworthy cache. A blanket threshold adjustment after every own-current-round completion needs care because the first-round feedback suppression remains a frozen rule.

Evidence:

- `repro-fix-counterexamples.mjs`, R1 both platform module sets.
- `browser-fix-check.mjs`.
- `browser/results.json`.
- `browser/r1-web-locks.png` and `browser/r1-indexeddb.png`.

## R2 — P3 — Naturally delayed easy-only storage event mistakes a newer own normal write for an external record

The equality guard in `refreshBestScores` fixes a completed own-write case but cannot identify what a storage event actually changed when its delivery lags behind a newer write.

**Natural Chromium reproduction, no synthetic event or forced callback reordering:**

- Two same-origin pages, actual IndexedDB fallback (Web Locks disabled solely to select that supported path).
- Page B calls real `saveBestScore('easy',20)` concurrently with page A making its first legal normal placement for 10 points.
- A receives a real `storage` event: old `{easy:0, normal:0, master:0}`, new `{easy:20, normal:0, master:0}`. The event changed only easy.
- At delivery, latest localStorage is already `{easy:20, normal:10, master:0}` because A's own synchronous write has happened, but its IDB completion Promise remains pending. A's cached best and starting threshold are still 0.
- The new listener rereads latest normal=10 and raises the first-round threshold to 10.
- A's next legal normal placement reaches 20 and falsely sets `hasShownNewRecord=true`.

The counterexample appeared on iteration 23 of the captured browser run (and on iteration 5 of the first run). The loop stops once a counterexample is observed; the evidence records real event old/new values and localStorage at event delivery. The trace's `after` microtask executes before the product listener in this browser's event delivery checkpoint; final `starting=10` and second-placement `record=true` are the decisive settled observations.

Suggested repair: pass storage event context / current-difficulty change information to feedback-threshold reconciliation. Continue reading latest trustworthy values for display, but an event that changes only another difficulty must not redefine this round's external threshold. Equality against a stale UI cache alone is insufficient.

Baseline evidence: `browser-natural-event-race.mjs`, `browser/baseline-natural-event-race.json`. The latter preserves the exact originally observed stdout, with its provenance stated in the file; the original results file was overwritten by the passing rerun. Final evidence: `browser/natural-event-race.json` (500 attempts, no counterexample) and `browser/event-source-checks.json` (15 positively observed critical interleavings, all correct). The three targeted modes reached five critical interleavings after 37, 130 and 27 attempts respectively; there were zero page errors.

## R3 — P2 — A one-time failed reconciliation read leaves a successful reset stale after storage recovers

Actual adapter-level fault injection: an active normal round displays historic best 100. Explicit reset successfully writes 0. The immediate reconciliation read throws once, so keeping the old trustworthy cache is correct for that instant. Reads then recover; the next valid score operation persists 10, but ScoreManager takes `Math.max(100,10)`, leaving display and starting threshold at 100 indefinitely until another reinitialization/reconciliation.

Observed on Web and Android module flows: stored normal=10, UI best=100, starting=100 after the recovered write.

Suggested repair: retain a pending trusted-reconciliation marker when reset completion cannot read, and retry it before a later score read/merge/write can turn stale cache into a permanent maximum. A verified successful reset may provide a carefully scoped fallback for its affected difficulty. Avoid defaulting all difficulty fields to zero or treating a failed transaction as proof of no side effect.

Initial evidence: `redteam-extra-paths.mjs`, R3. Its final rerun reports stored=10, UI=10, threshold=0 for Web and Android. Final assertions: `reset-reconcile-boundaries.test.mjs` (13/13) and `pending-threshold-equality.test.mjs` (4/4), plus the integrated `tests/parity/reset-reconcile-regressions.test.mjs`. These are controlled transient read failures, not a claim that Chromium naturally threw those exceptions during this run.

## Browser QA environment and limits

Applied `frontend-testing-debugging`; Browser plugin was unavailable, so existing Playwright was used. No browser, package, font, or toolchain was installed.

- Existing Playwright: `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`.
- Existing executable explicitly selected: `/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell`.
- Target: local HTTP server serving the real Web docs tree, with only the repository's existing browser-test pattern exposing the original Main instance.
- Viewport: 390 × 844.
- Page identity, nonempty Canvas dimensions, hidden boot error overlay and zero page errors were verified for R1.
- Screenshots were actually inspected: the numeric record is legible, but this container lacks suitable Chinese fonts and renders Chinese as missing-glyph boxes. They support state/number verification, not full Chinese typography acceptance. No product font change is requested on this basis.
- Browser-hosted Android assets and Node adapter tests do not establish APK/device acceptance.

## Commands executed

Working directory for the repository command is `/workspace/scratch/7bb2fb03b768/source/relax-block-puzzle`.

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-concurrency=1 tests/parity/state-race-regressions.test.mjs tests/parity/reset-reconcile-regressions.test.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-concurrency=1 /workspace/scratch/7bb2fb03b768/audit/concurrency/reset-reconcile-boundaries.test.mjs /workspace/scratch/7bb2fb03b768/audit/concurrency/pending-threshold-equality.test.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /workspace/scratch/7bb2fb03b768/audit/concurrency/storage-fault-matrix.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /workspace/scratch/7bb2fb03b768/audit/concurrency/redteam-extra-paths.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /workspace/scratch/7bb2fb03b768/audit/concurrency/browser-fix-check.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /workspace/scratch/7bb2fb03b768/audit/concurrency/browser-natural-event-race.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /workspace/scratch/7bb2fb03b768/audit/concurrency/browser-event-source-checks.mjs
```

All listed final validations passed. Earlier scripts named `reproduce-*` and `repro-fix-counterexamples.mjs` intentionally assert historical buggy outcomes; they remain provenance/reproduction material and are not final release gates. Root owns the complete test/parity/verify/assets/simulation/build matrix; this review does not substitute its focused results for those gates.
