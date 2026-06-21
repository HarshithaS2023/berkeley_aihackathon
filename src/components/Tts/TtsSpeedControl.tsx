import { TTS_SPEED_OPTIONS } from '../../hooks/useTts'
import './Tts.css'

type TtsSpeedControlProps = {
  speed: number
  onSpeedChange: (speed: number) => void
  disabled?: boolean
}

export function TtsSpeedControl({
  speed,
  onSpeedChange,
  disabled,
}: TtsSpeedControlProps) {
  return (
    <div className="tts-speed-control">
      <svg className="tts-speed-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 8v4l2.5 1.5" />
      </svg>
      <label className="tts-speed-label" htmlFor="tts-speed">
        Speed
      </label>
      <select
        id="tts-speed"
        className="tts-speed-select"
        value={speed}
        disabled={disabled}
        aria-label="Read-aloud speed"
        onChange={(event) => onSpeedChange(Number.parseFloat(event.target.value))}
      >
        {TTS_SPEED_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
