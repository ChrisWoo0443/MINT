import { createClient, SupabaseClient } from '@supabase/supabase-js'

export class SupabaseService {
  private client: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey)
  }

  setAccessToken(token: string): void {
    this.client = createClient(
      process.env.VITE_SUPABASE_URL || '',
      process.env.VITE_SUPABASE_ANON_KEY || '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
  }

  async createMeeting(userId: string, title: string): Promise<string> {
    const { data, error } = await this.client
      .from('meetings')
      .insert({ user_id: userId, title, status: 'recording' })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  async updateMeetingStatus(meetingId: string, status: string, endedAt?: string): Promise<void> {
    const update: Record<string, unknown> = { status }
    if (endedAt) update.ended_at = endedAt
    const { error } = await this.client.from('meetings').update(update).eq('id', meetingId)
    if (error) throw error
  }

  async insertTranscriptChunk(
    meetingId: string,
    speaker: string | null,
    content: string,
    timestampStart: number,
    timestampEnd: number
  ): Promise<void> {
    const { error } = await this.client.from('transcripts').insert({
      meeting_id: meetingId,
      speaker,
      content,
      timestamp_start: timestampStart,
      timestamp_end: timestampEnd
    })
    if (error) throw error
  }

  async getFullTranscript(meetingId: string): Promise<string> {
    const { data, error } = await this.client
      .from('transcripts')
      .select('speaker, content, timestamp_start')
      .eq('meeting_id', meetingId)
      .order('timestamp_start', { ascending: true })
    if (error) throw error
    return data.map((row) => `${row.speaker ?? 'Unknown'}: ${row.content}`).join('\n')
  }

  async saveNotes(
    meetingId: string,
    summary: string,
    decisions: string[],
    actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>,
    rawResponse: unknown
  ): Promise<void> {
    const { error } = await this.client.from('notes').insert({
      meeting_id: meetingId,
      summary,
      decisions,
      action_items: actionItems,
      raw_gemini_response: rawResponse
    })
    if (error) throw error
  }
}
