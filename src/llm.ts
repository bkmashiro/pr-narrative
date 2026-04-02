import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export interface LLMProvider {
  complete(prompt: string): Promise<string>
}

class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  private model: string

  constructor(model: string) {
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey) {
      throw new Error(
        'Missing OPENAI_API_KEY environment variable.\n' +
        'Set it with: export OPENAI_API_KEY=sk-...\n' +
        'Get your key at: https://platform.openai.com/api-keys'
      )
    }
    this.client = new OpenAI({ apiKey })
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

class AnthropicProvider implements LLMProvider {
  private client: Anthropic
  private model: string

  constructor(model: string) {
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) {
      throw new Error(
        'Missing ANTHROPIC_API_KEY environment variable.\n' +
        'Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n' +
        'Get your key at: https://console.anthropic.com/settings/keys'
      )
    }
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = response.content[0]
    if (block.type === 'text') return block.text
    return ''
  }
}

class OllamaProvider implements LLMProvider {
  private model: string

  constructor(model: string) {
    this.model = model
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch('http://localhost:11434/api/generate', {
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

const DEFAULT_MODELS: Record<string, string> = {
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
