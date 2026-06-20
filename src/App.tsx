import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './components/HomePage'
import SummaryPage from './components/SummaryPage'

function SetupPage() {
  return (
    <div className="h-full flex items-center justify-center font-sans" style={{ background: '#f0faff', color: '#386fa4' }}>
      Setup page — coming soon
    </div>
  )
}
function QuizPage() {
  return (
    <div className="h-full flex items-center justify-center font-sans" style={{ background: '#f0faff', color: '#386fa4' }}>
      Quiz page — coming soon
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="h-full">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
