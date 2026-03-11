import { describe, expect, it } from 'vitest'

import type { Candidate } from '../types'
import { matchCandidates } from './matcher'

const candidates: Candidate[] = [
  { kind: 'word', text: 'foobar', line: 2, col: 1, endCol: 7 },
  { kind: 'word', text: 'foo', line: 1, col: 3, endCol: 6 },
  { kind: 'word', text: 'frameBuffer', line: 1, col: 0, endCol: 11 },
]

describe('matchCandidates', () => {
  it('sorts by score and tie-breakers', () => {
    const targets = matchCandidates(candidates, 'fb')

    expect(targets.map((target) => target.text)).toEqual([
      'frameBuffer',
      'foobar',
    ])
  })

  it('returns sorted match positions and primary position', () => {
    const [target] = matchCandidates(candidates, 'fb')

    expect(target?.positions).toEqual([0, 5])
    expect(target?.primary).toBe(0)
  })

  it('returns empty array for empty query', () => {
    expect(matchCandidates(candidates, '')).toEqual([])
  })
})
