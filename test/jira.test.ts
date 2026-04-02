import test from 'node:test'
import assert from 'node:assert/strict'
import { buildJiraSection, extractJiraTickets } from '../src/jira.ts'

test('extractJiraTickets finds unique tickets in commit messages', () => {
  const tickets = extractJiraTickets([
    'PROJ-123 add retry logic',
    'Cleanup after ABC-456',
    'Follow-up for PROJ-123',
    'ignore lower-case proj-999',
  ])

  assert.deepEqual(tickets, ['PROJ-123', 'ABC-456'])
})

test('buildJiraSection builds linked issue references when a base url is provided', () => {
  const section = buildJiraSection(['PROJ-123', 'ABC-456'], 'https://your-jira.atlassian.net/')

  assert.equal(
    section,
    `## Related Issues
- [PROJ-123](https://your-jira.atlassian.net/browse/PROJ-123)
- [ABC-456](https://your-jira.atlassian.net/browse/ABC-456)`
  )
})

test('buildJiraSection falls back to plain ticket bullets without a base url', () => {
  const section = buildJiraSection(['PROJ-123'])

  assert.equal(
    section,
    `## Related Issues
- PROJ-123`
  )
})
