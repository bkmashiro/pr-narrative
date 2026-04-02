export interface GitCommit {
  hash: string
  subject: string
  body: string
  author: string
}

export interface ReleaseNotes {
  title: string
  newFeatures: string[]
  bugFixes: string[]
  improvements: string[]
  dependencies: string[]
  contributors: Array<{ author: string; commits: number }>
}

const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'

const CATEGORY_TITLES: Array<{
  key: keyof Omit<ReleaseNotes, 'title' | 'contributors'>
  heading: string
}> = [
  { key: 'newFeatures', heading: '## ✨ New Features' },
  { key: 'bugFixes', heading: '## 🐛 Bug Fixes' },
  { key: 'improvements', heading: '## 🔧 Improvements' },
  { key: 'dependencies', heading: '## 📦 Dependencies' },
]

export function buildGitLogFormat(): string {
  return ['%H', '%an', '%s', '%b'].join(FIELD_SEPARATOR) + RECORD_SEPARATOR
}

export function parseGitLog(raw: string): GitCommit[] {
  return raw
    .split(RECORD_SEPARATOR)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [hash = '', author = 'unknown', subject = '', body = ''] = entry.split(FIELD_SEPARATOR)
      return {
        hash,
        author: author || 'unknown',
        subject,
        body,
      }
    })
}

export function extractPRReferences(message: string): string[] {
  return Array.from(new Set(message.match(/#\d+/g) ?? []))
}

export function normalizeCommitSummary(subject: string): string {
  const conventionalMatch = subject.match(/^([a-z]+)(\([^)]+\))?(!)?:\s*(.+)$/i)
  const summary = (conventionalMatch?.[4] ?? subject)
    .replace(/\s*\((#\d+(,\s*#\d+)*)\)\s*$/g, '')
    .replace(/\s+#\d+(?=(\s|$))/g, '')
    .trim()
  return summary.charAt(0).toUpperCase() + summary.slice(1)
}

export function categorizeCommit(subject: string): keyof Omit<ReleaseNotes, 'title' | 'contributors'> {
  const conventionalMatch = subject.match(/^([a-z]+)(\([^)]+\))?(!)?:\s*(.+)$/i)
  const type = conventionalMatch?.[1]?.toLowerCase()

  switch (type) {
    case 'feat':
      return 'newFeatures'
    case 'fix':
      return 'bugFixes'
    case 'deps':
    case 'dependabot':
      return 'dependencies'
    case 'perf':
    case 'chore':
      return 'improvements'
    default:
      return 'improvements'
  }
}

export function formatReleaseEntry(commit: GitCommit): string {
  const refs = extractPRReferences([commit.subject, commit.body].filter(Boolean).join('\n'))
  const summary = normalizeCommitSummary(commit.subject)
  return refs.length > 0 ? `${summary} (${refs.join(', ')})` : summary
}

export function buildReleaseNotes(commits: GitCommit[], toRef: string): ReleaseNotes {
  const notes: ReleaseNotes = {
    title: `# Release Notes — ${toRef}`,
    newFeatures: [],
    bugFixes: [],
    improvements: [],
    dependencies: [],
    contributors: [],
  }

  const contributorCounts = new Map<string, number>()

  for (const commit of commits) {
    const category = categorizeCommit(commit.subject)
    notes[category].push(formatReleaseEntry(commit))
    contributorCounts.set(commit.author, (contributorCounts.get(commit.author) ?? 0) + 1)
  }

  notes.contributors = Array.from(contributorCounts.entries())
    .map(([author, count]) => ({ author, commits: count }))
    .sort((left, right) => right.commits - left.commits || left.author.localeCompare(right.author))

  return notes
}

export function formatReleaseNotes(notes: ReleaseNotes): string {
  const lines = [notes.title, '']

  for (const section of CATEGORY_TITLES) {
    const entries = notes[section.key]
    if (entries.length === 0) continue
    lines.push(section.heading)
    lines.push(...entries.map(entry => `- ${entry}`))
    lines.push('')
  }

  lines.push('## Contributors')
  if (notes.contributors.length === 0) {
    lines.push('- None')
  } else {
    lines.push(...notes.contributors.map(({ author, commits }) => `- ${author} (${commits} commit${commits === 1 ? '' : 's'})`))
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function prependReleaseNotesToChangelog(existingContent: string, releaseNotes: string): string {
  const trimmedExisting = existingContent.trimStart()
  const changelogHeading = '# Changelog'

  if (trimmedExisting.startsWith(changelogHeading)) {
    const headingIndex = existingContent.indexOf(changelogHeading)
    const headingEnd = headingIndex + changelogHeading.length
    const afterHeading = existingContent.slice(headingEnd).trimStart()
    return `${existingContent.slice(0, headingEnd)}\n\n${releaseNotes.trimEnd()}\n\n${afterHeading}`
  }

  if (existingContent.trim().length === 0) {
    return `${releaseNotes.trimEnd()}\n`
  }

  return `${releaseNotes.trimEnd()}\n\n${existingContent.trimStart()}`
}
