import { auditModuleUrl, auditOutputFile } from '../source-path.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const { loadVersion } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const { createMemoryStorage, installWxStorage } = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));

function random(seed) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
const clone = value => structuredClone(value);
const occupancy = board => board.map(row => row.map(cell => cell?.color || null));
const normalizeRack = rack => rack.map(({id, ...piece}) => piece);
const layout = {cellSize: 30, boardRect: {x: 20, y: 100, width: 300, height: 300}};
function canPlace(grid, piece, row, col) {
  return piece.cells.every(cell => row + cell.y >= 0 && row + cell.y < 10 && col + cell.x >= 0 && col + cell.x < 10 && grid[row + cell.y][col + cell.x] === null);
}
function completed(grid) {
  return {rows: Array.from({length: 10}, (_, i) => i).filter(row => grid[row].every(Boolean)),
    cols: Array.from({length: 10}, (_, i) => i).filter(col => grid.every(row => row[col]))};
}
function drop(state, index, row, col) {
  const piece = state.rackPieces[index];
  const hitArea = {x: 40 + 80 * index, y: 450, width: 60, height: 60, cellSize: 20};
  assert.equal(state.startDrag(index, hitArea.x + 30, hitArea.y + 30, hitArea), true);
  const size = layout.cellSize * 0.96;
  state.moveDrag(layout.boardRect.x + col * layout.cellSize + piece.bounds.width * size / 2,
    layout.boardRect.y + row * layout.cellSize + piece.bounds.height * size + state.getDragFingerOffsetY());
  return state.endDrag();
}

let now = 1000000;
const originalRandom = Math.random;
const originalNow = Date.now;
Date.now = () => now;
const summaries = [];
const totals = {games: 0, placements: 0, clearedLines: 0, invalidDrops: 0, undo: 0, refresh: 0, clear: 0, maxScore: 0, longestGame: 0};
try {
  for (const platform of ['wechat', 'web', 'android']) {
    const { GameState } = await loadVersion(platform);
    for (const difficulty of ['easy', 'normal', 'master']) {
      for (let seed = 1; seed <= 12; seed += 1) {
        Math.random = random(seed * 991 + difficulty.length);
        const decide = random(seed * 733 + difficulty.length);
        const memory = createMemoryStorage({block_puzzle_best_scores_v1: {easy: 0, normal: 0, master: 0}});
        const restore = installWxStorage(memory);
        try {
          now = 1000000;
          const state = new GameState();
          state.setSettings({difficulty});
          state.setLayout(layout);
          state.startNewGame();
          let grid = Array.from({length: 10}, () => Array(10).fill(null));
          let score = 0;
          let best = 0;
          let undo = null;
          let placements = 0;
          let clearedLines = 0;
          const stats = {undo: 0, refresh: 0, clear: 0, invalidDrops: 0};
          for (let turn = 0; turn < 400 && state.screen === 'playing'; turn += 1) {
            assert.deepEqual(occupancy(state.board.grid), grid);
            assert.equal(state.score, score);
            const placementsAvailable = [];
            const rowCounts = grid.map(row => row.filter(Boolean).length);
            const colCounts = Array.from({length: 10}, (_, col) => grid.filter(row => row[col]).length);
            for (let index = 0; index < state.rackPieces.length; index += 1) {
              const piece = state.rackPieces[index];
              if (piece.used) continue;
              assert.ok(piece.cells.length > 0 && new Set(piece.cells.map(cell => `${cell.x}:${cell.y}`)).size === piece.cells.length);
              for (let row = -1; row <= 10; row += 1) {
                for (let col = -1; col <= 10; col += 1) {
                  const legal = canPlace(grid, piece, row, col);
                  assert.equal(state.board.canPlace(piece.cells, row, col), legal);
                  if (!legal) continue;
                  const addedRows = new Map();
                  const addedCols = new Map();
                  for (const cell of piece.cells) {
                    const r = row + cell.y, c = col + cell.x;
                    addedRows.set(r, (addedRows.get(r) || 0) + 1);
                    addedCols.set(c, (addedCols.get(c) || 0) + 1);
                  }
                  const lines = [...addedRows].filter(([r, count]) => rowCounts[r] + count === 10).length +
                    [...addedCols].filter(([c, count]) => colCounts[c] + count === 10).length;
                  placementsAvailable.push({index, row, col, priority: lines * 1000 - row * 1.4 - col + decide() * 4});
                }
              }
            }
            assert.ok(placementsAvailable.length > 0, 'playing state must retain a legal move after completed actions');
            assert.equal(state.board.hasAnyValidMove(state.rackPieces), true);
            placementsAvailable.sort((a, b) => b.priority - a.priority);
            const chosen = placementsAvailable[0];
            const piece = state.rackPieces[chosen.index];
            if (turn % 11 === 0) {
              const previousUndo = state.undoSnapshot;
              assert.equal(drop(state, chosen.index, -3, -3), false);
              assert.deepEqual(occupancy(state.board.grid), grid);
              assert.equal(state.score, score);
              assert.equal(state.undoSnapshot, previousUndo);
              stats.invalidDrops += 1;
              state.update(260);
            }
            undo = {grid: clone(grid), score, rack: clone(state.rackPieces), history: clone(state.recentRackBaseIds),
              toolUsage: clone(state.toolUsage), lastRackHadSnake: state.lastRackHadSnake};
            for (const cell of piece.cells) grid[chosen.row + cell.y][chosen.col + cell.x] = piece.color;
            const lines = completed(grid);
            const lineCount = lines.rows.length + lines.cols.length;
            assert.equal(drop(state, chosen.index, chosen.row, chosen.col), true);
            score += piece.cells.length * 10;
            assert.equal(state.score, score);
            if (lineCount) {
              assert.deepEqual(state.pendingClear.rows, lines.rows);
              assert.deepEqual(state.pendingClear.cols, lines.cols);
              assert.equal(state.inputLocked, true);
              assert.equal(state.useUndoTool(), false, 'tools stay locked until the pending clear resolves');
              now += 180;
              state.update(180);
              for (let row = 0; row < 10; row += 1) for (let col = 0; col < 10; col += 1) {
                if (lines.rows.includes(row) || lines.cols.includes(col)) grid[row][col] = null;
              }
              score += lineCount * 100 + lineCount * lineCount * 50;
              clearedLines += lineCount;
            }
            assert.equal(state.pendingClear, null);
            assert.equal(state.inputLocked, false);
            assert.deepEqual(occupancy(state.board.grid), grid, 'line/column union must be cleared exactly once');
            assert.equal(state.score, score);
            best = Math.max(best, score);
            assert.equal(memory.snapshot().block_puzzle_best_scores_v1[difficulty], best);
            placements += 1;
            now += 220;
            state.update(260);
            if (state.screen !== 'playing') {
              assert.equal(state.board.hasAnyValidMove(state.rackPieces), false);
              break;
            }
            const action = decide();
            if (action < 0.035 && state.toolState.undoCount > 0 && state.undoSnapshot) {
              assert.equal(state.useUndoTool(), true);
              grid = undo.grid; score = undo.score;
              assert.deepEqual(state.rackPieces, undo.rack);
              assert.deepEqual(state.recentRackBaseIds, undo.history);
              assert.equal(state.lastRackHadSnake, undo.lastRackHadSnake);
              assert.deepEqual(state.toolUsage, {...undo.toolUsage, undo: undo.toolUsage.undo + 1});
              assert.deepEqual(occupancy(state.board.grid), grid);
              assert.equal(state.score, score);
              assert.equal(state.undoSnapshot, null);
              assert.equal(memory.snapshot().block_puzzle_best_scores_v1[difficulty], best, 'undo must preserve historical record');
              stats.undo += 1;
            } else if (action < 0.06 && state.toolState.refreshCount > 0) {
              const oldRack = clone(state.rackPieces);
              const oldUsage = state.toolUsage.refresh;
              const success = state.useRefreshTool();
              if (success) {
                assert.equal(state.toolUsage.refresh, oldUsage + 1);
                assert.equal(state.undoSnapshot, null);
                assert.equal(state.board.hasAnyValidMove(state.rackPieces), true);
                stats.refresh += 1;
              } else {
                assert.deepEqual(state.rackPieces, oldRack);
                assert.equal(state.toolUsage.refresh, oldUsage);
              }
              assert.deepEqual(occupancy(state.board.grid), grid);
              assert.equal(state.score, score);
            } else if (action < 0.085 && state.toolState.clearCount > 0) {
              const occupied = [];
              grid.forEach((row, r) => row.forEach((tile, c) => {if (tile) occupied.push({row: r, col: c});}));
              if (occupied.length) {
                const center = occupied[Math.floor(decide() * occupied.length)];
                assert.equal(state.toggleClearTool(), 'enabled');
                assert.equal(state.useClearTool(center.row, center.col), true);
                for (let r = Math.max(0, center.row - 1); r <= Math.min(9, center.row + 1); r += 1) {
                  for (let c = Math.max(0, center.col - 1); c <= Math.min(9, center.col + 1); c += 1) grid[r][c] = null;
                }
                assert.deepEqual(occupancy(state.board.grid), grid);
                assert.equal(state.score, score, 'clear tools do not score');
                assert.equal(state.undoSnapshot, null);
                stats.clear += 1;
              }
            }
          }
          totals.games += 1;
          totals.placements += placements;
          totals.clearedLines += clearedLines;
          for (const key of Object.keys(stats)) totals[key] += stats[key];
          totals.maxScore = Math.max(totals.maxScore, best);
          totals.longestGame = Math.max(totals.longestGame, placements);
          const fingerprint = createHash('sha256').update(JSON.stringify({grid, score, best,
            rack: normalizeRack(state.rackPieces), toolUsage: state.toolUsage,
            history: state.recentRackBaseIds, screen: state.screen})).digest('hex');
          summaries.push({platform, difficulty, seed, placements, clearedLines, finalScore: score, best, fingerprint, ...stats});
        } finally {restore();}
      }
    }
  }
  for (const row of summaries.filter(row => row.platform === 'wechat')) {
    for (const platform of ['web', 'android']) {
      const peer = summaries.find(candidate => candidate.platform === platform && candidate.difficulty === row.difficulty && candidate.seed === row.seed);
      assert.deepEqual({...peer, platform: 'wechat'}, row, 'identical random stream and decisions must produce identical cross-platform outcomes');
    }
  }
  const report = {result: 'PASS', scope: 'Node game-state/model paths with native synchronous storage mock; no device claims', totals, summaries};
  await writeFile(auditOutputFile('core', 'long-game-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({result: report.result, totals, crossPlatformReplayPairs: summaries.length / 3 * 2}, null, 2));
} finally {
  Math.random = originalRandom;
  Date.now = originalNow;
}
