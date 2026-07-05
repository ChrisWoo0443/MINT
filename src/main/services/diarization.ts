import { existsSync, mkdirSync } from 'node:fs'
import { writeFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { TranscriptEntry } from './local-storage'

const execFileAsync = promisify(execFile)

export interface DiarizationTurn {
  start: number
  end: number
  speaker: number
}

const NEAREST_TURN_TOLERANCE_S = 2

export function relabelEntries(
  entries: TranscriptEntry[],
  turns: DiarizationTurn[],
  targetLabel: string
): TranscriptEntry[] {
  return entries.map((entry) => {
    if (entry.speaker !== targetLabel) return entry
    const at = entry.timestampStart
    let match = turns.find((turn) => at >= turn.start && at < turn.end)
    if (!match) {
      let best: { turn: DiarizationTurn; distance: number } | null = null
      for (const turn of turns) {
        const distance = at < turn.start ? turn.start - at : at - turn.end
        if (distance <= NEAREST_TURN_TOLERANCE_S && (!best || distance < best.distance)) {
          best = { turn, distance }
        }
      }
      match = best?.turn
    }
    if (!match) return entry
    return { ...entry, speaker: `Speaker ${match.speaker + 1}` }
  })
}

// Model sources: sherpa-onnx GitHub release assets. Verified reachable (302 -> 200)
// at implementation time. The embedding release tag really is "speaker-recongition-models"
// (the project's own typo) -- "speaker-recognition-models" 404s.
const SEGMENTATION_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2'
const EMBEDDING_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx'

export class DiarizationService {
  private downloading = false

  constructor(private readonly modelsDir: string) {}

  private segmentationPath(): string {
    return join(this.modelsDir, 'sherpa-onnx-pyannote-segmentation-3-0', 'model.onnx')
  }

  private embeddingPath(): string {
    return join(this.modelsDir, 'nemo_en_titanet_small.onnx')
  }

  getStatus(): 'not-downloaded' | 'downloading' | 'ready' {
    if (this.downloading) return 'downloading'
    return existsSync(this.segmentationPath()) && existsSync(this.embeddingPath())
      ? 'ready'
      : 'not-downloaded'
  }

  async downloadModels(): Promise<void> {
    if (this.getStatus() === 'ready') return
    this.downloading = true
    try {
      mkdirSync(this.modelsDir, { recursive: true })

      const embeddingTmp = `${this.embeddingPath()}.tmp`
      const embeddingResponse = await fetch(EMBEDDING_URL)
      if (!embeddingResponse.ok) {
        throw new Error(`embedding model download failed: ${embeddingResponse.status}`)
      }
      await writeFile(embeddingTmp, Buffer.from(await embeddingResponse.arrayBuffer()))
      await rename(embeddingTmp, this.embeddingPath())

      const tarPath = join(this.modelsDir, 'segmentation.tar.bz2')
      const segmentationResponse = await fetch(SEGMENTATION_URL)
      if (!segmentationResponse.ok) {
        throw new Error(`segmentation model download failed: ${segmentationResponse.status}`)
      }
      await writeFile(tarPath, Buffer.from(await segmentationResponse.arrayBuffer()))
      // macOS bsdtar handles .tar.bz2 natively
      await execFileAsync('tar', ['-xjf', tarPath, '-C', this.modelsDir])
      await unlink(tarPath)

      if (!existsSync(this.segmentationPath()) || !existsSync(this.embeddingPath())) {
        throw new Error('diarization models missing after download')
      }
    } finally {
      this.downloading = false
    }
  }

  async diarizeWav(wavPath: string): Promise<DiarizationTurn[]> {
    if (this.getStatus() !== 'ready') {
      throw new Error('diarization models are not downloaded')
    }
    // Lazy-require: native addon must not load at app startup or in tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sherpa = require('sherpa-onnx-node')
    const diarizer = new sherpa.OfflineSpeakerDiarization({
      segmentation: { pyannote: { model: this.segmentationPath() } },
      embedding: { model: this.embeddingPath() },
      clustering: { numClusters: -1, threshold: 0.5 },
      minDurationOn: 0.3,
      minDurationOff: 0.5
    })
    const wave = sherpa.readWave(wavPath)
    if (wave.sampleRate !== diarizer.sampleRate) {
      throw new Error(`wav sample rate ${wave.sampleRate} != diarizer ${diarizer.sampleRate}`)
    }
    const segments = diarizer.process(wave.samples) as Array<{
      start: number
      end: number
      speaker: number
    }>
    return segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      speaker: segment.speaker
    }))
  }
}
