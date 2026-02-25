import OpenAI from 'openai'

export interface MeetingNotes {
  summary: string
  decisions: string[]
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
}

interface NotesServiceOptions {
  provider: 'openai' | 'ollama'
  apiKey?: string
  ollamaUrl?: string
  ollamaModel?: string
}

export class OpenAIService {
  private client: OpenAI
  private model: string

  constructor(apiKeyOrOptions: string | NotesServiceOptions) {
    if (typeof apiKeyOrOptions === 'string') {
      this.client = new OpenAI({ apiKey: apiKeyOrOptions })
      this.model = 'gpt-4o'
    } else if (apiKeyOrOptions.provider === 'ollama') {
      const baseURL = `${apiKeyOrOptions.ollamaUrl || 'http://localhost:11434'}/v1`
      this.client = new OpenAI({ baseURL, apiKey: 'ollama' })
      this.model = apiKeyOrOptions.ollamaModel || 'llama3.2:latest'
    } else {
      this.client = new OpenAI({ apiKey: apiKeyOrOptions.apiKey })
      this.model = 'gpt-4o'
    }
  }

  async generateNotes(transcript: string): Promise<{ notes: MeetingNotes; rawResponse: unknown }> {
    const useJsonFormat = this.model === 'gpt-4o'

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `You are a meeting notes assistant. Analyze meeting transcripts and produce structured notes.

Return a JSON object with exactly this shape:
{
  "summary": "An executive summary of the meeting in 2-4 paragraphs",
  "decisions": ["Decision 1", "Decision 2"],
  "actionItems": [{"task": "Description", "assignee": "Person or null", "dueDate": "Date or null"}]
}

Rules:
- Summary should capture the key discussion points and outcomes
- Extract every decision that was made, even implicit ones
- Extract every action item, task, or follow-up mentioned
- If an assignee or due date is mentioned, include them
- Return ONLY valid JSON, no markdown fences`
        },
        {
          role: 'user',
          content: transcript
        }
      ],
      ...(useJsonFormat ? { response_format: { type: 'json_object' as const } } : {})
    })

    const responseText = response.choices[0].message.content || '{}'
    const cleaned = responseText.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '')
    const parsed = JSON.parse(cleaned) as MeetingNotes

    return {
      notes: parsed,
      rawResponse: responseText
    }
  }
}
