import { Fzf } from 'fzf'

import type { Candidate, MatchTarget } from '../types'

export const matchCandidates = (
  candidates: Candidate[],
  query: string,
): MatchTarget[] => {
  if (query.length === 0) {
    return []
  }

  const fzf = new Fzf<Candidate[]>(candidates, {
    casing: 'case-insensitive',
    selector: (candidate: Candidate) => candidate.text,
  })

  return fzf
    .find(query)
    .map(
      (result: {
        item: Candidate
        positions: Set<number>
        score: number
      }): MatchTarget => {
        const positions = [...result.positions].sort(
          (left, right) => left - right,
        )

        return {
          ...result.item,
          positions,
          primary: positions[0] ?? 0,
          score: result.score,
          hint: '',
        }
      },
    )
    .sort(
      (left: MatchTarget, right: MatchTarget) =>
        right.score - left.score ||
        left.line - right.line ||
        left.col - right.col ||
        left.text.length - right.text.length,
    )
}
