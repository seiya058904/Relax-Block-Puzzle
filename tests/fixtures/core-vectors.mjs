// Every platform copy is exercised by the version-parameterised parity tests.
// The published browser build (docs/js) must not be skipped: it is deployed
// separately from the Android asset copy even though the two share a source.
export const versions = ['wechat', 'android', 'web'];

export const toolCountsByDifficulty = {
  easy: { refreshCount: 3, clearCount: 1, undoCount: 1 },
  normal: { refreshCount: 2, clearCount: 1, undoCount: 1 },
  master: { refreshCount: 1, clearCount: 0, undoCount: 1 }
};

export const scoreVectors = [
  { cells: 1, placement: 10 },
  { cells: 3, placement: 30 },
  { cells: 5, placement: 50 }
];

export const lineScoreVectors = [
  { lines: 1, lineScore: 100, bonus: 50, total: 150 },
  { lines: 2, lineScore: 200, bonus: 200, total: 400 },
  { lines: 3, lineScore: 300, bonus: 450, total: 750 },
  { lines: 4, lineScore: 400, bonus: 800, total: 1200 }
];
