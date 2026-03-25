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

export type PaneStartContext = PaneContext & {
  inCopyMode: boolean
}

export type WindowPaneContext = PaneStartContext & {
  left: number
  top: number
  active: boolean
}

export type PaneBorderLines =
  | 'single'
  | 'double'
  | 'heavy'
  | 'simple'
  | 'number'
  | 'spaces'

export type DisplayPopupOptions = PaneGeometry & {
  command: string[]
  currentPath: string
  targetClient: string
  targetPane: string
  x?: number | string
  y?: number | string
}

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

export const focusClientPane = async (
  tmux: TmuxClient,
  paneId: string,
  clientTty: string,
): Promise<void> => {
  try {
    await tmux.run(['switch-client', '-c', clientTty, '-t', paneId])
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: client not found', { cause: error })
  }
}

export const enterCopyMode = async (
  tmux: TmuxClient,
  paneId: string,
): Promise<void> => {
  try {
    await tmux.run(['copy-mode', '-t', paneId])
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: failed to enter copy-mode', {
      cause: error,
    })
  }
}

export const getPaneStartContext = async (
  tmux: TmuxClient,
  paneId: string,
): Promise<PaneStartContext> => {
  let output = ''

  try {
    output = (
      await tmux.capture([
        'display-message',
        '-p',
        '-t',
        paneId,
        '#{pane_id}\t#{pane_in_mode}\t#{pane_width}\t#{pane_height}\t#{pane_current_path}',
      ])
    ).trim()
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: pane not found', { cause: error })
  }

  const [resolvedPaneId, paneInMode, width, height, currentPath] =
    output.split('\t')

  if (
    !resolvedPaneId ||
    !paneInMode ||
    !currentPath ||
    [width, height]
      .map((value) => Number(value))
      .some((value) => !Number.isFinite(value))
  ) {
    throw new Error('tmux-fuzzy-motion: failed to resolve pane context')
  }

  return {
    paneId: resolvedPaneId,
    inCopyMode: paneInMode === '1',
    width: Number(width),
    height: Number(height),
    currentPath,
  }
}

export const displayPopup = async (
  tmux: TmuxClient,
  options: DisplayPopupOptions,
): Promise<void> => {
  await tmux.run([
    'display-popup',
    '-E',
    '-B',
    '-c',
    options.targetClient,
    '-t',
    options.targetPane,
    '-d',
    options.currentPath,
    '-x',
    String(options.x ?? '#{popup_pane_left}'),
    '-y',
    String(options.y ?? '#{popup_pane_top}'),
    '-w',
    String(options.width),
    '-h',
    String(options.height),
    ...options.command,
  ])
}

export const listWindowPanes = async (
  tmux: TmuxClient,
  paneId: string,
): Promise<WindowPaneContext[]> => {
  let output = ''

  try {
    output = (
      await tmux.capture([
        'list-panes',
        '-t',
        paneId,
        '-F',
        '#{pane_id}\t#{pane_in_mode}\t#{pane_width}\t#{pane_height}\t#{pane_current_path}\t#{pane_left}\t#{pane_top}\t#{?pane_active,1,0}\t#{window_zoomed_flag}',
      ])
    ).trim()
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: pane not found', { cause: error })
  }

  const panes = output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [
        resolvedPaneId,
        paneInMode,
        width,
        height,
        currentPath,
        left,
        top,
        active,
        zoomed,
      ] = line.split('\t')
      const numeric = [width, height, left, top].map((value) => Number(value))

      if (
        !resolvedPaneId ||
        !paneInMode ||
        !currentPath ||
        [active, zoomed].some((value) => value === undefined) ||
        numeric.some((value) => !Number.isFinite(value))
      ) {
        throw new Error('tmux-fuzzy-motion: failed to resolve window panes')
      }

      return {
        paneId: resolvedPaneId,
        inCopyMode: paneInMode === '1',
        width: Number(width),
        height: Number(height),
        currentPath,
        left: Number(left),
        top: Number(top),
        active: active === '1',
        zoomed: zoomed === '1',
      }
    })

  if (panes.length === 0) {
    throw new Error('tmux-fuzzy-motion: pane not found')
  }

  const zoomed = panes.some((pane) => pane.zoomed)
  return panes
    .filter((pane) => !zoomed || pane.active)
    .map((pane) => {
      const { zoomed: paneZoomed, ...rest } = pane
      void paneZoomed
      return rest
    })
}

export const getPaneBorderLines = async (
  tmux: TmuxClient,
  paneId: string,
): Promise<PaneBorderLines> => {
  let output = ''

  try {
    output = (
      await tmux.capture([
        'show-options',
        '-A',
        '-wv',
        '-t',
        paneId,
        'pane-border-lines',
      ])
    ).trim()
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: failed to resolve pane border lines', {
      cause: error,
    })
  }

  if (
    output === 'single' ||
    output === 'double' ||
    output === 'heavy' ||
    output === 'simple' ||
    output === 'number' ||
    output === 'spaces'
  ) {
    return output
  }

  throw new Error('tmux-fuzzy-motion: failed to resolve pane border lines')
}

export const getTmuxVersion = async (): Promise<string> => {
  const result = await runProcess('tmux', ['-V'])
  return result.stdout.trim()
}
