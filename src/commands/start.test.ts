import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DisplayPopupOptions } from '../infra/tmux'

type MockCapture = {
  text: string
  lines: string[]
  displayText: string
  displayLines: string[]
}

const tmux = {
  run: vi.fn(),
  runQuiet: vi.fn(),
  capture: vi.fn(),
}

const fsMocks = vi.hoisted(() => ({
  appendFile: vi.fn(),
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  createDaemonSocketPath: vi.fn(),
  ensureDaemon: vi.fn(),
  resolveCliEntrypoint: vi.fn(),
}))

const tmuxMocks = vi.hoisted(() => ({
  createTmuxClient: vi.fn(),
  displayPopup: vi.fn(),
  enterCopyMode: vi.fn(),
  focusClientPane: vi.fn(),
  getPaneBorderLines: vi.fn(),
  getPaneStartContext: vi.fn(),
  listWindowPanes: vi.fn(),
}))

const captureMocks = vi.hoisted(() => ({
  capturePane: vi.fn(),
  fitCaptureToHeight: vi.fn(),
}))

const actionMocks = vi.hoisted(() => ({
  moveCopyCursor: vi.fn(),
}))

vi.mock('node:fs/promises', () => fsMocks)
vi.mock('../infra/tmux', () => tmuxMocks)
vi.mock('../core/capture', () => captureMocks)
vi.mock('../core/action', () => actionMocks)
vi.mock('./runtime', () => runtimeMocks)

describe('runStart', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.TMUX = '/tmp/tmux-test'

    const capture = {
      text: '',
      lines: [],
      displayText: '',
      displayLines: ['alpha', 'beta'],
    }

    fsMocks.mkdtemp.mockResolvedValue('/tmp/tmux-fuzzy-motion-test')
    fsMocks.appendFile.mockResolvedValue(undefined)
    fsMocks.readFile.mockResolvedValue(JSON.stringify({ status: 'cancelled' }))
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.writeFile.mockResolvedValue(undefined)
    runtimeMocks.createDaemonSocketPath.mockReturnValue('/tmp/tfm-test.sock')
    runtimeMocks.ensureDaemon.mockResolvedValue(undefined)
    runtimeMocks.resolveCliEntrypoint.mockReturnValue('/tmp/dist/cli.js')

    tmuxMocks.createTmuxClient.mockReturnValue(tmux)
    tmuxMocks.displayPopup.mockResolvedValue(undefined)
    tmuxMocks.enterCopyMode.mockResolvedValue(undefined)
    tmuxMocks.focusClientPane.mockResolvedValue(undefined)
    tmuxMocks.getPaneStartContext.mockResolvedValue({
      paneId: '%127',
      inCopyMode: true,
      currentPath: '/tmp',
      width: 80,
      height: 16,
    })
    tmuxMocks.getPaneBorderLines.mockResolvedValue('single')
    tmuxMocks.listWindowPanes.mockResolvedValue([])

    captureMocks.capturePane.mockResolvedValue(capture)
    captureMocks.fitCaptureToHeight.mockReturnValue(capture)

    tmux.run.mockResolvedValue(undefined)
    tmux.runQuiet.mockResolvedValue(undefined)
    tmux.capture.mockResolvedValue('')
  })

  it('ensures the daemon and opens a popup for the target pane', async () => {
    fsMocks.readFile.mockResolvedValueOnce(
      JSON.stringify({
        status: 'selected',
        target: {
          kind: 'word',
          text: 'alpha',
          line: 1,
          col: 0,
          endCol: 5,
          charCol: 0,
          positions: [0],
          primary: 0,
          primaryChar: 0,
          score: 1,
          hint: 'A',
        },
      }),
    )

    const { runStart } = await import('./start')

    await expect(runStart(['%127', '/dev/ttys001'])).resolves.toBe(0)

    expect(runtimeMocks.ensureDaemon).toHaveBeenCalledWith('/tmp/tfm-test.sock')
    expect(tmuxMocks.displayPopup).toHaveBeenCalledTimes(1)
    const popupOptions = tmuxMocks.displayPopup.mock.calls[0]?.[1] as
      | DisplayPopupOptions
      | undefined
    expect(popupOptions).toMatchObject({
      currentPath: '/tmp',
      height: 16,
      targetClient: '/dev/ttys001',
      targetPane: '%127',
      width: 80,
    })
    expect(popupOptions?.command).toEqual(
      expect.arrayContaining([
        process.execPath,
        expect.stringMatching(
          /(?:dist\/cli\.js|cli\.js|src\/cli\.ts|forks\.js)$/,
        ),
        'popup',
        '--state-file',
        '/tmp/tmux-fuzzy-motion-test/state.json',
        '--result-file',
        '/tmp/tmux-fuzzy-motion-test/result.json',
        '--socket',
        '/tmp/tfm-test.sock',
      ]),
    )
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/tmp/tmux-fuzzy-motion-test/state.json',
      expect.any(String),
      'utf8',
    )
    expect(tmux.runQuiet).toHaveBeenCalledWith(['select-pane', '-t', '%127'])
    expect(actionMocks.moveCopyCursor).toHaveBeenCalledWith(tmux, '%127', {
      kind: 'word',
      text: 'alpha',
      line: 1,
      col: 0,
      endCol: 5,
      charCol: 0,
      positions: [0],
      primary: 0,
      primaryChar: 0,
      score: 1,
      hint: 'A',
    })
  })

  it('fails when the popup exits without writing a result file', async () => {
    fsMocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))

    const { runStart } = await import('./start')

    await expect(runStart(['%127', '/dev/ttys001'])).resolves.toBe(2)

    expect(tmuxMocks.displayPopup).toHaveBeenCalledTimes(1)
    expect(actionMocks.moveCopyCursor).not.toHaveBeenCalled()
  })

  it('enters copy-mode before opening the popup when needed', async () => {
    tmuxMocks.getPaneStartContext.mockResolvedValueOnce({
      paneId: '%127',
      inCopyMode: false,
      currentPath: '/tmp',
      width: 80,
      height: 16,
    })

    const { runStart } = await import('./start')

    await expect(runStart(['%127', '/dev/ttys001'])).resolves.toBe(0)

    expect(tmuxMocks.enterCopyMode).toHaveBeenCalledWith(tmux, '%127')
    expect(tmuxMocks.displayPopup).toHaveBeenCalledTimes(1)
  })

  it('supports all-pane scope and moves into the selected pane copy-mode', async () => {
    captureMocks.capturePane
      .mockResolvedValueOnce({
        text: 'left pane',
        lines: ['left pane'],
        displayText: 'left pane',
        displayLines: ['left pane'],
      })
      .mockResolvedValueOnce({
        text: 'right pane',
        lines: ['right pane'],
        displayText: 'right pane',
        displayLines: ['right pane'],
      })
    captureMocks.fitCaptureToHeight.mockImplementation(
      (value: MockCapture) => value,
    )
    tmuxMocks.getPaneStartContext.mockResolvedValueOnce({
      paneId: '%127',
      inCopyMode: false,
      currentPath: '/tmp',
      width: 40,
      height: 16,
    })
    tmuxMocks.listWindowPanes.mockResolvedValueOnce([
      {
        paneId: '%127',
        inCopyMode: false,
        currentPath: '/tmp/left',
        width: 40,
        height: 16,
        left: 0,
        top: 0,
      },
      {
        paneId: '%128',
        inCopyMode: false,
        currentPath: '/tmp/right',
        width: 40,
        height: 16,
        left: 41,
        top: 0,
      },
    ])
    tmuxMocks.getPaneBorderLines.mockResolvedValueOnce('single')
    fsMocks.readFile.mockResolvedValueOnce(
      JSON.stringify({
        status: 'selected',
        target: {
          paneId: '%128',
          screenLine: 1,
          screenCol: 41,
          kind: 'word',
          text: 'right',
          line: 1,
          col: 0,
          endCol: 5,
          charCol: 0,
          positions: [0],
          primary: 0,
          primaryChar: 0,
          score: 1,
          hint: 'A',
        },
      }),
    )

    const { runStart } = await import('./start')

    await expect(
      runStart(['--scope', 'all', '%127', '/dev/ttys001']),
    ).resolves.toBe(0)

    const stateWrite = fsMocks.writeFile.mock.calls.find(
      ([filePath]) => filePath === '/tmp/tmux-fuzzy-motion-test/state.json',
    )
    const state = JSON.parse(String(stateWrite?.[1])) as {
      scope: string
      paneId: string
      width: number
      height: number
      panes: unknown[]
      displayLines: string[]
    }
    expect(state).toMatchObject({
      scope: 'all',
      paneId: '%127',
      width: 81,
      height: 16,
    })
    expect(state.panes).toHaveLength(2)
    expect(state.displayLines[0]).toContain('left pane')
    expect(state.displayLines[0]).toContain('│')
    expect(state.displayLines[0]).toContain('right pane')

    const popupOptions = tmuxMocks.displayPopup.mock.calls[0]?.[1] as
      | DisplayPopupOptions
      | undefined
    expect(popupOptions).toMatchObject({
      width: 81,
      height: 16,
    })
    expect(popupOptions?.x).toContain('0')
    expect(popupOptions?.x).toContain('#{popup_pane_left}')
    expect(popupOptions?.x).toContain('#{pane_left}')
    expect(popupOptions?.y).toContain('#{popup_height}')
    expect(popupOptions?.y).toContain('#{status-position}')
    expect(popupOptions?.y).toContain('#{client_height}')
    expect(popupOptions?.y).toContain('#{window_height}')
    expect(popupOptions?.y).toContain('#{window_offset_y}')
    expect(tmuxMocks.enterCopyMode).toHaveBeenCalledTimes(1)
    expect(tmuxMocks.enterCopyMode).toHaveBeenCalledWith(tmux, '%128')
    expect(tmux.runQuiet).toHaveBeenCalledWith(['select-pane', '-t', '%128'])
    expect(actionMocks.moveCopyCursor).toHaveBeenCalledWith(tmux, '%128', {
      paneId: '%128',
      screenLine: 1,
      screenCol: 41,
      kind: 'word',
      text: 'right',
      line: 1,
      col: 0,
      endCol: 5,
      charCol: 0,
      positions: [0],
      primary: 0,
      primaryChar: 0,
      score: 1,
      hint: 'A',
    })
  })
})
