import type { HoldToTalkPhase } from './useHoldToTalk'

interface VoiceHoldButtonProps {
  phase: HoldToTalkPhase
  disabled?: boolean
  className?: string
  onStart: () => void
  onEnd: () => void
  onCancel?: () => void
  title?: string
  showLabel?: boolean
}

export default function VoiceHoldButton({
  phase,
  disabled = false,
  className = '',
  onStart,
  onEnd,
  onCancel,
  title,
  showLabel = false
}: VoiceHoldButtonProps) {
  const isRecording = phase === 'recording' || phase === 'arming'
  const defaultTitle = isRecording
    ? '松手填入输入框'
    : '按住说话，松手填入输入框'

  const stopHold = () => {
    if (phase === 'arming') {
      onCancel?.()
    } else {
      void onEnd()
    }
  }

  return (
    <button
      type="button"
      className={`voice-hold-btn ${phase} ${className}`.trim()}
      disabled={disabled || phase === 'processing'}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled && phase === 'idle') onStart()
      }}
      onMouseUp={(e) => {
        e.stopPropagation()
        if (isRecording) stopHold()
      }}
      onMouseLeave={(e) => {
        e.stopPropagation()
        if (isRecording) stopHold()
      }}
      onTouchStart={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled && phase === 'idle') onStart()
      }}
      onTouchEnd={(e) => {
        e.stopPropagation()
        if (isRecording) stopHold()
      }}
      title={title ?? defaultTitle}
      aria-label={title ?? defaultTitle}
    >
      <span className="voice-hold-icon" aria-hidden>
        {phase === 'processing' ? '⏳' : isRecording ? '🔴' : '🎤'}
      </span>
      {showLabel ? <span className="voice-hold-label">{isRecording ? '松手填入' : '按住说话'}</span> : null}
    </button>
  )
}
