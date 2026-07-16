import test from 'node:test';
import assert from 'node:assert/strict';

import { toolCountsByDifficulty, versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';
import {
  createMemoryStorage,
  installWxStorage,
  withFixedDateNow,
  withRandomSequence
} from '../helpers/platform-mocks.mjs';

function makePiece(cells, id = 'test-piece') {
  const maxX = Math.max(...cells.map((cell) => cell.x));
  const maxY = Math.max(...cells.map((cell) => cell.y));
  return {
    id,
    cells: cells.map((cell) => ({ ...cell })),
    color: '#123456',
    used: false,
    bounds: { width: maxX + 1, height: maxY + 1 },
    category: 'rescue',
    baseId: cells.length === 1 ? 'single' : 'line2',
    isSnake: false
  };
}

async function createGame(version, initialStorage = {}) {
  const storage = createMemoryStorage(initialStorage);
  const restore = installWxStorage(storage);
  const modules = await loadVersion(version);
  const state = new modules.GameState();
  return { ...modules, state, storage, restore };
}

function fillBoard(board) {
  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) board.grid[row][col] = { color: '#aaa' };
  }
}

function feedbackEvents(events) {
  const names = new Set([
    'piecePicked',
    'piecePlaced',
    'invalidPlacement',
    'linesCleared',
    'scoreChanged',
    'highScoreBroken'
  ]);
  return events.filter((event) => names.has(event.type));
}

function installSimpleLayout(state) {
  state.setLayout({
    cellSize: 30,
    boardRect: { x: 20, y: 100, width: 300, height: 300 }
  });
}

for (const version of versions) {
  test(`${version}: initializes and resets tool counts for every difficulty`, async () => {
    const game = await createGame(version);
    try {
      for (const difficulty of ['easy', 'normal', 'master']) {
        game.state.setScreen('home');
        game.state.setSettings({ ...game.state.settings, difficulty });
        assert.deepEqual(
          {
            refreshCount: game.state.toolState.refreshCount,
            clearCount: game.state.toolState.clearCount,
            undoCount: game.state.toolState.undoCount
          },
          toolCountsByDifficulty[difficulty]
        );
        await withRandomSequence(Array(100).fill(0), () => game.state.startNewGame());
        assert.equal(game.state.screen, 'playing');
        assert.equal(game.state.toolState.refreshCount, toolCountsByDifficulty[difficulty].refreshCount);
      }
    } finally {
      game.restore();
    }
  });

  test(`${version}: refresh decrements only on success and keeps a playable rack`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      game.state.activeDifficulty = 'normal';
      game.state.toolState = game.state.buildCurrentToolState(false);
      const before = game.state.toolState.refreshCount;
      const success = await withRandomSequence(Array(100).fill(0), () => game.state.useRefreshTool());
      assert.equal(success, true);
      assert.equal(game.state.toolState.refreshCount, before - 1);
      assert.equal(game.state.board.hasAnyValidMove(game.state.rackPieces), true);

      game.state.toolUsage.refresh = before;
      game.state.syncRoundRuntimeState();
      const rackBefore = game.state.rackPieces.map((item) => item.id);
      assert.equal(game.state.useRefreshTool(), false);
      assert.deepEqual(game.state.rackPieces.map((item) => item.id), rackBefore);
    } finally {
      game.restore();
    }
  });

  test(`${version}: clear tool removes the selected area, decrements count, and does not add score`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      game.state.activeDifficulty = 'normal';
      game.state.toolState = game.state.buildCurrentToolState(false);
      game.state.score = 123;
      game.state.board.grid[4][4] = { color: 'a' };
      game.state.board.grid[5][5] = { color: 'b' };
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }], 'spare')];
      assert.equal(game.state.toggleClearTool(), 'enabled');
      assert.equal(game.state.useClearTool(4, 4), true);
      assert.equal(game.state.board.grid[4][4], null);
      assert.equal(game.state.board.grid[5][5], null);
      assert.equal(game.state.score, 123);
      assert.equal(game.state.toolState.clearCount, 0);
      assert.equal(game.state.toggleClearTool(), 'failed');
    } finally {
      game.restore();
    }
  });

  test(`${version}: undo restores board, rack, score and tool state and cannot repeat the same snapshot`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      installSimpleLayout(game.state);
      game.state.activeDifficulty = 'normal';
      game.state.toolState = game.state.buildCurrentToolState(false);
      game.state.rackPieces = [
        makePiece([{ x: 0, y: 0 }], 'placed'),
        makePiece([{ x: 0, y: 0 }], 'spare')
      ];
      assert.equal(game.state.startDrag(0, 35, 145, { x: 20, y: 400, width: 30, height: 30, cellSize: 30 }), true);
      game.state.previewState = { row: 2, col: 3, canPlace: true, visible: true };
      assert.equal(game.state.tryPlaceDraggedPiece(), true);
      assert.equal(game.state.score, 10);
      assert.notEqual(game.state.board.grid[2][3], null);
      assert.notEqual(game.state.undoSnapshot, null);
      game.state.board.grid[9][9] = { color: 'mutated-after-snapshot' };
      game.state.rackPieces[1].cells[0].x = 9;
      assert.equal(game.state.useUndoTool(), true);
      assert.equal(game.state.score, 0);
      assert.equal(game.state.board.grid[2][3], null);
      assert.equal(game.state.board.grid[9][9], null);
      assert.equal(game.state.rackPieces[0].used, false);
      assert.equal(game.state.rackPieces[1].cells[0].x, 0);
      assert.equal(game.state.toolUsage.undo, 1);
      assert.equal(game.state.toolState.undoCount, 0);
      assert.equal(game.state.undoSnapshot, null);
      assert.equal(game.state.dragState.isDragging, false);
      assert.equal(game.state.dragState.activePieceIndex, -1);
      assert.equal(game.state.previewState.visible, false);
      assert.equal(game.state.inputLocked, false);
      assert.equal(game.state.feedbackState.drag.active, false);
      assert.equal(game.state.feedbackState.clearScore.active, false);
      assert.equal(game.state.useUndoTool(), false);
      assert.equal(game.state.toolUsage.undo, 1);
      assert.equal(game.state.toolState.undoCount, 0);
    } finally {
      game.restore();
    }
  });

  test(`${version}: undo after a line clear removes board clear effects without replaying them`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      installSimpleLayout(game.state);
      game.state.activeDifficulty = 'normal';
      game.state.toolState = game.state.buildCurrentToolState(false);
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }], 'single')];
      for (let col = 1; col < game.state.board.size; col += 1) {
        game.state.board.grid[0][col] = { color: '#aaa' };
      }

      assert.equal(game.state.startDrag(0, 35, 145, { x: 20, y: 400, width: 30, height: 30, cellSize: 30 }), true);
      game.state.previewState = { row: 0, col: 0, canPlace: true, visible: true };
      assert.equal(game.state.endDrag(), true);
      game.state.finishPendingClear();
      assert.equal(game.state.feedbackState.clearEffects.length, 1);
      assert.deepEqual(game.state.feedbackState.clearEffects[0].clearedRows, [0]);

      assert.equal(game.state.useUndoTool(), true);
      assert.equal(game.state.feedbackState.clearEffects.length, 0);
      assert.equal(game.state.feedbackState.clearScore.active, false);
      assert.equal(game.state.score, 0);
      assert.notEqual(game.state.board.grid[0][1], null);
    } finally {
      game.restore();
    }
  });

  test(`${version}: invalid placement keeps the previous undo snapshot available`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      installSimpleLayout(game.state);
      game.state.activeDifficulty = 'normal';
      game.state.toolState = game.state.buildCurrentToolState(false);
      game.state.rackPieces = [
        makePiece([{ x: 0, y: 0 }], 'placed'),
        makePiece([{ x: 0, y: 0 }], 'invalid')
      ];
      assert.equal(game.state.startDrag(0, 35, 145, { x: 20, y: 400, width: 30, height: 30, cellSize: 30 }), true);
      game.state.previewState = { row: 1, col: 1, canPlace: true, visible: true };
      assert.equal(game.state.endDrag(), true);
      const snapshot = game.state.undoSnapshot;
      assert.notEqual(snapshot, null);

      assert.equal(game.state.startDrag(1, 35, 145, { x: 60, y: 400, width: 30, height: 30, cellSize: 30 }), true);
      game.state.previewState = { row: -1, col: -1, canPlace: false, visible: true };
      assert.equal(game.state.endDrag(), false);
      assert.equal(game.state.undoSnapshot, snapshot);

      assert.equal(game.state.useUndoTool(), true);
      assert.equal(game.state.board.grid[1][1], null);
      assert.equal(game.state.rackPieces[0].used, false);
      assert.equal(game.state.toolState.undoCount, 0);
    } finally {
      game.restore();
    }
  });

  test(`${version}: combo state exposes deterministic feedback data`, async () => {
    const game = await createGame(version);
    try {
      await withFixedDateNow(1_000, () => game.state.handleLineClear(1));
      assert.equal(game.state.comboState.comboCount, 1);
      assert.equal(game.state.consumeEvents().at(-1).type, 'clear');
      await withFixedDateNow(2_000, () => game.state.handleLineClear(1));
      assert.equal(game.state.comboState.comboCount, 2);
      assert.equal(game.state.consumeEvents().at(-1).type, 'combo');
      await withFixedDateNow(2_500, () => game.state.handleLineClear(1));
      assert.equal(game.state.comboState.comboCount, 3);
      assert.equal(game.state.consumeEvents().at(-1).type, 'combo3');
      await withFixedDateNow(6_000, () => game.state.handleLineClear(1));
      assert.equal(game.state.comboState.comboCount, 1);
    } finally {
      game.restore();
    }
  });

  test(`${version}: no moves ends the game when no revive is available`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      fillBoard(game.state.board);
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }])];
      game.state.reviveCount = 0;
      assert.equal(game.state.checkGameOver(), true);
      assert.equal(game.state.screen, 'gameover');
      assert.equal(game.state.isGameOver, true);
    } finally {
      game.restore();
    }
  });

  test(`${version}: welfare revive preserves score, consumes one revive, and returns a playable rack`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      game.state.setSettings({ ...game.state.settings, difficulty: 'easy', localMembershipEnabled: true });
      game.state.activeDifficulty = 'easy';
      game.state.score = 321;
      fillBoard(game.state.board);
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }])];
      game.state.undoSnapshot = game.state.createUndoSnapshot();
      assert.equal(game.state.handleNoMoves(), true);
      assert.equal(game.state.ui.isRevivePromptOpen, true);
      const success = await withRandomSequence(Array(1000).fill(0), () => game.state.acceptRevive());
      assert.equal(success, true);
      assert.equal(game.state.score, 321);
      assert.equal(game.state.reviveCount, 1);
      assert.equal(game.state.reviveUsedCount, 1);
      assert.equal(game.state.screen, 'playing');
      assert.equal(game.state.ui.isRevivePromptOpen, false);
      assert.equal(game.state.board.hasAnyValidMove(game.state.rackPieces), true);
      assert.equal(game.state.toolState.refreshCount, toolCountsByDifficulty.easy.refreshCount);
      assert.equal(game.state.undoSnapshot, null);
      assert.equal(game.state.useUndoTool(), false);
    } finally {
      game.restore();
    }
  });

  test(`${version}: failed revive transitions to game over and keeps the score`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      game.state.settings.localMembershipEnabled = true;
      game.state.reviveCount = 1;
      game.state.score = 77;
      fillBoard(game.state.board);
      game.state.board.clearRandomFilled = () => [];
      game.state.openRevivePrompt();
      const success = await withRandomSequence(Array(1000).fill(0), () => game.state.acceptRevive());
      assert.equal(success, false);
      assert.equal(game.state.screen, 'gameover');
      assert.equal(game.state.score, 77);
    } finally {
      game.restore();
    }
  });

  test(`${version}: administrator mode remains runtime-only and cannot update official scores`, async () => {
    const game = await createGame(version, {
      block_puzzle_best_scores_v1: { easy: 1, normal: 40, master: 2 }
    });
    try {
      game.state.authState.isAdminAllowed = true;
      game.state.enableAdminMode();
      game.state.setScreen('playing');
      game.state.bestScoreEligible = false;
      game.state.score = 999;
      game.state.scoreManager.syncBestScore(game.state);
      assert.equal(game.state.adminModeEnabled, true);
      assert.equal(Object.hasOwn(game.state.settings, 'adminModeEnabled'), false);
      assert.equal(game.storage.snapshot().block_puzzle_best_scores_v1.normal, 40);
    } finally {
      game.restore();
    }
  });
}

test('wechat: unified clear score keeps the existing score feedback and new-record behavior', async () => {
  const game = await createGame('wechat', {
    block_puzzle_best_scores_v1: { easy: 0, normal: 100, master: 0 }
  });
  try {
    game.state.setScreen('playing');
    game.state.activeDifficulty = 'normal';
    game.state.bestScore = 100;
    game.state.startingHighScore = 100;
    game.state.score = 90;
    game.state.pendingClear = {
      rows: [0],
      cols: [0],
      lineCount: 2,
      remainingTime: 0
    };
    game.state.rackPieces = [makePiece([{ x: 0, y: 0 }], 'spare')];

    game.state.finishPendingClear();

    assert.equal(game.state.score, 490);
      assert.equal(game.state.feedbackState.clearScore.active, true);
      assert.equal(game.state.feedbackState.clearScore.totalAdded, 400);
      assert.equal(game.state.feedbackState.clearScore.clearedLines, 2);
      assert.equal(game.state.feedbackState.clearEffects.length, 1);
      assert.deepEqual(game.state.feedbackState.clearEffects[0].clearedRows, [0]);
      assert.deepEqual(game.state.feedbackState.clearEffects[0].clearedCols, [0]);
      assert.equal(game.state.feedbackState.scorePulse.remaining, 500);
      assert.equal(game.state.hasShownNewRecord, true);
      assert.equal(game.state.feedbackState.highScore.remaining, 1200);
    assert.equal(game.storage.snapshot().block_puzzle_best_scores_v1.normal, 490);
  } finally {
    game.restore();
  }
});

for (const version of versions) {
  test(`${version}: one clearing placement emits the unified events once with production score data`, async () => {
    const game = await createGame(version, {
      block_puzzle_best_scores_v1: { easy: 0, normal: 20, master: 0 }
    });
    try {
      game.state.setScreen('playing');
      installSimpleLayout(game.state);
      game.state.activeDifficulty = 'normal';
      game.state.bestScore = 20;
      game.state.startingHighScore = 20;
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }], 'single')];
      for (let col = 1; col < game.state.board.size; col += 1) {
        game.state.board.grid[0][col] = { color: '#aaa' };
      }

      assert.equal(game.state.startDrag(0, 35, 145, { x: 20, y: 400, width: 30, height: 30, cellSize: 30 }), true);
      game.state.previewState = { row: 0, col: 0, canPlace: true, visible: true };
      assert.equal(game.state.endDrag(), true);
      game.state.finishPendingClear();

      const events = feedbackEvents(game.state.consumeEvents());
      const counts = Object.fromEntries(events.map((event) => [event.type, events.filter((item) => item.type === event.type).length]));
      assert.equal(counts.piecePicked, 1);
      assert.equal(counts.piecePlaced, 1);
      assert.equal(counts.linesCleared, 1);
      assert.equal(counts.scoreChanged, 1);
      assert.equal(counts.highScoreBroken, 1);

      const clearEvent = events.find((event) => event.type === 'linesCleared');
      assert.deepEqual(clearEvent.payload.scoreResult, {
        placementScore: 0,
        lineClearScore: 100,
        bonusScore: 50,
        totalAdded: 150,
        clearedLines: 1
      });
      assert.equal(game.state.feedbackState.clearEffects.length, 1);
      assert.deepEqual(game.state.feedbackState.clearEffects[0].clearedRows, [0]);
      assert.equal(game.state.feedbackState.clearEffects[0].cells.length, game.state.board.size);
      const scoreEvent = events.find((event) => event.type === 'scoreChanged');
      assert.deepEqual(scoreEvent.payload, { scoreBefore: 0, scoreAfter: 160, totalAdded: 160 });
    } finally {
      game.restore();
    }
  });

  test(`${version}: invalid release emits no score or clear feedback events`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      installSimpleLayout(game.state);
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }], 'single')];
      game.state.startDrag(0, 35, 145, { x: 20, y: 400, width: 30, height: 30, cellSize: 30 });
      game.state.previewState = { row: -1, col: -1, canPlace: false, visible: true };
      assert.equal(game.state.endDrag(), false);
      const events = feedbackEvents(game.state.consumeEvents());
      assert.equal(events.filter((event) => event.type === 'invalidPlacement').length, 1);
      assert.equal(events.some((event) => ['piecePlaced', 'linesCleared', 'scoreChanged', 'highScoreBroken'].includes(event.type)), false);
      assert.equal(game.state.feedbackState.drag.phase, 'invalid');
    } finally {
      game.restore();
    }
  });

  test(`${version}: placement without a clear emits score data without starting clear-only pulse feedback`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      installSimpleLayout(game.state);
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }], 'single')];
      game.state.startDrag(0, 35, 145, { x: 20, y: 400, width: 30, height: 30, cellSize: 30 });
      game.state.previewState = { row: 2, col: 2, canPlace: true, visible: true };
      assert.equal(game.state.endDrag(), true);
      const events = feedbackEvents(game.state.consumeEvents());
      const scoreEvent = events.find((event) => event.type === 'scoreChanged');
      assert.deepEqual(scoreEvent.payload, { scoreBefore: 0, scoreAfter: 10, totalAdded: 10 });
      assert.equal(events.some((event) => event.type === 'linesCleared'), false);
      assert.equal(game.state.feedbackState.clearScore.active, false);
      assert.equal(game.state.feedbackState.scorePulse.active, false);
    } finally {
      game.restore();
    }
  });

  test(`${version}: feedback timers freeze while paused and reset with a new game`, async () => {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      game.feedback.triggerClearScore(game.state.feedbackState, {
        placementScore: 0,
        lineClearScore: 100,
        bonusScore: 50,
        totalAdded: 150,
        clearedLines: 1
      });
      game.state.update(200);
      assert.equal(game.state.feedbackState.clearScore.remaining, 700);
      game.state.openPause();
      game.state.update(400);
      assert.equal(game.state.feedbackState.clearScore.remaining, 700);
      game.state.closePause();
      game.state.update(100);
      assert.equal(game.state.feedbackState.clearScore.remaining, 600);
      await withRandomSequence(Array(100).fill(0), () => game.state.startNewGame());
      assert.equal(game.feedback.hasActiveFeedback(game.state.feedbackState), false);
    } finally {
      game.restore();
    }
  });

  test(`${version}: administrator scoring does not emit a normal high-score event`, async () => {
    const game = await createGame(version, {
      block_puzzle_best_scores_v1: { easy: 0, normal: 10, master: 0 }
    });
    try {
      game.state.setScreen('playing');
      game.state.adminModeEnabled = true;
      game.state.bestScoreEligible = false;
      game.state.startingHighScore = 10;
      game.state.score = 100;
      assert.equal(game.state.checkNewRecord(), false);
      assert.equal(feedbackEvents(game.state.consumeEvents()).some((event) => event.type === 'highScoreBroken'), false);
      assert.equal(game.state.feedbackState.highScore.active, false);
    } finally {
      game.restore();
    }
  });
}

test('drag feedback phase transitions remain equivalent across versions', async () => {
  const summaries = [];
  for (const version of versions) {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      installSimpleLayout(game.state);
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }], 'single')];
      game.state.startDrag(0, 80, 420, { x: 50, y: 500, width: 30, height: 30, cellSize: 30 });
      game.state.update(200);
      game.state.moveDrag(100, 380);
      summaries.push({
        active: game.state.feedbackState.drag.active,
        phase: game.state.feedbackState.drag.phase,
        pieceIndex: game.state.feedbackState.drag.pieceIndex,
        pointerX: game.state.feedbackState.drag.pointerX,
        pointerY: game.state.feedbackState.drag.pointerY
      });
      assert.equal(Number.isFinite(game.state.feedbackState.drag.visualX), true);
      assert.equal(Number.isFinite(game.state.feedbackState.drag.visualY), true);
      game.state.cancelDrag();
      assert.equal(game.state.feedbackState.drag.active, false);
    } finally {
      game.restore();
    }
  }
  assert.deepEqual(summaries[0], summaries[1]);
});

test('tool, undo and revive snapshots remain equivalent across versions', async () => {
  const summaries = [];
  for (const version of versions) {
    const game = await createGame(version);
    try {
      game.state.setScreen('playing');
      game.state.activeDifficulty = 'normal';
      game.state.toolState = game.state.buildCurrentToolState(false);
      game.state.board.grid[5][5] = { color: 'x' };
      game.state.rackPieces = [makePiece([{ x: 0, y: 0 }], 'rack')];
      game.state.toggleClearTool();
      game.state.useClearTool(5, 5);
      summaries.push({
        board: game.state.board.getSnapshot(),
        score: game.state.score,
        toolState: game.state.toolState,
        reviveCount: game.state.reviveCount,
        screen: game.state.screen
      });
    } finally {
      game.restore();
    }
  }
  assert.deepEqual(summaries[0], summaries[1]);
});
