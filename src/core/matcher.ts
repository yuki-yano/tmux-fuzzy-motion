import { Fzf } from 'fzf'

import type { Candidate, MatchTarget } from '../types'
import {
  codeUnitIndexToCharacterIndex,
  codeUnitIndicesToColumns,
  codeUnitRangeToColumns,
} from './width'

export type MigemoQuery = {
  query: (value: string) => string
}

type RankedMatchTarget = MatchTarget & {
  source: 'fuzzy' | 'migemo'
}

export type CandidateMatcher = (query: string) => MatchTarget[]

const candidateKey = (candidate: Candidate): string =>
  [
    candidate.paneId ?? '',
    candidate.kind,
    candidate.text,
    String(candidate.line),
    String(candidate.col),
    String(candidate.endCol),
  ].join(':')

const compareTargets = (
  left: RankedMatchTarget,
  right: RankedMatchTarget,
): number =>
  (left.source === right.source ? 0 : left.source === 'fuzzy' ? -1 : 1) ||
  right.score - left.score ||
  left.line - right.line ||
  left.col - right.col ||
  left.text.length - right.text.length

const createFuzzyMatches = (
  fzf: Fzf<Candidate[]>,
  query: string,
): RankedMatchTarget[] => {
  return fzf
    .find(query)
    .map(
      (result: {
        item: Candidate
        positions: Set<number>
        score: number
      }): RankedMatchTarget => {
        const rawPositions = [...result.positions].sort(
          (left, right) => left - right,
        )
        const positions = codeUnitIndicesToColumns(
          result.item.text,
          rawPositions,
        )

        return {
          ...result.item,
          positions,
          primary: positions[0] ?? 0,
          primaryChar: codeUnitIndexToCharacterIndex(
            result.item.text,
            rawPositions[0] ?? 0,
          ),
          score: result.score,
          hint: '',
          source: 'fuzzy',
        }
      },
    )
}

const buildMigemoRegex = (
  query: string,
  migemo?: MigemoQuery,
): RegExp | null => {
  if (!migemo || !/^[a-z]+$/i.test(query)) {
    return null
  }

  const pattern = migemo.query(query).trim()
  if (!pattern) {
    return null
  }

  try {
    return new RegExp(pattern, 'iu')
  } catch {
    return null
  }
}

const createMigemoMatches = (
  candidates: Candidate[],
  regex: RegExp | null,
): RankedMatchTarget[] => {
  if (!regex) {
    return []
  }

  const matches: RankedMatchTarget[] = []

  for (const candidate of candidates) {
    const result = regex.exec(candidate.text)
    if (!result?.[0]) {
      continue
    }

    const start = result.index ?? 0
    const end = start + result[0].length
    const positions = codeUnitRangeToColumns(candidate.text, start, end)

    if (positions.length === 0) {
      continue
    }

    matches.push({
      ...candidate,
      positions,
      primary: positions[0] ?? 0,
      primaryChar: codeUnitIndexToCharacterIndex(candidate.text, start),
      score: result[0].length,
      hint: '',
      source: 'migemo',
    })
  }

  return matches
}

const stripSource = (target: RankedMatchTarget): MatchTarget => {
  const { source, ...rest } = target
  void source
  return rest
}

export const createMatcher = (
  candidates: Candidate[],
  migemo?: MigemoQuery,
): CandidateMatcher => {
  const fzf = new Fzf<Candidate[]>(candidates, {
    casing: 'case-insensitive',
    selector: (candidate: Candidate) => candidate.text,
  })

  return (query: string): MatchTarget[] => {
    if (query.length === 0) {
      return []
    }

    const merged = new Map<string, RankedMatchTarget>()

    for (const target of createFuzzyMatches(fzf, query)) {
      merged.set(candidateKey(target), target)
    }

    for (const target of createMigemoMatches(
      candidates,
      buildMigemoRegex(query, migemo),
    )) {
      const key = candidateKey(target)
      if (!merged.has(key)) {
        merged.set(key, target)
      }
    }

    return [...merged.values()].sort(compareTargets).map(stripSource)
  }
}

export const matchCandidates = (
  candidates: Candidate[],
  query: string,
  migemo?: MigemoQuery,
): MatchTarget[] => createMatcher(candidates, migemo)(query)
