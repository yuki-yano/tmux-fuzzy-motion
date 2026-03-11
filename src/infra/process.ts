import { execFile } from 'node:child_process'

export type ProcessResult = {
  stdout: string
  stderr: string
}

export const runProcess = async (
  command: string,
  args: string[],
): Promise<ProcessResult> =>
  new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const enrichedError = Object.assign(error, { stdout, stderr })
        reject(
          enrichedError instanceof Error
            ? enrichedError
            : new Error('process execution failed'),
        )
        return
      }

      resolve({ stdout, stderr })
    })
  })
