// Presentation only. Palette IDs never replace stored piece colors or gameplay settings.
export const BACKGROUND_TOP = '#F6F3EB';
export const BACKGROUND_MID = '#F6F3EB';
export const BACKGROUND_BOTTOM = '#F6F3EB';
export const BOARD_PANEL = '#D8D5C9';
export const BOARD_PANEL_BORDER = '#C9C7BA';
export const BOARD_PANEL_GLOW = 'rgba(35, 57, 46, 0.06)';
export const BOARD_CELL = '#EAE7DD';
export const BOARD_CELL_ALT = '#EAE7DD';
export const BOARD_GRID = '#D8D5C9';
export const PREVIEW_VALID = '#365D4D';
export const PREVIEW_INVALID = '#A24F3E';
export const OVERLAY = 'rgba(24, 39, 32, 0.38)';
export const PANEL = '#FFFCF5';
export const PANEL_BORDER = '#D8D5C9';
export const TEXT_PRIMARY = '#283E33';
export const TEXT_SECONDARY = '#536357';
export const TEXT_MUTED = '#596556';
export const BUTTON_FILL = '#365D4D';
export const BUTTON_GLOW = 'rgba(35, 57, 46, 0.1)';
export const UI_TOKENS = Object.freeze({
  radius: Object.freeze({ small: 8, medium: 12, large: 18 }),
  surface: Object.freeze({ modal: '#FFFCF5', elevated: '#F0EDE3', sunken: '#E8E5DA', input: '#FFFCF5' }),
  border: Object.freeze({ subtle: '#D6D7CB', strong: '#738773' }),
  accent: Object.freeze({ primary: '#365D4D', positive: '#365D4D', warning: '#846020', danger: '#A24F3E' }),
  motion: Object.freeze({ pressMs: 90, modalOpenMs: 180, modalCloseMs: 140 })
});
const PIECE_INKS = Object.freeze({
  '#2DE2E6': '#478D85', '#3A86FF': '#697FB3', '#FF9F1C': '#BB7950',
  '#FFD60A': '#D3B45E', '#47E56B': '#849C62', '#9B5DE5': '#9E81A9', '#FF4D6D': '#B86162'
});
export function getPieceInk(color, themeId = 'soft') {
  return themeId === 'classic' ? color : PIECE_INKS[String(color).toUpperCase()] || color;
}

const soft = Object.freeze({
  id: 'soft', name: '纸感', BACKGROUND_TOP, BACKGROUND_MID, BACKGROUND_BOTTOM,
  BOARD_PANEL, BOARD_PANEL_BORDER, BOARD_PANEL_GLOW, BOARD_CELL, BOARD_CELL_ALT, BOARD_GRID,
  PREVIEW_VALID, PREVIEW_INVALID, OVERLAY, PANEL, PANEL_BORDER,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, BUTTON_FILL, BUTTON_GLOW, UI_TOKENS,
  onAction: '#FFFCF5', titleFont: 'serif', shadow: 'rgba(24, 39, 32, 0.16)',
  wellLight: 'rgba(255, 252, 245, 0.35)', wellShade: 'rgba(35, 57, 46, 0.03)'
});

// Recovered from local pre-redesign 0c0ce54; brighter text, calmer glow and
// opaque panel surfaces refine the original blue / luminous-piece identity.
const classic = Object.freeze({
  id: 'classic', name: '流光',
  BACKGROUND_TOP: '#17496B', BACKGROUND_MID: '#123751', BACKGROUND_BOTTOM: '#091B36',
  BOARD_PANEL: '#0E2640', BOARD_PANEL_BORDER: '#4B83A1', BOARD_PANEL_GLOW: 'rgba(110, 200, 255, 0.16)',
  BOARD_CELL: '#18364C', BOARD_CELL_ALT: '#18364C', BOARD_GRID: '#29536B',
  PREVIEW_VALID: '#AEECFF', PREVIEW_INVALID: '#FF91A6',
  OVERLAY: 'rgba(4, 10, 24, 0.72)', PANEL: '#132E4C', PANEL_BORDER: '#31526D',
  TEXT_PRIMARY: '#F5FBFF', TEXT_SECONDARY: '#C1DAED', TEXT_MUTED: '#AACADC',
  BUTTON_FILL: '#27618D', BUTTON_GLOW: 'rgba(80, 182, 255, 0.14)',
  onAction: '#F5FBFF', titleFont: 'sans-serif', shadow: 'rgba(0, 10, 28, 0.42)',
  wellLight: 'rgba(157, 218, 251, 0.04)', wellShade: 'rgba(0, 8, 24, 0.12)',
  UI_TOKENS: Object.freeze({
    radius: Object.freeze({ small: 10, medium: 14, large: 22 }),
    surface: Object.freeze({ modal: '#132E4C', elevated: '#183C58', sunken: '#0B223A', input: '#0B223A' }),
    border: Object.freeze({ subtle: '#355D77', strong: '#75B6D6' }),
    accent: Object.freeze({ primary: '#8BCFF1', positive: '#8CE4B5', warning: '#F3D178', danger: '#F2A298' }),
    motion: UI_TOKENS.motion
  }),
  dangerFill: '#9A3F49'
});

export const THEMES = Object.freeze({ classic, soft });
export function normalizeTheme(id) { return id === 'soft' ? 'soft' : 'classic'; }
export function getTheme(id) { return THEMES[normalizeTheme(id)]; }
