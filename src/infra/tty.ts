import type { ReadStream, WriteStream } from 'node:tty'

type Reader = {
  nextByte: () => Promise<number | null>
  close: () => void
}

export const clearScreen = (output: NodeJS.WriteStream): void => {
  output.write('\u001B[2J\u001B[H')
}

export const createByteReader = (input: NodeJS.ReadStream): Reader => {
  const queue: number[] = []
  const listeners: Array<(value: number | null) => void> = []

  const onData = (chunk: Buffer | string): void => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

    for (const value of buffer.values()) {
      const listener = listeners.shift()
      if (listener) {
        listener(value)
      } else {
        queue.push(value)
      }
    }
  }

  const onEnd = (): void => {
    while (listeners.length > 0) {
      listeners.shift()?.(null)
    }
  }

  input.on('data', onData)
  input.on('end', onEnd)

  return {
    nextByte: async () => {
      const value = queue.shift()
      if (typeof value === 'number') {
        return value
      }

      return new Promise<number | null>((resolve) => {
        listeners.push(resolve)
      })
    },
    close: () => {
      input.off('data', onData)
      input.off('end', onEnd)
      input.pause()
    },
  }
}

export const withRawMode = async <T>(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
  callback: () => Promise<T>,
): Promise<T> => {
  const ttyInput = input as ReadStream
  const ttyOutput = output as WriteStream
  const canUseRaw = Boolean(ttyInput.isTTY && ttyOutput.isTTY)
  const previousRawMode = canUseRaw ? ttyInput.isRaw : undefined

  input.resume()

  if (canUseRaw) {
    ttyInput.setRawMode(true)
    output.write('\u001B[?25l')
  }

  try {
    return await callback()
  } finally {
    if (canUseRaw) {
      ttyInput.setRawMode(previousRawMode ?? false)
      output.write('\u001B[?25h')
    }
    input.pause()
  }
}
