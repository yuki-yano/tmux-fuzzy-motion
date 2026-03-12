import { describe, expect, it, vi } from 'vitest'

import { createMoveCursorCommands } from '../core/action'
import {
  createScratchWindow,
  getPaneContext,
  resizeWindow,
  swapPanes,
} from './tmux'

describe('tmux helpers', () => {
  it('creates copy-mode cursor movement commands', () => {
    expect(
      createMoveCursorCommands('%1', {
        line: 3,
        charCol: 4,
        primaryChar: 2,
      }),
    ).toEqual([
      ['send-keys', '-X', '-t', '%1', 'top-line'],
      ['send-keys', '-X', '-N', '2', '-t', '%1', 'cursor-down'],
      ['send-keys', '-X', '-t', '%1', 'start-of-line'],
      ['send-keys', '-X', '-N', '6', '-t', '%1', 'cursor-right'],
    ])
  })

  it('resolves pane context for the target pane', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi
        .fn()
        .mockResolvedValueOnce('%127\t181\t64\t/tmp/tmux-fuzzy-motion'),
    }

    await expect(getPaneContext(tmux, '%127')).resolves.toEqual({
      paneId: '%127',
      width: 181,
      height: 64,
      currentPath: '/tmp/tmux-fuzzy-motion',
    })
  })

  it('creates a detached scratch window', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi.fn().mockResolvedValueOnce('@1\t%200'),
    }

    await expect(
      createScratchWindow(tmux, '/tmp', 'sh -lc "echo test"'),
    ).resolves.toEqual({
      windowId: '@1',
      paneId: '%200',
    })

    expect(tmux.capture).toHaveBeenCalledWith([
      'new-window',
      '-P',
      '-d',
      '-n',
      '[tmux-fuzzy-motion]',
      '-c',
      '/tmp',
      '-F',
      '#{window_id}\t#{pane_id}',
      'sh -lc "echo test"',
    ])
  })

  it('resizes a scratch window to the target pane dimensions', async () => {
    const tmux = {
      run: vi.fn().mockResolvedValue(undefined),
      runQuiet: vi.fn(),
      capture: vi.fn(),
    }

    await resizeWindow(tmux, '@1', { width: 181, height: 64 })

    expect(tmux.run).toHaveBeenCalledWith([
      'resize-window',
      '-t',
      '@1',
      '-x',
      '181',
      '-y',
      '64',
    ])
  })

  it('swaps panes using the target pane geometry', async () => {
    const tmux = {
      run: vi.fn().mockResolvedValue(undefined),
      runQuiet: vi.fn(),
      capture: vi.fn(),
    }

    await swapPanes(tmux, '%200', '%127')

    expect(tmux.run).toHaveBeenCalledWith([
      'swap-pane',
      '-d',
      '-Z',
      '-s',
      '%200',
      '-t',
      '%127',
    ])
  })
})
