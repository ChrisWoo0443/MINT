import { app, ipcMain, BrowserWindow, dialog, shell, webContents } from 'electron'
import { join } from 'node:path'
import { AudioCaptureService } from './services/audio-capture'
import { AudioTeeService } from './services/audiotee'
import { DeepgramService } from './services/deepgram'
import { OpenAIService } from './services/openai'
import { LocalStorageService } from './services/local-storage'
import { WhisperModelManager, type ModelName } from './services/whisper-model-manager'
import { LocalWhisperService } from './services/local-whisper'
import { WhisperEngine } from './services/whisper-engine'
import type { TranscriptionService } from './services/transcription'
import { UpdateCheckerService, type UpdateStatus } from './services/update-checker'
import { z } from 'zod'
import {
  MeetingIdSchema,
  StoragePathSchema,
  ShellPathSchema,
  ExternalUrlSchema,
  OllamaUrlSchema,
  WhisperModelSchema,
  RenameMeetingArgsSchema
} from './ipc-schemas'

export function registerIpcHandlers(mainWindow: BrowserWindow): {
  updateCheckerService: UpdateCheckerService
} {
  const audioCaptureService = new AudioCaptureService()
  const audioTeeService = new AudioTeeService()
  let micTranscriptionService: TranscriptionService | null = null
  let systemTranscriptionService: TranscriptionService | null = null
  let sharedWhisperEngine: WhisperEngine | null = null
  let sharedWhisperEngineModel: ModelName | null = null
  const localStorageService = new LocalStorageService()
  const whisperModelManager = new WhisperModelManager(join(app.getPath('userData'), 'models'))

  const updateCheckerService = new UpdateCheckerService({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged
  })

  updateCheckerService.onStatusChange((status) => {
    for (const wc of webContents.getAllWebContents()) {
      wc.send('updates:status', status)
    }
  })

  async function ensureWhisperEngine(modelName: ModelName): Promise<WhisperEngine> {
    if (sharedWhisperEngine && sharedWhisperEngineModel === modelName) {
      return sharedWhisperEngine
    }
    if (sharedWhisperEngine) {
      await sharedWhisperEngine.unload()
    }
    const modelPath = whisperModelManager.getModelPath(modelName)
    const engine = new WhisperEngine(modelPath)
    await engine.load()
    sharedWhisperEngine = engine
    sharedWhisperEngineModel = modelName
    return engine
  }

  let currentMeetingId: string | null = null

  // --- Storage handlers ---

  ipcMain.handle('storage:getPath', () => localStorageService.getStoragePath())

  ipcMain.handle('storage:setPath', (_event, newPath: unknown) =>
    localStorageService.setStoragePath(StoragePathSchema.parse(newPath))
  )

  ipcMain.handle('storage:pickFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose meetings storage folder'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // --- Meeting data handlers ---

  ipcMain.handle('meetings:list', async () => localStorageService.listMeetings())

  ipcMain.handle('meetings:get', async (_event, meetingId: unknown) =>
    localStorageService.getMeeting(MeetingIdSchema.parse(meetingId))
  )

  ipcMain.handle('meetings:delete', async (_event, meetingId: unknown) =>
    localStorageService.deleteMeeting(MeetingIdSchema.parse(meetingId))
  )

  ipcMain.handle('meetings:rename', async (_event, meetingId: unknown, newTitle: unknown) => {
    const [id, title] = RenameMeetingArgsSchema.parse([meetingId, newTitle])
    return localStorageService.renameMeeting(id, title)
  })

  ipcMain.handle('tags:get', async () => localStorageService.getTags())

  ipcMain.handle(
    'tags:save',
    async (_event, tags: Array<{ id: string; name: string; color: string }>) =>
      localStorageService.saveTags(tags)
  )

  ipcMain.handle('meetings:setTags', async (_event, meetingId: string, tagIds: string[]) =>
    localStorageService.setMeetingTags(meetingId, tagIds)
  )

  ipcMain.handle('meetings:getNotes', async (_event, meetingId: unknown) =>
    localStorageService.getNote(MeetingIdSchema.parse(meetingId))
  )

  ipcMain.handle('meetings:getTranscripts', async (_event, meetingId: unknown) =>
    localStorageService.getTranscripts(MeetingIdSchema.parse(meetingId))
  )

  // --- Recording handlers ---

  ipcMain.handle(
    'recording:start',
    async (
      _event,
      args: {
        title: string
        userName: string
        micDeviceId?: string
        deepgramApiKey?: string
        openaiApiKey?: string
        notesProvider?: 'openai' | 'ollama'
        ollamaUrl?: string
        ollamaModel?: string
        transcriptionProvider?: 'local' | 'deepgram'
        whisperModel?: ModelName
      }
    ) => {
      try {
        const { title, userName } = args
        currentMeetingId = await localStorageService.createMeeting(title)

        const handleTranscript = async (result: {
          speaker: string | null
          content: string
          timestampStart: number
          timestampEnd: number
          isFinal: boolean
        }): Promise<void> => {
          for (const wc of webContents.getAllWebContents()) {
            wc.send('transcript:chunk', result)
          }
          if (result.isFinal && currentMeetingId) {
            try {
              await localStorageService.insertTranscriptChunk(
                currentMeetingId,
                result.speaker,
                result.content,
                result.timestampStart,
                result.timestampEnd
              )
            } catch (insertError) {
              console.error('Failed to insert transcript chunk:', insertError)
            }
          }
        }

        const provider = args.transcriptionProvider ?? 'local'

        if (provider === 'local') {
          const modelName: ModelName = args.whisperModel ?? 'small.en'
          const status = await whisperModelManager.getModelStatus(modelName)
          if (status !== 'ready') {
            throw new Error(
              `Whisper model "${modelName}" is not downloaded. Download it in Settings first.`
            )
          }
          const engine = await ensureWhisperEngine(modelName)
          micTranscriptionService = new LocalWhisperService(engine)
          systemTranscriptionService = new LocalWhisperService(engine)
        } else {
          micTranscriptionService = new DeepgramService()
          systemTranscriptionService = new DeepgramService()
        }

        const deepgramApiKey = args.deepgramApiKey || process.env.DEEPGRAM_API_KEY || ''

        await micTranscriptionService.startStreaming(
          { deepgramApiKey },
          userName,
          handleTranscript
        )
        console.log(`[MINT] Mic transcription started (provider: ${provider}, speaker: "${userName}")`)

        try {
          await systemTranscriptionService.startStreaming(
            { deepgramApiKey },
            'Meeting Users',
            handleTranscript
          )
          console.log(
            `[MINT] System audio transcription started (provider: ${provider}, speaker: "Meeting Users")`
          )
          await audioTeeService.start((chunk) => {
            systemTranscriptionService?.sendAudio(chunk)
          })
        } catch (systemError) {
          console.warn('[MINT] System audio transcription unavailable:', systemError)
        }

        for (const wc of webContents.getAllWebContents()) wc.send('recording:status', 'recording')
        const micDeviceId = args.micDeviceId || 'default'
        audioCaptureService.startCapture(mainWindow, { micDeviceId })
      } catch (startError) {
        console.error('Failed to start recording:', startError)
        currentMeetingId = null
        for (const wc of webContents.getAllWebContents()) wc.send('recording:status', 'error')
        throw startError
      }
    }
  )

  ipcMain.handle('recording:stop', async () => {
    audioCaptureService.stopCapture(mainWindow)
    audioTeeService.stop()
    micTranscriptionService?.stopStreaming()
    systemTranscriptionService?.stopStreaming()
    micTranscriptionService = null
    systemTranscriptionService = null

    if (!currentMeetingId) {
      for (const wc of webContents.getAllWebContents()) wc.send('recording:status', 'stopped')
      return
    }

    const meetingId = currentMeetingId
    currentMeetingId = null

    localStorageService.clearTranscriptBuffer(meetingId)
    await localStorageService.updateMeetingStatus(meetingId, 'completed', new Date().toISOString())

    for (const wc of webContents.getAllWebContents()) wc.send('recording:status', 'stopped')
  })

  ipcMain.handle(
    'meetings:generateNotes',
    async (
      _event,
      args: {
        meetingId: string
        openaiApiKey?: string
        notesProvider?: 'openai' | 'ollama'
        ollamaUrl?: string
        ollamaModel?: string
      }
    ) => {
      const { meetingId } = args
      const openaiApiKey = args.openaiApiKey || process.env.OPENAI_API_KEY || ''
      const notesProvider = args.notesProvider || 'openai'
      const ollamaUrl = args.ollamaUrl || 'http://localhost:11434'
      const ollamaModel = args.ollamaModel || ''

      try {
        await localStorageService.updateMeetingStatus(meetingId, 'processing')

        const fullTranscript = await localStorageService.getFullTranscript(meetingId)

        if (!fullTranscript.trim()) {
          await localStorageService.updateMeetingStatus(
            meetingId,
            'completed',
            new Date().toISOString()
          )
          throw new Error('No transcript available to generate notes from.')
        }

        const openaiService =
          notesProvider === 'ollama'
            ? new OpenAIService({
                provider: 'ollama',
                ollamaUrl: ollamaUrl,
                ollamaModel: ollamaModel
              })
            : new OpenAIService({ provider: 'openai', apiKey: openaiApiKey })
        const { notes } = await openaiService.generateNotes(fullTranscript)

        await localStorageService.saveNotes(
          meetingId,
          notes.summary,
          notes.decisions,
          notes.actionItems
        )

        await localStorageService.updateMeetingStatus(
          meetingId,
          'completed',
          new Date().toISOString()
        )

        return notes
      } catch (error) {
        console.error('Failed to generate notes:', error)
        await localStorageService.updateMeetingStatus(meetingId, 'completed')
        throw error
      }
    }
  )

  // --- Audio handlers ---

  ipcMain.on('audio:chunk:mic', (_event, chunk: Buffer) => {
    micTranscriptionService?.sendAudio(chunk)
  })

  ipcMain.handle('audio:getDevices', async () => {
    return []
  })

  ipcMain.handle('audio:setDevice', async () => {
    // Will be implemented in a future task
  })

  // --- Ollama handler ---

  ipcMain.handle('ollama:listModels', async (_event, url: unknown) => {
    try {
      const safeUrl = OllamaUrlSchema.parse(url)
      console.log('[MINT] Fetching Ollama models from:', safeUrl)
      const response = await fetch(`${safeUrl}/api/tags`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()
      const models = (data.models || []).map((m: { name: string }) => m.name)
      console.log('[MINT] Ollama models:', models)
      return models
    } catch (error) {
      console.error('[MINT] Ollama fetch error:', error)
      return null
    }
  })

  // --- Whisper model handlers ---

  ipcMain.handle('whisper:listModels', async () => whisperModelManager.listModels())

  ipcMain.handle('whisper:getModelStatus', async (_event, name: unknown) =>
    whisperModelManager.getModelStatus(WhisperModelSchema.parse(name))
  )

  ipcMain.handle('whisper:downloadModel', async (_event, name: unknown) => {
    const modelName = WhisperModelSchema.parse(name)
    await whisperModelManager.downloadModel(modelName, (progress) => {
      for (const wc of webContents.getAllWebContents()) {
        wc.send('whisper:download:progress', progress)
      }
    })
  })

  ipcMain.handle('whisper:deleteModel', async (_event, name: unknown) =>
    whisperModelManager.deleteModel(WhisperModelSchema.parse(name))
  )

  // --- Update checker handlers ---

  ipcMain.handle('updates:getStatus', (): UpdateStatus => updateCheckerService.getStatus())

  ipcMain.handle('updates:checkNow', async () => {
    await updateCheckerService.checkNow()
  })

  ipcMain.handle('updates:setAutoCheck', (_event, enabled: unknown) => {
    updateCheckerService.setAutoCheck(z.boolean().parse(enabled))
  })

  ipcMain.handle('updates:openExternal', async (_event, url: unknown) => {
    await shell.openExternal(ExternalUrlSchema.parse(url))
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  // --- Shell handlers ---

  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    await shell.openExternal(ExternalUrlSchema.parse(url))
  })

  ipcMain.handle('shell:openApp', async (_event, appPath: unknown) => {
    await shell.openPath(ShellPathSchema.parse(appPath))
  })

  return { updateCheckerService }
}
