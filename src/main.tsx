import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import SandaTestHarness from './test/sanda/SandaTestHarness.tsx'

const isSandaHarness =
  typeof window !== 'undefined' &&
  (window.location.pathname.endsWith('/test/sanda') ||
    window.location.hash === '#/test/sanda')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSandaHarness ? <SandaTestHarness /> : <App />}
  </StrictMode>,
)
