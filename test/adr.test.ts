import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import {
  buildADR,
  buildPrompt,
  generateADR,
  getNextADRNumber,
  parseSection,
  slugify,
} from '../src/adr.ts'
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

test('getNextADRNumber returns 0001 when the output directory does not exist', async () => {
  const parentDir = await mkdtemp(join(tmpdir(), 'pr-narrative-missing-parent-'))
  const outDir = join(parentDir, 'missing')

  try {
    assert.equal(await getNextADRNumber(outDir), '0001')
  } finally {
    await rm(parentDir, { recursive: true, force: true })
  }
})

test('buildPrompt falls back to none placeholders when PR context sections are empty', () => {
  const prompt = buildPrompt({
    ...ctx,
    body: '',
    files: [],
    commits: [],
    reviewComments: [],
  })

  assert.match(prompt, /PR Description: \(none\)/)
  assert.match(prompt, /Changed Files Summary:\n\(none\)/)
  assert.match(prompt, /Key Commits:\n\(none\)/)
  assert.match(prompt, /Review Comments \(discussion\):\n\(none\)/)
})

test('parseSection supports bold heading format', () => {
  const text = `**Context**
Problem statement.

**Decision**
Chosen approach.`

  assert.equal(parseSection(text, 'Context'), 'Problem statement.')
  assert.equal(parseSection(text, 'Decision'), 'Chosen approach.')
})

test('buildADR falls back to PR-derived placeholders and filters reviewers', () => {
  const content = buildADR(
    '0007',
    {
      ...ctx,
      author: 'alice',
      reviews: [{ author: 'alice', state: 'APPROVED', body: '' }],
      reviewComments: [{ author: 'unknown', body: 'Needs tests.', path: 'src/auth.ts', line: null }],
    },
    'Unstructured summary without headings',
    '2026-04-02'
  )

  assert.match(content, /\(see PR description\)/)
  assert.match(content, /\(see review comments\)/)
  assert.match(content, /\(see diff\)/)
  assert.match(content, /Reviewers: \(none\)/)
})

test('generateADR dry-run returns content without writing a file', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'pr-narrative-adr-dry-run-'))

  try {
    const result = await generateADR(ctx, llm, { outDir, dryRun: true })

    assert.equal(result.filePath, null)
    await assert.rejects(() => readFile(join(outDir, '0001-fix-auth-token-handling.md'), 'utf-8'))
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('generateADR renders a custom template with computed variables', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'pr-narrative-adr-template-'))

  try {
    const result = await generateADR(ctx, llm, {
      outDir,
      dryRun: true,
      template: `## Summary
{{summary}}

## Changes
{{changes}}

## Stats
- Files: {{files_changed}}
- +{{insertions}} / -{{deletions}}

{{#if breaking_changes}}## Breaking Changes
{{breaking_changes}}
{{/if}}`,
    })

    assert.match(result.content, /^## Summary/m)
    assert.match(result.content, /Token refreshes were failing intermittently/)
    assert.match(result.content, /- src\/auth.ts \(modified, \+10\/-2\)/)
    assert.match(result.content, /- Files: 1/)
    assert.doesNotMatch(result.content, /## Breaking Changes/)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})

test('generateADR appends a related issues section when jira tickets are supplied', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'pr-narrative-adr-jira-'))

  try {
    const result = await generateADR(ctx, llm, {
      outDir,
      dryRun: true,
      jiraTickets: ['PROJ-123', 'PROJ-456'],
      jiraBaseUrl: 'https://example.atlassian.net/',
    })

    assert.match(result.content, /^## Related Issues/m)
    assert.match(result.content, /\[PROJ-123\]\(https:\/\/example\.atlassian\.net\/browse\/PROJ-123\)/)
    assert.match(result.content, /\[PROJ-456\]\(https:\/\/example\.atlassian\.net\/browse\/PROJ-456\)/)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})
