import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import mascot from '../assets/lamb-mascot.png'
import { useAuth } from '../contexts/AuthContext'
import { API_BASE } from '../lib/apiBase'
import { useQuizStore } from '../store/quizStore'
import './HomePage.css'

interface UploadedFile {
  name: string
  base64: string
  mimeType: string
}

const difficultyLevels = [
  { label: 'Easy', value: 'easy', num: 1, description: 'Warm-up' },
  { label: 'Medium', value: 'medium', num: 3, description: 'Balanced' },
  { label: 'Hard', value: 'hard', num: 5, description: 'Challenge' },
] as const

export default function HomePage() {
  const [chatInput, setChatInput] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [difficulty, setDifficulty] =
    useState<(typeof difficultyLevels)[number]['value']>('medium')
  const [numQuestions, setNumQuestions] = useState(5)
  const [numQuestionsInput, setNumQuestionsInput] = useState('5')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [whiteboardGraded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const setSettings = useQuizStore((state) => state.setSettings)
  const setSourceProfile = useQuizStore((state) => state.setSourceProfile)
  const warmQuestionQueue = useQuizStore((state) => state.warmQuestionQueue)
  const startQuiz = useQuizStore((state) => state.startQuiz)

  const readFileAsBase64 = (file: File): Promise<UploadedFile> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        resolve({
          name: file.name,
          base64: dataUrl.split(',')[1],
          mimeType: file.type,
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const processFiles = async (fileList: FileList | File[]) => {
    const existing = new Set(uploadedFiles.map((file) => file.name))
    const newFiles: UploadedFile[] = []

    for (const file of Array.from(fileList)) {
      if (!existing.has(file.name)) {
        newFiles.push(await readFileAsBase64(file))
      }
    }

    setUploadedFiles((current) => [...current, ...newFiles])
    if (newFiles.length) setError(null)
  }

  const setQuestionCount = (value: number) => {
    const nextValue = Math.min(20, Math.max(1, value))
    setNumQuestions(nextValue)
    setNumQuestionsInput(String(nextValue))
  }

  const handleChallenge = async () => {
    const instructions = chatInput.trim()
    if (uploadedFiles.length === 0 && !instructions) {
      setError('Upload a study file or add instructions first.')
      return
    }
    setError(null)
    setIsAnalyzing(true)

    const selectedLevel = difficultyLevels.find((level) => level.value === difficulty)!
    const fallbackStyleNotes = [instructions, whiteboardGraded ? 'Grade whiteboard work.' : '']
      .filter(Boolean).join(' ')

    setSettings({ numQuestions, startingDifficulty: selectedLevel.num })

    try {
      const response = await fetch(`${API_BASE}/analyze-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles, instructions }),
      })
      if (response.ok) {
        const data = await response.json()
        const styleNotes = [
          data.styleNotes,
          instructions ? `Follow the user's instructions: ${instructions}` : '',
          whiteboardGraded ? 'Grade whiteboard work.' : '',
        ].filter(Boolean).join(' ')
        setSourceProfile({ topics: data.topics ?? [], concepts: data.concepts ?? [], styleNotes })
      } else {
        setSourceProfile({ topics: instructions ? [instructions] : ['Uploaded study material'], concepts: [], styleNotes: fallbackStyleNotes })
      }
    } catch {
      setSourceProfile({ topics: instructions ? [instructions] : ['Uploaded study material'], concepts: [], styleNotes: fallbackStyleNotes })
    }

    setIsAnalyzing(false)
    navigate('/compete')
  }

  const handleEnter = async () => {
    const instructions = chatInput.trim()

    if (uploadedFiles.length === 0 && !instructions) {
      setError('Upload a study file or add instructions for your quiz.')
      return
    }

    setError(null)
    setIsAnalyzing(true)

    const selectedLevel = difficultyLevels.find(
      (level) => level.value === difficulty,
    )!
    const fallbackStyleNotes = instructions

    setSettings({
      numQuestions,
      startingDifficulty: selectedLevel.num,
    })

    try {
      const response = await fetch(`${API_BASE}/analyze-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles, instructions }),
      })

      if (response.ok) {
        const data = await response.json()
        const styleNotes = [
          data.styleNotes,
          instructions ? `Follow the user's instructions: ${instructions}` : '',
        ]
          .filter(Boolean)
          .join(' ')

        setSourceProfile({
          topics: data.topics ?? [],
          concepts: data.concepts ?? [],
          styleNotes,
        })
      } else {
        setSourceProfile({
          topics: instructions ? [instructions] : ['Uploaded study material'],
          concepts: [],
          styleNotes: fallbackStyleNotes,
        })
      }
    } catch {
      setSourceProfile({
        topics: instructions ? [instructions] : ['Uploaded study material'],
        concepts: [],
        styleNotes: fallbackStyleNotes,
      })
    }

    warmQuestionQueue(numQuestions)
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
    <main className="home">
      <div className="home-glow home-glow-one" />
      <div className="home-glow home-glow-two" />

      <header className="home-nav">
        <a className="home-brand" href="/" aria-label="Learn+Grow home">
          <span className="home-brand-mark">
            <img src={mascot} alt="" />
          </span>
          <span>
            <strong>Learn+Grow</strong>
            <small>Adaptive study partner</small>
          </span>
        </a>
        <div className="home-nav-actions">
          {user ? (
            <>
              <span className="home-user-email" title={user.email ?? undefined}>
                {user.email}
              </span>
              <button
                type="button"
                className="home-analytics-link"
                onClick={() => navigate('/analytics')}
              >
                Analytics
              </button>
              <button
                type="button"
                className="home-analytics-link"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="home-analytics-link"
              onClick={() => navigate('/login')}
            >
              Sign in
            </button>
          )}
          <div className="home-nav-badge">
            <span />
            AI-powered practice
          </div>
        </div>
      </header>

      <section className="home-content">
        <div className="home-hero">
          <div className="home-kicker">
            <span>✦</span>
            Practice that learns with you
          </div>
          <h1>
            Turn your notes into
            <em> smarter practice.</em>
          </h1>
          <p>
            Upload homework, lecture notes, or a past test. Learn+Grow creates
            an adaptive quiz around exactly what you're learning.
          </p>

          <div className="home-benefits">
            <div>
              <span>01</span>
              <p>Questions grounded in your material</p>
            </div>
            <div>
              <span>02</span>
              <p>Difficulty that adapts as you answer</p>
            </div>
            <div>
              <span>03</span>
              <p>Feedback based on your actual work</p>
            </div>
          </div>

          <div className="mascot-stage">
            <div className="mascot-message">
              <strong>Ready when you are.</strong>
              <span>I'll build the practice test.</span>
            </div>
            <div className="mascot-orbit mascot-orbit-one" />
            <div className="mascot-orbit mascot-orbit-two" />
            <img src={mascot} alt="Learn+Grow" />
          </div>
        </div>

        <section className="quiz-builder" aria-labelledby="builder-title">
          <div className="builder-heading">
            <div>
              <span className="builder-step">New session</span>
              <h2 id="builder-title">Build your quiz</h2>
            </div>
            <span className="builder-time">Takes ~10 sec</span>
          </div>

          <div className="builder-section">
            <div className="builder-label">
              <span>1</span>
              Choose a starting level
            </div>
            <div className="difficulty-options">
              {difficultyLevels.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  className={
                    difficulty === level.value
                      ? 'difficulty-option is-selected'
                      : 'difficulty-option'
                  }
                  onClick={() => setDifficulty(level.value)}
                >
                  <strong>{level.label}</strong>
                  <small>{level.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="builder-section">
              <div className="builder-label">
                <span>2</span>
                Questions
              </div>
              <div className="question-stepper">
                <button
                  type="button"
                  onClick={() => setQuestionCount(numQuestions - 1)}
                  aria-label="Decrease question count"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={numQuestionsInput}
                  aria-label="Number of questions"
                  onChange={(event) => setNumQuestionsInput(event.target.value)}
                  onBlur={() =>
                    setQuestionCount(Number.parseInt(numQuestionsInput) || 5)
                  }
                />
                <span>questions</span>
                <button
                  type="button"
                  onClick={() => setQuestionCount(numQuestions + 1)}
                  aria-label="Increase question count"
                >
                  +
                </button>
              </div>
            </div>

          </div>

          <div className="builder-section">
            <div className="builder-label">
              <span>3</span>
              Add study material (optional)
            </div>
            <div
              className={dragOver ? 'material-dropzone is-dragging' : 'material-dropzone'}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(false)
                void processFiles(event.dataTransfer.files)
              }}
            >
              <button
                type="button"
                className="upload-icon"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload study materials"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                </svg>
              </button>
              <div>
                <strong>Drop PDFs or images here</strong>
                <span>
                  or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    browse your files
                  </button>
                </span>
              </div>
              <small>PDF, PNG or JPG</small>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files) void processFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </div>

            {uploadedFiles.length > 0 && (
              <div className="uploaded-files">
                {uploadedFiles.map((file) => (
                  <div className="uploaded-file" key={file.name}>
                    <span className="file-icon">✓</span>
                    <span title={file.name}>{file.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setUploadedFiles((current) =>
                          current.filter((item) => item.name !== file.name),
                        )
                      }
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="quiz-instructions">
            <span>Quiz instructions</span>
            <textarea
              value={chatInput}
              onChange={(event) => {
                setChatInput(event.target.value)
                if (event.target.value.trim()) setError(null)
              }}
              placeholder="e.g. Create a quiz about derivatives using product and chain rules"
              rows={2}
            />
            <small>
              Add instructions, upload a file, or use both. At least one is
              required.
            </small>
          </label>

          {error && <p className="builder-error">{error}</p>}

          <div className="generate-actions">
            <button
              type="button"
              className="generate-button"
              disabled={isAnalyzing}
              onClick={() => void handleEnter()}
            >
              <span>{isAnalyzing ? 'Building your quiz…' : 'Generate my quiz'}</span>
              {!isAnalyzing && <span aria-hidden="true">→</span>}
            </button>
            <button
              type="button"
              className="challenge-button"
              disabled={isAnalyzing}
              onClick={() => void handleChallenge()}
            >
              ⚡ Challenge a friend
            </button>
          </div>
          <p className="builder-footnote">
            Your files and instructions are used only to create this practice
            session.
          </p>
        </section>
      </section>
    </main>
  )
}
