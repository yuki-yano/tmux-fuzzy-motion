import { describe, expect, it, vi } from 'vitest'

import { createMoveCursorCommands } from '../core/action'
import {
  displayPopup,
  enterCopyMode,
  focusClientPane,
  getPaneBorderLines,
  getPaneStartContext,
  listWindowPanes,
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

  it('resolves pane start context for the target pane', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi
        .fn()
        .mockResolvedValueOnce('%127\t1\t181\t64\t/tmp/tmux-fuzzy-motion'),
    }

    await expect(getPaneStartContext(tmux, '%127')).resolves.toEqual({
      paneId: '%127',
      inCopyMode: true,
      width: 181,
      height: 64,
      currentPath: '/tmp/tmux-fuzzy-motion',
    })
  })

  it('keeps track of panes outside copy-mode', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi
        .fn()
        .mockResolvedValueOnce('%127\t0\t181\t64\t/tmp/tmux-fuzzy-motion'),
    }

    await expect(getPaneStartContext(tmux, '%127')).resolves.toEqual({
      paneId: '%127',
      inCopyMode: false,
      width: 181,
      height: 64,
      currentPath: '/tmp/tmux-fuzzy-motion',
    })
  })

  it('maps switch-client failures to a client not found error', async () => {
    const tmux = {
      run: vi.fn().mockRejectedValueOnce(new Error('no such client')),
      runQuiet: vi.fn(),
      capture: vi.fn(),
    }

    await expect(focusClientPane(tmux, '%127', '/dev/ttys001')).rejects.toThrow(
      'tmux-fuzzy-motion: client not found',
    )
  })

  it('runs display-popup with the target client and pane', async () => {
    const tmux = {
      run: vi.fn().mockResolvedValue(undefined),
      runQuiet: vi.fn(),
      capture: vi.fn(),
    }

    await displayPopup(tmux, {
      command: [
        process.execPath,
        '/tmp/dist/cli.js',
        'popup',
        '--state-file',
        '/tmp/state.json',
      ],
      currentPath: '/tmp/work',
      height: 24,
      targetClient: '/dev/ttys001',
      targetPane: '%127',
      width: 80,
    })

    expect(tmux.run).toHaveBeenCalledWith([
      'display-popup',
      '-E',
      '-B',
      '-c',
      '/dev/ttys001',
      '-t',
      '%127',
      '-d',
      '/tmp/work',
      '-x',
      '#{popup_pane_left}',
      '-y',
      '#{popup_pane_top}',
      '-w',
      '80',
      '-h',
      '24',
      process.execPath,
      '/tmp/dist/cli.js',
      'popup',
      '--state-file',
      '/tmp/state.json',
    ])
  })

  it('enters copy-mode for the target pane', async () => {
    const tmux = {
      run: vi.fn().mockResolvedValue(undefined),
      runQuiet: vi.fn(),
      capture: vi.fn(),
    }

    await expect(enterCopyMode(tmux, '%127')).resolves.toBeUndefined()

    expect(tmux.run).toHaveBeenCalledWith(['copy-mode', '-t', '%127'])
  })

  it('maps copy-mode failures to a dedicated error', async () => {
    const tmux = {
      run: vi.fn().mockRejectedValueOnce(new Error('copy-mode failed')),
      runQuiet: vi.fn(),
      capture: vi.fn(),
    }

    await expect(enterCopyMode(tmux, '%127')).rejects.toThrow(
      'tmux-fuzzy-motion: failed to enter copy-mode',
    )
  })

  it('lists panes in the current window', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi
        .fn()
        .mockResolvedValueOnce(
          [
            '%127\t1\t80\t24\t/tmp/left\t0\t0\t1\t0',
            '%128\t0\t81\t24\t/tmp/right\t80\t0\t0\t0',
          ].join('\n'),
        ),
    }

    await expect(listWindowPanes(tmux, '%127')).resolves.toEqual([
      {
        paneId: '%127',
        inCopyMode: true,
        width: 80,
        height: 24,
        currentPath: '/tmp/left',
        left: 0,
        top: 0,
        active: true,
      },
      {
        paneId: '%128',
        inCopyMode: false,
        width: 81,
        height: 24,
        currentPath: '/tmp/right',
        left: 80,
        top: 0,
        active: false,
      },
    ])
  })

  it('keeps only the visible active pane while zoomed', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi
        .fn()
        .mockResolvedValueOnce(
          [
            '%127\t1\t160\t48\t/tmp/zoomed\t0\t0\t1\t1',
            '%128\t0\t80\t24\t/tmp/hidden\t80\t0\t0\t1',
          ].join('\n'),
        ),
    }

    await expect(listWindowPanes(tmux, '%127')).resolves.toEqual([
      {
        paneId: '%127',
        inCopyMode: true,
        width: 160,
        height: 48,
        currentPath: '/tmp/zoomed',
        left: 0,
        top: 0,
        active: true,
      },
    ])
  })

  it('reads pane border lines from tmux options', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi.fn().mockResolvedValueOnce('single'),
    }

    await expect(getPaneBorderLines(tmux, '%127')).resolves.toBe('single')
  })
})
