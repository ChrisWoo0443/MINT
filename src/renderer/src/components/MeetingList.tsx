import { useCallback, useEffect, useMemo, useState } from 'react'
import { MeetingCard } from './MeetingCard'

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

interface MeetingListProps {
  onSelectMeeting: (meetingId: string) => void
  onStartRecording: () => void
}

function getDateSection(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  if (date >= startOfToday) return 'Today'
  if (date >= startOfYesterday) return 'Yesterday'
  if (date >= startOfWeek) return 'This Week'
  if (date >= startOfMonth) return 'This Month'
  return 'Older'
}

const SECTION_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']

function loadSectionNames(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('sectionNames') || '{}')
  } catch {
    return {}
  }
}

function loadCollapsedSections(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('collapsedSections') || '{}')
  } catch {
    return {}
  }
}

export function MeetingList({
  onSelectMeeting,
  onStartRecording
}: MeetingListProps): React.JSX.Element {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsedSections)
  const [sectionNames, setSectionNames] = useState<Record<string, string>>(loadSectionNames)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const loadData = useCallback(async (): Promise<void> => {
    const [meetingsData, tagsData] = await Promise.all([
      window.mintAPI.listMeetings(),
      window.mintAPI.getTags()
    ])
    setMeetings(meetingsData)
    setAvailableTags(tagsData)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  const groupedMeetings = useMemo(() => {
    const groups = new Map<string, Meeting[]>()
    for (const meeting of meetings) {
      const section = getDateSection(meeting.startedAt)
      const list = groups.get(section) || []
      list.push(meeting)
      groups.set(section, list)
    }
    return SECTION_ORDER
      .filter((section) => groups.has(section))
      .map((section) => ({ section, meetings: groups.get(section)! }))
  }, [meetings])

  const toggleCollapse = (section: string): void => {
    setCollapsed((prev) => {
      const next = { ...prev, [section]: !prev[section] }
      localStorage.setItem('collapsedSections', JSON.stringify(next))
      return next
    })
  }

  const startRename = (section: string): void => {
    setEditingSection(section)
    setEditValue(sectionNames[section] || section)
  }

  const commitRename = (): void => {
    if (!editingSection) return
    const trimmed = editValue.trim()
    setSectionNames((prev) => {
      const next = { ...prev }
      if (!trimmed || trimmed === editingSection) {
        delete next[editingSection]
      } else {
        next[editingSection] = trimmed
      }
      localStorage.setItem('sectionNames', JSON.stringify(next))
      return next
    })
    setEditingSection(null)
  }

  const handleDeleteMeeting = async (meetingId: string): Promise<void> => {
    await window.mintAPI.deleteMeeting(meetingId)
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
  }

  const handleToggleTag = async (meetingId: string, tagId: string): Promise<void> => {
    const meeting = meetings.find((m) => m.id === meetingId)
    if (!meeting) return
    const currentTags = meeting.tags ?? []
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId]
    await window.mintAPI.setMeetingTags(meetingId, newTags)
    setMeetings((prev) => prev.map((m) => (m.id === meetingId ? { ...m, tags: newTags } : m)))
  }

  return (
    <div className="meeting-list">
      <div className="meeting-list-header">
        <h2>Meetings</h2>
        <button onClick={onStartRecording}>Start Recording</button>
      </div>
      {meetings.length === 0 ? (
        <p>No meetings yet. Start your first recording.</p>
      ) : (
        groupedMeetings.map(({ section, meetings: sectionMeetings }) => {
          const isCollapsed = collapsed[section] ?? false
          const displayName = sectionNames[section] || section

          return (
            <div key={section} className="meeting-section">
              <div className="meeting-section-header">
                <button
                  className="meeting-section-toggle"
                  onClick={() => toggleCollapse(section)}
                  aria-expanded={!isCollapsed}
                >
                  <span className={`section-chevron ${isCollapsed ? 'collapsed' : ''}`} />
                </button>
                {editingSection === section ? (
                  <input
                    className="section-rename-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditingSection(null)
                    }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="meeting-section-label"
                    onDoubleClick={() => startRename(section)}
                    title="Double-click to rename"
                  >
                    {displayName}
                  </span>
                )}
                <span className="meeting-section-count">{sectionMeetings.length}</span>
              </div>
              {!isCollapsed &&
                sectionMeetings.map((meeting) => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    availableTags={availableTags}
                    onClick={() => onSelectMeeting(meeting.id)}
                    onDelete={handleDeleteMeeting}
                    onToggleTag={handleToggleTag}
                  />
                ))}
            </div>
          )
        })
      )}
    </div>
  )
}
