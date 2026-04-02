#!/usr/bin/env node

import { Command } from 'commander'
import { execSync } from 'child_process'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { resolveConfig, type Config } from './config.js'
import { fetchPRContext } from './github.js'
import { createProvider } from './llm.js'
import { generateADR } from './adr.js'
import { log } from './formatter.js'

const program = new Command()

program
  .name('pr-narrative')
  .description('Turn your PR history into ADRs automatically')
  .version('0.1.0')

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
  .action(async (opts: {
    pr: number
    repo?: string
    out: string
    provider: string
    model?: string
    dryRun?: boolean
    token?: string
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
          const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim()
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

      log.step('📝 Generating ADR...')
      const llm = createProvider(provider, model)

      const result = await generateADR(ctx, llm, {
        outDir,
        dryRun: opts.dryRun,
      })

      if (opts.dryRun) {
        console.log('\n' + result.content)
      } else {
        log.success(`Written: ${result.filePath}`)
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
    }
    await writeFile(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf-8')
    log.success(`Created ${configPath}`)
    log.info('Edit the file to set your repository, provider, and token.')
  })

program.parse()
