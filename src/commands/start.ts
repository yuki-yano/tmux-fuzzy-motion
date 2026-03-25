import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { moveCopyCursor } from '../core/action'
import { capturePane, fitCaptureToHeight } from '../core/capture'
import { createStyledDisplayCells } from '../core/width'
import {
  createDaemonSocketPath,
  ensureDaemon,
  resolveCliEntrypoint,
} from './runtime'
import {
  createTmuxClient,
  displayPopup,
  enterCopyMode,
  focusClientPane,
  getPaneStartContext,
  getPaneBorderLines,
  listWindowPanes,
  type PaneBorderLines,
  type DisplayPopupOptions,
  type PaneStartContext,
} from '../infra/tmux'
import type { InputResult, InputState, PaneSnapshot } from '../types'

type StartScope = 'current' | 'all'

type ParsedStartArgs = {
  scope: StartScope
  paneId: string
  clientTty: string
}

type PopupState = {
  currentPath: string
  state: InputState
  x?: string | number
  y?: string | number
}

type DebugLogPayload = {
  event: string
  [key: string]: unknown
}

const writeDebugLog = async (payload: DebugLogPayload): Promise<void> => {
  const debugLogPath = process.env.TMUX_FUZZY_MOTION_DEBUG_LOG
  if (!debugLogPath) {
    return
  }

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  })

  try {
    await appendFile(debugLogPath, `${line}\n`, 'utf8')
  } catch {
    // Ignore debug logging failures.
  }
}

const buildPopupRelativePosition = (
  axis: 'x' | 'y',
  targetOrigin: number,
): string => {
  if (axis === 'x') {
    return `#{e|+|:#{popup_pane_left},#{e|-|:${targetOrigin},#{pane_left}}}`
  }

  const topOffset =
    '#{?#{==:#{status-position},top},#{e|-|:#{client_height},#{window_height}},0}'
  const desiredTop = `#{e|+|:#{e|-|:${targetOrigin},#{window_offset_y}},${topOffset}}`

  return `#{e|+|:#{popup_height},${desiredTop}}`
}

const buildPopupCommand = (
  stateFile: string,
  resultFile: string,
  socketPath: string,
): string[] => [
  process.execPath,
  resolveCliEntrypoint(),
  'popup',
  '--state-file',
  stateFile,
  '--result-file',
  resultFile,
  '--socket',
  socketPath,
]

const readResult = async (resultFile: string): Promise<InputResult> => {
  try {
    return JSON.parse(await readFile(resultFile, 'utf8')) as InputResult
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: popup did not produce result', {
      cause: error,
    })
  }
}

const parseStartArgs = (args: string[]): ParsedStartArgs => {
  let scope: StartScope = 'current'
  const positional: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--scope') {
      const nextScope = args[index + 1]
      if (nextScope === 'current' || nextScope === 'all') {
        scope = nextScope
      }
      index += 1
      continue
    }

    positional.push(value ?? '')
  }

  return {
    scope,
    paneId: positional[0] ?? '',
    clientTty: positional[1] ?? '',
  }
}

const createBlankRow = (width: number): string[] =>
  Array.from({ length: width }, () => ' ')

const BORDER_SETS: Record<
  Exclude<PaneBorderLines, 'number'>,
  { horizontal: string; intersection: string; vertical: string }
> = {
  single: {
    vertical: '│',
    horizontal: '─',
    intersection: '┼',
  },
  double: {
    vertical: '║',
    horizontal: '═',
    intersection: '╬',
  },
  heavy: {
    vertical: '┃',
    horizontal: '━',
    intersection: '╋',
  },
  simple: {
    vertical: '|',
    horizontal: '-',
    intersection: '+',
  },
  spaces: {
    vertical: ' ',
    horizontal: ' ',
    intersection: ' ',
  },
}

const createOccupancyGrid = (
  panes: Pick<PaneSnapshot, 'left' | 'top' | 'width' | 'height'>[],
  width: number,
  height: number,
): boolean[][] => {
  const occupied = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false),
  )

  for (const pane of panes) {
    for (let row = pane.top; row < pane.top + pane.height; row += 1) {
      const line = occupied[row]
      if (!line) {
        continue
      }

      for (
        let column = pane.left;
        column < pane.left + pane.width;
        column += 1
      ) {
        if (column >= 0 && column < line.length) {
          line[column] = true
        }
      }
    }
  }

  return occupied
}

const resolveBorderSet = (
  borderLines: PaneBorderLines,
): { horizontal: string; intersection: string; vertical: string } =>
  borderLines === 'number' ? BORDER_SETS.simple : BORDER_SETS[borderLines]

const drawPaneBorders = (
  rows: string[][],
  occupied: boolean[][],
  borderLines: PaneBorderLines,
): void => {
  const borderSet = resolveBorderSet(borderLines)

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const occupiedRow = occupied[rowIndex]
    if (!row || !occupiedRow) {
      continue
    }

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (occupiedRow[columnIndex]) {
        continue
      }

      const left = occupiedRow[columnIndex - 1] ?? false
      const right = occupiedRow[columnIndex + 1] ?? false
      const top = occupied[rowIndex - 1]?.[columnIndex] ?? false
      const bottom = occupied[rowIndex + 1]?.[columnIndex] ?? false
      const hasVertical = left || right
      const hasHorizontal = top || bottom

      if (hasVertical && hasHorizontal) {
        row[columnIndex] = borderSet.intersection
      } else if (hasVertical) {
        row[columnIndex] = borderSet.vertical
      } else if (hasHorizontal) {
        row[columnIndex] = borderSet.horizontal
      }
    }
  }
}

const composeDisplayLines = (
  panes: Pick<
    PaneSnapshot,
    'displayLines' | 'left' | 'top' | 'width' | 'height'
  >[],
  width: number,
  height: number,
  borderLines: PaneBorderLines,
): string[] => {
  const rows = Array.from({ length: height }, () => createBlankRow(width))
  const occupied = createOccupancyGrid(panes, width, height)

  for (const pane of panes) {
    pane.displayLines.forEach((line, lineIndex) => {
      const row = rows[pane.top + lineIndex]
      if (!row) {
        return
      }

      const cells = createStyledDisplayCells(line)
      cells.forEach((cell, cellIndex) => {
        const column = pane.left + cellIndex
        if (column < 0 || column >= row.length) {
          return
        }

        row[column] = cell
      })
    })
  }

  drawPaneBorders(rows, occupied, borderLines)

  return rows.map((row) => row.join(''))
}

const buildCurrentState = async (
  tmux: ReturnType<typeof createTmuxClient>,
  pane: PaneStartContext,
  paneId: string,
  clientTty: string,
): Promise<PopupState> => {
  if (!pane.inCopyMode) {
    await enterCopyMode(tmux, paneId)
  }
  const capture = fitCaptureToHeight(
    await capturePane(tmux, paneId),
    pane.height,
  )

  return {
    currentPath: pane.currentPath,
    state: {
      scope: 'current',
      paneId,
      clientTty,
      displayLines: capture.displayLines,
      plainLines: capture.lines,
      width: pane.width,
      height: pane.height,
    },
  }
}

const buildAllPaneState = async (
  tmux: ReturnType<typeof createTmuxClient>,
  pane: PaneStartContext,
  paneId: string,
  clientTty: string,
): Promise<PopupState> => {
  const panes = await listWindowPanes(tmux, paneId)
  const borderLines = await getPaneBorderLines(tmux, paneId)
  const bounds = panes.reduce(
    (accumulator, item) => ({
      left: Math.min(accumulator.left, item.left),
      top: Math.min(accumulator.top, item.top),
      right: Math.max(accumulator.right, item.left + item.width),
      bottom: Math.max(accumulator.bottom, item.top + item.height),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  )
  const snapshots: PaneSnapshot[] = []

  for (const item of panes) {
    const capture = fitCaptureToHeight(
      await capturePane(tmux, item.paneId),
      item.height,
    )
    snapshots.push({
      paneId: item.paneId,
      inCopyMode: item.inCopyMode,
      width: item.width,
      height: item.height,
      left: item.left - bounds.left,
      top: item.top - bounds.top,
      plainLines: capture.lines,
      displayLines: capture.displayLines,
    })
  }

  const width = Math.max(0, bounds.right - bounds.left)
  const height = Math.max(0, bounds.bottom - bounds.top)
  const x = buildPopupRelativePosition('x', bounds.left)
  const y = buildPopupRelativePosition('y', bounds.top)

  await writeDebugLog({
    event: 'start.build-all-pane-state',
    paneId,
    clientTty,
    targetPane: {
      paneId: pane.paneId,
      width: pane.width,
      height: pane.height,
      inCopyMode: pane.inCopyMode,
      currentPath: pane.currentPath,
    },
    bounds,
    size: {
      width,
      height,
    },
    popupPosition: {
      x,
      y,
    },
    panes: panes.map((item) => ({
      paneId: item.paneId,
      left: item.left,
      top: item.top,
      width: item.width,
      height: item.height,
      active: item.active,
      inCopyMode: item.inCopyMode,
      currentPath: item.currentPath,
    })),
  })

  return {
    currentPath: pane.currentPath,
    x,
    y,
    state: {
      scope: 'all',
      paneId,
      clientTty,
      displayLines: composeDisplayLines(snapshots, width, height, borderLines),
      panes: snapshots,
      width,
      height,
    },
  }
}

export const runStart = async (args: string[]): Promise<number> => {
  const { scope, paneId, clientTty } = parseStartArgs(args)

  if (!process.env.TMUX) {
    console.error('tmux-fuzzy-motion: must be run inside tmux')
    return 2
  }

  if (!paneId) {
    console.error('tmux-fuzzy-motion: pane not found')
    return 2
  }

  if (!clientTty) {
    console.error('tmux-fuzzy-motion: client not found')
    return 2
  }

  const tmux = createTmuxClient()
  const tempDir = await mkdtemp(join(tmpdir(), 'tmux-fuzzy-motion-'))
  const stateFile = join(tempDir, 'state.json')
  const resultFile = join(tempDir, 'result.json')
  const socketPath = createDaemonSocketPath()

  try {
    const pane = await getPaneStartContext(tmux, paneId)
    await focusClientPane(tmux, paneId, clientTty)
    const popupState =
      scope === 'all'
        ? await buildAllPaneState(tmux, pane, paneId, clientTty)
        : await buildCurrentState(tmux, pane, paneId, clientTty)
    const state = popupState.state

    await writeFile(stateFile, JSON.stringify(state), 'utf8')
    await ensureDaemon(socketPath)
    const popupOptions: DisplayPopupOptions = {
      command: buildPopupCommand(stateFile, resultFile, socketPath),
      currentPath: popupState.currentPath,
      height: state.height,
      targetClient: clientTty,
      targetPane: paneId,
      width: state.width,
    }
    if (popupState.x !== undefined) {
      popupOptions.x = popupState.x
    }
    if (popupState.y !== undefined) {
      popupOptions.y = popupState.y
    }

    await writeDebugLog({
      event: 'start.display-popup',
      scope,
      paneId,
      clientTty,
      popupOptions: {
        targetPane: popupOptions.targetPane,
        targetClient: popupOptions.targetClient,
        currentPath: popupOptions.currentPath,
        width: popupOptions.width,
        height: popupOptions.height,
        x: popupOptions.x ?? '#{popup_pane_left}',
        y: popupOptions.y ?? '#{popup_pane_top}',
      },
    })

    await displayPopup(tmux, popupOptions)

    const result = await readResult(resultFile)
    if (result.status === 'selected') {
      const targetPaneId = result.target.paneId ?? paneId
      await tmux.runQuiet(['select-pane', '-t', targetPaneId])
      if (
        state.scope === 'all' &&
        !state.panes.some(
          (targetPane) =>
            targetPane.paneId === targetPaneId && targetPane.inCopyMode,
        )
      ) {
        await enterCopyMode(tmux, targetPaneId)
      }
      await moveCopyCursor(tmux, targetPaneId, result.target)
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
