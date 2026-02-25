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

interface CustomSection {
  id: string
  name: string
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

const DATE_SECTION_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function MeetingList({
  onSelectMeeting,
  onStartRecording
}: MeetingListProps): React.JSX.Element {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    () => loadJson('collapsedSections', {})
  )
  const [sectionNames, setSectionNames] = useState<Record<string, string>>(
    () => loadJson('sectionNames', {})
  )
  const [customSections, setCustomSections] = useState<CustomSection[]>(
    () => loadJson('customSections', [])
  )
  const [sectionAssignments, setSectionAssignments] = useState<Record<string, string>>(
    () => loadJson('sectionAssignments', {})
  )
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const hasDeepgramKey = Boolean(localStorage.getItem('deepgramApiKey'))

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

  const { customGroups, dateGroups } = useMemo(() => {
    const assignedMeetingIds = new Set(Object.keys(sectionAssignments))

    const customMap = new Map<string, Meeting[]>()
    for (const section of customSections) {
      customMap.set(section.id, [])
    }
    for (const meeting of meetings) {
      const sectionId = sectionAssignments[meeting.id]
      if (sectionId && customMap.has(sectionId)) {
        customMap.get(sectionId)!.push(meeting)
      }
    }
    const customResult = customSections.map((section) => ({
      section: section.id,
      name: section.name,
      isCustom: true as const,
      meetings: customMap.get(section.id) || []
    }))

    const dateMap = new Map<string, Meeting[]>()
    for (const meeting of meetings) {
      if (assignedMeetingIds.has(meeting.id)) continue
      const section = getDateSection(meeting.startedAt)
      const list = dateMap.get(section) || []
      list.push(meeting)
      dateMap.set(section, list)
    }
    const dateResult = DATE_SECTION_ORDER
      .filter((section) => dateMap.has(section))
      .map((section) => ({
        section,
        name: sectionNames[section] || section,
        isCustom: false as const,
        meetings: dateMap.get(section)!
      }))

    return { customGroups: customResult, dateGroups: dateResult }
  }, [meetings, customSections, sectionAssignments, sectionNames])

  const allGroups = useMemo(
    () => [...customGroups, ...dateGroups],
    [customGroups, dateGroups]
  )

  const toggleCollapse = (section: string): void => {
    setCollapsed((prev) => {
      const next = { ...prev, [section]: !prev[section] }
      saveJson('collapsedSections', next)
      return next
    })
  }

  const startRename = (section: string, currentName: string): void => {
    setEditingSection(section)
    setEditValue(currentName)
  }

  const commitRename = (): void => {
    if (!editingSection) return
    const trimmed = editValue.trim()

    const customSection = customSections.find((s) => s.id === editingSection)
    if (customSection) {
      if (trimmed) {
        setCustomSections((prev) => {
          const next = prev.map((s) => (s.id === editingSection ? { ...s, name: trimmed } : s))
          saveJson('customSections', next)
          return next
        })
      }
    } else {
      setSectionNames((prev) => {
        const next = { ...prev }
        if (!trimmed || trimmed === editingSection) {
          delete next[editingSection]
        } else {
          next[editingSection] = trimmed
        }
        saveJson('sectionNames', next)
        return next
      })
    }
    setEditingSection(null)
  }

  const addCustomSection = (): void => {
    const newSection: CustomSection = {
      id: `section-${Date.now()}`,
      name: 'New Section'
    }
    setCustomSections((prev) => {
      const next = [...prev, newSection]
      saveJson('customSections', next)
      return next
    })
    startRename(newSection.id, newSection.name)
  }

  const deleteCustomSection = (sectionId: string): void => {
    setCustomSections((prev) => {
      const next = prev.filter((s) => s.id !== sectionId)
      saveJson('customSections', next)
      return next
    })
    setSectionAssignments((prev) => {
      const next = { ...prev }
      for (const [meetingId, assignedSection] of Object.entries(next)) {
        if (assignedSection === sectionId) delete next[meetingId]
      }
      saveJson('sectionAssignments', next)
      return next
    })
  }

  const moveMeeting = (meetingId: string, targetSectionId: string | null): void => {
    setSectionAssignments((prev) => {
      const next = { ...prev }
      if (targetSectionId === null) {
        delete next[meetingId]
      } else {
        next[meetingId] = targetSectionId
      }
      saveJson('sectionAssignments', next)
      return next
    })
  }

  const handleSectionDragOver = (e: React.DragEvent, sectionId: string): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverSection(sectionId)
  }

  const handleSectionDragLeave = (): void => {
    setDragOverSection(null)
  }

  const handleSectionDrop = (e: React.DragEvent, sectionId: string, isCustom: boolean): void => {
    e.preventDefault()
    setDragOverSection(null)
    const meetingId = e.dataTransfer.getData('text/plain')
    if (!meetingId) return

    if (isCustom) {
      moveMeeting(meetingId, sectionId)
    } else {
      // Dropping on a date section removes the custom assignment
      moveMeeting(meetingId, null)
    }
  }

  const handleDeleteMeeting = async (meetingId: string): Promise<void> => {
    await window.mintAPI.deleteMeeting(meetingId)
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
    setSectionAssignments((prev) => {
      const next = { ...prev }
      delete next[meetingId]
      saveJson('sectionAssignments', next)
      return next
    })
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
        <div className="meeting-list-actions">
          <button className="add-section-button" onClick={addCustomSection} title="New section">
            +
          </button>
          <button
            onClick={onStartRecording}
            disabled={!hasDeepgramKey}
            title={hasDeepgramKey ? undefined : 'Set a Deepgram API key in Settings'}
          >
            Start Recording
          </button>
        </div>
      </div>
      {meetings.length === 0 ? (
        <p>No meetings yet. Start your first recording.</p>
      ) : (
        allGroups.map(({ section, name, isCustom, meetings: sectionMeetings }) => {
          const isCollapsed = collapsed[section] ?? false
          const isDragOver = dragOverSection === section

          return (
            <div key={section} className="meeting-section">
              <div
                className={`meeting-section-header ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => handleSectionDragOver(e, section)}
                onDragLeave={handleSectionDragLeave}
                onDrop={(e) => handleSectionDrop(e, section, isCustom)}
              >
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
                    onDoubleClick={() => startRename(section, name)}
                    title="Double-click to rename"
                  >
                    {name}
                  </span>
                )}
                <span className="meeting-section-count">{sectionMeetings.length}</span>
                {isCustom && (
                  <button
                    className="section-delete-button"
                    onClick={() => deleteCustomSection(section)}
                    title="Delete section"
                  >
                    ✕
                  </button>
                )}
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
