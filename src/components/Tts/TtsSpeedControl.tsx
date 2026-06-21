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
    <div className="tts-toolbar">
      <label htmlFor="tts-speed">Read-aloud speed</label>
      <select
        id="tts-speed"
        value={speed}
        disabled={disabled}
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
