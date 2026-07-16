import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const versionRoots = {
  wechat: path.join(rootDir, 'we xin xiao cheng xu', 'js'),
  android: path.join(
    rootDir,
    'we xin xiao cheng xu-android-apk',
    'app',
    'src',
    'main',
    'assets',
    'js'
  ),
  web: path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'docs', 'js')
};

function moduleUrl(version, relativePath) {
  const versionRoot = versionRoots[version];
  if (!versionRoot) {
    throw new Error(`Unknown version: ${version}`);
  }
  return pathToFileURL(path.join(versionRoot, relativePath)).href;
}

export function getVersionPath(version, relativePath) {
  const versionRoot = versionRoots[version];
  if (!versionRoot) {
    throw new Error(`Unknown version: ${version}`);
  }
  return path.join(versionRoot, relativePath);
}

export async function loadVersion(version) {
  const [boardModule, pieceModule, scoreModule, stateModule, storageModule, constantsModule, feedbackModule, inputModule] =
    await Promise.all([
      import(moduleUrl(version, 'game/Board.js')),
      import(moduleUrl(version, 'game/Piece.js')),
      import(moduleUrl(version, 'game/ScoreManager.js')),
      import(moduleUrl(version, 'game/GameState.js')),
      import(moduleUrl(version, 'utils/storage.js')),
      import(moduleUrl(version, 'game/constants.js')),
      import(moduleUrl(version, 'game/FeedbackState.js')),
      import(moduleUrl(version, 'game/InputManager.js'))
    ]);

  return {
    Board: boardModule.default,
    createRack: pieceModule.createRack,
    ScoreManager: scoreModule.default,
    GameState: stateModule.default,
    getDifficultyLabel: stateModule.getDifficultyLabel,
    storage: storageModule,
    constants: constantsModule,
    feedback: feedbackModule,
    InputManager: inputModule.default
  };
}

export async function loadPieceInternals(version) {
  const piecePath = getVersionPath(version, 'game/Piece.js');
  const constantsUrl = pathToFileURL(getVersionPath(version, 'game/constants.js')).href;
  const coreConstantsUrl = pathToFileURL(getVersionPath(version, 'game/coreConstants.js')).href;
  const storageUrl = pathToFileURL(getVersionPath(version, 'utils/storage.js')).href;
  let source = await fs.readFile(piecePath, 'utf8');
  source = source
    .replace("from './constants.js'", `from '${constantsUrl}'`)
    .replace("from './coreConstants.js'", `from '${coreConstantsUrl}'`)
    .replace("from '../utils/storage.js'", `from '${storageUrl}'`);
  source += '\nexport { SHAPE_LIBRARY, DIFFICULTY_RULES, createCandidateRack, isRackValidForDifficulty };\n';
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(dataUrl);
}
