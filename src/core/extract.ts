import type { Candidate, CandidateKind } from '../types'
import {
  codeUnitIndexToCharacterIndex,
  codeUnitIndexToColumn,
  displayWidth,
} from './width'

type RawCandidate = Candidate & {
  priority: number
  startIndex: number
  endIndex: number
}

const PATTERNS: Array<{ kind: CandidateKind; pattern: RegExp }> = [
  { kind: 'url', pattern: /https?:\/\/[^\s\])'">]+/dgu },
  { kind: 'path', pattern: /(?:~\/|\/|\.\/|\.\.\/)[^\s"'`]+/dgu },
  { kind: 'filename', pattern: /\b[\w.-]+\.[A-Za-z0-9]{1,10}\b/dg },
  { kind: 'symbol', pattern: /\b[A-Za-z_][A-Za-z0-9_:-]*[A-Za-z0-9_]\b/dg },
  {
    kind: 'word',
    pattern: /[\p{L}\p{N}][\p{L}\p{N}._-]*[\p{L}\p{N}]|[\p{L}\p{N}]/dgu,
  },
]

const isContainedByHigherPriority = (
  current: RawCandidate,
  others: RawCandidate[],
): boolean =>
  others.some(
    (candidate) =>
      candidate.line === current.line &&
      candidate.priority < current.priority &&
      candidate.startIndex <= current.startIndex &&
      candidate.endIndex >= current.endIndex,
  )

const dedupeLineCandidates = (candidates: RawCandidate[]): RawCandidate[] => {
  const byStartIndex = new Map<number, RawCandidate>()

  for (const candidate of candidates) {
    const current = byStartIndex.get(candidate.startIndex)
    if (!current || candidate.priority < current.priority) {
      byStartIndex.set(candidate.startIndex, candidate)
    }
  }

  const deduped = [...byStartIndex.values()]

  return deduped.filter(
    (candidate) => !isContainedByHigherPriority(candidate, deduped),
  )
}

export const extractCandidates = (lines: string[]): Candidate[] => {
  const collected: RawCandidate[] = []

  lines.forEach((lineText, lineIndex) => {
    const lineCandidates: RawCandidate[] = []

    PATTERNS.forEach(({ kind, pattern }, priority) => {
      const regex = new RegExp(pattern.source, pattern.flags)

      for (const match of lineText.matchAll(regex)) {
        const text = match[0]
        const startIndex = match.index ?? 0
        const endIndex = startIndex + text.length
        const width = displayWidth(text)

        if (width === 1 && kind !== 'word') {
          continue
        }

        const col = codeUnitIndexToColumn(lineText, startIndex)
        const charCol = codeUnitIndexToCharacterIndex(lineText, startIndex)
        lineCandidates.push({
          kind,
          text,
          line: lineIndex + 1,
          col,
          endCol: col + width,
          charCol,
          priority,
          startIndex,
          endIndex,
        })
      }
    })

    collected.push(...dedupeLineCandidates(lineCandidates))
  })

  return collected
    .sort(
      (left, right) =>
        left.line - right.line ||
        left.col - right.col ||
        left.priority - right.priority,
    )
    .map((candidate) => ({
      kind: candidate.kind,
      text: candidate.text,
      line: candidate.line,
      col: candidate.col,
      endCol: candidate.endCol,
      charCol: candidate.charCol,
    }))
}
