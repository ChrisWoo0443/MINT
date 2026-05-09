import { z } from 'zod'

// Max sizes guard against accidental memory pressure / DoS from a bad renderer.
const MAX_ID_LEN = 256
const MAX_PATH_LEN = 4096
const MAX_NAME_LEN = 1024

export const MeetingIdSchema = z.string().min(1).max(MAX_ID_LEN)
export const StoragePathSchema = z.string().min(1).max(MAX_PATH_LEN)
export const ShellPathSchema = z.string().min(1).max(MAX_PATH_LEN)
export const MeetingTitleSchema = z.string().min(1).max(MAX_NAME_LEN)

export const ExternalUrlSchema = z
  .string()
  .min(1)
  .max(MAX_PATH_LEN)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'URL must be http(s)' }
  )

export const OllamaUrlSchema = z
  .string()
  .min(1)
  .max(MAX_PATH_LEN)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      } catch {
        return false
      }
    },
    { message: 'Ollama URL must point to localhost' }
  )

export const WhisperModelSchema = z.enum(['tiny.en', 'base.en', 'small.en', 'medium.en'])

const ApiKeySchema = z.string().min(1).max(512)

export const RecordingStartArgsSchema = z.object({
  title: MeetingTitleSchema,
  userName: z.string().min(1).max(MAX_NAME_LEN),
  micDeviceId: z.string().max(MAX_ID_LEN).optional(),
  deepgramApiKey: ApiKeySchema.optional(),
  openaiApiKey: ApiKeySchema.optional(),
  openaiModel: z.string().max(MAX_NAME_LEN).optional(),
  notesProvider: z.enum(['openai', 'ollama']).optional(),
  ollamaUrl: OllamaUrlSchema.optional(),
  ollamaModel: z.string().max(MAX_NAME_LEN).optional(),
  transcriptionProvider: z.enum(['local', 'deepgram']).optional(),
  whisperModel: WhisperModelSchema.optional()
})

export const GenerateNotesArgsSchema = z.object({
  meetingId: MeetingIdSchema,
  openaiApiKey: ApiKeySchema.optional(),
  openaiModel: z.string().max(MAX_NAME_LEN).optional(),
  notesProvider: z.enum(['openai', 'ollama']).optional(),
  ollamaUrl: OllamaUrlSchema.optional(),
  ollamaModel: z.string().max(MAX_NAME_LEN).optional()
})

export const OpenAIApiKeyArgSchema = ApiKeySchema

export const TagSchema = z.object({
  id: z.string().min(1).max(MAX_ID_LEN),
  name: z.string().min(1).max(MAX_NAME_LEN),
  color: z.string().min(1).max(32)
})

export const TagsArraySchema = z.array(TagSchema).max(1000)

export const SetMeetingTagsArgsSchema = z.tuple([
  MeetingIdSchema,
  z.array(z.string().min(1).max(MAX_ID_LEN)).max(1000)
])

export const RenameMeetingArgsSchema = z.tuple([MeetingIdSchema, MeetingTitleSchema])

export const SearchQuerySchema = z.string().max(MAX_NAME_LEN)

const MAX_TITLE_LEN = 200
const MAX_NOTES_LEN = 2000
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000

const IsoDateString = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'must be a parseable ISO 8601 datetime'
  })

const TitleSchema = z.string().trim().min(1).max(MAX_TITLE_LEN)
const NotesSchema = z.string().trim().max(MAX_NOTES_LEN)
const TagIdSchema = z.string().min(1).max(MAX_ID_LEN)
const EventIdSchema = z.string().uuid()
const MeetingIdRefSchema = z.string().min(1).max(MAX_ID_LEN)

export const CalendarEventSchema = z
  .object({
    id: EventIdSchema,
    title: TitleSchema,
    startISO: IsoDateString,
    endISO: IsoDateString,
    notes: NotesSchema.optional(),
    tagId: TagIdSchema.optional(),
    meetingId: MeetingIdRefSchema.optional(),
    createdAt: IsoDateString,
    updatedAt: IsoDateString
  })
  .refine((event) => Date.parse(event.endISO) > Date.parse(event.startISO), {
    message: 'endISO must be strictly greater than startISO',
    path: ['endISO']
  })

export const CalendarListArgsSchema = z
  .object({
    rangeStartISO: IsoDateString,
    rangeEndISO: IsoDateString
  })
  .refine(
    (args) => Date.parse(args.rangeEndISO) > Date.parse(args.rangeStartISO),
    { message: 'rangeEndISO must be strictly greater than rangeStartISO', path: ['rangeEndISO'] }
  )
  .refine(
    (args) => Date.parse(args.rangeEndISO) - Date.parse(args.rangeStartISO) <= MAX_RANGE_MS,
    { message: 'range cannot exceed 31 days', path: ['rangeEndISO'] }
  )

export const CalendarGetArgsSchema = z.object({
  id: EventIdSchema
})

export const CalendarDeleteArgsSchema = z.object({
  id: EventIdSchema
})

export const CalendarCreateArgsSchema = z
  .object({
    title: TitleSchema,
    startISO: IsoDateString,
    endISO: IsoDateString,
    notes: NotesSchema.optional(),
    tagId: TagIdSchema.optional()
  })
  .refine((args) => Date.parse(args.endISO) > Date.parse(args.startISO), {
    message: 'endISO must be strictly greater than startISO',
    path: ['endISO']
  })

const CalendarUpdatePatchSchema = z
  .object({
    title: TitleSchema.optional(),
    startISO: IsoDateString.optional(),
    endISO: IsoDateString.optional(),
    notes: NotesSchema.optional(),
    tagId: TagIdSchema.optional(),
    meetingId: MeetingIdRefSchema.optional()
  })
  .refine(
    (patch) =>
      patch.title !== undefined ||
      patch.startISO !== undefined ||
      patch.endISO !== undefined ||
      patch.notes !== undefined ||
      patch.tagId !== undefined ||
      patch.meetingId !== undefined,
    { message: 'patch must contain at least one field' }
  )
  .refine(
    (patch) => {
      if (patch.startISO === undefined || patch.endISO === undefined) return true
      return Date.parse(patch.endISO) > Date.parse(patch.startISO)
    },
    { message: 'endISO must be strictly greater than startISO when both are present', path: ['endISO'] }
  )

export const CalendarUpdateArgsSchema = z.object({
  id: EventIdSchema,
  patch: CalendarUpdatePatchSchema
})
