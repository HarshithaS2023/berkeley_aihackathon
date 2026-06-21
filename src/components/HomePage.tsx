import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import mascot from '../assets/hero.png'
import { API_BASE } from '../lib/apiBase'
import { useQuizStore } from '../store/quizStore'

interface UploadedFile {
  name: string
  base64: string
  mimeType: string
}

export default function HomePage() {
  const [chatInput, setChatInput] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [numQuestions, setNumQuestions] = useState(5)
  const [numQuestionsInput, setNumQuestionsInput] = useState('5')
  const [whiteboardGraded, setWhiteboardGraded] = useState(false)

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const addUploadedFile = (f: UploadedFile) => setUploadedFiles((prev) => [...prev, f])
  const removeUploadedFile = (name: string) => setUploadedFiles((prev) => prev.filter((f) => f.name !== name))

  const setSettings = useQuizStore((s) => s.setSettings)
  const setSourceProfile = useQuizStore((s) => s.setSourceProfile)
  const startQuiz = useQuizStore((s) => s.startQuiz)

  const difficultyLevels: { label: string; value: 'easy' | 'medium' | 'hard'; num: number }[] = [
    { label: 'Easy',   value: 'easy',   num: 1 },
    { label: 'Medium', value: 'medium', num: 3 },
    { label: 'Hard',   value: 'hard',   num: 5 },
  ]


  const readFileAsBase64 = (file: File): Promise<UploadedFile> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        resolve({ name: file.name, base64: dataUrl.split(',')[1], mimeType: file.type })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const processFiles = async (fileList: FileList | File[]) => {
    const existing = new Set(uploadedFiles.map((f) => f.name))
    for (const file of Array.from(fileList)) {
      if (!existing.has(file.name)) {
        addUploadedFile(await readFileAsBase64(file))
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await processFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) await processFiles(e.dataTransfer.files)
  }

  const handleEnter = async () => {
    if (uploadedFiles.length === 0) {
      setError('Please upload at least one study material.')
      return
    }
    setError(null)
    setIsAnalyzing(true)

    const selectedLevel = difficultyLevels.find((d) => d.value === difficulty)!
    setSettings({ numQuestions, startingDifficulty: selectedLevel.num as 1 | 2 | 3 | 4 | 5 })

    try {
      const res = await fetch(`${API_BASE}/analyze-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles }),
      })
      if (res.ok) {
        const data = await res.json()
        setSourceProfile({
          topics: data.topics ?? [],
          concepts: data.concepts ?? [],
          styleNotes: data.styleNotes ?? (whiteboardGraded ? 'Grade whiteboard work.' : ''),
        })
      } else {
        setSourceProfile({ topics: [], concepts: [], styleNotes: '' })
      }
    } catch {
      setSourceProfile({ topics: [], concepts: [], styleNotes: '' })
    }

    await startQuiz()
    setIsAnalyzing(false)

    const nextPhase = useQuizStore.getState().phase
    if (nextPhase === 'error') {
      navigate('/error')
    } else {
      navigate('/quiz')
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Header */}
      <header
        className="px-6 py-4 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-h)' }}>
          Professor X
        </span>
        <span className="text-sm" style={{ color: 'var(--text)' }}>— your personal tutor</span>
      </header>

      {/* Mascot area — 3 columns: difficulty | mascot | spacer */}
      <div className="flex-1 flex items-center px-8 gap-8">

        {/* Left: controls */}
        <div className="flex flex-col gap-5 w-44 flex-shrink-0">

          {/* Difficulty */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
              Difficulty
            </p>
            {difficultyLevels.map(({ label, value }) => {
              const isSelected = difficulty === value
              return (
                <button
                  key={value}
                  onClick={() => setDifficulty(value)}
                  style={{
                    background: isSelected ? 'var(--accent)' : 'var(--bg)',
                    color: isSelected ? '#fff' : 'var(--text-h)',
                    border: isSelected ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 600 : 400,
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Number of questions */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
              # of Questions
            </p>
            <div
              className="flex items-center gap-1"
              style={{
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: 'var(--bg)',
                padding: '4px 8px',
              }}
            >
              <button
                onClick={() => { const n = Math.max(1, numQuestions - 1); setNumQuestions(n); setNumQuestionsInput(String(n)) }}
                style={{ color: 'var(--text-h)', fontSize: '1.1rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
              >−</button>
              <input
                type="text"
                inputMode="numeric"
                value={numQuestionsInput}
                onChange={(e) => setNumQuestionsInput(e.target.value)}
                onBlur={() => {
                  const v = parseInt(numQuestionsInput)
                  const clamped = isNaN(v) ? 5 : Math.min(20, Math.max(1, v))
                  setNumQuestions(clamped)
                  setNumQuestionsInput(String(clamped))
                }}
                style={{
                  width: '36px',
                  textAlign: 'center',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-h)',
                  fontSize: '0.95rem',
                }}
              />
              <button
                onClick={() => { const n = Math.min(20, numQuestions + 1); setNumQuestions(n); setNumQuestionsInput(String(n)) }}
                style={{ color: 'var(--text-h)', fontSize: '1.1rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
              >+</button>
            </div>
          </div>

          {/* Whiteboard grading toggle */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
              Whiteboard work graded
            </p>
            <button
              onClick={() => setWhiteboardGraded((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              aria-pressed={whiteboardGraded}
            >
              {/* Pill track */}
              <div style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                background: whiteboardGraded ? 'var(--accent)' : 'var(--border)',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}>
                {/* Thumb */}
                <div style={{
                  position: 'absolute',
                  top: '3px',
                  left: whiteboardGraded ? '23px' : '3px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-h)' }}>
                {whiteboardGraded ? 'On' : 'Off'}
              </span>
            </button>
          </div>

        </div>

        {/* Center: mascot */}
        <div className="flex-1 flex flex-col items-center gap-4">
          {/* Speech bubble */}
          <div
            className="relative px-5 py-4 max-w-xs text-center"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              boxShadow: 'var(--shadow)',
            }}
          >
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
              Hi! Upload your study materials below and tell me how many questions you want me to generate!
            </p>
            <div
              className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                bottom: '-10px',
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: '10px solid var(--border)',
              }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                bottom: '-8px',
                borderLeft: '9px solid transparent',
                borderRight: '9px solid transparent',
                borderTop: '9px solid var(--bg)',
              }}
            />
          </div>

          <img src={mascot} alt="Professor X mascot" className="w-44 h-44 object-contain" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.12))' }} />
        </div>

        {/* Right spacer to keep mascot centered */}
        <div className="w-44 flex-shrink-0" />

      </div>

      {/* Bottom bar — fixed height so it never grows with file count */}
      <div
        className="flex"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)', height: '100px', flexShrink: 0 }}
      >
        {/* Left: dropzone */}
        <div
          className="w-56 flex flex-col transition-colors"
          style={{
            borderRight: '1px solid var(--border)',
            background: dragOver ? 'var(--accent-bg)' : 'var(--code-bg)',
            borderLeft: dragOver ? '2px solid var(--accent-border)' : '2px solid transparent',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Scrollable file list */}
          <div className="flex-1 overflow-y-auto px-3 pt-2" style={{ minHeight: 0 }}>
            {uploadedFiles.length === 0 ? (
              <p className="text-xs italic" style={{ color: 'var(--text)' }}>
                Drop files or click +
              </p>
            ) : (
              uploadedFiles.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-1.5 text-xs group mb-1"
                  style={{ color: 'var(--text-h)' }}
                >
                  <svg width="13" height="15" viewBox="0 0 14 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2 0h7l5 5v11H2V0z" fill="var(--code-bg)" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round" />
                    <path d="M9 0v5h5" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round" />
                    <line x1="4" y1="8.5" x2="10" y2="8.5" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
                    <line x1="4" y1="11" x2="8" y2="11" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
                  </svg>
                  <span className="truncate flex-1">{f.name}</span>
                  <button
                    onClick={() => removeUploadedFile(f.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                    style={{ color: 'var(--accent)' }}
                    aria-label="Remove file"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* + button — always pinned at the bottom */}
          <div className="px-3 pb-2 flex-shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 flex items-center justify-center text-2xl font-light transition-opacity hover:opacity-80"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: '6px',
                border: '1px solid var(--accent-border)',
              }}
              aria-label="Upload study materials"
              title="Upload study materials (PDF, image)"
            >
              +
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Center: chat input */}
        <div className="flex-1 flex flex-col justify-center px-5" style={{ minWidth: 0 }}>
          {error && (
            <p className="text-xs mb-1" style={{ color: '#dc2626' }}>{error}</p>
          )}
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
            placeholder="How many questions? e.g. Give me 10 practice problems"
            className="w-full outline-none text-sm bg-transparent"
            style={{ color: 'var(--text-h)' }}
          />
        </div>

        {/* Right: enter button */}
        <div className="p-3 flex items-center" style={{ borderLeft: '1px solid var(--border)' }}>
          <button
            onClick={handleEnter}
            disabled={isAnalyzing}
            className="w-12 h-12 flex items-center justify-center text-xl text-white transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent)',
              border: '1px solid var(--accent-border)',
              borderRadius: '6px',
            }}
            aria-label="Start session"
          >
            {isAnalyzing ? <span className="text-sm animate-pulse">…</span> : '→'}
          </button>
        </div>
      </div>
    </div>
  )
}
