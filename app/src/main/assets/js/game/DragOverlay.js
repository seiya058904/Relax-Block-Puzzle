function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((item) => item + item).join('')
    : normalized;

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function tintColor(hex, amount) {
  const rgb = hexToRgb(hex);
  const adjust = (channel) => clamp(Math.round(channel + (255 - channel) * amount), 0, 255);
  return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
}

function shadeColor(hex, amount) {
  const rgb = hexToRgb(hex);
  const adjust = (channel) => clamp(Math.round(channel * (1 - amount)), 0, 255);
  return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
}

function rgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

export default class DragOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    this.width = 0;
    this.height = 0;
    this.visible = false;
  }

  show(piece, cellSize, pointerX, pointerY, offsetY) {
    if (!piece || !piece.bounds) {
      this.hide();
      return;
    }

    this.pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    this.width = Math.ceil(piece.bounds.width * cellSize);
    this.height = Math.ceil(piece.bounds.height * cellSize);

    this.canvas.width = Math.max(1, Math.ceil(this.width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.ceil(this.height * this.pixelRatio));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.style.display = 'block';

    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawPiece(piece, cellSize);
    this.visible = true;
    this.moveTo(pointerX, pointerY, offsetY);
  }

  moveTo(pointerX, pointerY, offsetY) {
    if (!this.visible) {
      return;
    }

    const overlayX = pointerX - this.width / 2;
    const overlayY = pointerY - offsetY - this.height;
    this.canvas.style.transform = `translate3d(${overlayX}px, ${overlayY}px, 0)`;
  }

  hide() {
    this.visible = false;
    this.canvas.style.display = 'none';
    this.canvas.style.transform = 'translate3d(-9999px, -9999px, 0)';
    this.ctx.clearRect(0, 0, this.width || 1, this.height || 1);
  }

  drawPiece(piece, cellSize) {
    piece.cells.forEach((cell) => {
      this.drawBlockCell(cell.x * cellSize, cell.y * cellSize, cellSize, piece.color);
    });
  }

  drawBlockCell(x, y, size, color) {
    const inset = clamp(size * 0.02, 1, 2);
    const drawSize = size - inset * 2;
    const drawX = x + inset;
    const drawY = y + inset;
    const radius = clamp(size * 0.08, 2, 4);
    const topColor = tintColor(color, 0.2);
    const bottomColor = shadeColor(color, 0.22);
    const gradient = this.ctx.createLinearGradient(drawX, drawY, drawX, drawY + drawSize);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(0.48, color);
    gradient.addColorStop(1, bottomColor);

    roundedRect(this.ctx, drawX, drawY, drawSize, drawSize, radius);
    this.ctx.fillStyle = gradient;
    this.ctx.fill();

    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = rgba(tintColor(color, 0.34), 0.82);
    roundedRect(this.ctx, drawX + 0.5, drawY + 0.5, drawSize - 1, drawSize - 1, radius);
    this.ctx.stroke();

    this.ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    this.ctx.beginPath();
    this.ctx.moveTo(drawX + 2, drawY + drawSize - 2);
    this.ctx.lineTo(drawX + 2, drawY + 2);
    this.ctx.lineTo(drawX + drawSize - 2, drawY + 2);
    this.ctx.stroke();
  }
}
