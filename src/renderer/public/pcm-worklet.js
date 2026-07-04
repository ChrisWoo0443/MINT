/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Downsamples the input to targetSampleRate and posts fixed-size Float32Array
// chunks back to the node. Runs on the audio rendering thread.
class PcmDownsamplerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.targetSampleRate = options.processorOptions.targetSampleRate
    this.chunkSize = options.processorOptions.chunkSize
    this.pending = new Float32Array(0)
  }

  downsample(input) {
    if (sampleRate === this.targetSampleRate) return input
    const ratio = sampleRate / this.targetSampleRate
    const outputLength = Math.round(input.length / ratio)
    const output = new Float32Array(outputLength)
    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i * ratio
      const lower = Math.floor(sourceIndex)
      const upper = Math.min(lower + 1, input.length - 1)
      const t = sourceIndex - lower
      output[i] = input[lower] * (1 - t) + input[upper] * t
    }
    return output
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel || channel.length === 0) return true

    const down = this.downsample(channel)
    const merged = new Float32Array(this.pending.length + down.length)
    merged.set(this.pending, 0)
    merged.set(down, this.pending.length)
    this.pending = merged

    while (this.pending.length >= this.chunkSize) {
      const chunk = this.pending.slice(0, this.chunkSize)
      this.pending = this.pending.slice(this.chunkSize)
      this.port.postMessage(chunk, [chunk.buffer])
    }
    return true
  }
}

registerProcessor('pcm-downsampler', PcmDownsamplerProcessor)
