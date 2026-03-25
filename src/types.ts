export type CandidateKind = 'url' | 'path' | 'filename' | 'symbol' | 'word'

export type Candidate = {
  paneId?: string
  screenLine?: number
  screenCol?: number
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

export type PaneSnapshot = {
  paneId: string
  inCopyMode: boolean
  width: number
  height: number
  left: number
  top: number
  plainLines: string[]
  displayLines: string[]
}

type BaseInputState = {
  paneId: string
  clientTty: string
  displayLines: string[]
  plainLines: string[]
  width: number
  height: number
}

export type InputState =
  | (BaseInputState & {
      scope: 'current'
    })
  | (Omit<BaseInputState, 'plainLines'> & {
      scope: 'all'
      panes: PaneSnapshot[]
    })

export type InputResult =
  | {
      status: 'cancelled'
    }
  | {
      status: 'selected'
      target: MatchTarget
    }

export type DaemonRequest =
  | {
      type: 'ping'
    }
  | {
      type: 'prepare'
      stateFile: string
    }
  | {
      type: 'match'
      query: string
      previousHints: Record<string, string>
    }

export type DaemonResponse =
  | {
      type: 'pong'
    }
  | {
      type: 'prepared'
      candidateCount: number
    }
  | {
      type: 'matchResult'
      targets: MatchTarget[]
    }
  | {
      type: 'busy'
    }
  | {
      type: 'error'
      message: string
    }
