import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppConfig } from '../../shared/types'
import { FunAsrClient } from '../pet/asr/funasr-client'

export type HoldToTalkPhase = 'idle' | 'arming' | 'recording' | 'processing'

type AsrConfig = AppConfig['asr']

export interface UseHoldToTalkOptions {
  asrConfig: AsrConfig | null
  onRecordingStart?: () => void | Promise<void>
  onPartialResult?: (text: string) => void
  onResult: (text: string) => void | Promise<void>
  onCancel?: () => void
  onError?: (message: string) => void
  disabled?: boolean
}

export function useHoldToTalk({
  asrConfig,
  onRecordingStart,
  onPartialResult,
  onResult,
  onCancel,
  onError,
  disabled = false
}: UseHoldToTalkOptions) {
  const [phase, setPhase] = useState<HoldToTalkPhase>('idle')
  const clientRef = useRef<FunAsrClient | null>(null)
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdingRef = useRef(false)
  const phaseRef = useRef<HoldToTalkPhase>('idle')
  const onRecordingStartRef = useRef(onRecordingStart)
  const onPartialResultRef = useRef(onPartialResult)
  const onResultRef = useRef(onResult)
  const onCancelRef = useRef(onCancel)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onRecordingStartRef.current = onRecordingStart
    onPartialResultRef.current = onPartialResult
    onResultRef.current = onResult
    onCancelRef.current = onCancel
    onErrorRef.current = onError
  }, [onRecordingStart, onPartialResult, onResult, onCancel, onError])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current)
      armTimerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    clearArmTimer()
    holdingRef.current = false
    clientRef.current?.cancel()
    clientRef.current = null
    setPhase('idle')
  }, [clearArmTimer])

  const beginRecording = useCallback(async () => {
    if (!asrConfig?.enabled || phaseRef.current === 'processing') return

    const client = new FunAsrClient(asrConfig, (text) => {
      onPartialResultRef.current?.(text)
    })
    clientRef.current = client
    setPhase('recording')
    try {
      await onRecordingStartRef.current?.()
      await client.start()
      onPartialResultRef.current?.('')
    } catch (err) {
      reset()
      onErrorRef.current?.(err instanceof Error ? err.message : '无法开始录音')
    }
  }, [asrConfig, reset])

  const startHold = useCallback(() => {
    if (disabled || !asrConfig?.enabled) {
      if (!asrConfig?.enabled) onErrorRef.current?.('请先在配置页启用语音识别')
      return
    }
    if (phaseRef.current === 'processing' || holdingRef.current) return

    holdingRef.current = true
    clearArmTimer()

    const delay = Math.max(0, asrConfig.holdDelayMs ?? 0)
    if (delay === 0) {
      void beginRecording()
      return
    }

    setPhase('arming')
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null
      if (!holdingRef.current) return
      void beginRecording()
    }, delay)
  }, [asrConfig, beginRecording, clearArmTimer, disabled])

  const endHold = useCallback(async () => {
    if (!holdingRef.current) return
    holdingRef.current = false
    clearArmTimer()

    const currentPhase = phaseRef.current
    if (currentPhase === 'arming') {
      reset()
      return
    }

    if (currentPhase !== 'recording') return

    setPhase('processing')
    try {
      const text = (await clientRef.current?.stop()) ?? ''
      clientRef.current = null
      await onResultRef.current(text)
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : '语音识别失败')
    } finally {
      setPhase('idle')
    }
  }, [clearArmTimer, reset])

  const cancelHold = useCallback(() => {
    holdingRef.current = false
    clearArmTimer()
    clientRef.current?.cancel()
    clientRef.current = null
    setPhase('idle')
    onCancelRef.current?.()
  }, [clearArmTimer])

  useEffect(() => () => reset(), [reset])

  const isActive = phase !== 'idle'
  const hint =
    phase === 'arming'
      ? `继续按住 ${((asrConfig?.holdDelayMs ?? 0) / 1000).toFixed(1)}s 开始说话…`
      : phase === 'recording'
        ? '松手填入输入框'
        : phase === 'processing'
          ? '识别中…'
          : ''

  return {
    phase,
    isActive,
    hint,
    startHold,
    endHold,
    cancelHold
  }
}
