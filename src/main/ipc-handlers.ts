import { app, ipcMain, BrowserWindow, dialog, shell, webContents, safeStorage } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { AudioCaptureService } from './services/audio-capture'
import { AudioTeeService } from './services/audiotee'
import { DeepgramService } from './services/deepgram'
import { OpenAIService } from './services/openai'
import { LocalStorageService } from './services/local-storage'
import { CalendarStorageService } from './services/calendar-storage'
import { WhisperModelManager, type ModelName } from './services/whisper-model-manager'
import { LocalWhisperService } from './services/local-whisper'
import { WhisperEngine } from './services/whisper-engine'
import { MlxSidecarManager } from './services/mlx-sidecar'
import { AppleSpeechService, isAppleSpeechAvailable } from './services/apple-speech'
import { DiarizationService, relabelEntries } from './services/diarization'
import type { TranscriptionService } from './services/transcription'
import { UpdateCheckerService, type UpdateStatus } from './services/update-checker'
import type { TranscriptionDegradedEvent } from '../shared/api-types'
import { SecretsStore } from './services/secrets-store'
import { WavWriter } from './services/wav-writer'
import { z } from 'zod'
import {
  MeetingIdSchema,
  StoragePathSchema,
  ExternalUrlSchema,
  OllamaUrlSchema,
  WhisperModelSchema,
  RenameMeetingArgsSchema,
  RecordingStartArgsSchema,
  GenerateNotesArgsSchema,
  SecretNameSchema,
  SecretSetArgsSchema,
  TagsArraySchema,
  SetMeetingTagsArgsSchema,
  SearchQuerySchema,
  CalendarListArgsSchema,
  CalendarGetArgsSchema,
  CalendarCreateArgsSchema,
  CalendarUpdateArgsSchema,
  CalendarDeleteArgsSchema
} from './ipc-schemas'

export function registerIpcHandlers(mainWindow: BrowserWindow): {
  updateCheckerService: UpdateCheckerService
} {
  function broadcast(channel: string, payload: unknown): void {
    for (const wc of webContents.getAllWebContents()) {
      wc.send(channel, payload)
    }
  }

  const audioCaptureService = new AudioCaptureService()
  const audioTeeService = new AudioTeeService()
  let micTranscriptionService: TranscriptionService | null = null
  let systemTranscriptionService: TranscriptionService | null = null
  let sharedWhisperEngine: WhisperEngine | null = null
  let sharedWhisperEngineModel: ModelName | null = null
  const localStorageService = new LocalStorageService()
  const calendarStorageService = new CalendarStorageService(localStorageService.getStoragePath())
  const whisperModelManager = new WhisperModelManager(join(app.getPath('userData'), 'models'))
  const mlxSidecarManager = new MlxSidecarManager({
    venvDir: join(app.getPath('userData'), 'mlx-env'),
    sidecarScript: app.isPackaged
      ? join(process.resourcesPath, 'mlx-sidecar.py')
      : join(app.getAppPath(), 'native', 'mlx-sidecar', 'sidecar.py')
  })
  const secretsStore = new SecretsStore(app.getPath('userData'), safeStorage)
  const diarizationService = new DiarizationService(
    join(app.getPath('userData'), 'models', 'diarization')
  )

  const updateCheckerService = new UpdateCheckerService({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged
  })

  updateCheckerService.onStatusChange((status) => {
    broadcast('updates:status', status)
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
  let recordingActive = false
  let currentProvider: string = 'local'
  let micWavWriter: WavWriter | null = null
  let systemWavWriter: WavWriter | null = null

  async function closeWavWriters(): Promise<void> {
    const writers = [micWavWriter, systemWavWriter]
    micWavWriter = null
    systemWavWriter = null
    for (const writer of writers) {
      try {
        await writer?.close()
      } catch (closeError) {
        console.error('[MINT] Failed to close wav writer:', closeError)
      }
    }
  }

  void localStorageService.reconcileInterruptedMeetings().catch((reconcileError) => {
    console.error('[MINT] Failed to reconcile interrupted meetings:', reconcileError)
  })

  async function runSpeakerDetection(meetingId: string): Promise<void> {
    const wavPath = join(localStorageService.getStoragePath(), meetingId, 'audio-system.wav')
    if (!existsSync(wavPath)) return
    // A bare WAV header is 44 bytes with no audio samples — skip so meetings with no
    // system audio don't trigger a ~30MB diarization model download.
    if (statSync(wavPath).size <= 44) return

    broadcast('diarization:status', { meetingId, state: 'running' })
    try {
      if (diarizationService.getStatus() === 'not-downloaded') {
        await diarizationService.downloadModels()
      }
      const turns = await diarizationService.diarizeWav(wavPath)
      if (turns.length === 0) {
        broadcast('diarization:status', { meetingId, state: 'done' })
        return
      }
      const entries = await localStorageService.getTranscripts(meetingId)
      const relabeled = relabelEntries(entries, turns, 'Meeting Users')
      await localStorageService.rewriteTranscriptSpeakers(meetingId, relabeled)
      broadcast('diarization:status', { meetingId, state: 'done' })
    } catch (diarizationError) {
      console.error('[MINT] Speaker detection failed:', diarizationError)
      broadcast('diarization:status', { meetingId, state: 'error' })
    }
  }

  // --- Storage handlers ---

  ipcMain.handle('storage:getPath', () => localStorageService.getStoragePath())

  ipcMain.handle('storage:setPath', (_event, newPath: unknown) => {
    const path = StoragePathSchema.parse(newPath)
    localStorageService.setStoragePath(path)
    calendarStorageService.setStoragePath(path)
  })

  ipcMain.handle('storage:pickFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose meetings storage folder'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // --- Secrets handlers ---

  ipcMain.handle('secrets:get', (_event, name: unknown) =>
    secretsStore.get(SecretNameSchema.parse(name))
  )

  ipcMain.handle('secrets:set', (_event, name: unknown, value: unknown) => {
    const [secretName, secretValue] = SecretSetArgsSchema.parse([name, value])
    secretsStore.set(secretName, secretValue)
  })

  ipcMain.handle('secrets:has', (_event, name: unknown) =>
    secretsStore.has(SecretNameSchema.parse(name))
  )

  // --- Meeting data handlers ---

  ipcMain.handle('meetings:list', async () => localStorageService.listMeetings())

  ipcMain.handle('meetings:search', async (_event, query: unknown) =>
    localStorageService.searchMeetings(SearchQuerySchema.parse(query))
  )

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

  ipcMain.handle('tags:save', async (_event, tags: unknown) =>
    localStorageService.saveTags(TagsArraySchema.parse(tags))
  )

  ipcMain.handle('meetings:setTags', async (_event, meetingId: unknown, tagIds: unknown) => {
    const [id, ids] = SetMeetingTagsArgsSchema.parse([meetingId, tagIds])
    return localStorageService.setMeetingTags(id, ids)
  })

  ipcMain.handle('meetings:getNotes', async (_event, meetingId: unknown) =>
    localStorageService.getNote(MeetingIdSchema.parse(meetingId))
  )

  ipcMain.handle('meetings:getTranscripts', async (_event, meetingId: unknown) =>
    localStorageService.getTranscripts(MeetingIdSchema.parse(meetingId))
  )

  // --- Recording handlers ---

  ipcMain.handle('recording:start', async (_event, rawArgs: unknown) => {
    const args = RecordingStartArgsSchema.parse(rawArgs)
    if (recordingActive) {
      throw new Error('A recording is already in progress')
    }
    recordingActive = true
    try {
      const { title, userName } = args
      currentMeetingId = await localStorageService.createMeeting(title)

      const meetingDir = join(localStorageService.getStoragePath(), currentMeetingId)
      micWavWriter = await WavWriter.create(join(meetingDir, 'audio-mic.wav'))
      systemWavWriter = await WavWriter.create(join(meetingDir, 'audio-system.wav'))

      const handleTranscript = async (result: {
        speaker: string | null
        content: string
        timestampStart: number
        timestampEnd: number
        isFinal: boolean
      }): Promise<void> => {
        broadcast('transcript:chunk', result)
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
      currentProvider = provider

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
      } else if (provider === 'apple') {
        if (!isAppleSpeechAvailable()) {
          throw new Error('Apple transcription requires macOS 26 or newer.')
        }
        micTranscriptionService = new AppleSpeechService()
        systemTranscriptionService = new AppleSpeechService()
      } else if (provider === 'lightning-mlx' || provider === 'parakeet-mlx') {
        const engineKind = provider === 'lightning-mlx' ? 'lightning' : 'parakeet'
        const defaultModel =
          engineKind === 'lightning' ? 'distil-medium.en' : 'mlx-community/parakeet-tdt-0.6b-v2'
        const engine = await mlxSidecarManager.ensureEngine(
          engineKind,
          args.mlxModel ?? defaultModel
        )
        micTranscriptionService = new LocalWhisperService(engine)
        systemTranscriptionService = new LocalWhisperService(engine)
      } else {
        micTranscriptionService = new DeepgramService()
        systemTranscriptionService = new DeepgramService()
      }

      const deepgramApiKey = secretsStore.get('deepgramApiKey') ?? ''

      micTranscriptionService.onDegraded?.((event) => {
        broadcast('transcription:degraded', {
          ...event,
          source: 'mic'
        } satisfies TranscriptionDegradedEvent)
      })

      await micTranscriptionService.startStreaming(
        { deepgramApiKey, deepgramModel: args.deepgramModel },
        userName,
        handleTranscript
      )
      console.log(
        `[MINT] Mic transcription started (provider: ${provider}, speaker: "${userName}")`
      )

      try {
        systemTranscriptionService.onDegraded?.((event) => {
          broadcast('transcription:degraded', {
            ...event,
            source: 'system'
          } satisfies TranscriptionDegradedEvent)
        })

        await systemTranscriptionService.startStreaming(
          { deepgramApiKey, deepgramModel: args.deepgramModel, deepgramDiarize: true },
          'Meeting Users',
          handleTranscript
        )
        console.log(
          `[MINT] System audio transcription started (provider: ${provider}, speaker: "Meeting Users")`
        )

        audioTeeService.onDegraded((event) => {
          // Project audiotee process events onto the renderer's degraded
          // surface using the 'system' source. The audiotee terminal here
          // is distinct from the deepgram terminal — both stop system
          // audio, neither stops the meeting.
          if (event.kind === 'reconnecting') {
            broadcast('transcription:degraded', {
              kind: 'reconnecting',
              source: 'system',
              attempt: 1,
              nextDelayMs: 0
            } satisfies TranscriptionDegradedEvent)
          } else if (event.kind === 'recovered') {
            broadcast('transcription:degraded', {
              kind: 'recovered',
              source: 'system'
            } satisfies TranscriptionDegradedEvent)
          } else {
            broadcast('transcription:degraded', {
              kind: 'terminal',
              source: 'system',
              reason: event.reason
            } satisfies TranscriptionDegradedEvent)
          }
        })

        await audioTeeService.start((chunk) => {
          systemWavWriter?.append(chunk)
          systemTranscriptionService?.sendAudio(chunk)
        })
      } catch (systemError) {
        console.warn('[MINT] System audio transcription unavailable:', systemError)
      }

      broadcast('recording:status', 'recording')
      const micDeviceId = args.micDeviceId || 'default'
      audioCaptureService.startCapture(mainWindow, { micDeviceId })
      return currentMeetingId
    } catch (startError) {
      console.error('Failed to start recording:', startError)
      const failedMeetingId = currentMeetingId
      currentMeetingId = null
      recordingActive = false

      // Each teardown step is isolated so a teardown failure never masks startError.
      try {
        micTranscriptionService?.stopStreaming()
      } catch (teardownError) {
        console.error('[MINT] mic teardown after failed start:', teardownError)
      }
      micTranscriptionService = null

      try {
        systemTranscriptionService?.stopStreaming()
      } catch (teardownError) {
        console.error('[MINT] system teardown after failed start:', teardownError)
      }
      systemTranscriptionService = null

      try {
        audioTeeService.stop()
      } catch (teardownError) {
        console.error('[MINT] audiotee teardown after failed start:', teardownError)
      }

      await closeWavWriters()

      if (failedMeetingId) {
        try {
          await localStorageService.updateMeetingStatus(
            failedMeetingId,
            'completed',
            new Date().toISOString()
          )
        } catch (teardownError) {
          console.error('[MINT] failed-meeting status update after failed start:', teardownError)
        }
      }

      broadcast('recording:status', 'error')
      throw startError
    }
  })

  ipcMain.handle('recording:stop', async () => {
    recordingActive = false
    audioCaptureService.stopCapture(mainWindow)
    audioTeeService.stop()
    // Await the stop so providers that flush trailing finals (Apple Speech) persist
    // them via handleTranscript before currentMeetingId is cleared below. Providers
    // that return void resolve immediately.
    await Promise.resolve(micTranscriptionService?.stopStreaming())
    await Promise.resolve(systemTranscriptionService?.stopStreaming())
    micTranscriptionService = null
    systemTranscriptionService = null
    await closeWavWriters()

    if (sharedWhisperEngine) {
      try {
        await sharedWhisperEngine.unload()
      } catch (unloadError) {
        console.error('[MINT] Whisper engine unload failed:', unloadError)
      }
      sharedWhisperEngine = null
      sharedWhisperEngineModel = null
    }

    mlxSidecarManager.shutdown()

    if (!currentMeetingId) {
      broadcast('recording:status', 'stopped')
      return
    }

    const meetingId = currentMeetingId
    currentMeetingId = null

    localStorageService.clearTranscriptBuffer(meetingId)
    await localStorageService.updateMeetingStatus(meetingId, 'completed', new Date().toISOString())

    if (currentProvider !== 'deepgram') {
      void runSpeakerDetection(meetingId)
    }

    broadcast('recording:status', 'stopped')
  })

  ipcMain.handle('meetings:generateNotes', async (_event, rawArgs: unknown) => {
    const args = GenerateNotesArgsSchema.parse(rawArgs)
    const { meetingId } = args
    const openaiApiKey = secretsStore.get('openaiApiKey') ?? ''
    const openaiModel = args.openaiModel || ''
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

      const meetingMeta = await localStorageService.getMeeting(meetingId)
      const openaiService =
        notesProvider === 'ollama'
          ? new OpenAIService({
              provider: 'ollama',
              ollamaUrl: ollamaUrl,
              ollamaModel: ollamaModel
            })
          : new OpenAIService({
              provider: 'openai',
              apiKey: openaiApiKey,
              openaiModel: openaiModel || undefined
            })
      const { notes } = await openaiService.generateNotes(
        fullTranscript,
        { title: meetingMeta.title, startedAt: meetingMeta.startedAt },
        args.customPrompt
      )

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
  })

  // --- Audio handlers ---

  ipcMain.on('audio:chunk:mic', (_event, chunk: Buffer) => {
    micWavWriter?.append(chunk)
    micTranscriptionService?.sendAudio(chunk)
  })

  // --- OpenAI handler ---

  ipcMain.handle('openai:listModels', async () => {
    try {
      const apiKey = secretsStore.get('openaiApiKey')
      if (!apiKey) return null
      return await OpenAIService.listChatModels(apiKey)
    } catch (error) {
      console.error('[MINT] OpenAI listModels error:', error)
      return null
    }
  })

  // --- Ollama handler ---

  ipcMain.handle('ollama:listModels', async (_event, url: unknown) => {
    try {
      const safeUrl = OllamaUrlSchema.parse(url)
      console.log('[MINT] Fetching Ollama models from:', safeUrl)
      const response = await fetch(`${safeUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) })
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
      broadcast('whisper:download:progress', progress)
    })
  })

  ipcMain.handle('whisper:deleteModel', async (_event, name: unknown) =>
    whisperModelManager.deleteModel(WhisperModelSchema.parse(name))
  )

  // --- MLX runtime handlers ---

  ipcMain.handle('mlx:getStatus', () => mlxSidecarManager.getStatus())

  ipcMain.handle('mlx:installRuntime', async () => {
    await mlxSidecarManager.installRuntime((line) => broadcast('mlx:install:progress', line))
  })

  // --- Update checker handlers ---

  ipcMain.handle('updates:getStatus', (): UpdateStatus => updateCheckerService.getStatus())

  ipcMain.handle('updates:checkNow', async () => {
    await updateCheckerService.checkNow()
  })

  ipcMain.handle('updates:setAutoCheck', (_event, enabled: unknown) => {
    updateCheckerService.setAutoCheck(z.boolean().parse(enabled))
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  // --- Shell handlers ---

  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    await shell.openExternal(ExternalUrlSchema.parse(url))
  })

  // --- System capability handlers ---

  ipcMain.handle('system:getCapabilities', () => ({
    appleSpeechAvailable: isAppleSpeechAvailable()
  }))

  // --- Calendar handlers ---

  ipcMain.handle('calendar:list', async (_event, args: unknown) => {
    const parsed = CalendarListArgsSchema.parse(args)
    return calendarStorageService.listEvents(parsed.rangeStartISO, parsed.rangeEndISO)
  })

  ipcMain.handle('calendar:get', async (_event, args: unknown) => {
    const parsed = CalendarGetArgsSchema.parse(args)
    return calendarStorageService.getEvent(parsed.id)
  })

  ipcMain.handle('calendar:create', async (_event, args: unknown) => {
    const parsed = CalendarCreateArgsSchema.parse(args)
    return calendarStorageService.createEvent(parsed)
  })

  ipcMain.handle('calendar:update', async (_event, args: unknown) => {
    const parsed = CalendarUpdateArgsSchema.parse(args)
    return calendarStorageService.updateEvent(parsed.id, parsed.patch)
  })

  ipcMain.handle('calendar:delete', async (_event, args: unknown) => {
    const parsed = CalendarDeleteArgsSchema.parse(args)
    await calendarStorageService.deleteEvent(parsed.id)
  })

  return { updateCheckerService }
}
