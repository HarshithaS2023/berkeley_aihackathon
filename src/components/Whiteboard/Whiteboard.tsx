import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { blobToBase64 } from '../../lib/fileUtils'
import './Whiteboard.css'

export type WhiteboardHandle = {
  exportToBase64: () => Promise<string | null>
  clear: () => void
  hasContent: () => boolean
}

type WhiteboardProps = {
  className?: string
}

export const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(
  function Whiteboard({ className }, ref) {
    const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
    const [ready, setReady] = useState(false)

    const exportToBase64 = useCallback(async (): Promise<string | null> => {
      const api = apiRef.current
      if (!api) return null

      const elements = api.getSceneElements().filter((el) => !el.isDeleted)
      if (elements.length === 0) return null

      const blob = await exportToBlob({
        elements,
        appState: {
          ...api.getAppState(),
          exportBackground: true,
          exportWithDarkMode: false,
        },
        files: api.getFiles(),
        mimeType: 'image/png',
      })

      return blobToBase64(blob)
    }, [])

    const clear = useCallback(() => {
      apiRef.current?.resetScene()
    }, [])

    const hasContent = useCallback((): boolean => {
      const api = apiRef.current
      if (!api) return false
      return api.getSceneElements().some((el) => !el.isDeleted)
    }, [])

    useImperativeHandle(ref, () => ({ exportToBase64, clear, hasContent }), [
      clear,
      exportToBase64,
      hasContent,
    ])

    return (
      <div className={`whiteboard ${className ?? ''}`.trim()}>
        {!ready && <p className="whiteboard-loading">Loading whiteboard…</p>}
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api
            setReady(true)
          }}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              export: false,
              saveToActiveFile: false,
            },
          }}
        />
      </div>
    )
  },
)
