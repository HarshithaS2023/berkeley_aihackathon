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
  const [savedWhiteboardBase64, setSavedWhiteboardBase64] = useState<string | null>(null)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const whiteboardPreviewUrl = savedWhiteboardBase64
    ? `data:image/png;base64,${savedWhiteboardBase64}`
    : null

  const isBusy = disabled || submitting || isSubmitting

  async function handleSubmit() {
    setError(null)
    setIsSubmitting(true)
    try {
      const work = await getWorkSubmission(workFile, savedWhiteboardBase64)
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
    setSavedWhiteboardBase64(null)
    setError(null)
  }

  async function handleSaveWhiteboard() {
    setError(null)
    const exported = await whiteboardRef.current?.exportToBase64()
    if (!exported) {
      setError('Draw something on the whiteboard before saving.')
      return
    }
    setSavedWhiteboardBase64(exported)
    setWhiteboardOpen(false)
  }

  function handleCloseWhiteboard() {
    setWhiteboardOpen(false)
    setError(null)
  }

  return (
    <section className="work-panel">
      <header className="work-panel-header">
        <h3>Show your work</h3>
        <button
          type="button"
          className="secondary"
          disabled={isBusy}
          onClick={() => setWhiteboardOpen(true)}
        >
          Open whiteboard
        </button>
      </header>

      <WorkUpload file={workFile} onFileChange={setWorkFile} disabled={isBusy} />

      {savedWhiteboardBase64 && (
        <div className="work-panel-whiteboard-saved">
          <div className="work-panel-whiteboard-saved-header">
            <strong>Whiteboard work saved</strong>
            <button
              type="button"
              className="upload-clear"
              disabled={isBusy}
              onClick={() => {
                setSavedWhiteboardBase64(null)
                whiteboardRef.current?.clear()
              }}
            >
              Remove
            </button>
          </div>
          {whiteboardPreviewUrl && (
            <img
              src={whiteboardPreviewUrl}
              alt="Saved whiteboard work"
              className="upload-preview upload-preview--small"
            />
          )}
          {!workFile && (
            <p className="work-panel-whiteboard-note">
              This will be submitted if you don't upload a photo.
            </p>
          )}
        </div>
      )}

      <div className="work-panel-actions">
        <button
          type="button"
          className="work-panel-clear"
          disabled={isBusy}
          onClick={handleClear}
        >
          Clear all
        </button>
        <div className="work-panel-actions-right">
          {onShowHint && (
            <button
              type="button"
              className="secondary"
              disabled={isBusy}
              onClick={onShowHint}
            >
              Show hint
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={isBusy}
            onClick={handleSubmit}
          >
            {isSubmitting || submitting ? 'Submitting…' : 'Submit work'}
          </button>
        </div>
      </div>

      {error && !whiteboardOpen && <p className="work-panel-error">{error}</p>}

      {whiteboardOpen && (
        <div className="whiteboard-modal-backdrop" onClick={handleCloseWhiteboard}>
          <div
            className="whiteboard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whiteboard-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="whiteboard-modal-header">
              <h3 id="whiteboard-modal-title">Whiteboard</h3>
              <button
                type="button"
                className="whiteboard-modal-close"
                onClick={handleCloseWhiteboard}
                aria-label="Close whiteboard"
              >
                ×
              </button>
            </header>

            <Whiteboard ref={whiteboardRef} className="whiteboard-modal-canvas" />

            {error && <p className="work-panel-error">{error}</p>}

            <div className="whiteboard-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => whiteboardRef.current?.clear()}
              >
                Clear
              </button>
              <button type="button" className="secondary" onClick={handleCloseWhiteboard}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveWhiteboard}>
                Save work
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
