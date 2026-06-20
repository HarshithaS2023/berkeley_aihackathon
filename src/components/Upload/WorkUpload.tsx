import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  createImagePreviewUrl,
  formatFileSize,
  validateWorkImageFile,
} from "../../lib/fileUtils";
import "./Upload.css";

type WorkUploadProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
};

export function WorkUpload({ file, onFileChange, disabled }: WorkUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(() => {
    if (!file) return null;
    return createImagePreviewUrl(file);
  }, [file]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleFileSelect(selected: File | null) {
    setError(null);

    if (!selected) {
      onFileChange(null);
      return;
    }

    const validationError = validateWorkImageFile(selected);
    if (validationError) {
      setError(validationError);
      onFileChange(null);
      return;
    }

    onFileChange(selected);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    handleFileSelect(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    handleFileSelect(event.dataTransfer.files[0] ?? null);
  }

  return (
    <div className="upload-panel">
      <div
        className={`upload-dropzone ${disabled ? "upload-dropzone--disabled" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="upload-input"
          disabled={disabled}
          onChange={handleInputChange}
        />
        <label htmlFor={inputId} className="upload-label">
          <span className="upload-label-title">Upload your work</span>
          <span className="upload-label-hint">Photo of written work · drag & drop or click to browse</span>
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
              onFileChange(null);
              if (inputRef.current) inputRef.current.value = "";
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
  );
}
