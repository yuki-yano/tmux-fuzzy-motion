import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { CompactDictionary, Migemo } from 'jsmigemo'

import type { MigemoQuery } from './matcher'

const require = createRequire(import.meta.url)

let cachedMigemo: Promise<MigemoQuery> | null = null

const toArrayBuffer = (buffer: Buffer<ArrayBufferLike>): ArrayBuffer =>
  buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer

export const resolveMigemoDictionaryPath = (): string =>
  join(dirname(require.resolve('jsmigemo')), '..', 'migemo-compact-dict')

export const loadMigemo = async (): Promise<MigemoQuery> => {
  cachedMigemo ??= (async () => {
    const data = await readFile(resolveMigemoDictionaryPath())
    const dict = new CompactDictionary(toArrayBuffer(data))
    const migemo = new Migemo()
    migemo.setDict(dict)
    return migemo
  })()

  return cachedMigemo
}
