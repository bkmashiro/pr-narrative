#!/usr/bin/env node

import { Command } from 'commander'
import { execFileSync } from 'child_process'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { resolveConfig, type Config } from './config.js'
import { fetchPRContext } from './github.js'
import { createProvider } from './llm.js'
import { generateADR } from './adr.js'
import { log } from './formatter.js'
import { extractJiraTickets } from './jira.js'
import {
  buildGitLogFormat,
  buildReleaseNotes,
  formatReleaseNotes,
  parseGitLog,
  prependReleaseNotesToChangelog,
} from './release-notes.js'

const program = new Command()

program
  .name('pr-narrative')
  .description('Turn your PR history into ADRs automatically')
  .version('0.2.0')
  .option('--release-notes', 'Generate release notes from a git commit range')
  .option('--changelog', 'Prepend generated release notes to CHANGELOG.md')
  .option('--from <ref>', 'Starting git ref (exclusive) for release notes')
  .option('--to <ref>', 'Ending git ref (inclusive) for release notes', 'HEAD')
  .action(async (opts: {
    releaseNotes?: boolean
    changelog?: boolean
    from?: string
    to: string
  }) => {
    if (!opts.releaseNotes && !opts.changelog) {
      program.help()
    }

    if (opts.releaseNotes && opts.changelog) {
      log.error('Choose either --release-notes or --changelog')
      process.exit(1)
    }

    if (!opts.from) {
      log.error('Use --from <ref> to define the git range start')
      process.exit(1)
    }

    try {
      const rawLog = execFileSync(
        'git',
        ['log', `${opts.from}..${opts.to}`, `--format=${buildGitLogFormat()}`],
        { encoding: 'utf-8' }
      )
      const commits = parseGitLog(rawLog)
      const notes = formatReleaseNotes(buildReleaseNotes(commits, opts.to))

      if (opts.releaseNotes) {
        process.stdout.write(notes)
        return
      }

      log.step('Prepending release notes to CHANGELOG.md...')
      const changelogPath = join(process.cwd(), 'CHANGELOG.md')
      let existingContent = ''

      try {
        existingContent = await readFile(changelogPath, 'utf-8')
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException
        if (nodeError.code !== 'ENOENT') {
          throw error
        }
      }

      await writeFile(changelogPath, prependReleaseNotesToChangelog(existingContent, notes), 'utf-8')
      log.success('Updated CHANGELOG.md')
    } catch (err) {
      if (err instanceof Error) {
        log.error(err.message)
      } else {
        log.error(String(err))
      }
      process.exit(1)
    }
  })

program
  .command('generate')
  .description('Generate an ADR from a GitHub Pull Request')
  .requiredOption('--pr <number>', 'PR number', parseInt)
  .option('--repo <owner/repo>', 'Repository (or auto-detect from git remote)')
  .option('--out <dir>', 'Output directory', 'docs/decisions/')
  .option('--provider <name>', 'LLM provider: openai|anthropic|ollama', 'openai')
  .option('--model <name>', 'Model name')
  .option('--dry-run', 'Print ADR to stdout, do not write file')
  .option('--token <token>', 'GitHub token (or GITHUB_TOKEN env)')
  .option('--template <file>', 'Custom markdown template file')
  .option('--jira', 'Extract JIRA tickets from commit messages')
  .option('--jira-url <base>', 'JIRA base URL (or JIRA_URL env)')
  .action(async (opts: {
    pr: number
    repo?: string
    out: string
    provider: string
    model?: string
    dryRun?: boolean
    token?: string
    template?: string
    jira?: boolean
    jiraUrl?: string
  }) => {
    try {
      const config = await resolveConfig({
        repo: opts.repo,
        provider: opts.provider as Config['provider'],
        model: opts.model,
        out: opts.out,
        githubToken: opts.token,
      })

      // Resolve repo
      let repo = opts.repo ?? config.repo
      if (!repo) {
        try {
          const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' }).trim()
          // Handle both https and ssh formats
          const httpsMatch = remoteUrl.match(/github\.com[/:](.+?\/.+?)(?:\.git)?$/)
          if (httpsMatch?.[1]) {
            repo = httpsMatch[1]
          }
        } catch {
          log.error('Could not auto-detect repo from git remote. Use --repo owner/repo')
          process.exit(1)
        }
      }

      if (!repo) {
        log.error('No repository specified. Use --repo owner/repo or set repo in config.')
        process.exit(1)
      }

      const [owner, repoName] = repo.split('/')
      if (!owner || !repoName) {
        log.error(`Invalid repo format: ${repo}. Expected owner/repo`)
        process.exit(1)
      }

      const token = config.githubToken ?? process.env['GITHUB_TOKEN']
      const provider = config.provider ?? 'openai'
      const model = config.model
      const outDir = config.out ?? 'docs/decisions/'

      log.step(`🔍 Fetching PR #${opts.pr}...`)
      const ctx = await fetchPRContext(owner, repoName, opts.pr, token)

      const template = opts.template
        ? await readFile(opts.template, 'utf-8')
        : undefined
      if (opts.template) {
        log.info(`Using custom template: ${opts.template}`)
      }

      const jiraTickets = opts.jira
        ? extractJiraTickets(ctx.commits.map(commit => commit.message))
        : []
      const jiraBaseUrl = opts.jiraUrl ?? process.env['JIRA_URL']
      if (opts.jira && jiraTickets.length > 0) {
        log.info(`Detected JIRA tickets: ${jiraTickets.join(', ')}`)
      }

      log.step('📝 Generating ADR...')
      const llm = createProvider(provider, model)

      const result = await generateADR(ctx, llm, {
        outDir,
        dryRun: opts.dryRun,
        template,
        jiraTickets,
        jiraBaseUrl,
      })

      if (opts.dryRun) {
        console.log('\n' + result.content)
      } else {
        log.success(`Written: ${result.filePath}`)
        if (template) {
          log.success('Generated ADR with custom format.')
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        log.error(err.message)
      } else {
        log.error(String(err))
      }
      process.exit(1)
    }
  })

program
  .command('init')
  .description('Create pr-narrative.config.json with defaults')
  .action(async () => {
    const configPath = join(process.cwd(), 'pr-narrative.config.json')
    const defaultConfig = {
      repo: '',
      provider: 'openai',
      model: 'gpt-4o-mini',
      out: 'docs/decisions/',
      githubToken: '',
      jiraUrl: '',
    }
    await writeFile(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf-8')
    log.success(`Created ${configPath}`)
    log.info('Edit the file to set your repository, provider, and token.')
  })

program.parse()
