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
        charCol: 0,
        positions: [0, 3],
        primary: 0,
        primaryChar: 0,
        score: 10,
        hint: 'a',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(rendered[0]).toContain('\u001B[4;1;38;2;243;139;168ma\u001B[0m')
    expect(rendered[0]).toContain('\u001B[4;1;38;2;235;160;172mb\u001B[0m')
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
        charCol: 0,
        positions: [0],
        primary: 0,
        primaryChar: 0,
        score: 10,
        hint: 'A',
      },
      {
        kind: 'word',
        text: 'oba',
        line: 1,
        col: 0,
        endCol: 3,
        charCol: 0,
        positions: [0],
        primary: 0,
        primaryChar: 0,
        score: 9,
        hint: 'S',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(rendered[0]).toContain('\u001B[4;1;38;2;243;139;168mA\u001B[0m')
    expect(rendered[0]).not.toContain('\u001B[4;1;38;2;249;226;175mS\u001B[0m')
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
        charCol: 1,
        positions: [0],
        primary: 0,
        primaryChar: 0,
        score: 10,
        hint: 'A',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(
      rendered[0]?.startsWith('\u001B[4;1;38;2;243;139;168mA\u001B[0m'),
    ).toBe(true)
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
        charCol: 4,
        positions: [0],
        primary: 0,
        primaryChar: 0,
        score: 10,
        hint: 'A',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(rendered[0]).toContain('\u001B[31mf\u001B[0m')
    expect(rendered[0]).toContain('\u001B[4;1;38;2;243;139;168mA\u001B[0m')
  })

  it('replaces the previous wide character without shifting the hint left twice', () => {
    const lines = ['漢path']
    const targets: MatchTarget[] = [
      {
        kind: 'word',
        text: 'path',
        line: 1,
        col: 2,
        endCol: 6,
        charCol: 1,
        positions: [0],
        primary: 0,
        primaryChar: 0,
        score: 10,
        hint: 'A',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(
      rendered[0]?.startsWith('\u001B[4;1;38;2;243;139;168mA \u001B[0mpath'),
    ).toBe(true)
  })

  it('uses a different Catppuccin color for candidates after the first', () => {
    const lines = ['alpha beta']
    const targets: MatchTarget[] = [
      {
        kind: 'word',
        text: 'alpha',
        line: 1,
        col: 0,
        endCol: 5,
        charCol: 0,
        positions: [0, 2],
        primary: 0,
        primaryChar: 0,
        score: 10,
        hint: 'A',
      },
      {
        kind: 'word',
        text: 'beta',
        line: 1,
        col: 6,
        endCol: 10,
        charCol: 6,
        positions: [0, 2],
        primary: 0,
        primaryChar: 0,
        score: 9,
        hint: 'S',
      },
    ]

    const rendered = renderOverlay(lines, targets)

    expect(rendered[0]).toContain('\u001B[4;1;38;2;243;139;168mA\u001B[0m')
    expect(rendered[0]).toContain('\u001B[4;1;38;2;249;226;175mS\u001B[0m')
    expect(rendered[0]).toContain('\u001B[4;1;38;2;250;227;176mt\u001B[0m')
  })
})
