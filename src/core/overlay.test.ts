import { describe, expect, it } from 'vitest'

import type { MatchTarget } from '../types'
import { renderOverlay } from './overlay'

describe('renderOverlay', () => {
  it('overlays hint and highlights remaining positions', () => {
    const lines = ['foobar baz']
    const targets: MatchTarget[] = [
      {
        kind: 'word',
        text: 'foobar',
        line: 1,
        col: 0,
        endCol: 6,
        positions: [0, 3],
        primary: 0,
        score: 10,
        hint: 'a',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(rendered[0]).toContain('\u001B[4;1;38;5;209ma\u001B[0m')
    expect(rendered[0]).toContain('\u001B[4;1;38;5;108mb\u001B[0m')
  })

  it('drops later overlapping targets on the same line', () => {
    const lines = ['foobar']
    const targets: MatchTarget[] = [
      {
        kind: 'word',
        text: 'foobar',
        line: 1,
        col: 0,
        endCol: 6,
        positions: [0],
        primary: 0,
        score: 10,
        hint: 'A',
      },
      {
        kind: 'word',
        text: 'oba',
        line: 1,
        col: 0,
        endCol: 3,
        positions: [0],
        primary: 0,
        score: 9,
        hint: 'S',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(rendered[0]).toContain('\u001B[4;1;38;5;209mA\u001B[0m')
    expect(rendered[0]).not.toContain('\u001B[4;1;38;5;209mS\u001B[0m')
  })

  it('renders hint one cell left when the match is not at line start', () => {
    const lines = ['xpath']
    const targets: MatchTarget[] = [
      {
        kind: 'word',
        text: 'path',
        line: 1,
        col: 1,
        endCol: 5,
        positions: [0],
        primary: 0,
        score: 10,
        hint: 'A',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(rendered[0]?.startsWith('\u001B[4;1;38;5;209mA\u001B[0m')).toBe(true)
  })

  it('keeps existing ANSI colors on untouched cells', () => {
    const lines = ['\u001B[31mfoo\u001B[0m bar']
    const targets: MatchTarget[] = [
      {
        kind: 'word',
        text: 'bar',
        line: 1,
        col: 4,
        endCol: 7,
        positions: [0],
        primary: 0,
        score: 10,
        hint: 'A',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(rendered[0]).toContain('\u001B[31mf\u001B[0m')
    expect(rendered[0]).toContain('\u001B[4;1;38;5;209mA\u001B[0m')
  })
})
