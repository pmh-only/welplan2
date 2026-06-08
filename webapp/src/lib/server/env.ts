import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { config } from 'dotenv'

type EnvResult = ReturnType<typeof config>

const candidateFiles = new Set<string>()

for (const raw of [
  process.env.DOTENV_PATH,
  resolve(cwd(), '.env'),
  resolve(cwd(), '..', '.env')
]) {
  if (!raw) continue
  const file = resolve(raw)
  if (existsSync(file)) candidateFiles.add(file)
}

for (const file of candidateFiles) {
  const result = config({ path: file }) as EnvResult
  if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw result.error
  }
}
