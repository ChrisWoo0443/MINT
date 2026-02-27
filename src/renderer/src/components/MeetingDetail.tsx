import { useCallback, useEffect, useRef, useState } from 'react'
import { TagPicker } from './TagPicker'

interface TagDefinition {
  id: string
  name: string
  color: string
}

interface Meeting {
  id: string
  title: string
  startedAt: string
  endedAt: string | null
  status: string
  tags?: string[]
}

interface Note {
  summary: string
  decisions: string[]
  actionItems: Array<{ task: string; assignee?: string; dueDate?: string }>
}

interface Transcript {
  speaker: string | null
  content: string
  timestampStart: number
}

type ActiveTab = 'summary' | 'transcript'

interface MeetingDetailProps {
  meetingId: string
  onBack: () => void
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function MeetingDetail({ meetingId, onBack }: MeetingDetailProps): React.JSX.Element {
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [notes, setNotes] = useState<Note | null>(null)
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary')
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [isEdited, setIsEdited] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadMeetingData = useCallback(async (): Promise<void> => {
    const [meetingData, notesData, transcriptsData, tagsData] = await Promise.all([
      window.mintAPI.getMeeting(meetingId),
      window.mintAPI.getMeetingNotes(meetingId),
      window.mintAPI.getMeetingTranscripts(meetingId),
      window.mintAPI.getTags()
    ])

    setMeeting(meetingData)
    if (notesData) setNotes(notesData)
    setTranscripts(transcriptsData)
    setAvailableTags(tagsData)
  }, [meetingId])

  useEffect(() => {
    loadMeetingData()
  }, [loadMeetingData])

  const saveNotesDebounced = useCallback(
    (updatedNotes: Note) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(async () => {
        await window.mintAPI.saveNotes({
          meetingId,
          summary: updatedNotes.summary,
          decisions: updatedNotes.decisions,
          actionItems: updatedNotes.actionItems
        })
      }, 500)
    },
    [meetingId]
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.select()
  }, [isEditingTitle])

  const startRename = (): void => {
    if (!meeting) return
    setEditTitle(meeting.title)
    setIsEditingTitle(true)
  }

  const commitRename = async (): Promise<void> => {
    const trimmed = editTitle.trim()
    if (trimmed && meeting && trimmed !== meeting.title) {
      await window.mintAPI.renameMeeting(meetingId, trimmed)
      setMeeting({ ...meeting, title: trimmed })
    }
    setIsEditingTitle(false)
  }

  const handleToggleTag = async (tagId: string): Promise<void> => {
    if (!meeting) return
    const currentTags = meeting.tags ?? []
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId]
    await window.mintAPI.setMeetingTags(meetingId, newTags)
    setMeeting({ ...meeting, tags: newTags })
  }

  const filteredTranscripts = transcripts.filter((transcript) =>
    transcript.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleGenerateNotes = async (): Promise<void> => {
    if (!meeting) return
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const notesProvider =
        (localStorage.getItem('notesProvider') as 'openai' | 'ollama') || 'openai'
      const generatedNotes = await window.mintAPI.generateNotes({
        meetingId,
        openaiApiKey: localStorage.getItem('openaiApiKey') || undefined,
        notesProvider,
        ollamaUrl: localStorage.getItem('ollamaUrl') || undefined,
        ollamaModel: localStorage.getItem('ollamaModel') || undefined,
        customPrompt: localStorage.getItem('notesCustomPrompt') || undefined
      })
      setNotes(generatedNotes)
      setMeeting({ ...meeting, status: 'completed' })
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Failed to generate notes.')
    } finally {
      setIsGenerating(false)
    }
  }

  const hasTranscripts = transcripts.length > 0

  if (!meeting) {
    return (
      <div className="meeting-detail">
        <button onClick={onBack}>Back to Meetings</button>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="meeting-detail">
      <div className="detail-header-actions">
        <button className="back-button" onClick={onBack}>
          Back to Meetings
        </button>
        <button
          className="delete-button"
          onClick={async () => {
            if (!window.confirm('Delete this meeting? This cannot be undone.')) return
            await window.mintAPI.deleteMeeting(meetingId)
            onBack()
          }}
        >
          Delete
        </button>
      </div>

      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          className="rename-input rename-input-detail"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setIsEditingTitle(false)
          }}
        />
      ) : (
        <h2 className="editable-title" onDoubleClick={startRename}>
          {meeting.title}
        </h2>
      )}
      <div className="detail-tags-row">
        {availableTags
          .filter((t) => (meeting.tags ?? []).includes(t.id))
          .map((tag) => (
            <span key={tag.id} className="tag-badge" style={{ background: tag.color }}>
              {tag.name}
            </span>
          ))}
        <TagPicker
          tags={availableTags}
          selectedTagIds={meeting.tags ?? []}
          onToggleTag={handleToggleTag}
        />
      </div>
      <p className="meeting-date">{new Date(meeting.startedAt).toLocaleString()}</p>
      <span className={`status-badge status-${meeting.status}`}>{meeting.status}</span>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'summary' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button
          className={`tab ${activeTab === 'transcript' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('transcript')}
        >
          Transcript
        </button>
      </div>

      {activeTab === 'summary' && (
        <div className="tab-content">
          {isGenerating ? (
            <p>Generating notes...</p>
          ) : notes ? (
            <div className="summary-content">
              <section className="summary-section">
                <h3>
                  Executive Summary
                  {isEdited && <span className="edited-badge">Edited</span>}
                </h3>
                <textarea
                  className="editable-summary"
                  value={notes.summary}
                  onChange={(e) => {
                    const updated = { ...notes, summary: e.target.value }
                    setNotes(updated)
                    setIsEdited(true)
                    saveNotesDebounced(updated)
                  }}
                  rows={6}
                />
              </section>

              <section className="summary-section">
                <h3>Decisions</h3>
                <ul>
                  {notes.decisions.map((decision, index) => (
                    <li key={index} className="editable-list-item">
                      <input
                        type="text"
                        value={decision}
                        onChange={(e) => {
                          const updated = {
                            ...notes,
                            decisions: notes.decisions.map((d, i) =>
                              i === index ? e.target.value : d
                            )
                          }
                          setNotes(updated)
                          setIsEdited(true)
                          saveNotesDebounced(updated)
                        }}
                      />
                      <button
                        className="remove-item-button"
                        onClick={() => {
                          const updated = {
                            ...notes,
                            decisions: notes.decisions.filter((_, i) => i !== index)
                          }
                          setNotes(updated)
                          setIsEdited(true)
                          saveNotesDebounced(updated)
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  className="add-item-button"
                  onClick={() => {
                    const updated = { ...notes, decisions: [...notes.decisions, ''] }
                    setNotes(updated)
                    setIsEdited(true)
                  }}
                >
                  + Add Decision
                </button>
              </section>

              <section className="summary-section">
                <h3>Action Items</h3>
                <ul className="action-items">
                  {notes.actionItems.map((item, index) => (
                    <li key={index} className="action-item editable-action-item">
                      <label>
                        <input type="checkbox" />
                        <input
                          type="text"
                          className="action-task-input"
                          value={item.task}
                          onChange={(e) => {
                            const updated = {
                              ...notes,
                              actionItems: notes.actionItems.map((ai, i) =>
                                i === index ? { ...ai, task: e.target.value } : ai
                              )
                            }
                            setNotes(updated)
                            setIsEdited(true)
                            saveNotesDebounced(updated)
                          }}
                        />
                      </label>
                      <input
                        type="text"
                        className="action-meta-input"
                        placeholder="Assignee"
                        value={item.assignee || ''}
                        onChange={(e) => {
                          const updated = {
                            ...notes,
                            actionItems: notes.actionItems.map((ai, i) =>
                              i === index ? { ...ai, assignee: e.target.value || undefined } : ai
                            )
                          }
                          setNotes(updated)
                          setIsEdited(true)
                          saveNotesDebounced(updated)
                        }}
                      />
                      <input
                        type="text"
                        className="action-meta-input"
                        placeholder="Due date"
                        value={item.dueDate || ''}
                        onChange={(e) => {
                          const updated = {
                            ...notes,
                            actionItems: notes.actionItems.map((ai, i) =>
                              i === index ? { ...ai, dueDate: e.target.value || undefined } : ai
                            )
                          }
                          setNotes(updated)
                          setIsEdited(true)
                          saveNotesDebounced(updated)
                        }}
                      />
                      <button
                        className="remove-item-button"
                        onClick={() => {
                          const updated = {
                            ...notes,
                            actionItems: notes.actionItems.filter((_, i) => i !== index)
                          }
                          setNotes(updated)
                          setIsEdited(true)
                          saveNotesDebounced(updated)
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  className="add-item-button"
                  onClick={() => {
                    const updated = {
                      ...notes,
                      actionItems: [...notes.actionItems, { task: '' }]
                    }
                    setNotes(updated)
                    setIsEdited(true)
                  }}
                >
                  + Add Action Item
                </button>
              </section>

              <button
                className="generate-notes-button"
                onClick={() => {
                  if (
                    isEdited &&
                    !window.confirm('Regenerating will overwrite your edits. Continue?')
                  )
                    return
                  handleGenerateNotes()
                  setIsEdited(false)
                }}
              >
                Regenerate Notes
              </button>
            </div>
          ) : (
            <div className="no-notes">
              {hasTranscripts ? (
                <>
                  <p>No notes have been generated for this meeting yet.</p>
                  <button className="generate-notes-button" onClick={handleGenerateNotes}>
                    Generate Notes
                  </button>
                </>
              ) : (
                <p>No transcript available to generate notes from.</p>
              )}
              {generateError && <p className="generate-error">{generateError}</p>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'transcript' && (
        <div className="tab-content">
          <input
            className="transcript-search"
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {filteredTranscripts.length === 0 ? (
            <p>No transcript entries found.</p>
          ) : (
            <div className="transcript-list">
              {filteredTranscripts.map((transcript, index) => (
                <div key={index} className="transcript-row">
                  <span className="transcript-timestamp">
                    {formatTimestamp(transcript.timestampStart)}
                  </span>
                  <span className="transcript-speaker">{transcript.speaker ?? 'Unknown'}</span>
                  <span className="transcript-content">{transcript.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
