import { getTmuxVersion } from '../infra/tmux'
import { loadMigemo } from '../core/migemo'

const parseMajorMinor = (version: string): number => {
  const match = version.match(/tmux\s+(\d+)\.(\d+)/)
  if (!match) {
    return 0
  }

  return Number(match[1]) + Number(match[2]) / 10
}

export const runDoctor = async (): Promise<number> => {
  const nodeVersion = process.versions.node
  const nodeMajor = Number(nodeVersion.split('.')[0] ?? '0')

  try {
    const tmuxVersion = await getTmuxVersion()
    const migemoStatus = await (async () => {
      const migemo = await loadMigemo()
      return migemo.query('kensaku').length > 0 ? 'ok' : 'empty'
    })()

    const issues: string[] = []
    if (nodeMajor < 22) {
      issues.push(`node ${nodeVersion} is unsupported`)
    }
    if (parseMajorMinor(tmuxVersion) < 3.2) {
      issues.push(`${tmuxVersion} is unsupported`)
    }

    console.log(`node: ${nodeVersion}`)
    console.log(`tmux: ${tmuxVersion}`)
    console.log(`migemo: ${migemoStatus}`)

    if (issues.length > 0) {
      for (const issue of issues) {
        console.error(issue)
      }
      return 2
    }

    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    return 2
  }
}
