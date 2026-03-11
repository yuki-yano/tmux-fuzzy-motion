import type { MatchTarget } from '../types'
import type { TmuxClient } from '../infra/tmux'

type CursorTarget = Pick<MatchTarget, 'line' | 'col' | 'primary'>

export const createMoveCursorCommands = (
  paneId: string,
  target: CursorTarget,
): string[][] => {
  const commands: string[][] = [['send-keys', '-X', '-t', paneId, 'top-line']]

  if (target.line > 1) {
    commands.push([
      'send-keys',
      '-X',
      '-N',
      String(target.line - 1),
      '-t',
      paneId,
      'cursor-down',
    ])
  }

  commands.push(['send-keys', '-X', '-t', paneId, 'start-of-line'])

  const right = target.col + target.primary
  if (right > 0) {
    commands.push([
      'send-keys',
      '-X',
      '-N',
      String(right),
      '-t',
      paneId,
      'cursor-right',
    ])
  }

  return commands
}

export const moveCopyCursor = async (
  tmux: TmuxClient,
  paneId: string,
  target: CursorTarget,
): Promise<void> => {
  for (const command of createMoveCursorCommands(paneId, target)) {
    await tmux.run(command)
  }
}
