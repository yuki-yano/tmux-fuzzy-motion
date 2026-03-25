import { beforeEach, describe, expect, it, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({
  statSync: vi.fn(),
}))

vi.mock('node:fs', () => fsMocks)

describe('createDaemonSocketPath', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.TMUX = '/tmp/tmux-test,123,1'
    fsMocks.statSync.mockReturnValue({
      mtimeMs: 1000,
    })
  })

  it('includes the cli entrypoint identity in the socket path hash', async () => {
    const originalArgv = process.argv
    process.argv = ['node', '/tmp/dist-a/cli.js']

    const { createDaemonSocketPath } = await import('./runtime')
    const left = createDaemonSocketPath()

    process.argv = ['node', '/tmp/dist-b/cli.js']
    vi.resetModules()
    const runtime = await import('./runtime')
    const right = runtime.createDaemonSocketPath()

    expect(left).not.toBe(right)
    process.argv = originalArgv
  })

  it('changes the socket path when the entrypoint file changes', async () => {
    const originalArgv = process.argv
    process.argv = ['node', '/tmp/dist/cli.js']

    fsMocks.statSync.mockReturnValueOnce({
      mtimeMs: 1000,
    })
    const { createDaemonSocketPath } = await import('./runtime')
    const left = createDaemonSocketPath()

    vi.resetModules()
    fsMocks.statSync.mockReturnValueOnce({
      mtimeMs: 2000,
    })
    const runtime = await import('./runtime')
    const right = runtime.createDaemonSocketPath()

    expect(left).not.toBe(right)
    process.argv = originalArgv
  })
})
