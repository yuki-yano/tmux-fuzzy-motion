import { describe, expect, it } from 'vitest'

import { extractCandidates } from './extract'

describe('extractCandidates', () => {
  it('extracts mixed candidates with priority order', () => {
    const lines = [
      'see https://example.com/a and ./src/index.ts plus index.ts',
      'symbol foo_bar and 日本語 path ~/tmp/file.txt',
    ]

    const candidates = extractCandidates(lines)

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'url',
          text: 'https://example.com/a',
          line: 1,
        }),
        expect.objectContaining({
          kind: 'path',
          text: './src/index.ts',
          line: 1,
        }),
        expect.objectContaining({
          kind: 'filename',
          text: 'index.ts',
          line: 1,
        }),
        expect.objectContaining({ kind: 'symbol', text: 'foo_bar', line: 2 }),
        expect.objectContaining({ kind: 'word', text: '日本語', line: 2 }),
        expect.objectContaining({
          kind: 'path',
          text: '~/tmp/file.txt',
          line: 2,
        }),
      ]),
    )
  })

  it('drops contained lower-priority candidates', () => {
    const lines = ['open /tmp/example.txt now']

    const candidates = extractCandidates(lines)

    expect(candidates.map((candidate) => candidate.text)).toContain(
      '/tmp/example.txt',
    )
    expect(candidates.map((candidate) => candidate.text)).not.toContain(
      'example.txt',
    )
  })

  it('uses display-width columns for CJK', () => {
    const lines = ['漢字a path']

    const candidates = extractCandidates(lines)
    const path = candidates.find((candidate) => candidate.text === 'path')

    expect(path?.col).toBe(6)
  })

  it('uses display-width columns for ASCII after emoji', () => {
    const lines = ['😀a path']

    const candidates = extractCandidates(lines)
    const path = candidates.find((candidate) => candidate.text === 'path')

    expect(path?.col).toBe(4)
  })
})
