import { runDoctor } from './commands/doctor'
import { runInput } from './commands/input'
import { runStart } from './commands/start'

const usage = `tmux-fuzzy-motion

Usage:
  tmux-fuzzy-motion start <pane-id> <client-tty>
  tmux-fuzzy-motion input --state-file <path> --result-file <path>
  tmux-fuzzy-motion doctor`

const main = async (): Promise<number> => {
  const [, , command, ...args] = process.argv

  switch (command) {
    case 'start':
      return runStart(args)
    case 'input':
      return runInput(args)
    case 'doctor':
      return runDoctor()
    default:
      console.error(usage)
      return 1
  }
}

process.exitCode = await main()
