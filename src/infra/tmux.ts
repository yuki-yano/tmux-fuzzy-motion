import { runProcess } from './process'

export type TmuxClient = {
  run: (args: string[]) => Promise<void>
  runQuiet: (args: string[]) => Promise<void>
  capture: (args: string[]) => Promise<string>
}

export type PaneGeometry = {
  width: number
  height: number
}

export type PaneContext = PaneGeometry & {
  paneId: string
  currentPath: string
}

export type ScratchWindow = {
  windowId: string
  paneId: string
}

export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`

export const createTmuxClient = (): TmuxClient => ({
  async run(args) {
    await runProcess('tmux', args)
  },
  async runQuiet(args) {
    try {
      await runProcess('tmux', args)
    } catch {
      // Ignore cleanup failures.
    }
  },
  async capture(args) {
    const result = await runProcess('tmux', args)
    return result.stdout
  },
})

export const ensurePaneExists = async (
  tmux: TmuxClient,
  paneId: string,
): Promise<void> => {
  try {
    await tmux.capture(['display-message', '-p', '-t', paneId, '#{pane_id}'])
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: pane not found', { cause: error })
  }
}

export const ensureClientExists = async (
  tmux: TmuxClient,
  clientTty: string,
): Promise<void> => {
  const clients = (await tmux.capture(['list-clients', '-F', '#{client_tty}']))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!clients.includes(clientTty)) {
    throw new Error('tmux-fuzzy-motion: client not found')
  }
}

export const ensurePaneInCopyMode = async (
  tmux: TmuxClient,
  paneId: string,
): Promise<void> => {
  const value = (
    await tmux.capture([
      'display-message',
      '-p',
      '-t',
      paneId,
      '#{pane_in_mode}',
    ])
  ).trim()

  if (value !== '1') {
    throw new Error('tmux-fuzzy-motion: pane is not in copy-mode')
  }
}

export const focusClientPane = async (
  tmux: TmuxClient,
  paneId: string,
  clientTty: string,
): Promise<void> => {
  await tmux.run(['switch-client', '-c', clientTty, '-t', paneId])
  await tmux.run(['select-pane', '-t', paneId])
}

export const getPaneContext = async (
  tmux: TmuxClient,
  paneId: string,
): Promise<PaneContext> => {
  const output = (
    await tmux.capture([
      'display-message',
      '-p',
      '-t',
      paneId,
      '#{pane_id}\t#{pane_width}\t#{pane_height}\t#{pane_current_path}',
    ])
  ).trim()

  const [resolvedPaneId, width, height, currentPath] = output.split('\t')

  if (
    !resolvedPaneId ||
    !currentPath ||
    [width, height]
      .map((value) => Number(value))
      .some((value) => !Number.isFinite(value))
  ) {
    throw new Error('tmux-fuzzy-motion: failed to resolve pane context')
  }

  return {
    paneId: resolvedPaneId,
    width: Number(width),
    height: Number(height),
    currentPath,
  }
}

export const createScratchWindow = async (
  tmux: TmuxClient,
  currentPath: string,
  shellCommand: string,
): Promise<ScratchWindow> => {
  const output = (
    await tmux.capture([
      'new-window',
      '-P',
      '-d',
      '-n',
      '[tmux-fuzzy-motion]',
      '-c',
      currentPath,
      '-F',
      '#{window_id}\t#{pane_id}',
      shellCommand,
    ])
  ).trim()

  const [windowId, paneId] = output.split('\t')

  if (!windowId || !paneId) {
    throw new Error('tmux-fuzzy-motion: failed to create scratch window')
  }

  return { windowId, paneId }
}

export const resizeWindow = async (
  tmux: TmuxClient,
  windowId: string,
  geometry: PaneGeometry,
): Promise<void> => {
  await tmux.run([
    'resize-window',
    '-t',
    windowId,
    '-x',
    String(geometry.width),
    '-y',
    String(geometry.height),
  ])
}

export const swapPanes = async (
  tmux: TmuxClient,
  sourcePaneId: string,
  targetPaneId: string,
): Promise<void> => {
  await tmux.run([
    'swap-pane',
    '-d',
    '-Z',
    '-s',
    sourcePaneId,
    '-t',
    targetPaneId,
  ])
}

export const killWindow = async (
  tmux: TmuxClient,
  windowId: string,
): Promise<void> => {
  await tmux.run(['kill-window', '-t', windowId])
}

export const getTmuxVersion = async (): Promise<string> => {
  const result = await runProcess('tmux', ['-V'])
  return result.stdout.trim()
}
