import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTemplateVariables, renderTemplate } from '../src/template.ts'
import type { PRContext } from '../src/github.ts'

const ctx: PRContext = {
  title: 'Refactor auth',
  body: 'BREAKING CHANGES: consumers must pass a token provider.',
  number: 7,
  url: 'https://github.com/acme/pr-narrative/pull/7',
  author: 'alice',
  baseBranch: 'main',
  headBranch: 'refactor/auth',
  mergedAt: '2026-04-01T12:00:00Z',
  files: [
    { filename: 'src/auth.ts', status: 'modified', additions: 12, deletions: 4, patch: 'diff' },
    { filename: 'src/token.ts', status: 'added', additions: 20, deletions: 0, patch: 'diff' },
  ],
  commits: [
    { sha: 'abc123', message: 'PROJ-123 refactor auth flow', author: 'Alice Doe' },
    { sha: 'def456', message: 'Tighten token handling', author: 'Alice Doe' },
  ],
  reviewComments: [],
  reviews: [],
}

test('renderTemplate replaces variables and conditional blocks', () => {
  const output = renderTemplate(
    `Summary: {{summary}}
{{#if breaking_changes}}Breaking: {{breaking_changes}}{{/if}}`,
    {
      summary: 'Auth cleanup',
      breaking_changes: 'Pass a token provider',
    }
  )

  assert.equal(output, `Summary: Auth cleanup
Breaking: Pass a token provider`)
})

test('renderTemplate removes falsey conditional blocks', () => {
  const output = renderTemplate(
    `Summary: {{summary}}
{{#if breaking_changes}}Breaking: {{breaking_changes}}{{/if}}`,
    {
      summary: 'Auth cleanup',
      breaking_changes: '',
    }
  )

  assert.equal(output, 'Summary: Auth cleanup\n')
})

test('buildTemplateVariables computes summary, stats, and commit bullet lists', () => {
  const variables = buildTemplateVariables(
    ctx,
    `## Context
Token refreshes failed under load.

## Decision
Centralize auth state.

## Consequences
Breaking Changes: callers must pass a token provider.

## Implementation Notes
Added a shared token module.`
  )

  assert.match(variables.summary, /Token refreshes failed under load/)
  assert.match(variables.summary, /Centralize auth state/)
  assert.equal(variables.files_changed, 2)
  assert.equal(variables.insertions, 32)
  assert.equal(variables.deletions, 4)
  assert.match(variables.changes, /src\/auth.ts/)
  assert.match(variables.commits, /PROJ-123 refactor auth flow/)
  assert.match(variables.breaking_changes, /token provider/i)
})
