import type { MatchTarget } from '../types'

const HINT_CHARS = 'ASDFGHJKLQWERTYUIOPZXCVBNM'
const MAX_TARGETS = 200

type HintOptions = {
  characters?: string
  maxHintLength?: 1 | 2
  maxTargets?: number
}

export const createTargetKey = (
  target: Pick<MatchTarget, 'paneId' | 'line' | 'col' | 'text'>,
): string =>
  `${target.paneId ?? ''}:${target.line}:${target.col}:${target.text}`

const generateHints = (characters: string, maxHintLength: 1 | 2): string[] => {
  const single = [...characters]
  if (maxHintLength === 1) {
    return single
  }

  const double = single.flatMap((first) =>
    single.map((second) => `${first}${second}`),
  )

  return [...single, ...double]
}

export const assignHints = (
  targets: MatchTarget[],
  previousHints: ReadonlyMap<string, string> = new Map(),
  options: HintOptions = {},
): MatchTarget[] => {
  const characters = options.characters ?? HINT_CHARS
  const maxHintLength = options.maxHintLength ?? 2
  const maxTargets = options.maxTargets ?? MAX_TARGETS
  const hints = generateHints(characters, maxHintLength)
  const visible = targets.slice(0, maxTargets).map((target) => ({ ...target }))
  const remainingHints = new Set(hints)

  for (const target of visible) {
    const previous = previousHints.get(createTargetKey(target))
    if (!previous || !remainingHints.has(previous)) {
      continue
    }

    target.hint = previous
    remainingHints.delete(previous)
  }

  const iterator = hints
    .filter((hint) => remainingHints.has(hint))
    [Symbol.iterator]()

  for (const target of visible) {
    if (target.hint.length > 0) {
      continue
    }

    target.hint = iterator.next().value ?? ''
  }

  return visible
}
