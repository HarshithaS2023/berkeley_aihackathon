import { mockSourceProfile } from './mockData'
import type { SourceProfile } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API !== 'false'

export async function analyzeSource(file: File): Promise<SourceProfile> {
  if (USE_MOCK) {
    await delay(600)
    console.info('[mock] analyze-source', {
      name: file.name,
      size: file.size,
      type: file.type,
    })
    return mockSourceProfile
  }

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE}/analyze-source`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `analyze-source failed: ${response.status}`)
  }

  return response.json() as Promise<SourceProfile>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
