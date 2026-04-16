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
