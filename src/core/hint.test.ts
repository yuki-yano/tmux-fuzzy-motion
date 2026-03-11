import { describe, expect, it } from 'vitest'

import type { MatchTarget } from '../types'
import { assignHints } from './hint'

const target = (text: string, line: number): MatchTarget => ({
  kind: 'word',
  text,
  line,
  col: 0,
  endCol: text.length,
  positions: [0],
  primary: 0,
  score: 10,
  hint: '',
})

describe('assignHints', () => {
  it('assigns one-character hints before two-character hints', () => {
    const targets = Array.from({ length: 30 }, (_, index) =>
      target(`word-${index}`, index + 1),
    )

    const assigned = assignHints(targets)

    expect(assigned[0]?.hint).toBe('A')
    expect(assigned[25]?.hint).toBe('M')
    expect(assigned[26]?.hint).toBe('AA')
  })

  it('keeps previous hints for still-visible targets', () => {
    const previous = new Map([
      ['1:0:foo', 'N'],
      ['2:0:bar', 'E'],
    ])

    const assigned = assignHints(
      [target('foo', 1), target('bar', 2), target('baz', 3)],
      previous,
    )

    expect(assigned.map((item) => item.hint)).toEqual(['N', 'E', 'A'])
  })

  it('can limit to single-character uppercase hints', () => {
    const targets = Array.from({ length: 30 }, (_, index) =>
      target(`word-${index}`, index + 1),
    )

    const assigned = assignHints(targets, new Map(), {
      maxHintLength: 1,
      maxTargets: 26,
    })

    expect(assigned).toHaveLength(26)
    expect(assigned[0]?.hint).toBe('A')
    expect(assigned[25]?.hint).toBe('M')
  })
})
