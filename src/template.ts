import type { PRContext } from './github.js'

export interface TemplateVariables {
  summary: string
  changes: string
  files_changed: number
  insertions: number
  deletions: number
  breaking_changes: string
  commits: string
}

export function buildTemplateVariables(ctx: PRContext, llmText: string): TemplateVariables {
  const context = parseSection(llmText, 'Context')
  const decision = parseSection(llmText, 'Decision')
  const consequences = parseSection(llmText, 'Consequences')
  const implementationNotes = parseSection(llmText, 'Implementation Notes')
  const summary = [context, decision].filter(Boolean).join('\n\n').trim() || llmText.trim()
  const changes = ctx.files
    .map(file => `- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`)
    .join('\n')
  const filesChanged = ctx.files.length
  const insertions = ctx.files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = ctx.files.reduce((sum, file) => sum + file.deletions, 0)
  const breakingChanges = extractBreakingChanges([ctx.body, consequences, implementationNotes, llmText])
  const commits = ctx.commits
    .map(commit => `- ${commit.message.split('\n')[0]}`)
    .join('\n')

  return {
    summary,
    changes,
    files_changed: filesChanged,
    insertions,
    deletions,
    breaking_changes: breakingChanges,
    commits,
  }
}

export function renderTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  const withConditionals = template.replace(
    /{{#if\s+([a-zA-Z0-9_]+)}}([\s\S]*?){{\/if}}/g,
    (_match, variableName: string, content: string) => {
      const value = variables[variableName]
      return isTruthyTemplateValue(value) ? content : ''
    }
  )

  return withConditionals.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, variableName: string) => {
    const value = variables[variableName]
    return value === undefined || value === null ? '' : String(value)
  })
}

function isTruthyTemplateValue(value: string | number | undefined): boolean {
  if (typeof value === 'number') {
    return value !== 0
  }

  return Boolean(value && value.trim().length > 0)
}

function extractBreakingChanges(parts: Array<string | undefined>): string {
  for (const part of parts) {
    if (!part) continue

    const explicitMatch = part.match(
      /(?:breaking changes?|breaking:|breaks?|migration)(?:\s*[:.-]\s*|\n+)([\s\S]*?)(?=\n##?\s|\n[A-Z][A-Za-z ]+:\s|$)/i
    )
    if (explicitMatch?.[1]?.trim()) {
      return explicitMatch[1].trim()
    }

    if (/\bbreaking changes?\b/i.test(part)) {
      return part.trim()
    }
  }

  return ''
}

function parseSection(text: string, section: string): string {
  const headings = ['Context', 'Decision', 'Consequences', 'Implementation Notes']
  const idx = headings.indexOf(section)
  if (idx === -1) return ''

  const patterns = [
    new RegExp(`##?\\s*${section}[:\\s]*\\n([\\s\\S]*?)(?=##?\\s*(?:${headings.join('|')})|$)`, 'i'),
    new RegExp(`\\*\\*${section}\\*\\*[:\\s]*\\n([\\s\\S]*?)(?=\\*\\*(?:${headings.join('|')})|$)`, 'i'),
    new RegExp(`${section}[:\\s]*\\n([\\s\\S]*?)(?=(?:${headings.join('|')})[:\\s]*\\n|$)`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return ''
}
