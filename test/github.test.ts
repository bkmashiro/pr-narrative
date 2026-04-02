import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchPRContext,
  truncateDiff,
  filterReviewComments,
  extractReviews,
} from '../src/github.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const fixturePath = join(__dirname, 'fixtures', 'mock-pr-data.json')

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf-8')) as {
    pr: any
    files: any[]
    commits: any[]
    reviewComments: any[]
    reviews: any[]
  }
}

function createMockClient(fixture: Awaited<ReturnType<typeof loadFixture>>) {
  return {
    pulls: {
      async get() {
        return { data: fixture.pr }
      },
      async listFiles() {
        return { data: fixture.files }
      },
      async listCommits() {
        return { data: fixture.commits }
      },
      async listReviewComments() {
        return { data: fixture.reviewComments }
      },
      async listReviews() {
        return { data: fixture.reviews }
      },
    },
  }
}

test('fetchPRContext structures PR metadata', async () => {
  const fixture = await loadFixture()
  const ctx = await fetchPRContext('acme', 'pr-narrative', 42, undefined, createMockClient(fixture))

  assert.equal(ctx.title, fixture.pr.title)
  assert.equal(ctx.body, fixture.pr.body)
  assert.equal(ctx.author, fixture.pr.user.login)
  assert.equal(ctx.baseBranch, fixture.pr.base.ref)
  assert.equal(ctx.headBranch, fixture.pr.head.ref)
})

test('fetchPRContext extracts file names from files response', async () => {
  const fixture = await loadFixture()
  const ctx = await fetchPRContext('acme', 'pr-narrative', 42, undefined, createMockClient(fixture))

  assert.deepEqual(
    ctx.files.map(file => file.filename),
    ['src/auth.ts', 'src/session.ts']
  )
})

test('truncateDiff keeps the first and last 4000 characters when diff exceeds 8000', () => {
  const longDiff = 'a'.repeat(4500) + 'b'.repeat(4500)
  const truncated = truncateDiff(longDiff)

  assert.equal(truncated.slice(0, 4000), 'a'.repeat(4000))
  assert.equal(truncated.slice(-4000), 'b'.repeat(4000))
  assert.match(truncated, /\[truncated\]/)
})

test('fetchPRContext extracts commit messages from commits response', async () => {
  const fixture = await loadFixture()
  const ctx = await fetchPRContext('acme', 'pr-narrative', 42, undefined, createMockClient(fixture))

  assert.deepEqual(
    ctx.commits.map(commit => commit.message),
    ['Fix token refresh\n\nHandle retry edge cases', 'Add session helper']
  )
})

test('filterReviewComments drops blank review comments', async () => {
  const fixture = await loadFixture()
  const comments = filterReviewComments(fixture.reviewComments)

  assert.equal(comments.length, 1)
  assert.equal(comments[0]?.author, 'reviewer1')
  assert.equal(comments[0]?.path, 'src/auth.ts')
})

test('extractReviews includes author information from reviews', async () => {
  const fixture = await loadFixture()
  const reviews = extractReviews(fixture.reviews)

  assert.deepEqual(
    reviews.map(review => ({ author: review.author, state: review.state })),
    [
      { author: 'reviewer1', state: 'APPROVED' },
      { author: 'reviewer3', state: 'COMMENTED' },
    ]
  )
})
