import { describe, expect, it } from 'vitest'

import {
  createCompactStyledDisplayCells,
  createStyledDisplayCells,
} from './width'

describe('display cell helpers', () => {
  it('keeps compact ANSI style runs for full-frame rendering', () => {
    const rendered = createCompactStyledDisplayCells(
      '\u001B[31mfoo\u001B[0m bar',
    ).join('')

    expect(rendered).toBe('\u001B[31mfoo\u001B[0m bar')
  })

  it('keeps isolated ANSI cells available for overlay mutation', () => {
    const rendered = createStyledDisplayCells('\u001B[31mfoo\u001B[0m').join('')

    expect(rendered).toBe(
      '\u001B[31mf\u001B[0m\u001B[31mo\u001B[0m\u001B[31mo\u001B[0m',
    )
  })

  it('preserves wide-character cell width in compact styled cells', () => {
    const cells = createCompactStyledDisplayCells('\u001B[31m漢\u001B[0m')

    expect(cells).toEqual(['\u001B[31m漢\u001B[0m', ''])
  })
})
