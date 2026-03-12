import { readFile, writeFile } from 'node:fs/promises'

import stringWidth from 'string-width'

import { assignHints, createTargetKey } from '../core/hint'
import { loadMigemo } from '../core/migemo'
import { createMatcher, type CandidateMatcher } from '../core/matcher'
import { createOverlayRenderer } from '../core/overlay'
import { createStyledDisplayCells } from '../core/width'
import { clearScreen, createByteReader, withRawMode } from '../infra/tty'
import type { InputResult, InputState, MatchTarget } from '../types'

type ParsedInputArgs = {
  stateFile: string
  resultFile: string
}

const QUERY_STYLE = '\u001B[48;5;236;38;5;252m'
const RESET = '\u001B[0m'
const HINT_CHARS = new Set('ASDFGHJKLQWERTYUIOPZXCVBNM')
const WORD_CHAR_PATTERN = /[a-z0-9_-]/u

const parseArgs = (args: string[]): ParsedInputArgs => {
  let stateFile = ''
  let resultFile = ''

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--state-file') {
      stateFile = args[index + 1] ?? ''
      index += 1
    } else if (value === '--result-file') {
      resultFile = args[index + 1] ?? ''
      index += 1
    }
  }

  return { stateFile, resultFile }
}

const isPrintableAscii = (value: number): boolean =>
  value >= 0x20 && value <= 0x7e

const isQueryChar = (char: string): boolean => /^[a-z0-9./_:-]$/.test(char)

export const deleteBackwardChar = (query: string): string => query.slice(0, -1)

export const deleteBackwardWord = (query: string): string => {
  let next = query

  while (next.length > 0 && !WORD_CHAR_PATTERN.test(next.at(-1) ?? '')) {
    next = next.slice(0, -1)
  }

  while (next.length > 0 && WORD_CHAR_PATTERN.test(next.at(-1) ?? '')) {
    next = next.slice(0, -1)
  }

  return next
}

const fitBodyToHeight = (lines: string[], height: number): string[] => {
  const next = lines.slice(0, height)

  while (next.length < height) {
    next.push('')
  }

  return next
}

export const renderQueryOnBottomLine = (
  line: string,
  width: number,
  query: string,
): string => {
  const cells = createStyledDisplayCells(line)

  while (cells.length < width) {
    cells.push(' ')
  }

  if (query.length === 0) {
    return cells.slice(0, width).join('')
  }

  const queryWidth = Math.min(width, stringWidth(query))
  const start = Math.max(0, width - queryWidth)
  const content = Array.from(query)
  let cursor = start

  for (const char of content) {
    if (cursor >= width) {
      break
    }

    cells[cursor] = `${QUERY_STYLE}${char}${RESET}`
    cursor += Math.max(1, stringWidth(char))
  }

  while (cursor < width) {
    cells[cursor] = cells[cursor] ?? ' '
    cursor += 1
  }

  return cells.slice(0, width).join('')
}

type Frame = {
  body: string[]
}

const createFrame = (
  state: InputState,
  query: string,
  matches: MatchTarget[],
  renderOverlay: (targets: MatchTarget[]) => string[],
): Frame => {
  const body = fitBodyToHeight(
    query.length > 0 && matches.length > 0
      ? renderOverlay(matches)
      : state.lines,
    state.height,
  )
  const lastLineIndex = Math.max(0, body.length - 1)
  body[lastLineIndex] = renderQueryOnBottomLine(
    body[lastLineIndex] ?? '',
    state.width,
    query,
  )
  return { body }
}

const writeFullFrame = (output: NodeJS.WriteStream, frame: Frame): void => {
  clearScreen(output)
  output.write(frame.body.join('\n'))
}

const renderFrame = (
  output: NodeJS.WriteStream,
  frame: Frame,
  previousFrame?: Frame,
): Frame => {
  if (!previousFrame) {
    writeFullFrame(output, frame)
    return frame
  }

  for (let index = 0; index < frame.body.length; index += 1) {
    if (frame.body[index] === previousFrame.body[index]) {
      continue
    }

    output.write(`\u001B[${index + 1};1H`)
    output.write('\u001B[2K')
    output.write(frame.body[index] ?? '')
  }

  return frame
}

const writeResult = async (
  resultFile: string,
  result: InputResult,
): Promise<void> => {
  await writeFile(resultFile, JSON.stringify(result), 'utf8')
}

const computeMatches = (
  query: string,
  previousHints: ReadonlyMap<string, string>,
  matcher: CandidateMatcher,
): MatchTarget[] =>
  assignHints(matcher(query), previousHints, {
    maxHintLength: 1,
    maxTargets: 26,
  })

export const runInput = async (args: string[]): Promise<number> => {
  const { stateFile, resultFile } = parseArgs(args)
  if (!stateFile || !resultFile) {
    console.error(
      'tmux-fuzzy-motion: input requires --state-file and --result-file',
    )
    return 1
  }

  const state = JSON.parse(await readFile(stateFile, 'utf8')) as InputState
  const migemo = await loadMigemo()
  const matcher = createMatcher(state.candidates, migemo)
  const overlayRenderer = createOverlayRenderer(state.lines)
  let query = ''
  let previousHints = new Map<string, string>()
  let matches = computeMatches(query, previousHints, matcher)

  const input = process.stdin
  const output = process.stdout

  await withRawMode(input, output, async () => {
    const reader = createByteReader(input)
    let previousFrame = renderFrame(
      output,
      createFrame(state, query, matches, overlayRenderer),
    )

    try {
      while (true) {
        const value = await reader.nextByte()
        if (value === null) {
          await writeResult(resultFile, { status: 'cancelled' })
          return
        }

        if (value === 0x1b || value === 0x07) {
          await writeResult(resultFile, { status: 'cancelled' })
          return
        }

        if (value === 0x7f || value === 0x08) {
          query = deleteBackwardChar(query)
          previousHints = new Map()
        } else if (value === 0x17) {
          query = deleteBackwardWord(query)
          previousHints = new Map()
        } else if (value === 0x15) {
          query = ''
          previousHints = new Map()
        } else if (value === 0x0d || value === 0x0a) {
          const selected = matches[0]
          if (selected) {
            await writeResult(resultFile, {
              status: 'selected',
              target: selected,
            })
            return
          }
          await writeResult(resultFile, { status: 'cancelled' })
          return
        } else if (isPrintableAscii(value)) {
          const char = String.fromCharCode(value)
          if (HINT_CHARS.has(char)) {
            const selected = matches.find((target) => target.hint === char)
            if (selected) {
              await writeResult(resultFile, {
                status: 'selected',
                target: selected,
              })
              return
            }
          } else if (isQueryChar(char)) {
            query += char
          }
        }

        matches = computeMatches(query, previousHints, matcher)
        previousHints = new Map(
          matches.map((target) => [createTargetKey(target), target.hint]),
        )
        previousFrame = renderFrame(
          output,
          createFrame(state, query, matches, overlayRenderer),
          previousFrame,
        )
      }
    } finally {
      reader.close()
    }
  })

  return 0
}
