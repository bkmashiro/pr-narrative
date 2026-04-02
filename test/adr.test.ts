import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { generateADR, getNextADRNumber, slugify } from '../src/adr.ts'
import type { PRContext } from '../src/github.ts'

const ctx: PRContext = {
  title: 'Fix: Auth Token Handling',
  body: 'Improves refresh flow and retry handling.',
  number: 42,
  url: 'https://github.com/acme/pr-narrative/pull/42',
  author: 'alice',
  baseBranch: 'main',
  headBranch: 'fix/auth-token',
  mergedAt: '2026-04-01T12:00:00Z',
  files: [{ filename: 'src/auth.ts', status: 'modified', additions: 10, deletions: 2, patch: 'diff' }],
  commits: [{ sha: 'abc123', message: 'Fix token refresh', author: 'Alice Doe' }],
  reviewComments: [{ author: 'reviewer1', body: 'Needs tests.', path: 'src/auth.ts', line: 12 }],
  reviews: [{ author: 'reviewer2', state: 'APPROVED', body: 'Looks good.' }],
}

const llm = {
  async complete() {
    return `## Context
Token refreshes were failing intermittently.

## Decision
Centralize token refresh handling and retries.

## Consequences
The flow is more predictable, but retry limits must be maintained.

## Implementation Notes
The auth module now refreshes once and reuses the result.`
  },
}

test('generateADR creates a zero-padded slugified filename', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'pr-narrative-adr-'))

  try {
    const result = await generateADR(ctx, llm, { outDir })
    assert.equal(basename(result.filePath ?? ''), '0001-fix-auth-token-handling.md')
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('getNextADRNumber uses existing markdown file count plus one', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'pr-narrative-adr-'))

  try {
    await writeFile(join(outDir, '0001-existing.md'), '# ADR 1\n', 'utf-8')
    await writeFile(join(outDir, '0002-existing.md'), '# ADR 2\n', 'utf-8')
    assert.equal(await getNextADRNumber(outDir), '0003')
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('slugify normalizes titles for ADR filenames', () => {
  assert.equal(slugify('Fix: Auth Token Handling'), 'fix-auth-token-handling')
})

test('generateADR content contains all required sections', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'pr-narrative-adr-'))

  try {
    const result = await generateADR(ctx, llm, { outDir })
    const content = result.content

    assert.match(content, /^## Context/m)
    assert.match(content, /^## Decision/m)
    assert.match(content, /^## Consequences/m)
    assert.match(content, /^## Implementation Notes/m)
    assert.match(content, /^## References/m)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('generateADR references include PR URL and author', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'pr-narrative-adr-'))

  try {
    const result = await generateADR(ctx, llm, { outDir })
    assert.match(result.content, /https:\/\/github\.com\/acme\/pr-narrative\/pull\/42/)
    assert.match(result.content, /Author: alice/)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('generateADR formats the ADR date as YYYY-MM-DD', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'pr-narrative-adr-'))

  try {
    const result = await generateADR(ctx, llm, { outDir })
    assert.match(result.content, /^Date: \d{4}-\d{2}-\d{2}$/m)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})
