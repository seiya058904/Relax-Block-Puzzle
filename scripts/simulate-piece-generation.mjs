import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleFlagIndexes = process.argv.reduce((indexes, arg, index) => {
  if (arg === '--samples') indexes.push(index);
  return indexes;
}, []);
const sampleFlagIndex = sampleFlagIndexes.at(-1) ?? -1;
const samples = Number(sampleFlagIndex >= 0 ? process.argv[sampleFlagIndex + 1] : 10000);
if (!Number.isInteger(samples) || samples <= 0) throw new Error('--samples must be a positive integer');

const pieceFlagIndex = process.argv.indexOf('--piece');
const generatorRelativePath = pieceFlagIndex >= 0 ? process.argv[pieceFlagIndex + 1] : null;
const sharedPiecePath = path.join(rootDir, 'shared', 'js', 'game', 'Piece.js');
const generatorPiecePath = generatorRelativePath
  ? path.resolve(rootDir, generatorRelativePath)
  : sharedPiecePath;
const constantsPath = path.join(rootDir, 'shared', 'js', 'game', 'coreConstants.js');
const storagePath = path.join(rootDir, 'shared', 'js', 'utils', 'storage.js');
const boardPath = path.join(rootDir, 'shared', 'js', 'game', 'Board.js');

// Loads a Piece.js copy with its relative imports pointed at the shared
// modules. Used both for the current generator and (via --piece) for a
// baseline generator so before/after comparisons share one evaluator.
async function loadPieceModule(piecePath, extraExports) {
  let source = await fs.readFile(piecePath, 'utf8');
  source = source
    .replace("from './coreConstants.js'", `from '${pathToFileURL(constantsPath).href}'`)
    .replace("from '../utils/storage.js'", `from '${pathToFileURL(storagePath).href}'`)
    .replace("from './Board.js'", `from '${pathToFileURL(boardPath).href}'`);
  if (extraExports) {
    source += `\nexport { ${extraExports} };\n`;
  }
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const generator = await loadPieceModule(generatorPiecePath, 'DIFFICULTY_RULES, createCandidateRack, SHAPE_LIBRARY');
const evaluatorModule = await loadPieceModule(sharedPiecePath);
const evaluateRackViability = evaluatorModule.evaluateRackViability;
const Board = (await import(pathToFileURL(boardPath).href)).default;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function cellsKey(cells) {
  return cells
    .slice()
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((cell) => `${cell.x}:${cell.y}`)
    .join('|');
}

// Deterministic board fixtures covering the realistic difficulty range.
function buildFixture(kind, board) {
  const set = (row, col) => {
    board.grid[row][col] = { color: '#333333' };
  };
  if (kind === 'empty') {
    return 'empty';
  }
  if (kind === 'quarter') {
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if ((row * 10 + col) % 4 === 0) set(row, col);
      }
    }
    return 'quarter';
  }
  if (kind === 'half') {
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if ((row + col) % 2 === 0 || row < 3) set(row, col);
      }
    }
    return 'half';
  }
  if (kind === 'fragmented') {
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if ((row % 3 !== 1 || col % 4 !== 2) && (row * 7 + col * 3) % 5 !== 0) set(row, col);
      }
    }
    return 'fragmented';
  }
  if (kind === 'narrowLanes') {
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if (col % 3 !== 2) set(row, col);
      }
    }
    return 'narrowLanes';
  }
  if (kind === 'nearlyFullRow') {
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 10; col += 1) set(row, col);
    }
    for (let col = 0; col < 9; col += 1) set(6, col);
    return 'nearlyFullRow';
  }
  if (kind === 'nearlyFullColumn') {
    for (let col = 0; col < 6; col += 1) {
      for (let row = 0; row < 10; row += 1) set(row, col);
    }
    for (let row = 0; row < 9; row += 1) set(row, 6);
    return 'nearlyFullColumn';
  }
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      if (!(row === 9 && col % 5 !== 0) && !(col === 9 && row % 5 !== 0)) set(row, col);
    }
  }
  return 'critical';
}

const FIXTURES = [
  'empty', 'quarter', 'half', 'fragmented',
  'narrowLanes', 'nearlyFullRow', 'nearlyFullColumn', 'critical'
];

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * ratio));
  return sortedValues[index];
}

function runDifficulty(difficulty) {
  const random = seededRandom(difficulty.length * 991 + samples);
  const originalRandom = Math.random;
  Math.random = random;

  const categories = { rescue: 0, simple: 0, medium: 0, hard: 0 };
  const baseIdCounts = {};
  const rotationCounts = {};
  const rackSeenBaseIds = [];
  const durations = [];

  // JIT warm-up so generation timing reflects steady state, not the first call.
  for (let warmup = 0; warmup < 20; warmup += 1) {
    const board = new Board();
    buildFixture(FIXTURES[warmup % FIXTURES.length], board);
    generator.createRack(board, difficulty, {});
  }
  let failures = 0;
  let snakeStreak = 0;
  let maxSnakeStreak = 0;
  let crowdedSamples = 0;
  let rescueOnCrowdedBoard = 0;
  let duplicateRacks = 0;
  let consecutiveRepeatRacks = 0;
  const quality = {
    fullSequenceRate: 0,
    threePlaceableRate: 0,
    onlyOnePlaceableRate: 0,
    forcedZeroRate: 0,
    depthTotals: { 0: 0, 1: 0, 2: 0, 3: 0 },
    averageLegalPlacements: 0,
    viabilitySamples: 0
  };

  let previousBaseIds = [];
  let lastRackBaseIds = [];

  for (let index = 0; index < samples; index += 1) {
    const fixtureKind = FIXTURES[index % FIXTURES.length];
    const board = new Board();
    buildFixture(fixtureKind, board);
    if (fixtureKind !== 'empty' && fixtureKind !== 'quarter') {
      crowdedSamples += 1;
    }

    const startedAt = performance.now();
    const rack = generator.createRack(board, difficulty, {
      previousHadSnake: snakeStreak > 0,
      recentBaseIds: previousBaseIds
    });
    durations.push(performance.now() - startedAt);

    if (!rack || !rack.success || !rack.pieces || rack.pieces.length !== 3) {
      failures += 1;
      snakeStreak = 0;
      previousBaseIds = [];
      continue;
    }

    const rackBaseIds = [];
    const rackKeyCounts = {};
    let rackHasSnake = false;
    for (const piece of rack.pieces) {
      categories[piece.category] += 1;
      baseIdCounts[piece.baseId] = (baseIdCounts[piece.baseId] || 0) + 1;
      rackBaseIds.push(piece.baseId);
      rackHasSnake ||= piece.isSnake;
      const key = cellsKey(piece.cells);
      const turnCounts = rotationCounts[piece.baseId] || (rotationCounts[piece.baseId] = {});
      turnCounts[key] = (turnCounts[key] || 0) + 1;
      rackKeyCounts[piece.baseId] = (rackKeyCounts[piece.baseId] || 0) + 1;
    }

    const duplicateInRack = Object.values(rackKeyCounts).some((count) => count >= 2);
    if (duplicateInRack) duplicateRacks += 1;
    if (previousBaseIds.some((baseId) => rackBaseIds.includes(baseId))) {
      consecutiveRepeatRacks += 1;
    }

    const viability = evaluateRackViability(board, rack.pieces);
    if (viability) {
      quality.viabilitySamples += 1;
      quality.averageLegalPlacements += viability.totalLegalPlacements;
      quality.depthTotals[viability.bestSequenceDepth] += 1;
      if (viability.hasFullThreePieceSequence) quality.fullSequenceRate += 1;
      if (viability.immediatelyPlaceableCount === 3) quality.threePlaceableRate += 1;
      if (viability.immediatelyPlaceableCount === 1) quality.onlyOnePlaceableRate += 1;
      if (viability.immediatelyPlaceableCount === 0) quality.forcedZeroRate += 1;
    }

    if (fixtureKind !== 'empty' && fixtureKind !== 'quarter' && rack.pieces.some((piece) => piece.category === 'rescue')) {
      rescueOnCrowdedBoard += 1;
    }

    snakeStreak = rackHasSnake ? snakeStreak + 1 : 0;
    maxSnakeStreak = Math.max(maxSnakeStreak, snakeStreak);
    rackSeenBaseIds.push(rackBaseIds);
    previousBaseIds = rackBaseIds;
  }

  // Longest run of consecutive racks without seeing a base shape.
  const allBaseIds = [...new Set(Object.values(generator.SHAPE_LIBRARY).flat().map((variant) => variant.baseId))];
  const lastSeenIndex = new Map(allBaseIds.map((baseId) => [baseId, -1]));
  const droughtByBase = {};
  for (const baseId of allBaseIds) droughtByBase[baseId] = 0;
  rackSeenBaseIds.forEach((ids, index) => {
    for (const baseId of allBaseIds) {
      if (ids.includes(baseId)) {
        droughtByBase[baseId] = Math.max(droughtByBase[baseId], index - lastSeenIndex.get(baseId) - 1);
        lastSeenIndex.set(baseId, index);
      }
    }
  });
  for (const baseId of allBaseIds) {
    droughtByBase[baseId] = Math.max(
      droughtByBase[baseId],
      rackSeenBaseIds.length - 1 - lastSeenIndex.get(baseId)
    );
  }
  let similarConsecutiveRacks = 0;
  let intersectionSum = 0;
  for (let index = 1; index < rackSeenBaseIds.length; index += 1) {
    const previous = new Set(rackSeenBaseIds[index - 1]);
    let intersection = 0;
    for (const baseId of rackSeenBaseIds[index]) {
      if (previous.has(baseId)) intersection += 1;
    }
    intersectionSum += intersection;
    if (intersection >= 2) similarConsecutiveRacks += 1;
  }

  Math.random = originalRandom;

  const generated = Object.values(categories).reduce((sum, value) => sum + value, 0);
  const sortedDurations = durations.slice().sort((a, b) => a - b);
  const totalPieces = Object.values(baseIdCounts).reduce((sum, value) => sum + value, 0);
  const successfulRacks = samples - failures;
  const viabilityTotal = quality.viabilitySamples || 1;

  return {
    samples,
    fixtures: FIXTURES,
    categoryRatios: Object.fromEntries(
      Object.entries(categories).map(([key, value]) => [key, generated ? value / generated : 0])
    ),
    baseIdRatios: Object.fromEntries(
      Object.entries(baseIdCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => [key, totalPieces ? value / totalPieces : 0])
    ),
    rotationShares: Object.fromEntries(
      Object.entries(rotationCounts).map(([baseId, turnCounts]) => {
        const total = Object.values(turnCounts).reduce((sum, value) => sum + value, 0);
        return [baseId, Object.fromEntries(
          Object.entries(turnCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([key, value]) => [key, value / total])
        )];
      })
    ),
    rackDuplicateRate: successfulRacks ? duplicateRacks / successfulRacks : 0,
    consecutiveRepeatRate: successfulRacks ? consecutiveRepeatRacks / successfulRacks : 0,
    similarConsecutiveRate: successfulRacks ? similarConsecutiveRacks / successfulRacks : 0,
    averageConsecutiveIntersection: successfulRacks ? intersectionSum / successfulRacks : 0,
    maxDroughtByBase: droughtByBase,
    failedRate: failures / samples,
    maxSnakeStreak,
    crowdedSamples,
    crowdedRescueRate: crowdedSamples ? rescueOnCrowdedBoard / crowdedSamples : 0,
    quality: {
      fullSequenceRate: quality.fullSequenceRate / viabilityTotal,
      threePlaceableRate: quality.threePlaceableRate / viabilityTotal,
      onlyOnePlaceableRate: quality.onlyOnePlaceableRate / viabilityTotal,
      forcedZeroRate: quality.forcedZeroRate / viabilityTotal,
      depthDistribution: Object.fromEntries(
        Object.entries(quality.depthTotals).map(([depth, count]) => [depth, count / viabilityTotal])
      ),
      averageLegalPlacements: quality.averageLegalPlacements / viabilityTotal
    },
    generationTimeMs: {
      average: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
      p95: percentile(sortedDurations, 0.95),
      worst: sortedDurations.length ? sortedDurations[sortedDurations.length - 1] : 0
    }
  };
}

console.log(JSON.stringify({
  generator: path.relative(rootDir, generatorPiecePath) || generatorPiecePath,
  easy: runDifficulty('easy'),
  normal: runDifficulty('normal'),
  master: runDifficulty('master')
}, null, 2));
