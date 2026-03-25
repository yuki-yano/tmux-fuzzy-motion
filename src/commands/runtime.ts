import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { access, rm } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { join, resolve } from 'node:path'

import type { DaemonResponse } from '../types'

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export const resolveCliEntrypoint = (): string =>
  process.argv[1] ?? resolve(process.cwd(), 'dist/cli.js')

const createDaemonIdentity = (): string => {
  const entrypoint = resolveCliEntrypoint()
  const entrypointMtimeMs = statSync(entrypoint).mtimeMs

  return [
    process.env.TMUX ?? 'tmux-fuzzy-motion',
    process.execPath,
    entrypoint,
    String(entrypointMtimeMs),
  ].join('\0')
}

export const createDaemonSocketPath = (): string =>
  join(
    '/tmp',
    `tfm-${createHash('sha1')
      .update(createDaemonIdentity())
      .digest('hex')}.sock`,
  )

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const buildDaemonCommand = (socketPath: string): string[] => [
  resolveCliEntrypoint(),
  'daemon',
  '--socket',
  socketPath,
]

const isDaemonHealthy = async (socketPath: string): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = createConnection(socketPath)
    socket.setEncoding('utf8')
    let buffer = ''
    let settled = false

    const settle = (value: boolean): void => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(value)
    }

    socket.once('connect', () => {
      socket.write(`${JSON.stringify({ type: 'ping' })}\n`)
    })
    socket.once('error', () => {
      settle(false)
    })
    socket.on('data', (chunk: string) => {
      buffer += chunk

      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex < 0) {
          break
        }

        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) {
          continue
        }

        try {
          const response = JSON.parse(line) as DaemonResponse
          settle(response.type === 'pong')
        } catch {
          settle(false)
        }
      }
    })
  })

const waitForDaemon = async (socketPath: string): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await isDaemonHealthy(socketPath)) {
      return
    }

    await sleep(25)
  }

  throw new Error('tmux-fuzzy-motion: failed to start daemon')
}

const spawnDaemon = (socketPath: string): void => {
  const child = spawn(process.execPath, buildDaemonCommand(socketPath), {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

export const ensureDaemon = async (socketPath: string): Promise<void> => {
  if (await pathExists(socketPath)) {
    if (await isDaemonHealthy(socketPath)) {
      return
    }

    await rm(socketPath, { force: true })
  }

  spawnDaemon(socketPath)
  await waitForDaemon(socketPath)
}
