import { ipcMain, BrowserWindow } from 'electron'
import { AudioCaptureService } from './services/audio-capture'
import { DeepgramService } from './services/deepgram'
import { GeminiService } from './services/gemini'
import { SupabaseService } from './services/supabase'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const audioCaptureService = new AudioCaptureService()
  const deepgramService = new DeepgramService()
  const supabaseService = new SupabaseService(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  )

  let currentMeetingId: string | null = null

  ipcMain.handle(
    'recording:start',
    async (
      _event,
      args: { userId: string; title: string; accessToken: string }
    ) => {
      try {
        const { userId, title, accessToken } = args

        supabaseService.setAccessToken(accessToken)

        currentMeetingId = await supabaseService.createMeeting(userId, title)

        const deepgramApiKey = process.env.DEEPGRAM_API_KEY || ''

        await deepgramService.startStreaming(deepgramApiKey, async (result) => {
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
        })

        mainWindow.webContents.send('recording:status', 'recording')
        await audioCaptureService.startCapture(mainWindow, (chunk: Buffer) => {
          deepgramService.sendAudio(chunk)
        })
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
    deepgramService.stopStreaming()

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
        await supabaseService.updateMeetingStatus(
          meetingId,
          'completed',
          new Date().toISOString()
        )
        mainWindow.webContents.send('recording:status', 'stopped')
        return
      }

      const geminiService = new GeminiService(process.env.GEMINI_API_KEY || '')
      const { notes, rawResponse } = await geminiService.generateNotes(fullTranscript)

      await supabaseService.saveNotes(
        meetingId,
        notes.summary,
        notes.decisions,
        notes.actionItems,
        rawResponse
      )

      await supabaseService.updateMeetingStatus(
        meetingId,
        'completed',
        new Date().toISOString()
      )

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

  ipcMain.on('audio:chunk', (_event, chunk: Buffer) => {
    audioCaptureService.handleAudioChunk(chunk)
  })

  ipcMain.handle('audio:getDevices', async () => {
    // Will be implemented in a future task
    return []
  })

  ipcMain.handle('audio:setDevice', async (_event, _deviceId: string) => {
    // Will be implemented in a future task
  })
}
