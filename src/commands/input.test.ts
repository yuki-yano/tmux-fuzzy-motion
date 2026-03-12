import { describe, expect, it } from 'vitest'

import {
  deleteBackwardChar,
  deleteBackwardWord,
  renderQueryOnBottomLine,
} from './input'

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

  it('renders query text at the bottom right edge', () => {
    expect(renderQueryOnBottomLine('alpha beta', 12, 'xy')).toContain('x')
    expect(renderQueryOnBottomLine('alpha beta', 12, 'xy')).toContain('y')
  })

  it('keeps the base line when query is empty', () => {
    expect(renderQueryOnBottomLine('alpha beta', 12, '')).toBe('alpha beta  ')
  })
})
