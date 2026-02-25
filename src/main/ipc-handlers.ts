import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { AudioCaptureService } from './services/audio-capture'
import { AudioTeeService } from './services/audiotee'
import { DeepgramService } from './services/deepgram'
import { OpenAIService } from './services/openai'
import { LocalStorageService } from './services/local-storage'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const audioCaptureService = new AudioCaptureService()
  const audioTeeService = new AudioTeeService()
  const micDeepgramService = new DeepgramService()
  const systemDeepgramService = new DeepgramService()
  const localStorageService = new LocalStorageService()

  let currentMeetingId: string | null = null

  // --- Storage handlers ---

  ipcMain.handle('storage:getPath', () => localStorageService.getStoragePath())

  ipcMain.handle('storage:setPath', (_event, newPath: string) =>
    localStorageService.setStoragePath(newPath)
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

  ipcMain.handle('meetings:get', async (_event, meetingId: string) =>
    localStorageService.getMeeting(meetingId)
  )

  ipcMain.handle('meetings:delete', async (_event, meetingId: string) =>
    localStorageService.deleteMeeting(meetingId)
  )

  ipcMain.handle('meetings:rename', async (_event, meetingId: string, newTitle: string) =>
    localStorageService.renameMeeting(meetingId, newTitle)
  )

  ipcMain.handle('tags:get', async () => localStorageService.getTags())

  ipcMain.handle(
    'tags:save',
    async (_event, tags: Array<{ id: string; name: string; color: string }>) =>
      localStorageService.saveTags(tags)
  )

  ipcMain.handle('meetings:setTags', async (_event, meetingId: string, tagIds: string[]) =>
    localStorageService.setMeetingTags(meetingId, tagIds)
  )

  ipcMain.handle('meetings:getNotes', async (_event, meetingId: string) =>
    localStorageService.getNote(meetingId)
  )

  ipcMain.handle('meetings:getTranscripts', async (_event, meetingId: string) =>
    localStorageService.getTranscripts(meetingId)
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
      }
    ) => {
      try {
        const { title, userName } = args

        currentMeetingId = await localStorageService.createMeeting(title)

        const deepgramApiKey = args.deepgramApiKey || process.env.DEEPGRAM_API_KEY || ''
        const handleTranscript = async (result: {
          speaker: string | null
          content: string
          timestampStart: number
          timestampEnd: number
          isFinal: boolean
        }): Promise<void> => {
          mainWindow.webContents.send('transcript:chunk', result)

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

        // Start mic transcription (always)
        await micDeepgramService.startStreaming(deepgramApiKey, userName, handleTranscript)
        console.log(`[MINT] Mic Deepgram stream started (speaker: "${userName}")`)

        // Start system audio transcription via AudioTee
        try {
          await systemDeepgramService.startStreaming(
            deepgramApiKey,
            'Meeting Users',
            handleTranscript
          )
          console.log('[MINT] System audio Deepgram stream started (speaker: "Meeting Users")')

          await audioTeeService.start((chunk) => {
            systemDeepgramService.sendAudio(chunk)
          })
        } catch (systemError) {
          console.warn('[MINT] System audio Deepgram stream unavailable:', systemError)
        }

        mainWindow.webContents.send('recording:status', 'recording')
        const micDeviceId = args.micDeviceId || 'default'
        audioCaptureService.startCapture(mainWindow, { micDeviceId })
      } catch (startError) {
        console.error('Failed to start recording:', startError)
        currentMeetingId = null
        mainWindow.webContents.send('recording:status', 'error')
        throw startError
      }
    }
  )

  ipcMain.handle('recording:stop', async () => {
    audioCaptureService.stopCapture(mainWindow)
    audioTeeService.stop()
    micDeepgramService.stopStreaming()
    systemDeepgramService.stopStreaming()

    if (!currentMeetingId) {
      mainWindow.webContents.send('recording:status', 'stopped')
      return
    }

    const meetingId = currentMeetingId
    currentMeetingId = null

    localStorageService.clearTranscriptBuffer(meetingId)
    await localStorageService.updateMeetingStatus(
      meetingId,
      'completed',
      new Date().toISOString()
    )

    mainWindow.webContents.send('recording:status', 'stopped')
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
    micDeepgramService.sendAudio(chunk)
  })

  ipcMain.handle('audio:getDevices', async () => {
    return []
  })

  ipcMain.handle('audio:setDevice', async () => {
    // Will be implemented in a future task
  })

  // --- Ollama handler ---

  ipcMain.handle('ollama:listModels', async (_event, url: string) => {
    try {
      console.log('[MINT] Fetching Ollama models from:', url)
      const response = await fetch(`${url}/api/tags`)
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

  // --- Shell handlers ---

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('shell:openApp', async (_event, appPath: string) => {
    await shell.openPath(appPath)
  })
}
