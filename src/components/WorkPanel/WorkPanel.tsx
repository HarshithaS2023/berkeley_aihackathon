import { useRef, useState } from 'react'
import type { WorkSubmissionInput } from '../../types'
import { getWorkSubmission } from '../../lib/workSubmission'
import { Whiteboard, type WhiteboardHandle } from '../Whiteboard/Whiteboard'
import { WorkUpload } from '../Upload/WorkUpload'
import './WorkPanel.css'

type WorkPanelProps = {
  onSubmitWork: (work: WorkSubmissionInput) => void | Promise<void>
  onShowHint?: () => void
  disabled?: boolean
  submitting?: boolean
}

export function WorkPanel({
  onSubmitWork,
  onShowHint,
  disabled,
  submitting = false,
}: WorkPanelProps) {
  const whiteboardRef = useRef<WhiteboardHandle>(null)
  const [workFile, setWorkFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isBusy = disabled || submitting || isSubmitting

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

      <Whiteboard ref={whiteboardRef} className="work-panel-whiteboard" />

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
