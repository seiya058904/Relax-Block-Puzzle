import { BOARD_SIZE } from './constants.js';

function createEmptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function cloneCell(cell) {
  if (!cell) {
    return null;
  }

  return { ...cell };
}

function cloneGrid(grid) {
  return grid.map((row) => row.map((cell) => cloneCell(cell)));
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

export default class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.reset();
  }

  reset() {
    this.grid = createEmptyGrid(this.size);
  }

  getSnapshot() {
    return cloneGrid(this.grid);
  }

  restoreSnapshot(snapshot) {
    this.grid = cloneGrid(snapshot || createEmptyGrid(this.size));
  }

  canPlace(cells, row, col) {
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      const targetRow = row + cell.y;
      const targetCol = col + cell.x;

      if (
        targetRow < 0 ||
        targetRow >= this.size ||
        targetCol < 0 ||
        targetCol >= this.size
      ) {
        return false;
      }

      if (this.grid[targetRow][targetCol]) {
        return false;
      }
    }

    return true;
  }

  place(piece, row, col) {
    piece.cells.forEach((cell) => {
      this.grid[row + cell.y][col + cell.x] = {
        color: piece.color
      };
    });

    return piece.cells.length;
  }

  findCompletedLines() {
    const rows = [];
    const cols = [];

    for (let row = 0; row < this.size; row += 1) {
      let full = true;
      for (let col = 0; col < this.size; col += 1) {
        if (!this.grid[row][col]) {
          full = false;
          break;
        }
      }

      if (full) {
        rows.push(row);
      }
    }

    for (let col = 0; col < this.size; col += 1) {
      let full = true;
      for (let row = 0; row < this.size; row += 1) {
        if (!this.grid[row][col]) {
          full = false;
          break;
        }
      }

      if (full) {
        cols.push(col);
      }
    }

    return { rows, cols };
  }

  clearLines(rows, cols) {
    const rowSet = new Set(rows);
    const colSet = new Set(cols);

    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        if (rowSet.has(row) || colSet.has(col)) {
          this.grid[row][col] = null;
        }
      }
    }
  }

  clearArea(centerRow, centerCol, radius = 1) {
    const removedCells = [];

    for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
      for (let col = centerCol - radius; col <= centerCol + radius; col += 1) {
        if (
          row < 0 ||
          row >= this.size ||
          col < 0 ||
          col >= this.size
        ) {
          continue;
        }

        if (this.grid[row][col]) {
          removedCells.push({
            row,
            col,
            color: this.grid[row][col].color
          });
          this.grid[row][col] = null;
        }
      }
    }

    return removedCells;
  }

  clearRandomFilled(count = 5) {
    const filledCells = [];

    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        if (this.grid[row][col]) {
          filledCells.push({
            row,
            col,
            color: this.grid[row][col].color
          });
        }
      }
    }

    if (filledCells.length === 0) {
      return [];
    }

    for (let index = filledCells.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = filledCells[index];
      filledCells[index] = filledCells[swapIndex];
      filledCells[swapIndex] = current;
    }

    const removed = filledCells.slice(0, Math.min(count, filledCells.length));
    removed.forEach((cell) => {
      this.grid[cell.row][cell.col] = null;
    });

    return removed;
  }

  hasAnyValidMove(pieces) {
    for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
      const piece = pieces[pieceIndex];

      if (!piece || piece.used) {
        continue;
      }

      const bounds = piece.bounds || getBounds(piece.cells);
      const maxRow = this.size - bounds.height;
      const maxCol = this.size - bounds.width;

      for (let row = 0; row <= maxRow; row += 1) {
        for (let col = 0; col <= maxCol; col += 1) {
          if (this.canPlace(piece.cells, row, col)) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
