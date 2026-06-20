import type { WorkSubmissionInput } from '../types'
import { workFileToBase64 } from './fileUtils'

export async function getWorkSubmission(
  workFile: File | null,
  whiteboardImageBase64: string | null,
): Promise<WorkSubmissionInput> {
  if (workFile) {
    return { uploadedWorkFileBase64: await workFileToBase64(workFile) }
  }

  if (whiteboardImageBase64) {
    return { whiteboardImageBase64 }
  }

  throw new Error('Upload your work or open the whiteboard and save your drawing.')
}
