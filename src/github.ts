import { Octokit } from '@octokit/rest'

export interface PRContext {
  title: string
  body: string
  number: number
  url: string
  author: string
  baseBranch: string
  headBranch: string
  mergedAt: string | null
  files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>
  commits: Array<{ sha: string; message: string; author: string }>
  reviewComments: Array<{ author: string; body: string; path: string; line: number | null }>
  reviews: Array<{ author: string; state: string; body: string }>
}

function truncateDiff(diff: string, maxLength: number = 8000): string {
  if (diff.length <= maxLength) return diff
  const half = maxLength / 2
  return diff.slice(0, half) + '\n... [truncated] ...\n' + diff.slice(diff.length - half)
}

export async function fetchPRContext(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<PRContext> {
  const octokit = new Octokit({ auth: token })

  const [prRes, filesRes, commitsRes, reviewCommentsRes, reviewsRes] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.pulls.listCommits({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.pulls.listReviewComments({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 }),
  ])

  const pr = prRes.data

  // Combine all diffs and truncate if needed
  let totalDiff = filesRes.data.map(f => f.patch ?? '').join('\n')
  totalDiff = truncateDiff(totalDiff)

  // Re-distribute truncated diff back to files proportionally (simplified: just include patches as-is up to limit)
  const files = filesRes.data.map(f => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }))

  const commits = commitsRes.data.map(c => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
  }))

  const reviewComments = reviewCommentsRes.data.map(c => ({
    author: c.user?.login ?? 'unknown',
    body: c.body,
    path: c.path,
    line: c.line ?? null,
  }))

  const reviews = reviewsRes.data.map(r => ({
    author: r.user?.login ?? 'unknown',
    state: r.state,
    body: r.body ?? '',
  }))

  return {
    title: pr.title,
    body: pr.body ?? '',
    number: pr.number,
    url: pr.html_url,
    author: pr.user?.login ?? 'unknown',
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    mergedAt: pr.merged_at ?? null,
    files,
    commits,
    reviewComments,
    reviews,
  }
}
