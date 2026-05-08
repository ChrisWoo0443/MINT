import OpenAI from 'openai'

export interface MeetingNotes {
  summary: string
  decisions: string[]
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
}

export interface MeetingContext {
  title: string
  startedAt: string
}

interface NotesServiceOptions {
  provider: 'openai' | 'ollama'
  apiKey?: string
  openaiModel?: string
  ollamaUrl?: string
  ollamaModel?: string
}

export const DEFAULT_OPENAI_MODEL = 'gpt-4o'

// Models that support OpenAI's strict json_schema structured-output mode.
const STRUCTURED_OUTPUT_PATTERN = /^(gpt-4o|gpt-4\.1|gpt-5|o[13])/i

const SYSTEM_PROMPT = `You are a meeting notes assistant. Analyze the meeting transcript and produce structured notes.

Return a JSON object with exactly this shape:
{
  "summary": "string",
  "decisions": ["string"],
  "actionItems": [{"task": "string", "assignee": "string or null", "dueDate": "string or null"}]
}

Guidelines:
- summary: 3–6 sentences covering the meeting purpose, main discussion points, and outcome. Do not pad.
- decisions: things the group explicitly resolved or concluded (e.g. "We will use Postgres"). Distinct from tasks.
- actionItems: concrete work to be done by a specific person or the team. Each item needs a task description; include assignee and dueDate only if explicitly stated — never infer them.
- Only include information explicitly stated in the transcript. Do not speculate or fill in details that were not said.
- Return ONLY valid JSON, no markdown fences.`

const NOTES_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'meeting_notes',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        decisions: { type: 'array', items: { type: 'string' } },
        actionItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              assignee: { type: ['string', 'null'] },
              dueDate: { type: ['string', 'null'] }
            },
            required: ['task', 'assignee', 'dueDate'],
            additionalProperties: false
          }
        }
      },
      required: ['summary', 'decisions', 'actionItems'],
      additionalProperties: false
    }
  }
}

export class OpenAIService {
  private client: OpenAI
  private model: string

  constructor(apiKeyOrOptions: string | NotesServiceOptions) {
    if (typeof apiKeyOrOptions === 'string') {
      this.client = new OpenAI({ apiKey: apiKeyOrOptions })
      this.model = DEFAULT_OPENAI_MODEL
    } else if (apiKeyOrOptions.provider === 'ollama') {
      const baseURL = `${apiKeyOrOptions.ollamaUrl || 'http://localhost:11434'}/v1`
      this.client = new OpenAI({ baseURL, apiKey: 'ollama' })
      this.model = apiKeyOrOptions.ollamaModel || 'llama3.2:latest'
    } else {
      this.client = new OpenAI({ apiKey: apiKeyOrOptions.apiKey })
      this.model = apiKeyOrOptions.openaiModel || DEFAULT_OPENAI_MODEL
    }
  }

  async generateNotes(
    transcript: string,
    context?: MeetingContext
  ): Promise<{ notes: MeetingNotes; rawResponse: unknown }> {
    const useStructuredOutput = STRUCTURED_OUTPUT_PATTERN.test(this.model)

    const userContent = context
      ? `Meeting: ${context.title}\nStarted: ${context.startedAt}\n\n${transcript}`
      : transcript

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      ...(useStructuredOutput ? { response_format: NOTES_SCHEMA } : { response_format: { type: 'json_object' as const } })
    })

    const responseText = response.choices[0].message.content || '{}'
    const cleaned = responseText.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '')

    let parsed: MeetingNotes
    try {
      parsed = JSON.parse(cleaned) as MeetingNotes
    } catch {
      parsed = { summary: cleaned, decisions: [], actionItems: [] }
    }

    return {
      notes: parsed,
      rawResponse: responseText
    }
  }

  static async listChatModels(apiKey: string): Promise<string[]> {
    const client = new OpenAI({ apiKey })
    const list = await client.models.list()
    const ids = list.data.map((m) => m.id)
    // Keep chat-completion families, drop audio/embedding/image/moderation models.
    const chatPattern = /^(gpt-|o\d|chatgpt-)/i
    const excludePattern = /(audio|realtime|tts|whisper|embedding|moderation|dall-e|image|search|transcribe)/i
    return ids
      .filter((id) => chatPattern.test(id) && !excludePattern.test(id))
      .sort()
  }
}
