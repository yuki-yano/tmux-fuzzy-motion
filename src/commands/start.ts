import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { moveCopyCursor } from '../core/action'
import { capturePane, fitCaptureToHeight } from '../core/capture'
import { extractCandidates } from '../core/extract'
import {
  createScratchWindow,
  createTmuxClient,
  ensureClientExists,
  ensurePaneExists,
  ensurePaneInCopyMode,
  focusClientPane,
  getPaneContext,
  killWindow,
  resizeWindow,
  shellQuote,
  swapPanes,
} from '../infra/tmux'
import type { InputResult, InputState } from '../types'

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const readResult = async (resultFile: string): Promise<InputResult | null> => {
  try {
    const data = await readFile(resultFile, 'utf8')
    return JSON.parse(data) as InputResult
  } catch {
    return null
  }
}

const waitForResult = async (resultFile: string): Promise<InputResult> => {
  while (true) {
    const result = await readResult(resultFile)
    if (result) {
      return result
    }

    await sleep(25)
  }
}

const buildInputPaneShellCommand = (
  stateFile: string,
  resultFile: string,
): string => {
  const script = [
    shellQuote(process.execPath),
    shellQuote(process.argv[1] ?? join(process.cwd(), 'dist/cli.js')),
    'input',
    '--state-file',
    shellQuote(stateFile),
    '--result-file',
    shellQuote(resultFile),
    ';',
    'exec',
    'sleep',
    '86400',
  ].join(' ')

  return `sh -lc ${shellQuote(script)}`
}

export const runStart = async (args: string[]): Promise<number> => {
  const [paneId, clientTty] = args

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
  let scratchWindowId: string | null = null
  let scratchPaneId: string | null = null
  let swapped = false

  try {
    await ensurePaneExists(tmux, paneId)
    await ensureClientExists(tmux, clientTty)
    await focusClientPane(tmux, paneId, clientTty)
    await ensurePaneInCopyMode(tmux, paneId)

    const pane = await getPaneContext(tmux, paneId)
    const capture = fitCaptureToHeight(
      await capturePane(tmux, paneId),
      pane.height,
    )
    const candidates = extractCandidates(capture.lines)

    const state: InputState = {
      paneId,
      clientTty,
      lines: capture.displayLines,
      candidates,
      width: pane.width,
      height: pane.height,
    }

    await writeFile(stateFile, JSON.stringify(state), 'utf8')

    const scratch = await createScratchWindow(
      tmux,
      pane.currentPath,
      buildInputPaneShellCommand(stateFile, resultFile),
    )
    scratchWindowId = scratch.windowId
    scratchPaneId = scratch.paneId

    await resizeWindow(tmux, scratch.windowId, pane)
    await swapPanes(tmux, scratch.paneId, paneId)
    swapped = true

    const result = await waitForResult(resultFile)

    await swapPanes(tmux, scratch.paneId, paneId)
    swapped = false
    await killWindow(tmux, scratch.windowId)
    scratchWindowId = null
    scratchPaneId = null
    await tmux.runQuiet(['select-pane', '-t', paneId])

    if (result.status === 'selected') {
      await moveCopyCursor(tmux, paneId, result.target)
    }

    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    return message.startsWith('tmux-fuzzy-motion:') ? 2 : 1
  } finally {
    if (swapped && scratchPaneId) {
      await tmux.runQuiet([
        'swap-pane',
        '-d',
        '-Z',
        '-s',
        scratchPaneId,
        '-t',
        paneId,
      ])
    }

    if (scratchWindowId) {
      await tmux.runQuiet(['kill-window', '-t', scratchWindowId])
    }

    await tmux.runQuiet(['select-pane', '-t', paneId])
    await rm(tempDir, { recursive: true, force: true })
  }
}
