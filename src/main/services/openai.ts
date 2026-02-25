import OpenAI from 'openai'

export interface MeetingNotes {
  summary: string
  decisions: string[]
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
}

export class OpenAIService {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async generateNotes(transcript: string): Promise<{ notes: MeetingNotes; rawResponse: unknown }> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
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
      response_format: { type: 'json_object' }
    })

    const responseText = response.choices[0].message.content || '{}'
    const parsed = JSON.parse(responseText) as MeetingNotes

    return {
      notes: parsed,
      rawResponse: responseText
    }
  }
}
