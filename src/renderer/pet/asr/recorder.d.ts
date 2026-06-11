declare const Recorder: {
  (config: {
    type: string
    bitRate: number
    sampleRate: number
    onProcess: (
      buffer: Int16Array[],
      powerLevel: number,
      bufferDuration: number,
      bufferSampleRate: number,
      newBufferIdx: number,
      asyncEnd: () => void
    ) => void
  }): RecorderInstance
  SampleData: (
    buffer: Int16Array[],
    fromRate: number,
    toRate: number
  ) => { data: Int16Array }
}

interface RecorderInstance {
  open: (success: () => void, fail?: (msg: string) => void) => void
  start: () => void
  stop: (success: (blob: Blob, duration: number) => void, fail?: (msg: string) => void) => void
  close: () => void
}
