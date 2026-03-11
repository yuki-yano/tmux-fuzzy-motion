import { readFile, writeFile } from 'node:fs/promises'
import stringWidth from 'string-width'

import { assignHints, createTargetKey } from '../core/hint'
import { matchCandidates } from '../core/matcher'
import { renderOverlay } from '../core/overlay'
import { clearScreen, createByteReader, withRawMode } from '../infra/tty'
import type { InputResult, InputState, MatchTarget } from '../types'

type ParsedInputArgs = {
  stateFile: string
  resultFile: string
}

const PREFIX = 'fuzzy-motion:'
const STATUS_STYLE = '\u001B[48;5;236;38;5;252m'
const RESET = '\u001B[0m'
const NO_MATCHES_SUFFIX = 'no matches'
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

const padStatus = (message: string, width: number): string => {
  const messageWidth = stringWidth(message)
  if (messageWidth >= width) {
    return message.slice(0, width)
  }

  return `${message}${' '.repeat(width - messageWidth)}`
}

const formatStatus = (query: string, matches: MatchTarget[]): string => {
  if (query.length === 0) {
    return `${PREFIX} `
  }

  if (matches.length === 0) {
    return `${PREFIX} ${query} ${NO_MATCHES_SUFFIX}`
  }

  return `${PREFIX} ${query}`
}

const renderFrame = (
  output: NodeJS.WriteStream,
  state: InputState,
  query: string,
  matches: MatchTarget[],
): void => {
  clearScreen(output)
  const hasQuery = query.length > 0
  const renderedLines =
    hasQuery && matches.length > 0
      ? renderOverlay(state.lines, matches)
      : state.lines
  output.write(`${renderedLines.join('\n')}`)
  output.write(`\u001B[${state.height};1H`)
  output.write('\u001B[2K')
  output.write(
    `${STATUS_STYLE}${padStatus(formatStatus(query, matches), state.width)}${RESET}`,
  )
}

const writeResult = async (
  resultFile: string,
  result: InputResult,
): Promise<void> => {
  await writeFile(resultFile, JSON.stringify(result), 'utf8')
}

const computeMatches = (
  state: InputState,
  query: string,
  previousHints: ReadonlyMap<string, string>,
): MatchTarget[] =>
  assignHints(matchCandidates(state.candidates, query), previousHints, {
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
  let query = ''
  let previousHints = new Map<string, string>()
  let matches = computeMatches(state, query, previousHints)

  const input = process.stdin
  const output = process.stdout

  await withRawMode(input, output, async () => {
    const reader = createByteReader(input)
    renderFrame(output, state, query, matches)

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

        matches = computeMatches(state, query, previousHints)
        previousHints = new Map(
          matches.map((target) => [createTargetKey(target), target.hint]),
        )
        renderFrame(output, state, query, matches)
      }
    } finally {
      reader.close()
    }
  })

  return 0
}
