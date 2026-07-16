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

const piecePath = path.join(rootDir, 'shared', 'js', 'game', 'Piece.js');
const constantsPath = path.join(rootDir, 'shared', 'js', 'game', 'coreConstants.js');
const storagePath = path.join(rootDir, 'shared', 'js', 'utils', 'storage.js');
let source = await fs.readFile(piecePath, 'utf8');
source = source
  .replace("from './coreConstants.js'", `from '${pathToFileURL(constantsPath).href}'`)
  .replace("from '../utils/storage.js'", `from '${pathToFileURL(storagePath).href}'`);
source += '\nexport { DIFFICULTY_RULES, createCandidateRack };\n';
const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const Board = (await import(pathToFileURL(path.join(rootDir, 'shared', 'js', 'game', 'Board.js')).href)).default;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function runDifficulty(difficulty) {
    const random = seededRandom(difficulty.length * 991 + samples);
  const originalRandom = Math.random;
  Math.random = random;
  const categories = { rescue: 0, simple: 0, medium: 0, hard: 0 };
  let failures = 0;
  let maxSnakeStreak = 0;
  let snakeStreak = 0;
  let rescueOnCrowdedBoard = 0;
  let crowdedSamples = 0;

  for (let index = 0; index < samples; index += 1) {
    const board = new Board();
    if (index % 4 === 0) {
      crowdedSamples += 1;
      for (let cell = 0; cell < 60; cell += 1) board.grid[Math.floor(cell / 10)][cell % 10] = { color: '#000' };
    }
    const rack = module.createCandidateRack(board, difficulty, { previousHadSnake: snakeStreak > 0 });
    if (!rack || rack.length !== 3) {
      failures += 1;
      snakeStreak = 0;
      continue;
    }
    let rackHasSnake = false;
    for (const piece of rack) {
      categories[piece.category] += 1;
      rackHasSnake ||= piece.isSnake;
    }
    if (crowdedSamples && index % 4 === 0 && rack.some((piece) => piece.category === 'rescue')) rescueOnCrowdedBoard += 1;
    snakeStreak = rackHasSnake ? snakeStreak + 1 : 0;
    maxSnakeStreak = Math.max(maxSnakeStreak, snakeStreak);
  }

  Math.random = originalRandom;
  const generated = Object.values(categories).reduce((sum, value) => sum + value, 0);
  return {
    samples,
    categoryRatios: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, generated ? value / generated : 0])),
    failedRate: failures / samples,
    maxSnakeStreak,
    crowdedSamples,
    crowdedRescueRate: crowdedSamples ? rescueOnCrowdedBoard / crowdedSamples : 0
  };
}

console.log(JSON.stringify({
  easy: runDifficulty('easy'),
  normal: runDifficulty('normal'),
  master: runDifficulty('master')
}, null, 2));
