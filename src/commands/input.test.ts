import { describe, expect, it } from 'vitest'

import { deleteBackwardChar, deleteBackwardWord } from './input'

describe('input editing helpers', () => {
  it('deletes one character backward', () => {
    expect(deleteBackwardChar('path')).toBe('pat')
    expect(deleteBackwardChar('')).toBe('')
  })

  it('deletes a shell-like word backward', () => {
    expect(deleteBackwardWord('foo/bar-baz')).toBe('foo/')
    expect(deleteBackwardWord('foo///')).toBe('')
    expect(deleteBackwardWord('')).toBe('')
  })
})
