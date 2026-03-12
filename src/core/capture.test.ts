import { describe, expect, it } from 'vitest'

import { fitCaptureToHeight, type PaneCapture } from './capture'

describe('capture helpers', () => {
  it('keeps the bottom rows when trimming captured pane lines', () => {
    const capture: PaneCapture = {
      text: '1\n2\n3\n4',
      lines: ['1', '2', '3', '4'],
      displayText: 'a\nb\nc\nd',
      displayLines: ['a', 'b', 'c', 'd'],
    }

    expect(fitCaptureToHeight(capture, 2)).toEqual({
      text: '3\n4',
      lines: ['3', '4'],
      displayText: 'c\nd',
      displayLines: ['c', 'd'],
    })
  })

  it('returns the full capture when it already fits', () => {
    const capture: PaneCapture = {
      text: '1\n2',
      lines: ['1', '2'],
      displayText: '1\n2',
      displayLines: ['1', '2'],
    }

    expect(fitCaptureToHeight(capture, 4)).toEqual(capture)
  })
})
