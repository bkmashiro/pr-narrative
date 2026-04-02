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

export const MAX_DIFF_LENGTH = 8000

export function truncateDiff(diff: string, maxLength: number = MAX_DIFF_LENGTH): string {
  if (diff.length <= maxLength) return diff
  const half = maxLength / 2
  return diff.slice(0, half) + '\n... [truncated] ...\n' + diff.slice(diff.length - half)
}

export function extractFiles(
  files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>
): PRContext['files'] {
  const totalDiff = files.map(file => file.patch ?? '').join('\n')
  const truncatedDiff = truncateDiff(totalDiff)
  let offset = 0

  return files.map(file => {
    const patch = file.patch ?? ''
    const nextOffset = offset + patch.length
    const visiblePatch =
      truncatedDiff === totalDiff
        ? patch
        : truncatedDiff.slice(offset, Math.min(nextOffset, truncatedDiff.length)) || undefined

    offset = nextOffset + 1

    return {
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: visiblePatch,
    }
  })
}

export function extractCommits(
  commits: Array<{
    sha: string
    commit: { message: string; author?: { name?: string | null } | null }
    author?: { login?: string | null } | null
  }>
): PRContext['commits'] {
  return commits.map(commit => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author?.name ?? commit.author?.login ?? 'unknown',
  }))
}

export function filterReviewComments(
  comments: Array<{
    user?: { login?: string | null } | null
    body: string
    path: string
    line?: number | null
  }>
): PRContext['reviewComments'] {
  return comments
    .filter(comment => comment.body.trim().length > 0)
    .map(comment => ({
      author: comment.user?.login ?? 'unknown',
      body: comment.body,
      path: comment.path,
      line: comment.line ?? null,
    }))
}

export function extractReviews(
  reviews: Array<{
    user?: { login?: string | null } | null
    state: string
    body?: string | null
  }>
): PRContext['reviews'] {
  return reviews.map(review => ({
    author: review.user?.login ?? 'unknown',
    state: review.state,
    body: review.body ?? '',
  }))
}

interface GitHubClient {
  pulls: {
    get(args: { owner: string; repo: string; pull_number: number }): Promise<{ data: any }>
    listFiles(args: { owner: string; repo: string; pull_number: number; per_page: number }): Promise<{ data: any[] }>
    listCommits(args: { owner: string; repo: string; pull_number: number; per_page: number }): Promise<{ data: any[] }>
    listReviewComments(args: {
      owner: string
      repo: string
      pull_number: number
      per_page: number
    }): Promise<{ data: any[] }>
    listReviews(args: { owner: string; repo: string; pull_number: number; per_page: number }): Promise<{ data: any[] }>
  }
}

export async function fetchPRContext(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string,
  client?: GitHubClient
): Promise<PRContext> {
  const octokit = client ?? new Octokit({ auth: token })

  const [prRes, filesRes, commitsRes, reviewCommentsRes, reviewsRes] = await Promise.all([
    octokit.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.pulls.listCommits({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.pulls.listReviewComments({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 }),
  ])

  const pr = prRes.data

  const files = extractFiles(filesRes.data)
  const commits = extractCommits(commitsRes.data)
  const reviewComments = filterReviewComments(reviewCommentsRes.data)
  const reviews = extractReviews(reviewsRes.data)

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
