import stripAnsi from 'strip-ansi'

import type { TmuxClient } from '../infra/tmux'

export type PaneCapture = {
  text: string
  lines: string[]
  displayText: string
  displayLines: string[]
}

export const capturePane = async (
  tmux: TmuxClient,
  paneId: string,
): Promise<PaneCapture> => {
  try {
    const raw = await tmux.capture([
      'capture-pane',
      '-p',
      '-M',
      '-e',
      '-t',
      paneId,
    ])
    const displayText = raw.replace(/\r/g, '').replace(/\n$/, '')
    const text = stripAnsi(displayText)

    return {
      text,
      lines: text.length === 0 ? [] : text.split('\n'),
      displayText,
      displayLines: displayText.length === 0 ? [] : displayText.split('\n'),
    }
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: failed to capture pane', {
      cause: error,
    })
  }
}
