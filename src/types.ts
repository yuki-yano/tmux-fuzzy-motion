export type CandidateKind = 'url' | 'path' | 'filename' | 'symbol' | 'word'

export type Candidate = {
  kind: CandidateKind
  text: string
  line: number
  col: number
  endCol: number
  charCol: number
}

export type MatchTarget = Candidate & {
  positions: number[]
  primary: number
  primaryChar: number
  score: number
  hint: string
}

export type InputState = {
  paneId: string
  clientTty: string
  lines: string[]
  candidates: Candidate[]
  width: number
  height: number
}

export type InputResult =
  | {
      status: 'cancelled'
    }
  | {
      status: 'selected'
      target: MatchTarget
    }
