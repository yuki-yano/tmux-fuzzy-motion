import { runProcess } from './process'

export type TmuxClient = {
  run: (args: string[]) => Promise<void>
  runQuiet: (args: string[]) => Promise<void>
  capture: (args: string[]) => Promise<string>
}

export type PaneGeometry = {
  left: number
  top: number
  width: number
  height: number
}

export const getStatusLineCount = (status: string): number => {
  if (status === 'off') {
    return 0
  }

  if (status === 'on') {
    return 1
  }

  const lines = Number(status)
  return Number.isFinite(lines) && lines > 0 ? lines : 0
}

export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`

export const buildDisplayPopupArgs = (
  paneId: string,
  clientTty: string,
  geometry: PaneGeometry,
  shellCommand: string,
): string[] => [
  'display-popup',
  '-E',
  '-B',
  '-t',
  paneId,
  '-x',
  '#{popup_pane_left}',
  '-y',
  '#{popup_pane_top}',
  '-w',
  String(geometry.width),
  '-h',
  String(geometry.height),
  '-c',
  clientTty,
  shellCommand,
]

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

export const getPaneGeometry = async (
  tmux: TmuxClient,
  paneId: string,
  clientTty: string,
): Promise<PaneGeometry> => {
  const paneBorderStatus = (
    await tmux.capture(['show-options', '-gv', 'pane-border-status'])
  ).trim()

  const output = (
    await tmux.capture([
      'display-message',
      '-p',
      '-c',
      clientTty,
      '-t',
      paneId,
      '#{pane_left};#{pane_top};#{pane_width};#{pane_height};#{client_height};#{status};#{status-position}',
    ])
  ).trim()

  const [left, top, width, paneHeight, clientHeight, status, statusPosition] =
    output.split(';')

  if (
    [left, top, width, paneHeight, clientHeight]
      .map((value) => Number(value))
      .some((value) => !Number.isFinite(value))
  ) {
    throw new Error('tmux-fuzzy-motion: failed to resolve pane geometry')
  }

  const leftNumber = Number(left)
  const topNumber = Number(top)
  const widthNumber = Number(width)
  const paneHeightNumber = Number(paneHeight)
  const clientHeightNumber = Number(clientHeight)
  const statusLines =
    statusPosition === 'bottom' ? getStatusLineCount(status ?? 'off') : 0
  const extraLine =
    paneBorderStatus === 'bottom'
      ? 1
      : statusPosition === 'bottom' && statusLines > 0
        ? 1
        : 0
  const usableStatusLines = statusPosition === 'bottom' ? statusLines : 0
  const maxHeight = Math.max(
    1,
    clientHeightNumber - topNumber + usableStatusLines,
  )
  const height = Math.min(paneHeightNumber + extraLine, maxHeight)

  return {
    left: leftNumber,
    top: topNumber,
    width: widthNumber,
    height,
  }
}

export const getTmuxVersion = async (): Promise<string> => {
  const result = await runProcess('tmux', ['-V'])
  return result.stdout.trim()
}

export const ensurePopupAvailable = async (tmux: TmuxClient): Promise<void> => {
  const commands = await tmux.capture(['list-commands'])

  if (!commands.includes('display-popup')) {
    throw new Error('tmux-fuzzy-motion: popup is not available')
  }
}
