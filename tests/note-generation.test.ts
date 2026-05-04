import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/mint-test' }
}))

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return { ...actual, appendFile: vi.fn().mockResolvedValue(undefined) }
})

describe('getFullTranscript timestamp format', () => {
  it('includes [mm:ss] timestamps in transcript lines', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService('/tmp/mint-test')

    await (service as never)['insertTranscriptChunk'](
      'test-meeting',
      'Alice',
      'Hello everyone',
      65,
      67
    )

    const transcript = await service.getFullTranscript('test-meeting')
    expect(transcript).toContain('[01:05] Alice: Hello everyone')
  })

  it('falls back to Unknown when speaker is null', async () => {
    const { LocalStorageService } = await import('../src/main/services/local-storage')
    const service = new LocalStorageService('/tmp/mint-test')

    await (service as never)['insertTranscriptChunk']('test-meeting', null, 'Testing', 0, 1)

    const transcript = await service.getFullTranscript('test-meeting')
    expect(transcript).toContain('[00:00] Unknown: Testing')
  })
})

describe('generateNotes temperature', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('calls the model with temperature 0.2', async () => {
    const { OpenAIService } = await import('../src/main/services/openai')
    const service = new OpenAIService({ provider: 'openai', apiKey: 'test-key' })

    const createSpy = vi.spyOn(service['client'].chat.completions, 'create').mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ summary: 'S', decisions: [], actionItems: [] })
          }
        }
      ]
    } as never)

    await service.generateNotes('Speaker: Hello')

    const callArgs = createSpy.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.temperature).toBe(0.2)
  })
})

describe('generateNotes structured outputs (GPT-4o)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('uses json_schema response format for gpt-4o', async () => {
    const { OpenAIService } = await import('../src/main/services/openai')
    const service = new OpenAIService({ provider: 'openai', apiKey: 'test-key' })

    const createSpy = vi.spyOn(service['client'].chat.completions, 'create').mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ summary: 'S', decisions: [], actionItems: [] })
          }
        }
      ]
    } as never)

    await service.generateNotes('Speaker: Hello')

    const callArgs = createSpy.mock.calls[0][0] as Record<string, unknown>
    const responseFormat = callArgs.response_format as Record<string, unknown>
    expect(responseFormat?.type).toBe('json_schema')
  })

  it('does not use json_schema for ollama', async () => {
    const { OpenAIService } = await import('../src/main/services/openai')
    const service = new OpenAIService({
      provider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2'
    })

    const createSpy = vi.spyOn(service['client'].chat.completions, 'create').mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ summary: 'S', decisions: [], actionItems: [] })
          }
        }
      ]
    } as never)

    await service.generateNotes('Speaker: Hello')

    const callArgs = createSpy.mock.calls[0][0] as Record<string, unknown>
    const responseFormat = callArgs.response_format as Record<string, unknown> | undefined
    expect(responseFormat?.type).not.toBe('json_schema')
  })
})

describe('generateNotes meeting context', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('includes meeting title in the user message when context is provided', async () => {
    const { OpenAIService } = await import('../src/main/services/openai')
    const service = new OpenAIService({ provider: 'openai', apiKey: 'test-key' })

    const createSpy = vi.spyOn(service['client'].chat.completions, 'create').mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ summary: 'S', decisions: [], actionItems: [] })
          }
        }
      ]
    } as never)

    await service.generateNotes('Speaker: Hello', {
      title: 'Q2 Planning Session',
      startedAt: '2026-05-03T10:00:00Z'
    })

    const callArgs = createSpy.mock.calls[0][0] as Record<string, unknown>
    const messages = callArgs.messages as Array<{ role: string; content: string }>
    const userMessage = messages.find((m) => m.role === 'user')
    expect(userMessage?.content).toContain('Q2 Planning Session')
  })

  it('includes startedAt in the user message when context is provided', async () => {
    const { OpenAIService } = await import('../src/main/services/openai')
    const service = new OpenAIService({ provider: 'openai', apiKey: 'test-key' })

    const createSpy = vi.spyOn(service['client'].chat.completions, 'create').mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ summary: 'S', decisions: [], actionItems: [] })
          }
        }
      ]
    } as never)

    await service.generateNotes('Speaker: Hello', {
      title: 'Standup',
      startedAt: '2026-05-03T09:00:00Z'
    })

    const callArgs = createSpy.mock.calls[0][0] as Record<string, unknown>
    const messages = callArgs.messages as Array<{ role: string; content: string }>
    const userMessage = messages.find((m) => m.role === 'user')
    expect(userMessage?.content).toContain('2026-05-03T09:00:00Z')
  })

  it('works without context (backward compatible)', async () => {
    const { OpenAIService } = await import('../src/main/services/openai')
    const service = new OpenAIService({ provider: 'openai', apiKey: 'test-key' })

    vi.spyOn(service['client'].chat.completions, 'create').mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ summary: 'S', decisions: [], actionItems: [] })
          }
        }
      ]
    } as never)

    await expect(service.generateNotes('Speaker: Hello')).resolves.not.toThrow()
  })
})
