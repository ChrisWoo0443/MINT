// native/speech-transcriber/main.swift
// Reads 16 kHz s16le mono PCM from stdin, streams it through SpeechAnalyzer /
// SpeechTranscriber (macOS 26+), and emits NDJSON results on stdout.
import Foundation
import Speech
import AVFoundation

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object),
        let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

func fail(_ message: String) -> Never {
  emit(["type": "error", "message": message])
  exit(1)
}

@main
struct SpeechTranscriberCLI {
  static func main() async {
    let localeIdentifier = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "en-US"
    let locale = Locale(identifier: localeIdentifier)

    let transcriber = SpeechTranscriber(
      locale: locale,
      transcriptionOptions: [],
      reportingOptions: [.volatileResults],
      attributeOptions: [.audioTimeRange]
    )

    do {
      if let installRequest = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
        emit(["type": "downloading-model"])
        try await installRequest.downloadAndInstall()
      }
    } catch {
      fail("model install failed: \(error.localizedDescription)")
    }

    guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
      fail("no compatible audio format for SpeechTranscriber")
    }

    guard let inputFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true
    ) else {
      fail("cannot create input audio format")
    }
    guard let converter = AVAudioConverter(from: inputFormat, to: analyzerFormat) else {
      fail("cannot build audio converter")
    }

    let (inputSequence, inputBuilder) = AsyncStream<AnalyzerInput>.makeStream()
    let analyzer = SpeechAnalyzer(modules: [transcriber])

    let resultsTask = Task {
      do {
        for try await result in transcriber.results {
          let text = String(result.text.characters)
          guard !text.isEmpty else { continue }
          let startSeconds = result.range.start.seconds
          let endSeconds = result.range.end.seconds
          emit([
            "type": "result",
            "text": text,
            "isFinal": result.isFinal,
            "startMs": (startSeconds.isFinite ? startSeconds : 0) * 1000,
            "endMs": (endSeconds.isFinite ? endSeconds : 0) * 1000
          ])
        }
      } catch {
        emit(["type": "error", "message": "results stream failed: \(error.localizedDescription)"])
        exit(1)
      }
    }

    do {
      try await analyzer.start(inputSequence: inputSequence)
    } catch {
      fail("analyzer start failed: \(error.localizedDescription)")
    }

    emit(["type": "ready"])

    let stdin = FileHandle.standardInput
    let bytesPerChunk = 3200 // 100 ms of 16 kHz s16le mono
    var pendingByte = Data()
    while true {
      let readData = stdin.readData(ofLength: bytesPerChunk)
      if readData.isEmpty && pendingByte.isEmpty { break } // EOF, nothing left to flush
      let reachedEOF = readData.isEmpty

      var chunk = pendingByte + readData
      if chunk.count % 2 != 0 {
        pendingByte = Data(chunk.suffix(1))
        chunk = Data(chunk.dropLast(1))
      } else {
        pendingByte = Data()
      }

      if chunk.isEmpty {
        if reachedEOF { break }
        continue
      }

      let frameCount = AVAudioFrameCount(chunk.count / 2)
      guard let inputBuffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: frameCount) else { continue }
      inputBuffer.frameLength = frameCount
      chunk.withUnsafeBytes { rawBuffer in
        if let src = rawBuffer.baseAddress, let dst = inputBuffer.int16ChannelData?[0] {
          memcpy(dst, src, chunk.count)
        }
      }

      let ratio = analyzerFormat.sampleRate / inputFormat.sampleRate
      let outCapacity = AVAudioFrameCount((Double(frameCount) * ratio).rounded(.up) + 32)
      guard let outBuffer = AVAudioPCMBuffer(pcmFormat: analyzerFormat, frameCapacity: outCapacity) else { continue }
      var consumed = false
      var conversionError: NSError?
      converter.convert(to: outBuffer, error: &conversionError) { _, status in
        if consumed {
          status.pointee = .noDataNow
          return nil
        }
        consumed = true
        status.pointee = .haveData
        return inputBuffer
      }
      if conversionError != nil { continue }
      if outBuffer.frameLength > 0 {
        inputBuilder.yield(AnalyzerInput(buffer: outBuffer))
      }
    }

    inputBuilder.finish()
    do {
      try await analyzer.finalizeAndFinishThroughEndOfInput()
    } catch {
      // best effort — results already emitted
    }
    // The results stream terminates once finalize completes; drain the task so
    // the final (isFinal: true) result is emitted before exit rather than racing it.
    await resultsTask.value
    exit(0)
  }
}
