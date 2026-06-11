import type { AppConfig } from '../../../shared/types'

type AsrConfig = AppConfig['asr']

interface AsrMessage {
  text?: string
  mode?: string
  is_final?: boolean
}

const CHUNK_SIZE = 960
const RECORDER_SCRIPTS = ['recorder-core.js', 'wav.js', 'pcm.js']
let recorderLoadPromise: Promise<void> | null = null

function scriptUrl(file: string): string {
  const pagePath = window.location.pathname
  const entryBase = pagePath.includes('/dialog') ? '/dialog/' : '/pet/'
  return new URL(`asr/${file}`, new URL(entryBase, window.location.origin)).href
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.charset = 'UTF-8'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`无法加载录音组件：${src}`))
    document.head.appendChild(script)
  })
}

async function ensureRecorderLoaded(): Promise<void> {
  if (typeof Recorder !== 'undefined') return
  if (!recorderLoadPromise) {
    recorderLoadPromise = (async () => {
      for (const file of RECORDER_SCRIPTS) {
        await loadScript(scriptUrl(file))
      }
    })()
  }
  await recorderLoadPromise
}

function parseHotwords(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const lines = trimmed.split(/\r?\n/)
  const result: Record<string, number> = {}
  const weightRe = /^[0-9]+$/

  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 2) continue
    const weight = parts[parts.length - 1]
    if (!weightRe.test(weight)) continue
    const word = parts.slice(0, -1).join(' ').trim()
    if (word) result[word] = parseInt(weight, 10)
  }

  return Object.keys(result).length ? JSON.stringify(result) : null
}

export class FunAsrClient {
  private socket: WebSocket | null = null
  private recorder: RecorderInstance | null = null
  private sampleBuf = new Int16Array()
  private recText = ''
  private offlineText = ''
  private recording = false
  private resolveStop: ((text: string) => void) | null = null
  private stopTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly config: AsrConfig,
    private readonly onTextChange?: (text: string) => void
  ) {}

  async start(): Promise<void> {
    if (!this.config.wssUrl.match(/wss:\S*|ws:\S*/i)) {
      throw new Error('请检查 ASR WebSocket 地址格式')
    }

    await ensureRecorderLoaded()

    this.recText = ''
    this.offlineText = ''
    this.sampleBuf = new Int16Array()
    this.recording = true

    await this.connect()
    await this.openRecorder()
    this.recorder?.start()
  }

  stop(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recording) {
        resolve('')
        return
      }

      this.resolveStop = resolve
      this.recording = false

      const request = {
        chunk_size: [5, 10, 5],
        wav_name: 'h5',
        is_speaking: false,
        chunk_interval: 10,
        mode: this.config.mode
      }

      if (this.sampleBuf.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(this.sampleBuf)
        this.sampleBuf = new Int16Array()
      }
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(request))
      }

      this.recorder?.stop(
        () => {
          this.recorder?.close()
          this.recorder = null
        },
        (msg) => reject(new Error(msg))
      )

      this.stopTimer = setTimeout(() => {
        this.closeSocket()
        this.resolveStop?.(this.recText.trim())
        this.resolveStop = null
      }, 3000)
    })
  }

  cancel(): void {
    this.recording = false
    if (this.stopTimer) clearTimeout(this.stopTimer)
    this.recorder?.close()
    this.recorder = null
    this.closeSocket()
    this.resolveStop?.('')
    this.resolveStop = null
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.config.wssUrl)
      this.socket = socket

      socket.onopen = () => {
        const request: Record<string, unknown> = {
          chunk_size: [5, 10, 5],
          wav_name: 'h5',
          is_speaking: true,
          chunk_interval: 10,
          itn: this.config.useItn,
          mode: this.config.mode
        }

        const hotwords = parseHotwords(this.config.hotwords)
        if (hotwords) request.hotwords = hotwords

        socket.send(JSON.stringify(request))
        resolve()
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as AsrMessage
          const text = data.text ?? ''
          const asrModel = data.mode ?? ''
          if (asrModel === '2pass-offline' || asrModel === 'offline') {
            this.offlineText += text
            this.recText = this.offlineText
          } else {
            this.recText += text
          }
          this.onTextChange?.(this.recText)
        } catch {
          // ignore malformed payloads
        }
      }

      socket.onerror = () => {
        reject(new Error(`无法连接 ASR 服务：${this.config.wssUrl}`))
      }

      socket.onclose = () => {
        if (this.recording) {
          reject(new Error('ASR 连接已断开'))
        }
      }
    })
  }

  private openRecorder(): Promise<void> {
    return new Promise((resolve, reject) => {
      const rec = Recorder({
        type: 'pcm',
        bitRate: 16,
        sampleRate: 16000,
        onProcess: (buffer, _power, _duration, bufferSampleRate) => {
          if (!this.recording) return

          const data48k = buffer[buffer.length - 1]
          const data16k = Recorder.SampleData([data48k], bufferSampleRate, 16000).data
          this.sampleBuf = Int16Array.from([...this.sampleBuf, ...data16k])

          while (this.sampleBuf.length >= CHUNK_SIZE) {
            const sendBuf = this.sampleBuf.slice(0, CHUNK_SIZE)
            this.sampleBuf = this.sampleBuf.slice(CHUNK_SIZE)
            if (this.socket?.readyState === WebSocket.OPEN) {
              this.socket.send(sendBuf)
            }
          }
        }
      })

      this.recorder = rec
      rec.open(
        () => resolve(),
        (msg) => reject(new Error(msg || '无法打开麦克风'))
      )
    })
  }

  private closeSocket(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.socket.close()
    }
    this.socket = null
  }
}
