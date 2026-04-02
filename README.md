[![npm](https://img.shields.io/npm/v/pr-narrative)](https://www.npmjs.com/package/pr-narrative) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# pr-narrative

Turn your PR history into Architecture Decision Records (ADRs) automatically.

## Installation

```bash
npm install -g pr-narrative
```

## Usage

### Generate release notes from a commit range

```bash
pr-narrative --release-notes --from v1.0.0 --to v1.1.0
```

Options:
- `--release-notes` — Generate release notes markdown from a git range
- `--from <ref>` — Starting git ref, tag, or commit (required)
- `--to <ref>` — Ending git ref, tag, or commit (default: `HEAD`)

Commit subjects are grouped by conventional commit prefix:
- `feat` → `New Features`
- `fix` → `Bug Fixes`
- `perf`, `chore`, and uncategorized commits → `Improvements`
- `deps` → `Dependencies`

PR references like `#123` are extracted from commit messages and appended to each bullet when present.

### Update CHANGELOG.md

```bash
pr-narrative --changelog --from v1.0.0 --to v1.1.0
```

This generates the same release notes markdown and prepends it to `CHANGELOG.md`.

### Generate an ADR from a PR

```bash
pr-narrative generate --pr 234 --repo owner/repo
```

Options:
- `--pr <number>` — PR number (required)
- `--repo <owner/repo>` — Repository (auto-detected from git remote if omitted)
- `--out <dir>` — Output directory (default: `docs/decisions/`)
- `--provider <name>` — LLM provider: `openai` | `anthropic` | `ollama` (default: `openai`)
- `--model <name>` — Model name (defaults: `gpt-4o-mini` / `claude-haiku-3` / `llama3.2`)
- `--dry-run` — Print ADR to stdout without writing a file
- `--token <token>` — GitHub token (or set `GITHUB_TOKEN` env var)
- `--template <file>` — Render the generated output with a custom markdown template
- `--jira` — Extract JIRA tickets from commit messages and append a `Related Issues` section
- `--jira-url <base>` — JIRA base URL (defaults to `JIRA_URL` env var)

### Custom templates

`--template` accepts a markdown file with simple mustache-style placeholders:

- `{{summary}}`
- `{{changes}}`
- `{{files_changed}}`
- `{{insertions}}`
- `{{deletions}}`
- `{{breaking_changes}}`
- `{{commits}}`

It also supports simple conditional blocks:

```md
{{#if breaking_changes}}
## Breaking Changes
{{breaking_changes}}
{{/if}}
```

Example:

```bash
pr-narrative generate --pr 234 --repo owner/repo --template .github/pr-template.md
```

### JIRA references

When `--jira` is enabled, commit messages are scanned for ticket keys like `PROJ-123` and appended as a `Related Issues` section.

```bash
export JIRA_URL=https://your-jira.atlassian.net
pr-narrative generate --pr 234 --repo owner/repo --jira
```

### Initialize config

```bash
pr-narrative init
```

Creates `pr-narrative.config.json` in the current directory.

## Configuration

Create `pr-narrative.config.json`:

```json
{
  "repo": "owner/repo",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "out": "docs/decisions/",
  "githubToken": "ghp_..."
}
```

## Environment Variables

- `OPENAI_API_KEY` — Required for OpenAI provider
- `ANTHROPIC_API_KEY` — Required for Anthropic provider
- `GITHUB_TOKEN` — GitHub personal access token
- `JIRA_URL` — Default JIRA base URL for `--jira-url`

## Providers

### OpenAI
```bash
export OPENAI_API_KEY=sk-...
pr-narrative generate --pr 42 --provider openai --model gpt-4o-mini
```

### Anthropic
```bash
export ANTHROPIC_API_KEY=sk-ant-...
pr-narrative generate --pr 42 --provider anthropic --model claude-haiku-3
```

### Ollama (local)
```bash
ollama serve
pr-narrative generate --pr 42 --provider ollama --model llama3.2
```

## ADR Output Format

```markdown
# ADR-0001: Fix auth token handling

Date: 2024-01-15
Status: Proposed

## Context
...

## Decision
...

## Consequences
...

## Implementation Notes
...

## References
- PR #42: https://github.com/owner/repo/pull/42
- Author: username
- Reviewers: reviewer1, reviewer2
```
