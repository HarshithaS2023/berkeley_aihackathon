import './Tts.css'

type ReadAloudButtonProps = {
  text: string
  label?: string
  isSpeaking: boolean
  isLoading?: boolean
  disabled?: boolean
  onSpeak: (text: string) => void | Promise<void>
  onStop: () => void
}

export function ReadAloudButton({
  text,
  label = 'Read aloud',
  isSpeaking,
  isLoading = false,
  disabled,
  onSpeak,
  onStop,
}: ReadAloudButtonProps) {
  const isActive = isSpeaking

  return (
    <button
      type="button"
      className="read-aloud-button"
      disabled={disabled || !text.trim() || isLoading}
      aria-pressed={isActive}
      aria-busy={isLoading}
      onClick={() => {
        if (isActive) {
          onStop()
          return
        }
        void onSpeak(text)
      }}
    >
      {isActive ? 'Stop' : isLoading ? 'Loading…' : label}
    </button>
  )
}
