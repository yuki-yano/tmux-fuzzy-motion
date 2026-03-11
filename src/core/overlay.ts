import type { MatchTarget } from '../types'
import { createStyledDisplayCells, displayWidth } from './width'

const HINT_STYLE = '\u001B[4;1;38;5;209m'
const HIGHLIGHT_STYLE = '\u001B[4;1;38;5;108m'
const RESET = '\u001B[0m'

const occupy = (occupied: boolean[], start: number, width: number): void => {
  for (let index = start; index < start + width; index += 1) {
    occupied[index] = true
  }
}

const findOverlayStart = (cells: string[], matchCol: number): number => {
  if (matchCol <= 0) {
    return 0
  }

  let start = matchCol - 1
  while (start > 0 && cells[start] === '') {
    start -= 1
  }

  return start
}

const measureCellWidth = (cells: string[], start: number): number => {
  let width = 1
  while (start + width < cells.length && cells[start + width] === '') {
    width += 1
  }

  return width
}

export const renderOverlay = (
  lines: string[],
  targets: MatchTarget[],
): string[] => {
  const rendered = lines.map((line) => createStyledDisplayCells(line))
  const occupied = rendered.map((cells) =>
    Array.from({ length: cells.length }, () => false),
  )

  const sorted = [...targets].sort(
    (left, right) =>
      left.line - right.line ||
      left.col + left.primary - (right.col + right.primary),
  )

  for (const target of sorted) {
    const lineIndex = target.line - 1
    const cells = rendered[lineIndex]
    const lineOccupied = occupied[lineIndex]

    if (!cells || !lineOccupied) {
      continue
    }

    const matchCol = target.col + target.primary
    const hintCol = findOverlayStart(cells, matchCol)
    const baseWidth = measureCellWidth(cells, hintCol)
    const paddedHint =
      hintCol < matchCol ? target.hint.padStart(baseWidth, ' ') : target.hint
    const hintWidth = displayWidth(paddedHint)
    const highlightCols = target.positions
      .filter((position) => position !== target.primary)
      .map((position) => target.col + position)

    const overlapsHint = Array.from(
      { length: hintWidth },
      (_, offset) => lineOccupied[hintCol + offset],
    ).some(Boolean)
    const overlapsHighlight = highlightCols.some((col) => lineOccupied[col])

    if (overlapsHint || overlapsHighlight) {
      continue
    }

    cells[hintCol] = `${HINT_STYLE}${paddedHint}${RESET}`
    occupy(lineOccupied, hintCol, hintWidth)

    for (let offset = 1; offset < hintWidth; offset += 1) {
      if (hintCol + offset < cells.length) {
        cells[hintCol + offset] = ''
      }
    }

    for (const col of highlightCols) {
      if (!cells[col]) {
        continue
      }

      cells[col] = `${HIGHLIGHT_STYLE}${cells[col]}${RESET}`
      lineOccupied[col] = true
    }
  }

  return rendered.map((cells) => cells.join(''))
}
