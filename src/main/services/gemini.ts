import { GoogleGenerativeAI } from '@google/generative-ai'

export interface MeetingNotes {
  summary: string
  decisions: string[]
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
}

export class GeminiService {
  private genAI: GoogleGenerativeAI

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
  }

  async generateNotes(transcript: string): Promise<{ notes: MeetingNotes; rawResponse: unknown }> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `You are a meeting notes assistant. Analyze this meeting transcript and produce structured notes.

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
- Return ONLY valid JSON, no markdown fences

Transcript:
${transcript}`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    const parsed = JSON.parse(responseText) as MeetingNotes

    return {
      notes: parsed,
      rawResponse: responseText
    }
  }
}
