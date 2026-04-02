import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGitLogFormat,
  buildReleaseNotes,
  categorizeCommit,
  extractPRReferences,
  formatReleaseNotes,
  parseGitLog,
  prependReleaseNotesToChangelog,
} from '../src/release-notes.ts'

test('parseGitLog parses git log output into structured commits', () => {
  const raw = [
    ['abc123', 'alice', 'feat: add env var detection #42', ''],
    ['def456', 'bob', 'fix: handle missing .env #44', 'body line'],
  ]
    .map(fields => fields.join('\x1f'))
    .join('\x1e') + '\x1e'

  assert.deepEqual(parseGitLog(raw), [
    { hash: 'abc123', author: 'alice', subject: 'feat: add env var detection #42', body: '' },
    { hash: 'def456', author: 'bob', subject: 'fix: handle missing .env #44', body: 'body line' },
  ])
})

test('buildGitLogFormat uses field and record separators for machine parsing', () => {
  assert.equal(buildGitLogFormat(), '%H\x1f%an\x1f%s\x1f%b\x1e')
})

test('categorizeCommit maps conventional commit prefixes into release note sections', () => {
  assert.equal(categorizeCommit('feat: add support'), 'newFeatures')
  assert.equal(categorizeCommit('fix: handle crash'), 'bugFixes')
  assert.equal(categorizeCommit('perf: speed up scans'), 'improvements')
  assert.equal(categorizeCommit('chore: improve errors'), 'improvements')
  assert.equal(categorizeCommit('deps: upgrade chalk'), 'dependencies')
})

test('extractPRReferences returns unique PR references from commit text', () => {
  assert.deepEqual(
    extractPRReferences('feat: add support (#42)\n\nFollow-up in #43 and #42'),
    ['#42', '#43']
  )
})

test('formatReleaseNotes groups commits by category and includes contributor totals', () => {
  const notes = buildReleaseNotes(
    [
      { hash: '1', author: 'alice', subject: 'feat: add Python support #42', body: '' },
      { hash: '2', author: 'alice', subject: 'feat: add Go support #43', body: '' },
      { hash: '3', author: 'bob', subject: 'fix: handle missing .env #44', body: '' },
      { hash: '4', author: 'bob', subject: 'perf: speed up large directory scans', body: '' },
      { hash: '5', author: 'carol', subject: 'deps: upgrade chalk to v5', body: '' },
    ],
    'v1.1.0'
  )

  const output = formatReleaseNotes(notes)

  assert.match(output, /^# Release Notes — v1.1.0/m)
  assert.match(output, /^## ✨ New Features/m)
  assert.match(output, /- Add Python support \(\#42\)/)
  assert.match(output, /- Add Go support \(\#43\)/)
  assert.match(output, /^## 🐛 Bug Fixes/m)
  assert.match(output, /- Handle missing \.env \(\#44\)/)
  assert.match(output, /^## 🔧 Improvements/m)
  assert.match(output, /- Speed up large directory scans/)
  assert.match(output, /^## 📦 Dependencies/m)
  assert.match(output, /- Upgrade chalk to v5/)
  assert.match(output, /^## Contributors/m)
  assert.match(output, /- alice \(2 commits\)/)
  assert.match(output, /- bob \(2 commits\)/)
  assert.match(output, /- carol \(1 commit\)/)
})

test('prependReleaseNotesToChangelog inserts notes after the changelog heading', () => {
  const updated = prependReleaseNotesToChangelog(
    '# Changelog\n\n## Old Release\n- Existing entry\n',
    '# Release Notes — v1.1.0\n\n## ✨ New Features\n- Added support\n'
  )

  assert.equal(
    updated,
    '# Changelog\n\n# Release Notes — v1.1.0\n\n## ✨ New Features\n- Added support\n\n## Old Release\n- Existing entry\n'
  )
})

test('prependReleaseNotesToChangelog prepends notes when no heading exists', () => {
  const updated = prependReleaseNotesToChangelog(
    '## Older Notes\n- Existing entry\n',
    '# Release Notes — v1.1.0\n'
  )

  assert.equal(updated, '# Release Notes — v1.1.0\n\n## Older Notes\n- Existing entry\n')
})
