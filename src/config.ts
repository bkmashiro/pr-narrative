import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export interface Config {
  repo?: string
  provider?: 'openai' | 'anthropic' | 'ollama'
  model?: string
  out?: string
  githubToken?: string
}

export async function loadConfig(): Promise<Config> {
  const configPath = join(process.cwd(), 'pr-narrative.config.json')
  if (!existsSync(configPath)) return {}
  const raw = await readFile(configPath, 'utf-8')
  return JSON.parse(raw) as Config
}
