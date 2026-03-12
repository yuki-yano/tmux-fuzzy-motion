import { describe, expect, it } from 'vitest'

import type { Candidate } from '../types'
import { matchCandidates } from './matcher'

const candidates: Candidate[] = [
  { kind: 'word', text: 'foobar', line: 2, col: 1, endCol: 7, charCol: 1 },
  { kind: 'word', text: 'foo', line: 1, col: 3, endCol: 6, charCol: 3 },
  {
    kind: 'word',
    text: 'frameBuffer',
    line: 1,
    col: 0,
    endCol: 11,
    charCol: 0,
  },
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

  it('includes migemo-only matches when migemo is available', () => {
    const targets = matchCandidates(
      [
        { kind: 'word', text: '検索', line: 0, col: 0, endCol: 4, charCol: 0 },
        { kind: 'word', text: '検査', line: 0, col: 4, endCol: 8, charCol: 2 },
      ],
      'kensaku',
      {
        query: (query: string) =>
          query === 'kensaku' ? '(検索|けんさく)' : '',
      },
    )

    expect(targets.map((target) => target.text)).toEqual(['検索'])
    expect(targets[0]?.positions).toEqual([0, 2])
    expect(targets[0]?.primary).toBe(0)
  })

  it('keeps fuzzy matches ahead of migemo-only matches', () => {
    const targets = matchCandidates(
      [
        {
          kind: 'word',
          text: 'kensaku',
          line: 0,
          col: 0,
          endCol: 7,
          charCol: 0,
        },
        { kind: 'word', text: '検索', line: 1, col: 0, endCol: 4, charCol: 0 },
      ],
      'kensaku',
      {
        query: () => '(検索)',
      },
    )

    expect(targets.map((target) => target.text)).toEqual(['kensaku', '検索'])
  })

  it('falls back to fuzzy matching when migemo pattern is invalid', () => {
    const targets = matchCandidates(candidates, 'foo', {
      query: () => '(',
    })

    expect(targets.map((target) => target.text)).toEqual(['foo', 'foobar'])
  })

  it('converts migemo match positions to display columns for wide characters', () => {
    const targets = matchCandidates(
      [{ kind: 'word', text: '検索', line: 1, col: 0, endCol: 4, charCol: 0 }],
      'kensaku',
      {
        query: () => '(検索)',
      },
    )

    expect(targets[0]?.positions).toEqual([0, 2])
    expect(targets[0]?.primary).toBe(0)
    expect(targets[0]?.primaryChar).toBe(0)
  })
})
