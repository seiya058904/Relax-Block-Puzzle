import { COLORS, RACK_SIZE } from './constants.js';
import { normalizeDifficulty } from '../utils/storage.js';

let pieceCounter = 0;

const SNAKE_BASE_IDS = new Set(['z', 's', 'stair5']);

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

const DIFFICULTY_RULES = {
  easy: {
    categoryWeights: { rescue: 40, simple: 35, medium: 25 },
    maxMedium: 2,
    maxHard: 0,
    maxSnake: 0,
    requireRescue: true,
    allowHard: false,
    avoidConsecutiveSnake: false
  },
  normal: {
    categoryWeights: { rescue: 35, simple: 37, medium: 20, hard: 8 },
    maxMedium: 2,
    maxHard: 1,
    maxSnake: 1,
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

function pickWeightedShape(pool) {
  let total = 0;
  pool.forEach((item) => {
    total += item.weight;
  });

  let cursor = Math.random() * total;
  for (let index = 0; index < pool.length; index += 1) {
    cursor -= pool[index].weight;
    if (cursor <= 0) {
      return pool[index];
    }
  }

  return pool[pool.length - 1];
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

function getCategoryWeights(difficulty, board) {
  const rules = DIFFICULTY_RULES[difficulty];
  const weights = { ...rules.categoryWeights };

  if (difficulty === 'normal' && rules.crowdAdjustRescue && board) {
    const filled = countFilledCells(board);
    if (filled >= 70) {
      weights.rescue += 14;
      weights.medium = Math.max(10, weights.medium - 6);
      weights.hard = Math.max(4, weights.hard - 4);
    } else if (filled >= 55) {
      weights.rescue += 8;
      weights.simple += 2;
      weights.hard = Math.max(5, weights.hard - 2);
    }
  }

  return weights;
}

function buildPoolForCategory(category, difficulty, pieces, options) {
  let pool = ALL_POOLS[category];

  if (difficulty === 'easy' && category === 'rescue' && countCellsByBaseId(pieces, 'single') >= 1) {
    pool = pool.filter((shape) => shape.baseId !== 'single');
  }

  if (difficulty === 'normal' && category === 'hard') {
    if (snakeCount(pieces) >= 1) {
      pool = pool.filter((shape) => !isSnakeBaseId(shape.baseId));
    } else if (options.previousHadSnake) {
      pool = pool.filter((shape) => !isSnakeBaseId(shape.baseId));
    }
  }

  if (difficulty === 'master' && category === 'hard' && snakeCount(pieces) >= 2) {
    pool = pool.filter((shape) => !isSnakeBaseId(shape.baseId));
  }

  return pool.length > 0 ? pool : ALL_POOLS[category];
}

function createCandidateRack(board, difficulty, options = {}) {
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  const rules = DIFFICULTY_RULES[normalizedDifficulty];
  const pieces = [];
  const weights = getCategoryWeights(normalizedDifficulty, board);

  if (rules.requireRescue) {
    const rescuePool = buildPoolForCategory('rescue', normalizedDifficulty, pieces, options);
    pieces.push(createPieceFromShape(pickWeightedShape(rescuePool)));
  }

  while (pieces.length < RACK_SIZE) {
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

    const pool = buildPoolForCategory(category, normalizedDifficulty, pieces, options);
    pieces.push(createPieceFromShape(pickWeightedShape(pool)));
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

export function createRack(board, difficulty = 'normal', options = {}) {
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  const maxAttempts = options.maxAttempts || 20;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const pieces = createCandidateRack(board, normalizedDifficulty, options);

    if (!isRackValidForDifficulty(pieces, normalizedDifficulty, options)) {
      continue;
    }

    if (!board || board.hasAnyValidMove(pieces)) {
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
