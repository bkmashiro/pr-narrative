# pr-narrative

Turn your PR history into Architecture Decision Records (ADRs) automatically.

## Installation

```bash
npm install -g pr-narrative
```

## Usage

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
