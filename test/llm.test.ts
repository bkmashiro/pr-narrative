import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AnthropicProvider,
  OllamaProvider,
  OpenAIProvider,
  createProvider,
} from '../src/llm.ts'

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

test('Anthropic provider returns an empty string for non-text content blocks', async () => {
  const provider = new AnthropicProvider(
    'claude-test',
    {
      messages: {
        async create() {
          return { content: [{ type: 'tool_use' }] }
        },
      },
    }
  )

  assert.equal(await provider.complete('Summarize this PR'), '')
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

test('Ollama provider throws a helpful error on non-OK responses', async () => {
  const provider = new OllamaProvider('llama-test', async () =>
    new Response('service unavailable', { status: 503, statusText: 'Service Unavailable' })
  )

  await assert.rejects(
    () => provider.complete('Summarize this PR'),
    /Ollama request failed: 503 Service Unavailable/
  )
})

test('missing API key throws a helpful OpenAI error', () => {
  assert.throws(
    () => new OpenAIProvider('gpt-test'),
    /Missing OPENAI_API_KEY environment variable/
  )
})

test('missing API key throws a helpful Anthropic error', () => {
  assert.throws(
    () => new AnthropicProvider('claude-test'),
    /Missing ANTHROPIC_API_KEY environment variable/
  )
})

test('OpenAI provider returns an empty string when the response has no message content', async () => {
  const provider = new OpenAIProvider(
    'gpt-test',
    {
      chat: {
        completions: {
          async create() {
            return { choices: [{}] }
          },
        },
      },
    }
  )

  assert.equal(await provider.complete('Summarize this PR'), '')
})

test('createProvider rejects unknown providers', () => {
  assert.throws(
    () => createProvider('bedrock'),
    /Unknown provider: bedrock/
  )
})

test('createProvider builds each supported provider with default models', () => {
  const originalOpenAIKey = process.env['OPENAI_API_KEY']
  const originalAnthropicKey = process.env['ANTHROPIC_API_KEY']

  process.env['OPENAI_API_KEY'] = 'test-openai-key'
  process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key'

  try {
    assert.equal(createProvider('openai').constructor.name, 'OpenAIProvider')
    assert.equal(createProvider('anthropic').constructor.name, 'AnthropicProvider')
    assert.equal(createProvider('ollama').constructor.name, 'OllamaProvider')
  } finally {
    if (originalOpenAIKey === undefined) {
      delete process.env['OPENAI_API_KEY']
    } else {
      process.env['OPENAI_API_KEY'] = originalOpenAIKey
    }

    if (originalAnthropicKey === undefined) {
      delete process.env['ANTHROPIC_API_KEY']
    } else {
      process.env['ANTHROPIC_API_KEY'] = originalAnthropicKey
    }
  }
})
