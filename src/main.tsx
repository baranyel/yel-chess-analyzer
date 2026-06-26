import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AnalysisProvider } from './context/AnalysisContext.tsx'
import { PrefsProvider } from './context/PrefsContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <AnalysisProvider>
        <App />
      </AnalysisProvider>
    </PrefsProvider>
  </StrictMode>,
)
