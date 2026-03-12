import { beforeEach, describe, expect, it, vi } from 'vitest'

const tmux = {
  run: vi.fn(),
  runQuiet: vi.fn(),
  capture: vi.fn(),
}

const fsMocks = vi.hoisted(() => ({
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}))

const tmuxMocks = vi.hoisted(() => ({
  createScratchWindow: vi.fn(),
  createTmuxClient: vi.fn(),
  ensureClientExists: vi.fn(),
  ensurePaneExists: vi.fn(),
  ensurePaneInCopyMode: vi.fn(),
  focusClientPane: vi.fn(),
  getPaneContext: vi.fn(),
  killWindow: vi.fn(),
  resizeWindow: vi.fn(),
  shellQuote: vi.fn(),
  swapPanes: vi.fn(),
}))

const captureMocks = vi.hoisted(() => ({
  capturePane: vi.fn(),
  fitCaptureToHeight: vi.fn(),
}))

const extractMocks = vi.hoisted(() => ({
  extractCandidates: vi.fn(),
}))

const actionMocks = vi.hoisted(() => ({
  moveCopyCursor: vi.fn(),
}))

vi.mock('node:fs/promises', () => fsMocks)
vi.mock('../infra/tmux', () => tmuxMocks)
vi.mock('../core/capture', () => captureMocks)
vi.mock('../core/extract', () => extractMocks)
vi.mock('../core/action', () => actionMocks)

describe('runStart', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const capture = {
      text: '',
      lines: [],
      displayText: '',
      displayLines: [],
    }

    process.env.TMUX = '/tmp/tmux-test'

    fsMocks.mkdtemp.mockResolvedValue('/tmp/tmux-fuzzy-motion-test')
    fsMocks.readFile.mockResolvedValue('{"status":"cancelled"}')
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.writeFile.mockResolvedValue(undefined)

    tmuxMocks.createTmuxClient.mockReturnValue(tmux)
    tmuxMocks.ensurePaneExists.mockResolvedValue(undefined)
    tmuxMocks.ensureClientExists.mockResolvedValue(undefined)
    tmuxMocks.focusClientPane.mockResolvedValue(undefined)
    tmuxMocks.ensurePaneInCopyMode.mockResolvedValue(undefined)
    tmuxMocks.getPaneContext.mockResolvedValue({
      paneId: '%127',
      currentPath: '/tmp',
      width: 80,
      height: 16,
    })
    tmuxMocks.createScratchWindow.mockResolvedValue({
      windowId: '@1',
      paneId: '%200',
    })
    tmuxMocks.resizeWindow.mockResolvedValue(undefined)
    tmuxMocks.swapPanes.mockResolvedValue(undefined)
    tmuxMocks.killWindow.mockResolvedValue(undefined)
    tmuxMocks.shellQuote.mockImplementation((value: string) => `'${value}'`)

    captureMocks.capturePane.mockResolvedValue(capture)
    captureMocks.fitCaptureToHeight.mockReturnValue(capture)
    extractMocks.extractCandidates.mockReturnValue([])

    tmux.run.mockResolvedValue(undefined)
    tmux.runQuiet.mockResolvedValue(undefined)
    tmux.capture.mockResolvedValue('')
  })

  it('opens the scratch pane even when no candidates are extracted', async () => {
    const { runStart } = await import('./start')

    await expect(runStart(['%127', '/dev/ttys001'])).resolves.toBe(0)

    expect(tmuxMocks.createScratchWindow).toHaveBeenCalled()
    expect(tmuxMocks.swapPanes).toHaveBeenCalledWith(tmux, '%200', '%127')
    expect(fsMocks.writeFile).toHaveBeenCalled()
  })
})
