export const BOARD_SIZE = 10;
export const RACK_SIZE = 3;

export const LEGACY_BEST_SCORE_KEY = 'block_puzzle_best_score_v1';
export const BEST_SCORES_KEY = 'block_puzzle_best_scores_v1';
export const DEBUG_CODE_ENABLED = true;
export const QUALITY_PROFILE = 'full';
export const REVIVE_CLEAR_COUNT = 5;
export const ADMIN_CLEAR_COUNT = 5;
export const MEMBERSHIP_CODES = [
  'RELAX2026'
];

export const COLORS = [
  '#2DE2E6',
  '#3A86FF',
  '#FF9F1C',
  '#FFD60A',
  '#47E56B',
  '#9B5DE5',
  '#FF4D6D'
];

export const BACKGROUND_TOP = '#2A8AC6';
export const BACKGROUND_MID = '#145E93';
export const BACKGROUND_BOTTOM = '#091B36';
export const BOARD_PANEL = '#0E2640';
export const BOARD_PANEL_BORDER = 'rgba(150, 218, 255, 0.4)';
export const BOARD_PANEL_GLOW = 'rgba(110, 200, 255, 0.12)';
export const BOARD_CELL = '#122B44';
export const BOARD_CELL_ALT = '#142F4B';
export const BOARD_GRID = 'rgba(150, 205, 240, 0.11)';
export const PREVIEW_VALID = 'rgba(174, 236, 255, 0.6)';
export const PREVIEW_INVALID = 'rgba(255, 119, 145, 0.5)';
export const OVERLAY = 'rgba(4, 10, 24, 0.72)';
export const PANEL = '#133157';
export const PANEL_BORDER = 'rgba(132, 218, 255, 0.64)';
export const TEXT_PRIMARY = '#F5FBFF';
export const TEXT_SECONDARY = '#B9D2FF';
export const TEXT_MUTED = 'rgba(185, 210, 255, 0.62)';
export const BUTTON_FILL = '#245B92';
export const BUTTON_GLOW = 'rgba(80, 182, 255, 0.24)';

export const UI_TOKENS = Object.freeze({
  radius: Object.freeze({ small: 10, medium: 14, large: 22 }),
  surface: Object.freeze({
    modal: '#132E56',
    elevated: 'rgba(11, 28, 52, 0.72)',
    sunken: 'rgba(8, 20, 40, 0.55)',
    input: 'rgba(11, 28, 52, 0.92)'
  }),
  border: Object.freeze({
    subtle: 'rgba(130, 205, 255, 0.18)',
    strong: 'rgba(140, 215, 255, 0.42)'
  }),
  accent: Object.freeze({
    primary: '#3FA9F5',
    positive: '#47E56B',
    warning: '#FFD60A',
    danger: '#E85D4A'
  }),
  motion: Object.freeze({
    pressMs: 90,
    modalOpenMs: 180,
    modalCloseMs: 140
  })
});

export const CLEAR_ANIMATION_MS = 180;
export const PLACEMENT_PULSE_MS = 140;
export const DRAG_FINGER_OFFSET_MULTIPLIER = 1.2;
export const DRAG_FINGER_OFFSET_MIN = 48;
export const DRAG_FINGER_OFFSET_MAX = 72;

export const MIN_SIDE_MARGIN = 14;
export const MAX_SIDE_MARGIN = 18;
export const BOARD_PADDING = 4;
export const SLOT_PADDING = 12;
export const HEADER_GAP = 8;
export const BOARD_GAP = 12;
export const RACK_BOTTOM_PADDING = 18;
