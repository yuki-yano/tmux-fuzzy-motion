import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createConnection, createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import stringWidth from 'string-width'

import { moveCopyCursor } from '../core/action'
import { capturePane, fitCaptureToHeight } from '../core/capture'
import { extractCandidates } from '../core/extract'
import { assignHints, createTargetKey } from '../core/hint'
import { loadMigemo } from '../core/migemo'
import { createMatcher, type CandidateMatcher } from '../core/matcher'
import { createDaemonSocketPath, ensureDaemon } from './runtime'
import { createOverlayRenderer } from '../core/overlay'
import { createStyledDisplayCells } from '../core/width'
import { createTmuxClient, getPaneStartContext } from '../infra/tmux'
import { clearScreen, createByteReader, withRawMode } from '../infra/tty'
import type {
  DaemonRequest,
  DaemonResponse,
  InputResult,
  InputState,
  MatchTarget,
} from '../types'

type ParsedPopupArgs = {
  resultFile: string
  socketPath: string
  stateFile: string
}

type ParsedPopupLiveArgs = {
  paneId: string
}

type ParsedDaemonArgs = {
  socketPath: string
}

type PopupJobOptions = {
  onMatch: (
    query: string,
    previousHints: ReadonlyMap<string, string>,
  ) => Promise<MatchTarget[]>
  onResult: (result: InputResult) => Promise<void>
}

type DaemonClient = {
  close: () => void
  send: (request: DaemonRequest) => Promise<DaemonResponse>
}

const QUERY_STYLE = '\u001B[48;5;236;38;5;252m'
const RESET = '\u001B[0m'
const HINT_CHARS = new Set('ASDFGHJKLQWERTYUIOPZXCVBNM')
const WORD_CHAR_PATTERN = /[a-z0-9_-]/u

const parsePopupArgs = (args: string[]): ParsedPopupArgs => {
  let resultFile = ''
  let socketPath = ''
  let stateFile = ''

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--state-file') {
      stateFile = args[index + 1] ?? ''
      index += 1
    } else if (value === '--result-file') {
      resultFile = args[index + 1] ?? ''
      index += 1
    } else if (value === '--socket') {
      socketPath = args[index + 1] ?? ''
      index += 1
    }
  }

  return { resultFile, socketPath, stateFile }
}

const parseDaemonArgs = (args: string[]): ParsedDaemonArgs => {
  let socketPath = ''

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--socket') {
      socketPath = args[index + 1] ?? ''
      index += 1
    }
  }

  return { socketPath }
}

const parsePopupLiveArgs = (args: string[]): ParsedPopupLiveArgs => {
  const [paneId] = args
  return { paneId: paneId ?? '' }
}

const isPrintableAscii = (value: number): boolean =>
  value >= 0x20 && value <= 0x7e

const isQueryChar = (char: string): boolean => /^[a-z0-9./_:-]$/.test(char)

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseDaemonRequestLine = (line: string): DaemonRequest => {
  const value = JSON.parse(line) as Partial<DaemonRequest>

  if (value.type === 'ping') {
    return {
      type: 'ping',
    }
  }

  if (value.type === 'prepare') {
    if (!value.stateFile) {
      throw new Error('tmux-fuzzy-motion: daemon prepare requires stateFile')
    }

    return {
      type: 'prepare',
      stateFile: value.stateFile,
    }
  }

  if (value.type === 'match') {
    if (
      typeof value.query !== 'string' ||
      !isRecord(value.previousHints) ||
      Object.values(value.previousHints).some(
        (hint) => typeof hint !== 'string',
      )
    ) {
      throw new Error(
        'tmux-fuzzy-motion: daemon match requires query and previousHints',
      )
    }

    return {
      type: 'match',
      query: value.query,
      previousHints: Object.fromEntries(
        Object.entries(value.previousHints).map(([key, hint]) => [
          key,
          String(hint),
        ]),
      ),
    }
  }

  throw new Error('tmux-fuzzy-motion: unsupported daemon request')
}

export const serializeDaemonMessageLine = (message: DaemonResponse): string =>
  `${JSON.stringify(message)}\n`

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
      : state.displayLines,
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
  output.write('\u001B[?7l')
  clearScreen(output)
  output.write(frame.body.join('\n'))
  output.write('\u001B[H\u001B[?7h')
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

  output.write('\u001B[?7l')
  for (let index = 0; index < frame.body.length; index += 1) {
    if (frame.body[index] === previousFrame.body[index]) {
      continue
    }

    output.write(`\u001B[${index + 1};1H`)
    output.write('\u001B[2K')
    output.write(frame.body[index] ?? '')
  }
  output.write('\u001B[H\u001B[?7h')
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

const createPreparedMatcher = async (
  state: InputState,
  migemoPromise: ReturnType<typeof loadMigemo>,
): Promise<{
  candidateCount: number
  matcher: CandidateMatcher
}> => {
  const candidates =
    state.scope === 'all'
      ? state.panes.flatMap((pane) =>
          extractCandidates(pane.plainLines).map((candidate) => ({
            ...candidate,
            paneId: pane.paneId,
            screenLine: pane.top + candidate.line,
            screenCol: pane.left + candidate.col,
          })),
        )
      : extractCandidates(state.plainLines)
  const migemo = await migemoPromise

  return {
    candidateCount: candidates.length,
    matcher: createMatcher(candidates, migemo),
  }
}

const connectDaemonClient = async (socketPath: string): Promise<DaemonClient> =>
  new Promise((resolve, reject) => {
    const socket = createConnection(socketPath)
    socket.setEncoding('utf8')

    let buffer = ''
    let connected = false
    let pending: {
      reject: (error: Error) => void
      resolve: (response: DaemonResponse) => void
    } | null = null

    const fail = (error: unknown): void => {
      const normalized = toError(error)
      pending?.reject(normalized)
      pending = null

      if (!connected) {
        reject(normalized)
        return
      }

      socket.destroy()
    }

    socket.on('connect', () => {
      connected = true
      resolve({
        close: () => socket.destroy(),
        send: async (request) => {
          if (pending) {
            throw new Error(
              'tmux-fuzzy-motion: daemon client does not support concurrent requests',
            )
          }

          return new Promise<DaemonResponse>(
            (resolveResponse, rejectResponse) => {
              pending = {
                reject: rejectResponse,
                resolve: resolveResponse,
              }

              socket.write(`${JSON.stringify(request)}\n`, (error) => {
                if (!error) {
                  return
                }

                const normalized = toError(error)
                pending?.reject(normalized)
                pending = null
              })
            },
          )
        },
      })
    })

    socket.on('data', (chunk: string) => {
      buffer += chunk

      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex < 0) {
          break
        }

        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) {
          continue
        }

        const current = pending
        if (!current) {
          continue
        }

        try {
          const response = JSON.parse(line) as DaemonResponse
          current.resolve(response)
          pending = null
        } catch (error) {
          const normalized = toError(error)
          current.reject(normalized)
          pending = null
        }
      }
    })

    socket.on('error', fail)
    socket.on('close', () => {
      if (!pending) {
        return
      }

      pending.reject(
        new Error('tmux-fuzzy-motion: daemon connection closed unexpectedly'),
      )
      pending = null
    })
  })

const expectResponse = <T extends DaemonResponse['type']>(
  response: DaemonResponse,
  type: T,
): Extract<DaemonResponse, { type: T }> => {
  if (response.type === 'error') {
    throw new Error(response.message)
  }

  if (response.type === 'busy') {
    throw new Error('tmux-fuzzy-motion: daemon is busy')
  }

  if (response.type !== type) {
    throw new Error(`tmux-fuzzy-motion: expected daemon response ${type}`)
  }

  return response as Extract<DaemonResponse, { type: T }>
}

const runPopupJob = async (
  state: InputState,
  options: PopupJobOptions,
): Promise<void> => {
  const overlayRenderer = createOverlayRenderer(state.displayLines)
  let query = ''
  let previousHints = new Map<string, string>()
  let matches: MatchTarget[] = []

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
        if (value === null || value === 0x1b || value === 0x07) {
          await options.onResult({ status: 'cancelled' })
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
          if (!selected) {
            await options.onResult({ status: 'cancelled' })
            return
          }

          await options.onResult({
            status: 'selected',
            target: selected,
          })
          return
        } else if (isPrintableAscii(value)) {
          const char = String.fromCharCode(value)
          if (HINT_CHARS.has(char)) {
            const selected = matches.find((target) => target.hint === char)
            if (selected) {
              await options.onResult({
                status: 'selected',
                target: selected,
              })
              return
            }
          } else if (isQueryChar(char)) {
            query += char
          }
        }

        matches =
          query.length === 0 ? [] : await options.onMatch(query, previousHints)
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
}

export const runPopup = async (args: string[]): Promise<number> => {
  const { resultFile, socketPath, stateFile } = parsePopupArgs(args)
  if (!stateFile || !resultFile || !socketPath) {
    console.error(
      'tmux-fuzzy-motion: popup requires --state-file, --result-file, and --socket',
    )
    return 1
  }

  const state = JSON.parse(await readFile(stateFile, 'utf8')) as InputState
  const client = await connectDaemonClient(socketPath)
  const preparePromise = client
    .send({
      type: 'prepare',
      stateFile,
    })
    .then((response) => expectResponse(response, 'prepared'))
  void preparePromise.catch(() => {})

  try {
    await runPopupJob(state, {
      onMatch: async (query, previousHints) => {
        await preparePromise
        const response = expectResponse(
          await client.send({
            type: 'match',
            query,
            previousHints: Object.fromEntries(previousHints),
          }),
          'matchResult',
        )

        return response.targets
      },
      onResult: async (result) => {
        await writeResult(resultFile, result)
      },
    })

    return 0
  } finally {
    client.close()
  }
}

export const runPopupLive = async (args: string[]): Promise<number> => {
  const { paneId } = parsePopupLiveArgs(args)

  if (!process.env.TMUX) {
    console.error('tmux-fuzzy-motion: must be run inside tmux')
    return 2
  }

  if (!paneId) {
    console.error('tmux-fuzzy-motion: pane not found')
    return 2
  }

  const tmux = createTmuxClient()
  const tempDir = await mkdtemp(join(tmpdir(), 'tmux-fuzzy-motion-'))
  const stateFile = join(tempDir, 'state.json')
  const resultFile = join(tempDir, 'result.json')
  const socketPath = createDaemonSocketPath()

  try {
    const pane = await getPaneStartContext(tmux, paneId)
    if (!pane.inCopyMode) {
      throw new Error('tmux-fuzzy-motion: pane is not in copy-mode')
    }
    const capture = fitCaptureToHeight(
      await capturePane(tmux, paneId),
      pane.height,
    )

    const state: InputState = {
      scope: 'current',
      paneId,
      clientTty: '',
      displayLines: capture.displayLines,
      plainLines: capture.lines,
      width: pane.width,
      height: pane.height,
    }

    await writeFile(stateFile, JSON.stringify(state), 'utf8')
    await ensureDaemon(socketPath)

    const exitCode = await runPopup([
      '--state-file',
      stateFile,
      '--result-file',
      resultFile,
      '--socket',
      socketPath,
    ])
    if (exitCode !== 0) {
      return exitCode
    }

    const result = JSON.parse(await readFile(resultFile, 'utf8')) as InputResult
    if (result.status === 'selected') {
      await tmux.runQuiet(['select-pane', '-t', paneId])
      await moveCopyCursor(tmux, paneId, result.target)
    }

    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    return message.startsWith('tmux-fuzzy-motion:') ? 2 : 1
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export const runDaemon = async (args: string[]): Promise<number> => {
  const { socketPath } = parseDaemonArgs(args)
  if (!socketPath) {
    console.error('tmux-fuzzy-motion: daemon requires --socket')
    return 1
  }

  await rm(socketPath, { force: true })
  const migemoPromise = loadMigemo()

  let activeSocket: Socket | null = null
  let activeMatcher: CandidateMatcher | null = null

  const resetSession = (socket: Socket): void => {
    if (activeSocket !== socket) {
      return
    }

    activeSocket = null
    activeMatcher = null
  }

  const server = createServer((socket) => {
    socket.setEncoding('utf8')

    let buffer = ''
    let chain = Promise.resolve()

    const writeMessage = async (message: DaemonResponse): Promise<void> =>
      new Promise((resolve, reject) => {
        socket.write(serializeDaemonMessageLine(message), (error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })

    const handleRequest = async (request: DaemonRequest): Promise<void> => {
      if (request.type === 'ping') {
        await writeMessage({ type: 'pong' })
        return
      }

      if (
        request.type === 'prepare' &&
        activeSocket !== null &&
        activeSocket !== socket
      ) {
        await writeMessage({ type: 'busy' })
        socket.end()
        return
      }

      if (
        request.type === 'match' &&
        activeSocket !== null &&
        activeSocket !== socket
      ) {
        await writeMessage({ type: 'busy' })
        socket.end()
        return
      }

      if (request.type === 'prepare') {
        activeSocket = socket
        const state = JSON.parse(
          await readFile(request.stateFile, 'utf8'),
        ) as InputState
        const prepared = await createPreparedMatcher(state, migemoPromise)
        activeMatcher = prepared.matcher
        await writeMessage({
          type: 'prepared',
          candidateCount: prepared.candidateCount,
        })
        return
      }

      if (activeSocket !== socket || !activeMatcher) {
        await writeMessage({
          type: 'error',
          message: 'tmux-fuzzy-motion: prepare must run before match',
        })
        return
      }

      await writeMessage({
        type: 'matchResult',
        targets: computeMatches(
          request.query,
          new Map(Object.entries(request.previousHints)),
          activeMatcher,
        ),
      })
    }

    socket.on('data', (chunk: string) => {
      buffer += chunk

      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex < 0) {
          break
        }

        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) {
          continue
        }

        chain = chain
          .then(async () => {
            await handleRequest(parseDaemonRequestLine(line))
          })
          .catch(async (error) => {
            await writeMessage({
              type: 'error',
              message: toError(error).message,
            })
          })
      }
    })

    socket.on('close', () => {
      resetSession(socket)
    })
    socket.on('error', () => {
      resetSession(socket)
    })
  })

  server.on('close', () => {
    void rm(socketPath, { force: true })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, resolve)
  })

  await migemoPromise
  await new Promise(() => {})
  return 0
}
