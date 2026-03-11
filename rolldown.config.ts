import { defineConfig } from 'rolldown'

export default defineConfig({
  input: './src/cli.ts',
  output: {
    file: './dist/cli.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
  },
  platform: 'node',
  external: [/^node:/],
})
