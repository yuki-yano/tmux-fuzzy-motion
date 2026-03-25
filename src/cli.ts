import { runDoctor } from './commands/doctor'
import { runDaemon, runPopup, runPopupLive } from './commands/input'
import { runStart } from './commands/start'

const usage = `tmux-fuzzy-motion

Usage:
  tmux-fuzzy-motion start [--scope current|all] <pane-id> <client-tty>
  tmux-fuzzy-motion popup --state-file <path> --result-file <path> --socket <path>
  tmux-fuzzy-motion popup-live <pane-id>
  tmux-fuzzy-motion daemon --socket <path>
  tmux-fuzzy-motion doctor`

const main = async (): Promise<number> => {
  const [, , command, ...args] = process.argv

  switch (command) {
    case 'start':
      return runStart(args)
    case 'popup':
      return runPopup(args)
    case 'popup-live':
      return runPopupLive(args)
    case 'daemon':
      return runDaemon(args)
    case 'doctor':
      return runDoctor()
    default:
      console.error(usage)
      return 1
  }
}

process.exitCode = await main()
