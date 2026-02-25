import { ipcMain, BrowserWindow, shell } from 'electron'
import { AudioCaptureService } from './services/audio-capture'
import { AudioTeeService } from './services/audiotee'
import { DeepgramService } from './services/deepgram'
import { OpenAIService } from './services/openai'
import { SupabaseService } from './services/supabase'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const audioCaptureService = new AudioCaptureService()
  const audioTeeService = new AudioTeeService()
  const micDeepgramService = new DeepgramService()
  const systemDeepgramService = new DeepgramService()
  const supabaseService = new SupabaseService(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  )

  let currentMeetingId: string | null = null

  ipcMain.handle(
    'recording:start',
    async (
      _event,
      args: {
        userId: string
        title: string
        accessToken: string
        userName: string
        micDeviceId?: string
      }
    ) => {
      try {
        const { userId, title, accessToken, userName } = args

        supabaseService.setAccessToken(accessToken)

        currentMeetingId = await supabaseService.createMeeting(userId, title)

        const deepgramApiKey = process.env.DEEPGRAM_API_KEY || ''

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
              await supabaseService.insertTranscriptChunk(
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

          audioTeeService.start((chunk) => {
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

    mainWindow.webContents.send('recording:status', 'processing')

    if (!currentMeetingId) {
      mainWindow.webContents.send('recording:status', 'stopped')
      return
    }

    const meetingId = currentMeetingId
    currentMeetingId = null

    try {
      await supabaseService.updateMeetingStatus(meetingId, 'processing')

      const fullTranscript = await supabaseService.getFullTranscript(meetingId)

      if (!fullTranscript.trim()) {
        await supabaseService.updateMeetingStatus(meetingId, 'completed', new Date().toISOString())
        mainWindow.webContents.send('recording:status', 'stopped')
        return
      }

      const openaiService = new OpenAIService(process.env.OPENAI_API_KEY || '')
      const { notes, rawResponse } = await openaiService.generateNotes(fullTranscript)

      await supabaseService.saveNotes(
        meetingId,
        notes.summary,
        notes.decisions,
        notes.actionItems,
        rawResponse
      )

      await supabaseService.updateMeetingStatus(meetingId, 'completed', new Date().toISOString())

      mainWindow.webContents.send('recording:status', 'stopped')
    } catch (processingError) {
      console.error('Failed to process meeting notes:', processingError)

      try {
        await supabaseService.updateMeetingStatus(meetingId, 'failed')
      } catch (updateError) {
        console.error('Failed to update meeting status to failed:', updateError)
      }

      mainWindow.webContents.send('recording:status', 'stopped')
    }
  })

  let micChunkCount = 0

  ipcMain.on('audio:chunk:mic', (_event, chunk: Buffer) => {
    micChunkCount++
    if (micChunkCount === 1) console.log('[MINT] Receiving mic audio chunks')
    micDeepgramService.sendAudio(chunk)
  })

  ipcMain.handle('audio:getDevices', async () => {
    return []
  })

  ipcMain.handle('audio:setDevice', async () => {
    // Will be implemented in a future task
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('shell:openApp', async (_event, appPath: string) => {
    await shell.openPath(appPath)
  })
}
