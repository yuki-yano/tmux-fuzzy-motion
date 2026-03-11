import { describe, expect, it } from 'vitest'

import { createMoveCursorCommands } from '../core/action'
import { buildDisplayPopupArgs, getStatusLineCount } from './tmux'

describe('tmux command builders', () => {
  it('creates popup args targeting a client tty', () => {
    expect(
      buildDisplayPopupArgs(
        '%1',
        '/dev/ttys001',
        { left: 10, top: 2, width: 80, height: 20 },
        'node dist/cli.js input --state-file a --result-file b',
      ),
    ).toEqual([
      'display-popup',
      '-E',
      '-B',
      '-t',
      '%1',
      '-x',
      '#{popup_pane_left}',
      '-y',
      '#{popup_pane_top}',
      '-w',
      '80',
      '-h',
      '20',
      '-c',
      '/dev/ttys001',
      'node dist/cli.js input --state-file a --result-file b',
    ])
  })

  it('creates copy-mode cursor movement commands', () => {
    expect(
      createMoveCursorCommands('%1', { line: 3, col: 4, primary: 2 }),
    ).toEqual([
      ['send-keys', '-X', '-t', '%1', 'top-line'],
      ['send-keys', '-X', '-N', '2', '-t', '%1', 'cursor-down'],
      ['send-keys', '-X', '-t', '%1', 'start-of-line'],
      ['send-keys', '-X', '-N', '6', '-t', '%1', 'cursor-right'],
    ])
  })

  it('parses tmux status line count', () => {
    expect(getStatusLineCount('off')).toBe(0)
    expect(getStatusLineCount('on')).toBe(1)
    expect(getStatusLineCount('3')).toBe(3)
  })
})
