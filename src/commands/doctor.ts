import {
  createTmuxClient,
  ensurePopupAvailable,
  getTmuxVersion,
} from '../infra/tmux'

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
  const tmux = createTmuxClient()

  try {
    const tmuxVersion = await getTmuxVersion()
    const popupStatus = await (async () => {
      await ensurePopupAvailable(tmux)
      return 'ok'
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
    console.log(`display-popup: ${popupStatus}`)

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
