import { describe, expect, it, vi } from 'vitest'

import type { InputState, MatchTarget } from '../types'
import {
  createFrame,
  deleteBackwardChar,
  deleteBackwardWord,
  parseDaemonRequestLine,
  renderQueryOnBottomLine,
  serializeDaemonMessageLine,
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

  it('clips the base line by display cells when query is empty', () => {
    expect(renderQueryOnBottomLine('alpha beta', 5, '')).toBe('alpha')
  })

  it('closes ANSI styling after clipping an empty-query base line', () => {
    expect(renderQueryOnBottomLine('\u001B[31mabcdef\u001B[0m', 3, '')).toBe(
      '\u001B[31mabc\u001B[0m',
    )
  })

  it('does not render overlay while the query is empty', () => {
    const state: InputState = {
      scope: 'current',
      paneId: '%1',
      clientTty: '/dev/ttys001',
      displayLines: ['\u001B[31mfoo\u001B[0m'],
      plainLines: ['foo'],
      width: 3,
      height: 1,
    }
    const renderOverlay = vi.fn(() => ['overlay'])

    const frame = createFrame(state, '', [], renderOverlay)

    expect(frame.body).toEqual(['\u001B[31mfoo\u001B[0m'])
    expect(renderOverlay).not.toHaveBeenCalled()
  })

  it('renders overlay after a query has matches', () => {
    const state: InputState = {
      scope: 'current',
      paneId: '%1',
      clientTty: '/dev/ttys001',
      displayLines: ['foo'],
      plainLines: ['foo'],
      width: 3,
      height: 1,
    }
    const matches: MatchTarget[] = [
      {
        kind: 'word',
        text: 'foo',
        line: 1,
        col: 0,
        endCol: 3,
        charCol: 0,
        positions: [0],
        primary: 0,
        primaryChar: 0,
        score: 1,
        hint: 'A',
      },
    ]
    const renderOverlay = vi.fn(() => ['overlay'])

    const frame = createFrame(state, 'f', matches, renderOverlay)

    expect(frame.body[0]).not.toBe('foo')
    expect(renderOverlay).toHaveBeenCalledWith(matches)
  })

  it('parses a prepare daemon request', () => {
    expect(
      parseDaemonRequestLine(
        JSON.stringify({
          type: 'prepare',
          stateFile: '/tmp/state.json',
        }),
      ),
    ).toEqual({
      type: 'prepare',
      stateFile: '/tmp/state.json',
    })
  })

  it('parses a ping daemon request', () => {
    expect(parseDaemonRequestLine(JSON.stringify({ type: 'ping' }))).toEqual({
      type: 'ping',
    })
  })

  it('parses a match daemon request with previous hints', () => {
    expect(
      parseDaemonRequestLine(
        JSON.stringify({
          type: 'match',
          query: 'abc',
          previousHints: {
            targetA: 'A',
          },
        }),
      ),
    ).toEqual({
      type: 'match',
      query: 'abc',
      previousHints: {
        targetA: 'A',
      },
    })
  })

  it('serializes daemon messages as JSON lines', () => {
    expect(
      serializeDaemonMessageLine({
        type: 'busy',
      }),
    ).toBe(`${JSON.stringify({ type: 'busy' })}\n`)
  })
})
