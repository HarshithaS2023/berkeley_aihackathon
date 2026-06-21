import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  createImagePreviewUrl,
  formatFileSize,
  validateWorkImageFile,
} from '../../lib/fileUtils'
import './Upload.css'

type WorkUploadProps = {
  file: File | null
  onFileChange: (file: File | null) => void
  disabled?: boolean
  compact?: boolean
}

export function WorkUpload({
  file,
  onFileChange,
  disabled,
  compact = false,
}: WorkUploadProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const previewUrl = useMemo(
    () => (file ? createImagePreviewUrl(file) : null),
    [file],
  )

  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function handleFileSelect(selected: File | null) {
    setError(null)
    if (!selected) {
      onFileChange(null)
      return
    }
    const validationError = validateWorkImageFile(selected)
    if (validationError) {
      setError(validationError)
      onFileChange(null)
      return
    }
    onFileChange(selected)
  }

  return (
    <div className={`upload-panel ${compact ? 'upload-panel--compact' : ''}`}>
      <div
        className={`upload-dropzone ${
          disabled ? 'upload-dropzone--disabled' : ''
        }`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          if (!disabled) handleFileSelect(event.dataTransfer.files[0] ?? null)
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="upload-input"
          disabled={disabled}
          onChange={(event) =>
            handleFileSelect(event.target.files?.[0] ?? null)
          }
        />
        <label htmlFor={inputId} className="upload-label">
          <span className="upload-label-title">Use a photo instead</span>
          <span className="upload-label-hint">Click or drop written work</span>
        </label>
      </div>

      {file && (
        <div className="upload-file-info">
          <div>
            <strong>{file.name}</strong>
            <span>{formatFileSize(file.size)}</span>
          </div>
          <button
            type="button"
            className="upload-clear"
            disabled={disabled}
            onClick={() => {
              onFileChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            Remove
          </button>
        </div>
      )}
      {previewUrl && (
        <img src={previewUrl} alt="Work preview" className="upload-preview" />
      )}
      {error && <p className="upload-error">{error}</p>}
    </div>
  )
}
