import stringWidth from 'string-width'

const ANSI_PATTERN = /\u001B\[[0-9;]*m/gu
const RESET = '\u001B[0m'

export const displayWidth = (value: string): number => stringWidth(value)

export const codeUnitIndexToColumn = (value: string, index: number): number =>
  stringWidth(value.slice(0, index))

export const codeUnitIndexToCharacterIndex = (
  value: string,
  index: number,
): number => Array.from(value.slice(0, index)).length

export const codeUnitIndicesToColumns = (
  value: string,
  indices: number[],
): number[] => {
  if (indices.length === 0) {
    return []
  }

  const sorted = [...new Set(indices)].sort((left, right) => left - right)
  const columns: number[] = []
  let currentIndex = 0
  let currentColumn = 0
  let pointer = 0

  for (const char of value) {
    const nextIndex = currentIndex + char.length
    const width = Math.max(1, stringWidth(char))

    while (pointer < sorted.length && sorted[pointer]! < nextIndex) {
      columns.push(currentColumn)
      pointer += 1
    }

    currentIndex = nextIndex
    currentColumn += width
  }

  return [...new Set(columns)]
}

export const codeUnitRangeToColumns = (
  value: string,
  start: number,
  end: number,
): number[] => {
  if (end <= start) {
    return []
  }

  const columns: number[] = []
  let currentIndex = 0
  let currentColumn = 0

  for (const char of value) {
    const nextIndex = currentIndex + char.length
    const width = Math.max(1, stringWidth(char))

    if (currentIndex >= start && currentIndex < end) {
      columns.push(currentColumn)
    }

    currentIndex = nextIndex
    currentColumn += width
  }

  return columns
}

export const createDisplayCells = (value: string): string[] => {
  const cells: string[] = []

  for (const char of value) {
    const width = Math.max(1, stringWidth(char))
    cells.push(char)
    for (let offset = 1; offset < width; offset += 1) {
      cells.push('')
    }
  }

  return cells
}

export const createStyledDisplayCells = (value: string): string[] => {
  const cells: string[] = []
  let activeStyle = ''
  let lastIndex = 0

  for (const match of value.matchAll(ANSI_PATTERN)) {
    const start = match.index ?? 0
    const chunk = value.slice(lastIndex, start)
    for (const char of chunk) {
      const width = Math.max(1, stringWidth(char))
      const styledChar =
        activeStyle.length > 0 ? `${activeStyle}${char}${RESET}` : char
      cells.push(styledChar)
      for (let offset = 1; offset < width; offset += 1) {
        cells.push('')
      }
    }

    const sequence = match[0]
    activeStyle = sequence === RESET ? '' : `${activeStyle}${sequence}`
    lastIndex = start + sequence.length
  }

  const rest = value.slice(lastIndex)
  for (const char of rest) {
    const width = Math.max(1, stringWidth(char))
    const styledChar =
      activeStyle.length > 0 ? `${activeStyle}${char}${RESET}` : char
    cells.push(styledChar)
    for (let offset = 1; offset < width; offset += 1) {
      cells.push('')
    }
  }

  return cells
}
