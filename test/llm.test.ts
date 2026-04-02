import test from 'node:test'
import assert from 'node:assert/strict'
import { AnthropicProvider, OllamaProvider, OpenAIProvider } from '../src/llm.ts'

test('OpenAI provider formats the prompt as a chat completion user message', async () => {
  let request: any
  const provider = new OpenAIProvider(
    'gpt-test',
    {
      chat: {
        completions: {
          async create(args) {
            request = args
            return { choices: [{ message: { content: 'ok' } }] }
          },
        },
      },
    }
  )

  const result = await provider.complete('Summarize this PR')

  assert.equal(result, 'ok')
  assert.deepEqual(request, {
    model: 'gpt-test',
    messages: [{ role: 'user', content: 'Summarize this PR' }],
  })
})

test('Anthropic provider formats the prompt as a messages API request', async () => {
  let request: any
  const provider = new AnthropicProvider(
    'claude-test',
    {
      messages: {
        async create(args) {
          request = args
          return { content: [{ type: 'text', text: 'ok' }] }
        },
      },
    }
  )

  const result = await provider.complete('Summarize this PR')

  assert.equal(result, 'ok')
  assert.deepEqual(request, {
    model: 'claude-test',
    max_tokens: 2048,
    messages: [{ role: 'user', content: 'Summarize this PR' }],
  })
})

test('Ollama provider posts to the local generate endpoint', async () => {
  let url = ''
  let init: RequestInit | undefined
  const provider = new OllamaProvider('llama-test', async (input, requestInit) => {
    url = String(input)
    init = requestInit
    return new Response(JSON.stringify({ response: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const result = await provider.complete('Summarize this PR')

  assert.equal(result, 'ok')
  assert.equal(url, 'http://localhost:11434/api/generate')
  assert.equal(init?.method, 'POST')
  assert.match(String(init?.body), /"model":"llama-test"/)
  assert.match(String(init?.body), /"prompt":"Summarize this PR"/)
})

test('missing API key throws a helpful OpenAI error', () => {
  assert.throws(
    () => new OpenAIProvider('gpt-test'),
    /Missing OPENAI_API_KEY environment variable/
  )
})
