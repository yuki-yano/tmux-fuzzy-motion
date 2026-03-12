import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { capturePane } from './capture'
import { extractCandidates } from './extract'
import { moveCopyCursor } from './action'
import { createTmuxClient, type TmuxClient } from '../infra/tmux'

describe('tmux integration', () => {
  let tmux: TmuxClient
  let sessionName: string
  let paneId: string
  let workDir: string

  const waitForPaneReady = async (): Promise<void> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const text = await tmux.capture(['capture-pane', '-p', '-t', paneId])
      if (text.includes('alpha beta')) {
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    throw new Error('pane output was not ready')
  }

  beforeEach(async () => {
    tmux = createTmuxClient()
    workDir = await mkdtemp(join(tmpdir(), 'tmux-fuzzy-motion-'))
    sessionName = `tfm-${process.pid}-${Date.now()}`
    const fixturePath = join(workDir, 'fixture.txt')

    await writeFile(
      fixturePath,
      [
        'alpha beta',
        'https://example.com/path',
        '日本語 path',
        'repeat repeat',
      ].join('\n'),
      'utf8',
    )

    await tmux.run([
      'new-session',
      '-d',
      '-x',
      '80',
      '-y',
      '12',
      '-s',
      sessionName,
      `sh -lc 'cat ${fixturePath}; exec sleep 600'`,
    ])
    paneId = (
      await tmux.capture([
        'display-message',
        '-p',
        '-t',
        `${sessionName}:0.0`,
        '#{pane_id}',
      ])
    ).trim()
    await waitForPaneReady()
    await tmux.run(['copy-mode', '-t', paneId])
  })

  afterEach(async () => {
    await tmux.runQuiet(['kill-session', '-t', sessionName])
    await rm(workDir, { recursive: true, force: true })
  })

  it('captures viewport text from copy-mode screen', async () => {
    const capture = await capturePane(tmux, paneId)

    expect(capture.lines.slice(0, 4)).toEqual([
      'alpha beta',
      'https://example.com/path',
      '日本語 path',
      'repeat repeat',
    ])
  })

  it('moves the copy-mode cursor to an extracted candidate', async () => {
    const capture = await capturePane(tmux, paneId)
    const candidates = extractCandidates(capture.lines)
    const target = candidates.find((candidate) => candidate.text === 'path')

    expect(target).toBeDefined()

    await moveCopyCursor(tmux, paneId, {
      line: target!.line,
      charCol: target!.charCol,
      primaryChar: 0,
    })

    const position = await tmux.capture([
      'display-message',
      '-p',
      '-t',
      paneId,
      '#{copy_cursor_y}:#{copy_cursor_x}:#{copy_cursor_word}',
    ])

    expect(position.trim()).toBe('2:7:path')
  })

  it('moves the copy-mode cursor to an extracted candidate after wide characters', async () => {
    const capture = await capturePane(tmux, paneId)
    const candidates = extractCandidates(capture.lines)
    const target = candidates.find(
      (candidate) => candidate.text === 'path' && candidate.line === 3,
    )

    expect(target).toBeDefined()

    await moveCopyCursor(tmux, paneId, {
      line: target!.line,
      charCol: target!.charCol,
      primaryChar: 0,
    })

    const position = await tmux.capture([
      'display-message',
      '-p',
      '-t',
      paneId,
      '#{copy_cursor_y}:#{copy_cursor_x}:#{copy_cursor_word}',
    ])

    expect(position.trim()).toBe('2:7:path')
  })

  it('moves the copy-mode cursor using display columns inside wide characters', async () => {
    await moveCopyCursor(tmux, paneId, {
      line: 3,
      charCol: 0,
      primaryChar: 2,
    })

    const position = await tmux.capture([
      'display-message',
      '-p',
      '-t',
      paneId,
      '#{copy_cursor_y}:#{copy_cursor_x}:#{copy_cursor_word}',
    ])

    expect(position.trim()).toBe('2:4:日本語')
  })
})
