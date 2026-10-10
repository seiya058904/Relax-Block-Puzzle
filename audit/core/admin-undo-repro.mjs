import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
const { loadVersion } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const { createMemoryStorage, installWxStorage, withRandomSequence } = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));

const memory = createMemoryStorage({block_puzzle_best_scores_v1: { easy: 0, normal: 0, master: 0 }});
const restore = installWxStorage(memory);
const { GameState } = await loadVersion('wechat');
const state = new GameState();
const layout = {cellSize: 30, boardRect: {x: 20, y: 100, width: 300, height: 300}};
state.setLayout(layout);
let completeVerification;
state.setAuthClient({ verifyAdmin: () => new Promise(resolve => { completeVerification = resolve; }) });

function placeFirstLegal() {
  for (let index = 0; index < state.rackPieces.length; index += 1) {
    const piece = state.rackPieces[index];
    if (piece.used) continue;
    for (let row = 0; row < state.board.size; row += 1) {
      for (let col = 0; col < state.board.size; col += 1) {
        if (!state.board.canPlace(piece.cells, row, col)) continue;
        const hitArea = {x: 40 + 80 * index, y: 450, width: 60, height: 60, cellSize: 20};
        assert.equal(state.startDrag(index, hitArea.x + 30, hitArea.y + 30, hitArea), true);
        const displayCellSize = layout.cellSize * 0.96;
        state.moveDrag(layout.boardRect.x + col * layout.cellSize + piece.bounds.width * displayCellSize / 2,
          layout.boardRect.y + row * layout.cellSize + piece.bounds.height * displayCellSize + state.getDragFingerOffsetY());
        assert.equal(state.endDrag(), true);
        state.update(260);
        return {baseId: piece.baseId, row, col};
      }
    }
  }
  throw new Error('No playable piece');
}

try {
  assert.equal(state.openAdminPanel(), true);
  state.setAdminInput('test-only-valid-server-response');
  const verifyPromise = state.submitAdminCode();
  state.closeAdminPanel(); // The UI explicitly allows Cancel while the request is pending.
  await withRandomSequence(Array(100).fill(0), () => state.startNewGame());
  const firstPlacement = placeFirstLegal();
  assert.equal(state.undoSnapshot.bestScoreEligible, true);
  const initialRecord = memory.snapshot().block_puzzle_best_scores_v1.normal;
  completeVerification({adminMode: true});
  assert.equal(await verifyPromise, true);
  assert.equal(state.adminModeEnabled, true);
  assert.equal(state.bestScoreEligible, false);
  state.update(260);
  assert.equal(state.useUndoTool(), true);
  const eligibilityAfterUndo = state.bestScoreEligible;
  const adminModeAfterUndo = state.adminModeEnabled;
  placeFirstLegal();
  placeFirstLegal();
  const finalRecord = memory.snapshot().block_puzzle_best_scores_v1.normal;
  console.log(JSON.stringify({platform: 'wechat', firstPlacement, initialRecord, eligibilityAfterUndo,
    adminModeAfterUndo, scoreAfterAdminPlacements: state.score, finalRecord,
    bug: adminModeAfterUndo && eligibilityAfterUndo && finalRecord > initialRecord}, null, 2));
  // This assertion describes the product invariant and fails on baseline 4d1c308.
  assert.equal(finalRecord, initialRecord, 'An administrator round must not update official high scores after undo');
} finally {
  restore();
}
