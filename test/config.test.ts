import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, resolveConfig } from '../src/config.ts'

test('loadConfig returns defaults when no config file exists', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pr-narrative-config-'))

  try {
    const config = await loadConfig(cwd)
    assert.equal(config.provider, 'openai')
    assert.equal(config.out, 'docs/decisions/')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('loadConfig reads provider from pr-narrative.config.json', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pr-narrative-config-'))

  try {
    await writeFile(
      join(cwd, 'pr-narrative.config.json'),
      JSON.stringify({ provider: 'anthropic', out: 'docs/adrs/' }),
      'utf-8'
    )

    const config = await loadConfig(cwd)
    assert.equal(config.provider, 'anthropic')
    assert.equal(config.out, 'docs/adrs/')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('resolveConfig lets CLI flags override config file values', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pr-narrative-config-'))

  try {
    await writeFile(
      join(cwd, 'pr-narrative.config.json'),
      JSON.stringify({ provider: 'anthropic', out: 'docs/adrs/', model: 'claude-old' }),
      'utf-8'
    )

    const config = await resolveConfig(
      { provider: 'ollama', model: 'llama3.2', out: 'custom/out/' },
      cwd
    )

    assert.equal(config.provider, 'ollama')
    assert.equal(config.model, 'llama3.2')
    assert.equal(config.out, 'custom/out/')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
