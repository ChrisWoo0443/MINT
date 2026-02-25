import { useEffect, useRef, useState } from 'react'

interface TagDefinition {
  id: string
  name: string
  color: string
}

interface TagPickerProps {
  tags: TagDefinition[]
  selectedTagIds: string[]
  onToggleTag: (tagId: string) => void
}

export function TagPicker({
  tags,
  selectedTagIds,
  onToggleTag
}: TagPickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div className="tag-picker" ref={pickerRef}>
      <button
        className="tag-picker-button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        title="Manage tags"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </svg>
      </button>
      {isOpen && (
        <div className="tag-picker-dropdown">
          {tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                className={`tag-picker-option ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleTag(tag.id)
                }}
              >
                <span className="tag-dot" style={{ background: tag.color }} />
                <span className="tag-option-name">{tag.name}</span>
                {isSelected && <span className="tag-check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
