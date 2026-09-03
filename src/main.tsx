import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { emitStrike, onStrike, strikeEvent } from './strikes'
import { classifyPose, KICK_SPEED, PUNCH_SPEED, SandaTracker } from './sanda'

// the test-harness surface: the same event bus the live pose path uses,
// the temporal tracker, and the single-frame pose classifier for stills
declare global {
  interface Window {
    nocturne?: {
      onStrike: typeof onStrike
      emitStrike: typeof emitStrike
      strikeEvent: typeof strikeEvent
      classifyPose: typeof classifyPose
      SandaTracker: typeof SandaTracker
      PUNCH_SPEED: number
      KICK_SPEED: number
    }
  }
}
window.nocturne = { onStrike, emitStrike, strikeEvent, classifyPose, SandaTracker, PUNCH_SPEED, KICK_SPEED }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
