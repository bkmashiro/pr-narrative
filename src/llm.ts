import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export interface LLMProvider {
  complete(prompt: string): Promise<string>
}

interface OpenAIClientLike {
  chat: {
    completions: {
      create(args: any): Promise<any>
    }
  }
}

interface AnthropicClientLike {
  messages: {
    create(args: any): Promise<any>
  }
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAIClientLike
  private model: string

  constructor(model: string, client?: OpenAIClientLike, apiKey?: string) {
    if (!client) {
      const resolvedApiKey = apiKey ?? process.env['OPENAI_API_KEY']
      if (!resolvedApiKey) {
        throw new Error(
          'Missing OPENAI_API_KEY environment variable.\n' +
          'Set it with: export OPENAI_API_KEY=sk-...\n' +
          'Get your key at: https://platform.openai.com/api-keys'
        )
      }
      this.client = new OpenAI({ apiKey: resolvedApiKey })
    } else {
      this.client = client
    }
    this.model = model
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    })
    return response.choices[0]?.message?.content ?? ''
  }
}

export class AnthropicProvider implements LLMProvider {
  private client: AnthropicClientLike
  private model: string

  constructor(model: string, client?: AnthropicClientLike, apiKey?: string) {
    if (!client) {
      const resolvedApiKey = apiKey ?? process.env['ANTHROPIC_API_KEY']
      if (!resolvedApiKey) {
        throw new Error(
          'Missing ANTHROPIC_API_KEY environment variable.\n' +
          'Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n' +
          'Get your key at: https://console.anthropic.com/settings/keys'
        )
      }
      this.client = new Anthropic({ apiKey: resolvedApiKey })
    } else {
      this.client = client
    }
    this.model = model
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = response.content[0] as { type: string; text?: string } | undefined
    if (block?.type === 'text') return block.text ?? ''
    return ''
  }
}

export class OllamaProvider implements LLMProvider {
  private model: string
  private fetchImpl: typeof fetch
  private baseUrl: string

  constructor(
    model: string,
    fetchImpl: typeof fetch = fetch,
    baseUrl: string = 'http://localhost:11434/api/generate'
  ) {
    this.model = model
    this.fetchImpl = fetchImpl
    this.baseUrl = baseUrl
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.fetchImpl(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}\n` +
        'Make sure Ollama is running: ollama serve'
      )
    }

    const data = (await response.json()) as { response: string }
    return data.response
  }
}

export const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-3',
  ollama: 'llama3.2',
}

export function createProvider(provider: string, model?: string): LLMProvider {
  const resolvedModel = model ?? DEFAULT_MODELS[provider] ?? ''

  switch (provider) {
    case 'openai':
      return new OpenAIProvider(resolvedModel)
    case 'anthropic':
      return new AnthropicProvider(resolvedModel)
    case 'ollama':
      return new OllamaProvider(resolvedModel)
    default:
      throw new Error(
        `Unknown provider: ${provider}\n` +
        'Supported providers: openai, anthropic, ollama'
      )
  }
}
