import { readdir, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { PRContext } from './github.js'
import type { LLMProvider } from './llm.js'

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

export async function getNextADRNumber(outDir: string): Promise<string> {
  if (!existsSync(outDir)) {
    return '0001'
  }
  const files = await readdir(outDir)
  const adrFiles = files.filter(f => f.endsWith('.md'))
  const num = adrFiles.length + 1
  return String(num).padStart(4, '0')
}

export function buildPrompt(ctx: PRContext): string {
  const filesSummary = ctx.files
    .map(f => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
    .join('\n')

  const commitMessages = ctx.commits
    .map(c => `- ${c.message.split('\n')[0]} (${c.author})`)
    .join('\n')

  const reviewComments = ctx.reviewComments
    .map(c => `- ${c.author} on ${c.path}:${c.line ?? '?'}: ${c.body}`)
    .join('\n')

  return `You are generating an Architecture Decision Record (ADR) from a GitHub Pull Request.

PR Title: ${ctx.title}
PR Description: ${ctx.body || '(none)'}

Changed Files Summary:
${filesSummary || '(none)'}

Key Commits:
${commitMessages || '(none)'}

Review Comments (discussion):
${reviewComments || '(none)'}

Generate a concise ADR following this structure:
- Context: What problem does this PR solve? What was the situation before?
- Decision: What was decided and implemented? Why this approach?
- Consequences: What are the tradeoffs? What did reviewers highlight?
- Implementation Notes: Key technical details from the diff.

Keep each section to 2-4 sentences. Be specific and technical.`
}

export function parseSection(text: string, section: string): string {
  const headings = ['Context', 'Decision', 'Consequences', 'Implementation Notes']
  const idx = headings.indexOf(section)
  if (idx === -1) return ''

  // Try to match the section heading in the LLM output
  const patterns = [
    new RegExp(`##?\\s*${section}[:\\s]*\\n([\\s\\S]*?)(?=##?\\s*(?:${headings.join('|')})|$)`, 'i'),
    new RegExp(`\\*\\*${section}\\*\\*[:\\s]*\\n([\\s\\S]*?)(?=\\*\\*(?:${headings.join('|')})|$)`, 'i'),
    new RegExp(`${section}[:\\s]*\\n([\\s\\S]*?)(?=(?:${headings.join('|')})[:\\s]*\\n|$)`, 'i'),
  ]

  for (const pat of patterns) {
    const match = text.match(pat)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return ''
}

export function buildADR(
  number: string,
  ctx: PRContext,
  llmText: string,
  date: string
): string {
  const context = parseSection(llmText, 'Context') || '(see PR description)'
  const decision = parseSection(llmText, 'Decision') || '(see PR description)'
  const consequences = parseSection(llmText, 'Consequences') || '(see review comments)'
  const implNotes = parseSection(llmText, 'Implementation Notes') || '(see diff)'

  const reviewers = [
    ...new Set([
      ...ctx.reviews.map(r => r.author),
      ...ctx.reviewComments.map(c => c.author),
    ]),
  ].filter(a => a !== 'unknown' && a !== ctx.author)

  return `# ADR-${number}: ${ctx.title}

Date: ${date}
Status: Proposed

## Context
${context}

## Decision
${decision}

## Consequences
${consequences}

## Implementation Notes
${implNotes}

## References
- PR #${ctx.number}: ${ctx.url}
- Author: ${ctx.author}
- Reviewers: ${reviewers.length > 0 ? reviewers.join(', ') : '(none)'}
`
}

export interface GenerateADROptions {
  outDir: string
  dryRun?: boolean
}

export async function generateADR(
  ctx: PRContext,
  llm: LLMProvider,
  options: GenerateADROptions
): Promise<{ content: string; filePath: string | null }> {
  const prompt = buildPrompt(ctx)
  const llmText = await llm.complete(prompt)

  const date = new Date().toISOString().split('T')[0] ?? new Date().toDateString()
  const number = await getNextADRNumber(options.outDir)
  const content = buildADR(number, ctx, llmText, date)
  const slug = slugify(ctx.title)
  const filename = `${number}-${slug}.md`
  const filePath = join(options.outDir, filename)

  if (!options.dryRun) {
    await mkdir(options.outDir, { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    return { content, filePath }
  }

  return { content, filePath: null }
}
