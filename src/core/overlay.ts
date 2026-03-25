import type { MatchTarget } from '../types'
import { createStyledDisplayCells, displayWidth } from './width'

const PRIMARY_HINT_STYLE = '\u001B[4;1;38;2;243;139;168m'
const PRIMARY_HIGHLIGHT_STYLE = '\u001B[4;1;38;2;137;220;235m'
const SECONDARY_HINT_STYLE = '\u001B[4;1;38;2;249;226;175m'
const SECONDARY_HIGHLIGHT_STYLE = '\u001B[4;1;38;2;116;199;236m'
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
): string[] => createOverlayRenderer(lines)(targets)

export const createOverlayRenderer = (
  lines: string[],
): ((targets: MatchTarget[]) => string[]) => {
  const baseCellsByLine = lines.map((line) => createStyledDisplayCells(line))
  const baseLines = baseCellsByLine.map((cells) => cells.join(''))
  const targetLine = (target: MatchTarget): number =>
    (target.screenLine ?? target.line) - 1
  const targetCol = (target: MatchTarget): number =>
    target.screenCol ?? target.col

  return (targets: MatchTarget[]): string[] => {
    const rendered = [...baseLines]
    const mutableCells = new Map<number, string[]>()
    const occupiedByLine = new Map<number, boolean[]>()
    const enterTarget = targets[0]

    const sorted = [...targets].sort(
      (left, right) =>
        targetLine(left) - targetLine(right) ||
        targetCol(left) + left.primary - (targetCol(right) + right.primary),
    )

    for (const target of sorted) {
      const lineIndex = targetLine(target)
      const baseCells = baseCellsByLine[lineIndex]
      if (!baseCells) {
        continue
      }

      let cells = mutableCells.get(lineIndex)
      if (!cells) {
        cells = [...baseCells]
        mutableCells.set(lineIndex, cells)
      }

      let lineOccupied = occupiedByLine.get(lineIndex)
      if (!lineOccupied) {
        lineOccupied = Array.from({ length: baseCells.length }, () => false)
        occupiedByLine.set(lineIndex, lineOccupied)
      }

      const matchCol = targetCol(target) + target.primary
      const hintCol = findOverlayStart(cells, matchCol)
      const baseWidth = measureCellWidth(cells, hintCol)
      const paddedHint =
        hintCol < matchCol ? target.hint.padEnd(baseWidth, ' ') : target.hint
      const hintWidth = displayWidth(paddedHint)
      const shouldHighlightPrimary = hintCol < matchCol
      const highlightCols = target.positions
        .filter(
          (position) => position !== target.primary || shouldHighlightPrimary,
        )
        .map((position) => targetCol(target) + position)
      const isEnterTarget =
        enterTarget !== undefined &&
        enterTarget.paneId === target.paneId &&
        targetLine(enterTarget) === lineIndex &&
        targetCol(enterTarget) === targetCol(target) &&
        enterTarget.text === target.text
      const hintStyle = isEnterTarget
        ? PRIMARY_HINT_STYLE
        : SECONDARY_HINT_STYLE
      const highlightStyle = isEnterTarget
        ? PRIMARY_HIGHLIGHT_STYLE
        : SECONDARY_HIGHLIGHT_STYLE

      const overlapsHint = Array.from(
        { length: hintWidth },
        (_, offset) => lineOccupied[hintCol + offset],
      ).some(Boolean)
      const overlapsHighlight = highlightCols.some((col) => lineOccupied[col])

      if (overlapsHint || overlapsHighlight) {
        continue
      }

      cells[hintCol] = `${hintStyle}${paddedHint}${RESET}`
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

        cells[col] = `${highlightStyle}${cells[col]}${RESET}`
        lineOccupied[col] = true
      }
    }

    for (const [lineIndex, cells] of mutableCells) {
      rendered[lineIndex] = cells.join('')
    }

    return rendered
  }
}
