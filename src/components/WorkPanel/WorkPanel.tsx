import { useEffect, useRef, useState } from 'react'
import { useLivePeek } from '../../hooks/useLivePeek'
import type { Question, WorkSubmissionInput } from '../../types'
import { getWorkSubmission } from '../../lib/workSubmission'
import { Whiteboard, type WhiteboardHandle } from '../Whiteboard/Whiteboard'
import { WorkUpload } from '../Upload/WorkUpload'
import './WorkPanel.css'

const LIVE_FEEDBACK_VISIBILITY_KEY = 'learn-grow-live-feedback-visible'
const LIVE_FEEDBACK_VOICE_KEY = 'learn-grow-live-feedback-voice'

type WorkPanelProps = {
  question: Question | null
  onSubmitWork: (work: WorkSubmissionInput) => void | Promise<void>
  onShowHint?: () => void
  onSpeak?: (text: string) => void | Promise<void>
  onStopSpeaking?: () => void
  onEnableVoice?: () => boolean | Promise<boolean>
  audioUnlocked?: boolean
  disabled?: boolean
  submitting?: boolean
}

export function WorkPanel({
  question,
  onSubmitWork,
  onShowHint,
  onSpeak,
  onStopSpeaking,
  onEnableVoice,
  audioUnlocked = false,
  disabled,
  submitting = false,
}: WorkPanelProps) {
  const whiteboardRef = useRef<WhiteboardHandle>(null)
  const [workFile, setWorkFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showLiveFeedback, setShowLiveFeedback] = useState(
    () => localStorage.getItem(LIVE_FEEDBACK_VISIBILITY_KEY) !== 'false',
  )
  const [voiceEnabled, setVoiceEnabled] = useState(
    () =>
      audioUnlocked &&
      localStorage.getItem(LIVE_FEEDBACK_VOICE_KEY) === 'true',
  )
  const lastSpokenFeedbackRef = useRef('')

  const isBusy = disabled || submitting || isSubmitting
  const livePeek = useLivePeek({
    whiteboardRef,
    question,
    enabled: showLiveFeedback && !isBusy && !workFile,
  })

  useEffect(() => {
    const spoken = (livePeek.spoken ?? '').trim()
    if (
      !voiceEnabled ||
      !showLiveFeedback ||
      !spoken ||
      spoken === lastSpokenFeedbackRef.current ||
      !onSpeak
    ) {
      return
    }

    lastSpokenFeedbackRef.current = spoken
    void onSpeak(spoken)
  }, [livePeek.spoken, onSpeak, showLiveFeedback, voiceEnabled])

  function toggleLiveFeedback() {
    setShowLiveFeedback((visible) => {
      const next = !visible
      localStorage.setItem(LIVE_FEEDBACK_VISIBILITY_KEY, String(next))
      if (!next) onStopSpeaking?.()
      return next
    })
  }

  async function toggleVoiceFeedback() {
    if (voiceEnabled) {
      localStorage.setItem(LIVE_FEEDBACK_VOICE_KEY, 'false')
      setVoiceEnabled(false)
      onStopSpeaking?.()
      return
    }

    const enabled = (await onEnableVoice?.()) ?? true
    if (!enabled) return

    lastSpokenFeedbackRef.current = ''
    localStorage.setItem(LIVE_FEEDBACK_VOICE_KEY, 'true')
    setVoiceEnabled(true)
  }

  async function handleSubmit() {
    setError(null)
    setIsSubmitting(true)
    try {
      const whiteboardImageBase64 = workFile
        ? null
        : await whiteboardRef.current?.exportToBase64()
      const work = await getWorkSubmission(
        workFile,
        whiteboardImageBase64 ?? null,
      )
      await onSubmitWork(work)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit work.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClear() {
    whiteboardRef.current?.clear()
    setWorkFile(null)
    setError(null)
  }

  return (
    <section className="work-panel">
      <div className="work-panel-heading">
        <div>
          <span className="work-panel-step">Workspace</span>
          <h3>Show your thinking</h3>
        </div>
        <p>Draw directly below. Your canvas is submitted automatically.</p>
      </div>

      <div
        className={
          showLiveFeedback
            ? 'work-panel-body'
            : 'work-panel-body work-panel-body--feedback-hidden'
        }
      >
        <Whiteboard
          ref={whiteboardRef}
          className="work-panel-whiteboard"
          onChange={livePeek.notifyChange}
        />

        {showLiveFeedback ? (
          <aside className="work-panel-coach" aria-live="polite">
            <div className="work-panel-coach-heading">
              <div>
                <span className="coach-status-dot" />
                <strong>Live feedback</strong>
              </div>
              <div className="work-panel-coach-controls">
                <button
                  type="button"
                  className={voiceEnabled ? 'coach-voice is-active' : 'coach-voice'}
                  aria-pressed={voiceEnabled}
                  onClick={() => void toggleVoiceFeedback()}
                >
                  {voiceEnabled ? 'Voice on' : 'Voice off'}
                </button>
                <button type="button" onClick={toggleLiveFeedback}>
                  Hide
                </button>
              </div>
            </div>
            <div className="work-panel-coach-copy">
              <p>
                {livePeek.loading && !livePeek.peek
                  ? 'Taking a quick look at your work…'
                  : livePeek.error ||
                    livePeek.peek ||
                    'Start writing on the whiteboard. Feedback will appear here as you work.'}
              </p>
              {livePeek.loading && <span className="coach-loading">Reviewing…</span>}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            className="work-panel-feedback-show"
            onClick={toggleLiveFeedback}
          >
            <span className="coach-status-dot" />
            Show live feedback
          </button>
        )}
      </div>

      <div className="work-panel-footer">
        <WorkUpload
          file={workFile}
          onFileChange={setWorkFile}
          disabled={isBusy}
          compact
        />
        <div className="work-panel-actions">
          <button
            type="button"
            className="work-panel-clear"
            disabled={isBusy}
            onClick={handleClear}
          >
            Clear
          </button>
          {onShowHint && (
            <button
              type="button"
              className="quiz-secondary"
              disabled={isBusy}
              onClick={onShowHint}
            >
              <span aria-hidden="true">✦</span>
              Hint
            </button>
          )}
          <button
            type="button"
            className="quiz-primary"
            disabled={isBusy}
            onClick={handleSubmit}
          >
            {isSubmitting || submitting ? 'Submitting…' : 'Submit work'}
            {!isSubmitting && !submitting && <span aria-hidden="true">→</span>}
          </button>
        </div>
      </div>

      {workFile && (
        <p className="work-panel-file-note">
          The uploaded photo will be submitted instead of the canvas.
        </p>
      )}
      {error && <p className="work-panel-error">{error}</p>}
    </section>
  )
}
