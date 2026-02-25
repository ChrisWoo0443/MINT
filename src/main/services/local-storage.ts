import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile, readdir, rm } from 'fs/promises'

export interface MeetingMetadata {
  id: string
  title: string
  status: string
  startedAt: string
  endedAt: string | null
}

export interface TranscriptEntry {
  speaker: string | null
  content: string
  timestampStart: number
  timestampEnd: number
}

export interface NoteData {
  summary: string
  decisions: string[]
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
}

export class LocalStorageService {
  private storagePath: string
  private transcriptBuffers: Map<string, TranscriptEntry[]> = new Map()

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? join(app.getPath('documents'), 'MINT')
  }

  getStoragePath(): string {
    return this.storagePath
  }

  setStoragePath(newPath: string): void {
    this.storagePath = newPath
  }

  async createMeeting(title: string): Promise<string> {
    await this.ensureStorageDir()

    const now = new Date()
    const isoTimestamp = now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '')
    const titleSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const meetingFolderName = `${isoTimestamp}_${titleSlug}`
    const meetingPath = join(this.storagePath, meetingFolderName)

    await mkdir(meetingPath, { recursive: true })

    const metadata: MeetingMetadata = {
      id: meetingFolderName,
      title,
      status: 'recording',
      startedAt: now.toISOString(),
      endedAt: null
    }

    await writeFile(join(meetingPath, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')

    const transcriptHeader = `# Transcript — ${title}\n\n`
    await writeFile(join(meetingPath, 'transcript.md'), transcriptHeader, 'utf-8')

    this.transcriptBuffers.set(meetingFolderName, [])

    return meetingFolderName
  }

  async updateMeetingStatus(meetingId: string, status: string, endedAt?: string): Promise<void> {
    const metadataPath = join(this.storagePath, meetingId, 'metadata.json')
    const metadata = await this.readMetadataFile(metadataPath)
    metadata.status = status
    if (endedAt) {
      metadata.endedAt = endedAt
    }
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  }

  async insertTranscriptChunk(
    meetingId: string,
    speaker: string | null,
    content: string,
    timestampStart: number,
    timestampEnd: number
  ): Promise<void> {
    const transcriptPath = join(this.storagePath, meetingId, 'transcript.md')
    const formattedTimestamp = this.formatTimestamp(timestampStart)
    const speakerLabel = speaker ?? 'Unknown'
    const transcriptLine = `[${formattedTimestamp}] **${speakerLabel}**: ${content}\n`

    await appendToFile(transcriptPath, transcriptLine)

    const entry: TranscriptEntry = { speaker, content, timestampStart, timestampEnd }
    const buffer = this.transcriptBuffers.get(meetingId) ?? []
    buffer.push(entry)
    this.transcriptBuffers.set(meetingId, buffer)
  }

  async getFullTranscript(meetingId: string): Promise<string> {
    const buffer = this.transcriptBuffers.get(meetingId)
    if (buffer && buffer.length > 0) {
      return buffer.map((entry) => `${entry.speaker ?? 'Unknown'}: ${entry.content}`).join('\n')
    }

    return this.parseTranscriptFileAsPlainText(meetingId)
  }

  async saveNotes(
    meetingId: string,
    summary: string,
    decisions: string[],
    actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
  ): Promise<void> {
    const metadata = await this.getMeeting(meetingId)
    const notesPath = join(this.storagePath, meetingId, 'notes.md')

    const decisionLines = decisions.map((decision) => `- ${decision}`).join('\n')

    const actionItemLines = actionItems
      .map((item) => {
        let line = `- [ ] ${item.task}`
        if (item.assignee) line += ` — ${item.assignee}`
        if (item.dueDate) line += ` (due: ${item.dueDate})`
        return line
      })
      .join('\n')

    const notesContent = [
      `# Notes — ${metadata.title}`,
      '',
      '## Summary',
      summary,
      '',
      '## Decisions',
      decisionLines || '- None',
      '',
      '## Action Items',
      actionItemLines || '- [ ] None',
      ''
    ].join('\n')

    await writeFile(notesPath, notesContent, 'utf-8')
  }

  async listMeetings(): Promise<MeetingMetadata[]> {
    await this.ensureStorageDir()

    const entries = await readdir(this.storagePath, { withFileTypes: true })
    const meetings: MeetingMetadata[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const metadataPath = join(this.storagePath, entry.name, 'metadata.json')
        const metadata = await this.readMetadataFile(metadataPath)
        meetings.push(metadata)
      } catch {
        // Skip directories without valid metadata
      }
    }

    meetings.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )

    return meetings
  }

  async getMeeting(meetingId: string): Promise<MeetingMetadata> {
    const metadataPath = join(this.storagePath, meetingId, 'metadata.json')
    return this.readMetadataFile(metadataPath)
  }

  async getNote(meetingId: string): Promise<NoteData | null> {
    const notesPath = join(this.storagePath, meetingId, 'notes.md')
    let notesContent: string
    try {
      notesContent = await readFile(notesPath, 'utf-8')
    } catch {
      return null
    }

    return this.parseNotesMarkdown(notesContent)
  }

  async getTranscripts(meetingId: string): Promise<TranscriptEntry[]> {
    const transcriptPath = join(this.storagePath, meetingId, 'transcript.md')
    let transcriptContent: string
    try {
      transcriptContent = await readFile(transcriptPath, 'utf-8')
    } catch {
      return []
    }

    return this.parseTranscriptMarkdown(transcriptContent)
  }

  async deleteMeeting(meetingId: string): Promise<void> {
    const meetingPath = join(this.storagePath, meetingId)
    await rm(meetingPath, { recursive: true, force: true })
    this.transcriptBuffers.delete(meetingId)
  }

  async renameMeeting(meetingId: string, newTitle: string): Promise<void> {
    const metadataPath = join(this.storagePath, meetingId, 'metadata.json')
    const metadata = await this.readMetadataFile(metadataPath)
    metadata.title = newTitle
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  }

  clearTranscriptBuffer(meetingId: string): void {
    this.transcriptBuffers.delete(meetingId)
  }

  // --- Private helpers ---

  private async ensureStorageDir(): Promise<void> {
    await mkdir(this.storagePath, { recursive: true })
  }

  private async readMetadataFile(metadataPath: string): Promise<MeetingMetadata> {
    const rawContent = await readFile(metadataPath, 'utf-8')
    return JSON.parse(rawContent) as MeetingMetadata
  }

  private formatTimestamp(seconds: number): string {
    const totalSeconds = Math.floor(seconds)
    const minutes = Math.floor(totalSeconds / 60)
    const remainingSeconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  private async parseTranscriptFileAsPlainText(meetingId: string): Promise<string> {
    const entries = await this.getTranscripts(meetingId)
    return entries.map((entry) => `${entry.speaker ?? 'Unknown'}: ${entry.content}`).join('\n')
  }

  private parseTranscriptMarkdown(markdownContent: string): TranscriptEntry[] {
    const entries: TranscriptEntry[] = []
    const transcriptLinePattern = /^\[(\d{2}):(\d{2})\]\s\*\*(.+?)\*\*:\s(.+)$/

    for (const line of markdownContent.split('\n')) {
      const match = line.match(transcriptLinePattern)
      if (!match) continue

      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      const timestampInSeconds = minutes * 60 + seconds
      const speaker = match[3]
      const content = match[4]

      entries.push({
        speaker,
        content,
        timestampStart: timestampInSeconds,
        timestampEnd: timestampInSeconds
      })
    }

    return entries
  }

  private parseNotesMarkdown(markdownContent: string): NoteData {
    const sections = markdownContent.split(/^## /m)
    let summary = ''
    const decisions: string[] = []
    const actionItems: Array<{ task: string; assignee?: string; dueDate?: string }> = []

    for (const section of sections) {
      if (section.startsWith('Summary')) {
        summary = section.replace(/^Summary\n/, '').trim()
      } else if (section.startsWith('Decisions')) {
        const decisionLines = section.replace(/^Decisions\n/, '').trim().split('\n')
        for (const decisionLine of decisionLines) {
          const cleaned = decisionLine.replace(/^-\s*/, '').trim()
          if (cleaned && cleaned !== 'None') {
            decisions.push(cleaned)
          }
        }
      } else if (section.startsWith('Action Items')) {
        const actionItemLines = section.replace(/^Action Items\n/, '').trim().split('\n')
        const actionItemPattern = /^-\s*\[[ x]\]\s*(.+)$/
        for (const actionLine of actionItemLines) {
          const actionMatch = actionLine.match(actionItemPattern)
          if (!actionMatch) continue

          const rawItemText = actionMatch[1]
          if (rawItemText === 'None') continue

          const dueDateMatch = rawItemText.match(/\(due:\s*(.+?)\)/)
          const dueDate = dueDateMatch ? dueDateMatch[1] : undefined
          const textWithoutDueDate = rawItemText.replace(/\s*\(due:\s*.+?\)/, '').trim()

          const assigneeSplit = textWithoutDueDate.split(' — ')
          const task = assigneeSplit[0].trim()
          const assignee = assigneeSplit.length > 1 ? assigneeSplit[1].trim() : undefined

          actionItems.push({ task, assignee, dueDate })
        }
      }
    }

    return { summary, decisions, actionItems }
  }
}

async function appendToFile(filePath: string, content: string): Promise<void> {
  const { appendFile } = await import('fs/promises')
  await appendFile(filePath, content, 'utf-8')
}
