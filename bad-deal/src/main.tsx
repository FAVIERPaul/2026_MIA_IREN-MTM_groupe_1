import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const DiagnosticPage = import.meta.env.DEV && window.location.pathname === '/dev/multiplayer'
  ? lazy(() => import('./dev/multiplayer/MultiplayerTestPage.tsx'))
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {DiagnosticPage ? (
      <Suspense fallback={<p>Chargement de la console multijoueur…</p>}>
        <DiagnosticPage />
      </Suspense>
    ) : <App />}
  </StrictMode>,
)
