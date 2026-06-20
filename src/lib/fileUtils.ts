export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const ACCEPTED_SOURCE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function validateSourceFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File is too large (max ${formatFileSize(MAX_UPLOAD_BYTES)}).`
  }

  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (isPdf || ACCEPTED_SOURCE_TYPES.has(file.type)) {
    return null
  }

  return 'Please upload a PDF or image (JPEG, PNG, WebP, GIF).'
}

export function validateWorkImageFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File is too large (max ${formatFileSize(MAX_UPLOAD_BYTES)}).`
  }

  if (!file.type.startsWith('image/')) {
    return 'Please upload an image file.'
  }

  return null
}

export function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',')
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read blob as base64.'))
        return
      }
      resolve(stripDataUrlPrefix(reader.result))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read blob.'))
    reader.readAsDataURL(blob)
  })
}

export function fileToBase64(file: File): Promise<string> {
  return blobToBase64(file)
}

export function workFileToBase64(file: File): Promise<string> {
  return fileToBase64(file)
}

export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif)$/i.test(file.name)
  )
}

export function createImagePreviewUrl(file: File): string {
  return URL.createObjectURL(file)
}
