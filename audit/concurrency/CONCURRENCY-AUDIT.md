# Concurrency / Persistence independent audit

Baseline: supplied `4d1c308` handoff. Audit reads used the extracted repository at `source/relax-block-puzzle`; no source, platform generated copies, test suites, synchronization, Git, backend, or production settings were modified by this auditor. Reproduction harnesses live alongside this report and use the existing repository Node test helpers.

## Confirmed findings

### C1 — P2 — Obsolete round completion rewrites the home screen's selected difficulty score

- Code: `shared/js/game/ScoreManager.js:49–63`; all platform `GameState.initializeHomeState` at line 210; Web/Android `confirmReturnHome:487–489`; WeChat counterpart `504–506`.
- Actual route: normal game earns one legal single-cell placement while its best-score lock is queued → return home → choose easy → original normal write completes.
- Observed: persistent easy best remains 2, normal becomes 10; UI currently shows easy but `state.bestScore` becomes 10. The result is visible through the normal render completion path.
- Root cause: `startNewGame` and explicit reset increment `bestScoreGeneration`, but returning home does not. The delayed callback can pass its generation check and merge the old difficulty's saved score with the current global display score.
- Platforms: Web and Android asynchronous adapters reproduced. Native WeChat synchronously finishes best-score writes before UI transitions, so this particular race is not naturally reachable there.
- Minimal fix: invalidate round-bound UI completions on return-home initialization, and guard difficulty ownership at application time. Preserve valid historical writes earned before the transition; invalidating a UI callback should not cancel their persisted record.
- Evidence: `reproduce-state-races.mjs`, cases C1 Web/Android.
- Confidence: high.

### C2 — P2 — Reset completion does not reconcile a new round started while the reset is waiting

- Code: Web/Android `GameState.confirmResetBestScore:500–519`; `reset:333–365`; shared `ScoreManager:59`.
- Actual route: home highest normal score is 100 → confirm reset while lock is queued → immediately start new round → release queued reset.
- Observed: new round loads old persisted 100 before the reset enters its critical section. After successful reset, storage is 0, but UI remains 100 because completion only requests rendering. The next legal placement persists 10, while the display remains 100 via `Math.max`.
- Root cause: reset mutates UI optimistically then ignores its actual outcome; a new round may load the pre-reset record. Completion does not refresh the currently displayed state from the successful mutation / trusted stored data.
- Platforms: Web and Android reproduced; native synchronous WeChat has no waiting interval here.
- Minimal fix: settle reset against the current screen and active difficulty, including a newly started round. Do not simply skip reset reconciliation when its original generation changed: that preserves this bug. Use trustworthy score data and do not replace unrelated difficulty caches with default zeros on a failed read.
- Evidence: `reproduce-state-races.mjs`, C2 Web/Android.
- Confidence: high.

### C3 — P2 — Failed reset displays a cleared record although the stored record was preserved

- Code: Web/Android `GameState.confirmResetBestScore:500–519`; WeChat `517–536`; shared `storage.js:79–85, 115–121`.
- Actual route: local storage rejects writes (quota/adapter failure); user confirms reset.
- Observed: real stored normal best remains 100; in-memory displayed best becomes 0. Read failure, malformed record, or unavailable coordination produce the same class of misleading optimistic state.
- Root cause: `confirmResetBestScore` overwrites cached scores without waiting for or inspecting persistence. Failure is intentionally caught by storage so gameplay continues, but the UI treats failure as success.
- Platforms: all three reproduced, with synchronous WeChat and promise-based Web/Android failure adapters.
- Minimal fix: failed mutation must preserve the last known trusted score; after completion reconcile from a status-bearing read or trusted successful result. A bare `loadBestScores()` defaults-on-failure result cannot distinguish an actual cleared record from failed reading.
- Evidence: `reproduce-state-races.mjs`, C3 all platforms.
- Confidence: high.
- Integration note: C2 and C3 share the same owning reset method and can be one focused repair.

### C4 — P3 — An unrelated difficulty storage event changes first-round record feedback

- Code: Web/Android `main.js:48–57`, especially line 54; shared `ScoreManager.js:54–58`; platform `checkNewRecord`.
- Actual route: first-ever normal round starts with high score 0 and earns 10; another same-origin context updates only easy; normal remains 10; local normal round then earns 20.
- Observed: the easy-only event raises local `startingHighScore` from 0 to 10, and the next normal placement emits a record celebration that the existing first-ever-round rule intentionally suppresses.
- Root cause: every best-score-key event is treated as a change to the current difficulty's external record, even when that difficulty is unchanged and the value is the current round's own earlier write.
- Platforms: Web runtime reproduced using its real `Main` listener, actual shim, and real GameState. Android browser assets have identical callback behavior and reproduced in the same host harness; packaged single-WebView use has no ordinary second tab, so real APK exposure is lower. WeChat has no cross-tab listener.
- Minimal fix: update the feedback threshold only for a relevant external record change; preserve fresh reads for display and monotonic storage. Consider old/new event payloads to avoid treating unrelated difficulty changes as current difficulty changes; equality with the already displayed best must not raise the threshold.
- Evidence: `reproduce-storage-event.mjs`.
- Confidence: high for Web, adapter-level confirmation only for multi-context Android behavior.

## Independent red-team check of administrator/undo candidate

### A1 — P1 candidate independently confirmed on WeChat

The auditor was asked to challenge another auditor's candidate without receiving their proof.

Real application method sequence:

1. Home → `openAdminPanel` → `submitAdminCode` with a legitimate deferred verification result (stubbed service response; no production/backend contact).
2. Close the panel before the response and start a normal game.
3. Make a legal placement; undo snapshot contains `bestScoreEligible=true`.
4. Verification completes successfully; `enableAdminMode` sets the current game's eligibility false, but retains the pre-admin snapshot.
5. Undo restores snapshot eligibility true while the runtime admin flag remains true.
6. Subsequent placements write official normal best scores while administrator tools are unlimited.

Observed after two placements: `admin=true`, `bestScoreEligible=true`, persisted normal best=20.

- Owning code: WeChat `submitAdminCode:1476–1505`, `enableAdminMode:1527–1539`, `useUndoTool` restore at `1108`; shared `ScoreManager:44–47`.
- Web/Android enabling is synchronous in its current local submit path. Their state methods share the invariant defect, but this audit does not claim an equivalent normal UI path enables admin halfway through a round there.
- Suggested minimal defense: eligibility must remain false once this round entered admin mode, even if a pre-admin snapshot is restored or admin is subsequently disabled. Shared scoring should also reject a currently active admin state. A canceled or obsolete WeChat verification should not unexpectedly enable mode after the originating panel/session changes.
- Evidence: A1 in `reproduce-state-races.mjs`.
- Confidence: high; service completion was controlled for timing, not authentication bypass.

## Confirmed non-findings and storage guarantees

`storage-fault-matrix.mjs` directly exercised all of these:

- Current best-score read exceptions prohibit ordinary score/reset writes; restoring readable storage preserves untouched difficulty fields.
- Legacy-score read failure prevents migration and subsequent mutation.
- Failure of the first migration write followed by successful normal score write still retains legacy normal=88.
- Same-context old save → explicit reset uses the same FIFO critical section; final stored normal=0, including a new round opened while waiting.
- Real browser/WebView shim rejects mutation if Web Locks and IndexedDB are unavailable.
- Real Web Lock acquisition rejection does not fall back to uncoordinated localStorage writes.

Source review additionally found:

- Public `loadBestScores` performs no browser migration writes outside the lock; lazy migration occurs inside the read/merge/write section.
- Malformed outer score records are not considered writable. Partial readable objects are intentionally sanitized according to the frozen compatibility contract.
- `saveBestScores` is a full-object operation but has no gameplay call sites; only fixtures use it. Its overwrite behavior is not labeled a reachable gameplay bug.
- Score-generation invalidation is correctly a UI ownership mechanism. Already-earned historical records should still persist after restart; preserving them is different from letting obsolete callbacks rewrite current state.
- Web/Android completion refresh callbacks honor their existing paused render guard. Native WeChat's synchronous storage does not need an asynchronous lock added.

## Residual uncertainties / unverified cases

These are not counted as discovered product bugs:

- The IndexedDB transaction is a mutex around synchronous localStorage operations, not a transactional localStorage rollback. If a transaction aborts after `update()` has already changed localStorage, its Promise can reject despite the side effect. No actual Chromium/WebView abort-after-update was reproduced here. Reset reconciliation should ideally read trusted current storage after either success or failure rather than assuming Promise rejection proves no write occurred.
- A blocked/unavailable lock fails closed. Abrupt page/process termination before acquisition can abandon queued persistence; no implementation can guarantee browser completion on forced process termination using these APIs. Device/background termination behavior was not accepted based solely on Node mocks.
- Cross-context mutation order is the lock's serialized acquisition order; no stronger wall-clock "reset cancels every earlier user intent in every tab" property is claimed. Introducing cross-tab reset epochs would be a larger compatibility decision, not justified by the confirmed same-context cases.
- Unexpected IndexedDB connection closure may require reopening; current promise caches a connection. Device evidence is needed before calling this a user-visible repeatable defect.
- Native WeChat Developer Tools and Android device behavior were not exercised by this subagent.

## Evidence invocation

All harnesses are independent audit evidence, not modifications to repository tests:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON audit/concurrency/reproduce-state-races.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON audit/concurrency/reproduce-storage-event.mjs
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON audit/concurrency/storage-fault-matrix.mjs
```

The two `reproduce-*` scripts assert the baseline defects and are expected to fail those bug assertions after successful repair. The fault matrix asserts protective behavior and should continue passing.
