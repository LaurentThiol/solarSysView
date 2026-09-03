export const N_ROWS = 5
export const N_COLS = 10
export const STAR_ROWS = 2
export const STAR_COLS = 6
export const N_POOL = 50
export const S_POOL = 12

export const CELL = 28
export const GAP = 4
export const MARGIN = 16
export const BOARD_GAP = 24

export function numberCell(n: number): [number, number] {
  const i = n - 1
  return [Math.floor(i / N_COLS), i % N_COLS]
}

export function starCell(s: number): [number, number] {
  const i = s - 1
  return [Math.floor(i / STAR_COLS), i % STAR_COLS]
}

export function cellNumber(row: number, col: number) {
  return row * N_COLS + col + 1
}

export function cellStar(row: number, col: number) {
  return row * STAR_COLS + col + 1
}

export function numbersBoardSize(): [number, number] {
  return [N_COLS * CELL + (N_COLS - 1) * GAP, N_ROWS * CELL + (N_ROWS - 1) * GAP]
}

export function starsBoardSize(): [number, number] {
  return [STAR_COLS * CELL + (STAR_COLS - 1) * GAP, STAR_ROWS * CELL + (STAR_ROWS - 1) * GAP]
}

export function canvasSize(): [number, number] {
  const [nw, nh] = numbersBoardSize()
  const [, sh] = starsBoardSize()
  return [MARGIN * 2 + nw, MARGIN + nh + BOARD_GAP + sh + MARGIN]
}

export function numbersOrigin(): [number, number] {
  return [MARGIN, MARGIN]
}

export function starsOrigin(): [number, number] {
  const [nw] = numbersBoardSize()
  const [sw] = starsBoardSize()
  const [, nh] = numbersBoardSize()
  return [MARGIN + Math.max(0, Math.floor((nw - sw) / 2)), MARGIN + nh + BOARD_GAP]
}

export function cellRect(
  origin: [number, number],
  row: number,
  col: number
): [number, number, number, number] {
  const x = origin[0] + col * (CELL + GAP)
  const y = origin[1] + row * (CELL + GAP)
  return [x, y, CELL, CELL]
}

export function occupancy(numbers: number[], stars: number[]) {
  const bits = Array<number>(N_POOL + S_POOL).fill(0)
  for (const n of numbers) if (n >= 1 && n <= N_POOL) bits[n - 1] = 1
  for (const s of stars) if (s >= 1 && s <= S_POOL) bits[N_POOL + s - 1] = 1
  return bits
}
