import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { moveCopyCursor } from '../core/action'
import { capturePane } from '../core/capture'
import { extractCandidates } from '../core/extract'
import {
  buildDisplayPopupArgs,
  createTmuxClient,
  ensureClientExists,
  ensurePaneExists,
  ensurePaneInCopyMode,
  ensurePopupAvailable,
  getPaneGeometry,
  shellQuote,
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

const buildPopupShellCommand = (
  stateFile: string,
  resultFile: string,
): string =>
  [
    shellQuote(process.execPath),
    shellQuote(process.argv[1] ?? join(process.cwd(), 'dist/cli.js')),
    'input',
    '--state-file',
    shellQuote(stateFile),
    '--result-file',
    shellQuote(resultFile),
  ].join(' ')

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

  try {
    await ensurePaneExists(tmux, paneId)
    await ensureClientExists(tmux, clientTty)
    await ensurePaneInCopyMode(tmux, paneId)
    await ensurePopupAvailable(tmux)
    const geometry = await getPaneGeometry(tmux, paneId, clientTty)

    const capture = await capturePane(tmux, paneId)
    const candidates = extractCandidates(capture.lines)

    if (candidates.length === 0) {
      console.error('tmux-fuzzy-motion: no matches')
      return 1
    }

    const state: InputState = {
      paneId,
      clientTty,
      lines: capture.displayLines,
      candidates,
      width: geometry.width,
      height: geometry.height,
    }

    await writeFile(stateFile, JSON.stringify(state), 'utf8')
    await tmux.run(
      buildDisplayPopupArgs(
        paneId,
        clientTty,
        geometry,
        buildPopupShellCommand(stateFile, resultFile),
      ),
    )
    const result = await readResult(resultFile)
    await tmux.runQuiet(['display-popup', '-C', '-c', clientTty])
    await sleep(25)
    await tmux.runQuiet(['select-pane', '-t', paneId])

    if (result?.status === 'selected') {
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
