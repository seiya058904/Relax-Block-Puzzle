// GENERATED FILE - edit shared/js source and run npm run sync.
import { COLORS, RACK_SIZE } from './coreConstants.js';
import Board from './Board.js';
import { normalizeDifficulty } from '../utils/storage.js';

let pieceCounter = 0;

const SNAKE_BASE_IDS = new Set(['z', 's', 'stair5']);

// Soft repeat penalty for base shapes that appeared in very recent racks.
const RECENT_BASE_PENALTY = 0.65;
// Extra soft penalty when a family already appears in the current rack:
// duplicates stay possible (hard cap still 2 for normal/master) but become
// clearly less likely than a fresh shape.
const REPEAT_IN_RACK_PENALTY = 0.5;
// Final attempts skip the viability gate so failure rates never exceed the
// previous generator (which only used hasAnyValidMove).
const RELAXED_ATTEMPTS = 3;
// Hard cap on simulated placements per viability search. The search exits
// gracefully when the budget runs out; generation falls back to the
// hasAnyValidMove safety line.
const VIABILITY_PLACEMENT_BUDGET = 10000;

function normalizeCells(cells) {
  let minX = cells[0].x;
  let minY = cells[0].y;

  cells.forEach((cell) => {
    if (cell.x < minX) minX = cell.x;
    if (cell.y < minY) minY = cell.y;
  });

  return cells.map((cell) => ({
    x: cell.x - minX,
    y: cell.y - minY
  }));
}

function rotateCells(cells) {
  const rotated = cells.map((cell) => ({
    x: -cell.y,
    y: cell.x
  }));

  return normalizeCells(rotated);
}

function cellsKey(cells) {
  return cells
    .slice()
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((cell) => `${cell.x}:${cell.y}`)
    .join('|');
}

function expandVariants(definition, turns = 4) {
  const variants = [];
  const seen = new Set();
  let current = normalizeCells(definition.cells);

  for (let turn = 0; turn < turns; turn += 1) {
    const key = cellsKey(current);
    if (!seen.has(key)) {
      seen.add(key);
      variants.push({
        id: `${definition.id}_${turn}`,
        cells: current,
        category: definition.category,
        weight: definition.weight,
        baseId: definition.id
      });
    }
    current = rotateCells(current);
  }

  return variants;
}

function getBounds(cells) {
  let maxX = 0;
  let maxY = 0;

  cells.forEach((cell) => {
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  });

  return {
    width: maxX + 1,
    height: maxY + 1
  };
}

const SHAPE_LIBRARY = {
  rescue: [
    ...expandVariants({
      id: 'single',
      category: 'rescue',
      weight: 3.2,
      cells: [{ x: 0, y: 0 }]
    }, 1),
    ...expandVariants({
      id: 'line2',
      category: 'rescue',
      weight: 3.1,
      cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    }, 2),
    ...expandVariants({
      id: 'line3',
      category: 'rescue',
      weight: 2.4,
      cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]
    }, 2)
  ],
  simple: [
    ...expandVariants({
      id: 'l3',
      category: 'simple',
      weight: 2.2,
      cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]
    }, 4)
  ],
  medium: [
    ...expandVariants({
      id: 'line4',
      category: 'medium',
      weight: 1.8,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 }
      ]
    }, 2),
    ...expandVariants({
      id: 'square2',
      category: 'medium',
      weight: 1.9,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 }
      ]
    }, 1),
    ...expandVariants({
      id: 'corner4',
      category: 'medium',
      weight: 1.4,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 1 }
      ]
    }, 4)
  ],
  hard: [
    ...expandVariants({
      id: 'z',
      category: 'hard',
      weight: 0.12,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 1 }
      ]
    }, 2),
    ...expandVariants({
      id: 's',
      category: 'hard',
      weight: 0.12,
      cells: [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 }
      ]
    }, 2),
    ...expandVariants({
      id: 'stair5',
      category: 'hard',
      weight: 0.1,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 2, y: 2 }
      ]
    }, 4),
    ...expandVariants({
      id: 't4',
      category: 'hard',
      weight: 0.92,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 1 }
      ]
    }, 4),
    ...expandVariants({
      id: 't5',
      category: 'hard',
      weight: 0.62,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 2 }
      ]
    }, 4),
    ...expandVariants({
      id: 'l5',
      category: 'hard',
      weight: 0.68,
      cells: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 }
      ]
    }, 4),
    ...expandVariants({
      id: 'cross5',
      category: 'hard',
      weight: 0.32,
      cells: [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 }
      ]
    }, 1),
    ...expandVariants({
      id: 'square3',
      category: 'hard',
      weight: 0.5,
      cells: [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
        { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
        { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }
      ]
    }, 1),
    ...expandVariants({
      id: 'line5',
      category: 'hard',
      weight: 0.55,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 4, y: 0 }
      ]
    }, 2)
  ]
};

const ALL_POOLS = {
  rescue: SHAPE_LIBRARY.rescue,
  simple: SHAPE_LIBRARY.simple,
  medium: SHAPE_LIBRARY.medium,
  hard: SHAPE_LIBRARY.hard
};

// Family-first sampling table: one entry per base shape. Rotation variants
// stay grouped under their base so the base weight, not the rotation count,
// decides how often a family appears.
const FAMILY_POOLS = Object.fromEntries(
  Object.entries(ALL_POOLS).map(([category, variants]) => [
    category,
    variants.reduce((families, variant) => {
      let family = families.find((item) => item.baseId === variant.baseId);
      if (!family) {
        family = { baseId: variant.baseId, weight: variant.weight, variants: [] };
        families.push(family);
      }
      family.variants.push(variant);
      return families;
    }, [])
  ])
);

const DIFFICULTY_RULES = {
  easy: {
    categoryWeights: { rescue: 40, simple: 35, medium: 25 },
    maxMedium: 2,
    maxHard: 0,
    maxSnake: 0,
    maxSameBase: 1,
    requireRescue: true,
    allowHard: false,
    avoidConsecutiveSnake: false
  },
  normal: {
    categoryWeights: { rescue: 35, simple: 37, medium: 20, hard: 8 },
    maxMedium: 2,
    maxHard: 1,
    maxSnake: 1,
    maxSameBase: 2,
    requireRescue: false,
    allowHard: true,
    avoidConsecutiveSnake: true,
    crowdAdjustRescue: true
  },
  master: {
    categoryWeights: { rescue: 20, simple: 25, medium: 30, hard: 25 },
    maxMedium: 3,
    maxHard: 2,
    maxSnake: 2,
    maxSameBase: 2,
    requireRescue: false,
    allowHard: true,
    avoidConsecutiveSnake: false,
    crowdAdjustRescue: false
  }
};

function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function isSnakeBaseId(baseId) {
  return SNAKE_BASE_IDS.has(baseId);
}

function createPieceFromShape(shape) {
  const cells = shape.cells.map((cell) => ({
    x: cell.x,
    y: cell.y
  }));

  return {
    id: `${shape.id}_${pieceCounter += 1}`,
    cells,
    color: getRandomColor(),
    used: false,
    bounds: getBounds(cells),
    category: shape.category,
    baseId: shape.baseId || shape.id,
    isSnake: isSnakeBaseId(shape.baseId || shape.id)
  };
}

function countFilledCells(board) {
  if (!board || !board.grid) {
    return 0;
  }

  let total = 0;
  for (let row = 0; row < board.grid.length; row += 1) {
    for (let col = 0; col < board.grid[row].length; col += 1) {
      if (board.grid[row][col]) {
        total += 1;
      }
    }
  }
  return total;
}

function countCellsByBaseId(pieces, baseId) {
  return pieces.filter((piece) => piece.baseId === baseId).length;
}

function categoryCounts(pieces) {
  return pieces.reduce((result, piece) => {
    result[piece.category] = (result[piece.category] || 0) + 1;
    return result;
  }, { rescue: 0, simple: 0, medium: 0, hard: 0 });
}

function snakeCount(pieces) {
  return pieces.filter((piece) => piece.isSnake).length;
}

function tinyCount(pieces) {
  return pieces.filter((piece) => piece.category === 'rescue').length;
}

function pickUniformVariant(family) {
  const variants = family.variants;
  return variants[Math.floor(Math.random() * variants.length)];
}

function pickWeightedFamily(families) {
  let total = 0;
  families.forEach((family) => {
    total += family.weight;
  });

  let cursor = Math.random() * total;
  for (let index = 0; index < families.length; index += 1) {
    cursor -= families[index].weight;
    if (cursor <= 0) {
      return families[index];
    }
  }

  return families[families.length - 1];
}

function pickWeightedCategory(weights) {
  const categories = Object.keys(weights).filter((key) => weights[key] > 0);
  let total = 0;
  categories.forEach((key) => {
    total += weights[key];
  });

  let cursor = Math.random() * total;
  for (let index = 0; index < categories.length; index += 1) {
    const key = categories[index];
    cursor -= weights[key];
    if (cursor <= 0) {
      return key;
    }
  }

  return categories[categories.length - 1];
}

function countBoardSize(board) {
  if (board && board.grid && board.grid.length) {
    return board.grid.length;
  }

  return 10;
}

// Coarse pressure bucket used by difficulty adaptation. Only two factors on
// purpose: fill ratio and how many placements the whole shape library still
// has on this board. Rules stay explicit and easy to test.
export function getBoardPressure(board) {
  if (!board || !board.grid || typeof board.canPlace !== 'function') {
    return 'low';
  }

  const size = countBoardSize(board);
  const filledRatio = countFilledCells(board) / (size * size);

  let totalPlacements = 0;
  for (const variants of Object.values(SHAPE_LIBRARY)) {
    for (const variant of variants) {
      const bounds = getBounds(variant.cells);
      const maxRow = size - bounds.height;
      const maxCol = size - bounds.width;
      for (let row = 0; row <= maxRow; row += 1) {
        for (let col = 0; col <= maxCol; col += 1) {
          if (board.canPlace(variant.cells, row, col)) {
            totalPlacements += 1;
          }
        }
      }
    }
  }

  if (filledRatio >= 0.7 || totalPlacements < 40) {
    return 'critical';
  }

  if (filledRatio >= 0.55 || totalPlacements < 90) {
    return 'high';
  }

  if (filledRatio >= 0.3 || totalPlacements < 180) {
    return 'medium';
  }

  return 'low';
}

function getCategoryWeights(difficulty, pressure = 'low') {
  const rules = DIFFICULTY_RULES[difficulty];
  const weights = { ...rules.categoryWeights };

  if (difficulty === 'normal' && rules.crowdAdjustRescue) {
    if (pressure === 'critical') {
      weights.rescue += 16;
      weights.simple += 4;
      weights.medium = Math.max(10, weights.medium - 6);
      weights.hard = Math.max(4, weights.hard - 4);
    } else if (pressure === 'high') {
      weights.rescue += 10;
      weights.simple += 3;
      weights.hard = Math.max(5, weights.hard - 2);
    } else if (pressure === 'medium') {
      weights.rescue += 5;
    }
  }

  if (difficulty === 'easy') {
    if (pressure === 'critical') {
      weights.rescue += 14;
      weights.simple += 6;
      weights.medium = Math.max(12, weights.medium - 8);
    } else if (pressure === 'high') {
      weights.rescue += 8;
      weights.simple += 4;
      weights.medium = Math.max(15, weights.medium - 6);
    }
  }

  if (difficulty === 'master' && pressure === 'critical') {
    weights.rescue += 3;
  }

  return weights;
}

// Picks the family pool for a slot. The duplicate policy is uniform for
// every category: a family already present in the rack stays selectable at
// the reduced in-rack weight, up to the same-base hard cap. Another category
// is used only when the picked category's pool is empty (cap filtered every
// family out), so single-family categories like simple behave exactly like
// multi-family ones.
function pickAvailableFamilyPool(category, difficulty, pieces, options) {
  const rules = DIFFICULTY_RULES[difficulty];
  let pool = buildFamilyPoolForCategory(category, difficulty, pieces, options);
  if (pool) {
    return { category, pool };
  }

  const fallbackOrder = ['rescue', 'simple', 'medium', 'hard'];
  for (const fallbackCategory of fallbackOrder) {
    if (!rules.allowHard && fallbackCategory === 'hard') {
      continue;
    }
    pool = buildFamilyPoolForCategory(fallbackCategory, difficulty, pieces, options);
    if (pool) {
      return { category: fallbackCategory, pool };
    }
  }

  return null;
}

// Returns the weighted family pool for a category, or null when every
// family is currently capped out (same-base limit) so the caller can fall
// back to another category instead of forcing a duplicate.
function buildFamilyPoolForCategory(category, difficulty, pieces, options) {
  const rules = DIFFICULTY_RULES[difficulty];
  const recentBaseIds = Array.isArray(options.recentBaseIds) ? options.recentBaseIds : [];
  let families = FAMILY_POOLS[category].map((family) => {
    let weight = family.weight;
    if (recentBaseIds.includes(family.baseId)) {
      weight *= RECENT_BASE_PENALTY;
    }
    if (countCellsByBaseId(pieces, family.baseId) > 0) {
      weight *= REPEAT_IN_RACK_PENALTY;
    }
    return { ...family, weight };
  });

  if (difficulty === 'easy' && category === 'rescue' && countCellsByBaseId(pieces, 'single') >= 1) {
    families = families.filter((family) => family.baseId !== 'single');
  }

  if (difficulty === 'normal' && category === 'hard') {
    if (snakeCount(pieces) >= 1) {
      families = families.filter((family) => !isSnakeBaseId(family.baseId));
    } else if (options.previousHadSnake) {
      families = families.filter((family) => !isSnakeBaseId(family.baseId));
    }
  }

  if (difficulty === 'master' && category === 'hard' && snakeCount(pieces) >= 2) {
    families = families.filter((family) => !isSnakeBaseId(family.baseId));
  }

  if (rules.maxSameBase) {
    families = families.filter(
      (family) => countCellsByBaseId(pieces, family.baseId) < rules.maxSameBase
    );
  }

  return families.length > 0 ? families : null;
}

function createCandidateRack(board, difficulty, options = {}) {
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  const rules = DIFFICULTY_RULES[normalizedDifficulty];
  const pieces = [];
  const weights = options.weights || getCategoryWeights(normalizedDifficulty, options.pressure);

  if (rules.requireRescue) {
    const rescuePool = pickAvailableFamilyPool('rescue', normalizedDifficulty, pieces, options);
    if (!rescuePool) {
      return pieces;
    }
    pieces.push(createPieceFromShape(pickUniformVariant(pickWeightedFamily(rescuePool.pool))));
  }

  while (pieces.length < RACK_SIZE) {
    let placed = false;

    for (let spin = 0; spin < 8 && pieces.length < RACK_SIZE && !placed; spin += 1) {
      const counts = categoryCounts(pieces);
      let category = pickWeightedCategory(weights);

      if (!rules.allowHard && category === 'hard') {
        category = Math.random() < 0.58 ? 'simple' : 'medium';
      }

      if (category === 'medium' && counts.medium >= rules.maxMedium) {
        category = counts.rescue === 0 ? 'rescue' : 'simple';
      }

      if (category === 'hard' && counts.hard >= rules.maxHard) {
        category = Math.random() < 0.55 ? 'simple' : 'medium';
      }

      if (normalizedDifficulty === 'easy' && tinyCount(pieces) >= 2 && category === 'rescue') {
        category = Math.random() < 0.6 ? 'simple' : 'medium';
      }

      if (normalizedDifficulty === 'normal' && counts.medium + counts.hard >= 2) {
        category = Math.random() < 0.55 ? 'rescue' : 'simple';
      }

      const available = pickAvailableFamilyPool(category, normalizedDifficulty, pieces, options);
      if (!available) {
        continue;
      }

      pieces.push(
        createPieceFromShape(pickUniformVariant(pickWeightedFamily(available.pool)))
      );
      placed = true;
    }

    if (!placed) {
      break;
    }
  }

  return pieces;
}

function easyRackValid(pieces) {
  const counts = categoryCounts(pieces);
  if (counts.rescue < 1) {
    return false;
  }
  if (counts.medium > 2) {
    return false;
  }
  if (counts.medium === RACK_SIZE) {
    return false;
  }
  if (tinyCount(pieces) === RACK_SIZE) {
    return false;
  }
  if (countCellsByBaseId(pieces, 'single') > 1) {
    return false;
  }
  const duplicated = pieces.some(
    (piece, index) => pieces.findIndex((item) => item.baseId === piece.baseId) !== index
  );
  if (duplicated) {
    return false;
  }
  return true;
}

function normalRackValid(pieces, options) {
  const counts = categoryCounts(pieces);
  if (counts.hard > 1) {
    return false;
  }
  if (counts.medium + counts.hard >= 3) {
    return false;
  }
  if (snakeCount(pieces) > 1) {
    return false;
  }
  if (options.previousHadSnake && snakeCount(pieces) > 0) {
    return false;
  }
  const tripled = pieces.some(
    (piece) => pieces.filter((item) => item.baseId === piece.baseId).length > DIFFICULTY_RULES.normal.maxSameBase
  );
  if (tripled) {
    return false;
  }
  return true;
}

function masterRackValid(pieces) {
  const counts = categoryCounts(pieces);
  if (counts.hard > 2) {
    return false;
  }
  if (snakeCount(pieces) >= RACK_SIZE) {
    return false;
  }
  return true;
}

function isRackValidForDifficulty(pieces, difficulty, options = {}) {
  if (difficulty === 'easy') {
    return easyRackValid(pieces);
  }

  if (difficulty === 'normal') {
    return normalRackValid(pieces, options);
  }

  if (difficulty === 'master') {
    return masterRackValid(pieces);
  }

  return true;
}

function createRackMeta(pieces) {
  return {
    hasSnake: pieces.some((piece) => piece.isSnake)
  };
}

// Enumerates legal placements of one piece on the current grid using the
// real Board rules (bounds-aware canPlace over every anchor).
function enumeratePlacements(board, piece, visit) {
  const bounds = piece.bounds || getBounds(piece.cells);
  const maxRow = board.size - bounds.height;
  const maxCol = board.size - bounds.width;

  for (let row = 0; row <= maxRow; row += 1) {
    for (let col = 0; col <= maxCol; col += 1) {
      if (board.canPlace(piece.cells, row, col) && visit(row, col) === false) {
        return;
      }
    }
  }
}

// Bounded depth-first search over all piece orders (the player chooses the
// order, so 3! = 6 sequences). At each depth every remaining piece is tried
// exactly once as the next placement, so no ordered sequence is searched
// twice and the placement budget is never wasted on duplicate permutations.
// Placement and line clears reuse the real Board methods on a snapshot copy;
// each step restores the grid rows it borrowed, so no second clear-rule
// implementation exists.
function searchRackSequence(sim, remainingPieces, depth, state) {
  if (remainingPieces.length === 0) {
    state.bestSequenceDepth = Math.max(state.bestSequenceDepth, depth);
    state.hasFullThreePieceSequence = true;
    return true;
  }

  for (let index = 0; index < remainingPieces.length; index += 1) {
    const piece = remainingPieces[index];
    const rest = remainingPieces.filter((_, itemIndex) => itemIndex !== index);
    let found = false;
    let placed = false;

    enumeratePlacements(sim, piece, (row, col) => {
      if (state.budget <= 0) {
        return false;
      }
      state.budget -= 1;

      const gridBackup = sim.grid.map((rowCells) => rowCells.slice());
      sim.place(piece, row, col);
      const completed = sim.findCompletedLines();
      if (completed.rows.length > 0 || completed.cols.length > 0) {
        sim.clearLines(completed.rows, completed.cols);
      }

      found = searchRackSequence(sim, rest, depth + 1, state);
      sim.grid = gridBackup;
      placed = true;

      if (found) {
        return false;
      }
      return true;
    });

    if (found) {
      return true;
    }
    if (!placed && state.budget <= 0) {
      return false;
    }
  }

  if (depth > state.bestSequenceDepth) {
    state.bestSequenceDepth = depth;
  }
  return false;
}

// Quality summary for a candidate rack. Returns null when the board does not
// expose the real Board API (defensive for legacy stubs). Generation only —
// never used by rendering, dragging, or the frame loop.
export function evaluateRackViability(board, pieces) {
  if (
    !board ||
    typeof board.canPlace !== 'function' ||
    typeof board.getSnapshot !== 'function' ||
    !Array.isArray(pieces) ||
    pieces.length === 0
  ) {
    return null;
  }

  const sim = new Board(board.size || 10);
  sim.restoreSnapshot(board.getSnapshot());

  let immediatelyPlaceableCount = 0;
  let totalLegalPlacements = 0;
  pieces.forEach((piece) => {
    let count = 0;
    enumeratePlacements(sim, piece, () => {
      count += 1;
      return true;
    });
    totalLegalPlacements += count;
    if (count > 0) {
      immediatelyPlaceableCount += 1;
    }
  });

  const state = {
    budget: VIABILITY_PLACEMENT_BUDGET,
    bestSequenceDepth: 0,
    hasFullThreePieceSequence: false
  };
  searchRackSequence(sim, pieces, 0, state);

  return {
    immediatelyPlaceableCount,
    totalLegalPlacements,
    hasFullThreePieceSequence: state.hasFullThreePieceSequence,
    bestSequenceDepth: state.bestSequenceDepth
  };
}

function passesViabilityGate(difficulty, viability) {
  if (!viability) {
    return true;
  }

  if (difficulty === 'easy') {
    return viability.hasFullThreePieceSequence;
  }

  if (difficulty === 'normal') {
    return viability.bestSequenceDepth >= 2;
  }

  return true;
}

export function createRack(board, difficulty = 'normal', options = {}) {
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  const maxAttempts = options.maxAttempts || 20;
  const pressure = getBoardPressure(board);
  const weights = getCategoryWeights(normalizedDifficulty, pressure);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const pieces = createCandidateRack(board, normalizedDifficulty, {
      ...options,
      weights,
      pressure
    });

    if (!isRackValidForDifficulty(pieces, normalizedDifficulty, options)) {
      continue;
    }

    if (!board || board.hasAnyValidMove(pieces)) {
      const relaxed = attempt >= maxAttempts - RELAXED_ATTEMPTS;
      if (!relaxed) {
        const viability = evaluateRackViability(board, pieces);
        if (!passesViabilityGate(normalizedDifficulty, viability)) {
          continue;
        }
      }

      return {
        success: true,
        pieces,
        meta: createRackMeta(pieces)
      };
    }
  }

  return {
    success: false,
    pieces: null,
    meta: {
      hasSnake: false
    }
  };
}
