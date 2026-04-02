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

export const DEFAULT_CONFIG: Required<Pick<Config, 'provider' | 'out'>> = {
  provider: 'openai',
  out: 'docs/decisions/',
}

export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
  const configPath = join(cwd, 'pr-narrative.config.json')
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG }
  const raw = await readFile(configPath, 'utf-8')
  return {
    ...DEFAULT_CONFIG,
    ...(JSON.parse(raw) as Config),
  }
}

export async function resolveConfig(
  cliConfig: Config = {},
  cwd: string = process.cwd()
): Promise<Config> {
  const fileConfig = await loadConfig(cwd)
  return {
    ...fileConfig,
    ...Object.fromEntries(
      Object.entries(cliConfig).filter(([, value]) => value !== undefined)
    ),
  }
}
