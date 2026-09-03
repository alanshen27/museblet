import { useCallback, useEffect, useRef, useState } from 'react'
import {
  classifyStrikeFromLandmarks,
  detectPoseOnImage,
  drawPoseOverlay,
  getPoseLandmarker,
  maybeEmitStrike,
  onStrike,
  type StrikeClassification,
  type StrikeEvent,
  type StrikeType,
} from '../../strikes'
import { FIXTURE_BASE, SANDA_FIXTURES, fixtureUrl, type SandaFixture } from './fixtures'
import './SandaTestHarness.css'

interface FixtureResult {
  fixture: SandaFixture
  classification: StrikeClassification | null
  strikeEvent: StrikeEvent | null
  pass: boolean | null
  error?: string
  durationMs?: number
}

function matchesLabel(
  predicted: StrikeType,
  expected: StrikeType,
): boolean {
  if (predicted === expected) return true
  // guard and neutral are both compact stances
  if (
    (expected === 'guard' || expected === 'neutral') &&
    (predicted === 'guard' || predicted === 'neutral')
  )
    return true
  return false
}

function summarize(results: FixtureResult[]) {
  const tested = results.filter((r) => r.classification)
  const passed = tested.filter((r) => r.pass)
  const strikes = results.filter((r) => r.strikeEvent)
  return { total: SANDA_FIXTURES.length, tested: tested.length, passed: passed.length, strikes: strikes.length }
}

export default function SandaTestHarness() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<FixtureResult[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(SANDA_FIXTURES[0]?.id ?? null)
  const [events, setEvents] = useState<StrikeEvent[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    return onStrike((e) => setEvents((prev) => [e, ...prev].slice(0, 20)))
  }, [])

  useEffect(() => {
    getPoseLandmarker()
      .then(() => setLoading(false))
      .catch((err) => {
        setLoadError(String(err))
        setLoading(false)
      })
  }, [])

  const drawSelected = useCallback(
    (_fixture: SandaFixture, classification: StrikeClassification | null) => {
      const img = imageRef.current
      const canvas = canvasRef.current
      if (!img || !canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = img.naturalWidth
      const h = img.naturalHeight
      canvas.width = w
      canvas.height = h
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      if (classification?.poseDetected) {
        drawPoseOverlay(ctx, classification.joints, w, h)
      }
    },
    [],
  )

  const runFixture = useCallback(
    async (fixture: SandaFixture): Promise<FixtureResult> => {
      const t0 = performance.now()
      try {
        const landmarker = await getPoseLandmarker()
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = fixtureUrl(fixture)
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error(`Failed to load ${fixture.file}`))
        })
        const detection = detectPoseOnImage(landmarker, img)
        const landmarks = detection.landmarks[0]
        const classification = classifyStrikeFromLandmarks(landmarks)
        const strikeEvent = maybeEmitStrike(classification, 'image')
        const pass =
          !classification.poseDetected && fixture.expectPose === false
            ? true
            : classification.poseDetected
              ? matchesLabel(classification.type, fixture.label)
              : null
        return {
          fixture,
          classification,
          strikeEvent,
          pass,
          durationMs: performance.now() - t0,
        }
      } catch (err) {
        return {
          fixture,
          classification: null,
          strikeEvent: null,
          pass: false,
          error: String(err),
          durationMs: performance.now() - t0,
        }
      }
    },
    [],
  )

  const runAll = useCallback(async () => {
    setRunning(true)
    setEvents([])
    const out: FixtureResult[] = []
    for (const fixture of SANDA_FIXTURES) {
      const result = await runFixture(fixture)
      out.push(result)
      setResults([...out])
    }
    setRunning(false)
    const first = out[0]
    if (first) {
      setSelectedId(first.fixture.id)
      const img = new Image()
      img.src = fixtureUrl(first.fixture)
      img.onload = () => {
        imageRef.current = img
        drawSelected(first.fixture, first.classification)
      }
    }
  }, [runFixture, drawSelected])

  const selectFixture = useCallback(
    async (fixture: SandaFixture) => {
      setSelectedId(fixture.id)
      const existing = results.find((r) => r.fixture.id === fixture.id)
      const img = new Image()
      img.src = fixtureUrl(fixture)
      await new Promise<void>((resolve) => {
        img.onload = () => resolve()
      })
      imageRef.current = img
      if (existing?.classification) {
        drawSelected(fixture, existing.classification)
        return
      }
      const result = await runFixture(fixture)
      setResults((prev) => {
        const next = prev.filter((r) => r.fixture.id !== fixture.id)
        return [...next, result]
      })
      drawSelected(fixture, result.classification)
    },
    [results, runFixture, drawSelected],
  )

  const summary = summarize(results)
  const selected = results.find((r) => r.fixture.id === selectedId)
  const selectedFixture =
    SANDA_FIXTURES.find((f) => f.id === selectedId) ?? SANDA_FIXTURES[0]

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      summary,
      results: results.map((r) => ({
        id: r.fixture.id,
        expected: r.fixture.label,
        predicted: r.classification?.type ?? null,
        confidence: r.classification?.confidence ?? null,
        scores: r.classification?.scores ?? null,
        pass: r.pass,
        strikeEmitted: Boolean(r.strikeEvent),
        durationMs: r.durationMs,
        error: r.error,
      })),
      strikeEvents: events,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'sanda-test-report.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="sanda-harness">
      <header className="sanda-header">
        <div>
          <h1>Sanda image test harness</h1>
          <p className="sanda-sub">
            Dev-only pose → strike classification on still fixtures. Live webcam
            will add velocity onset later.
          </p>
        </div>
        <div className="sanda-actions">
          <a className="sanda-link" href={import.meta.env.BASE_URL}>
            ← main app
          </a>
          <button type="button" disabled={loading || running} onClick={runAll}>
            {running ? 'Running…' : 'Run all fixtures'}
          </button>
          <button
            type="button"
            disabled={!results.length}
            onClick={exportJson}
          >
            Export JSON
          </button>
        </div>
      </header>

      {loading && <p className="sanda-status">Loading MediaPipe Pose model…</p>}
      {loadError && <p className="sanda-error">Model error: {loadError}</p>}

      {results.length > 0 && (
        <div className="sanda-summary" role="status">
          <span>
            {summary.passed}/{summary.tested} label matches
          </span>
          <span>{summary.strikes} onStrike events</span>
        </div>
      )}

      <div className="sanda-layout">
        <section className="sanda-gallery">
          <h2>Fixtures</h2>
          <ul>
            {SANDA_FIXTURES.map((fixture) => {
              const result = results.find((r) => r.fixture.id === fixture.id)
              const pass = result?.pass
              return (
                <li key={fixture.id}>
                  <button
                    type="button"
                    className={
                      selectedId === fixture.id ? 'fixture-btn active' : 'fixture-btn'
                    }
                    onClick={() => selectFixture(fixture)}
                  >
                    <img src={fixtureUrl(fixture)} alt={fixture.description} />
                    <span className="fixture-meta">
                      <strong>{fixture.label}</strong>
                      <span>{fixture.description}</span>
                      {result && (
                        <span
                          className={
                            pass === true
                              ? 'badge pass'
                              : pass === false
                                ? 'badge fail'
                                : 'badge warn'
                          }
                        >
                          {result.classification?.type ?? '—'}{' '}
                          {result.classification
                            ? `(${(result.classification.confidence * 100).toFixed(0)}%)`
                            : ''}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="sanda-note">
            Sources &amp; licenses:{' '}
            <a href={`${FIXTURE_BASE}fixtures/README.md`}>fixtures README</a>
          </p>
        </section>

        <section className="sanda-preview">
          <h2>Overlay</h2>
          <div className="canvas-wrap">
            <canvas ref={canvasRef} />
            {!selected && !running && (
              <p className="canvas-hint">Run tests or select a fixture</p>
            )}
          </div>
          {selected?.classification && (
            <div className="sanda-detail">
              <h3>
                {selected.classification.type}{' '}
                <small>
                  {(selected.classification.confidence * 100).toFixed(1)}%
                  {selected.classification.side
                    ? ` · ${selected.classification.side}`
                    : ''}
                </small>
              </h3>
              <p>
                Expected <code>{selectedFixture.label}</code> —{' '}
                {selected.pass ? (
                  <span className="pass-text">pass</span>
                ) : selected.pass === false ? (
                  <span className="fail-text">fail</span>
                ) : (
                  <span className="warn-text">no pose</span>
                )}
              </p>
              <dl className="score-grid">
                {Object.entries(selected.classification.scores).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <meter min={0} max={1} value={v} />
                      {(v * 100).toFixed(0)}%
                    </dd>
                  </div>
                ))}
              </dl>
              {selected.classification.notes && (
                <ul className="notes">
                  {selected.classification.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="sanda-events">
          <h2>onStrike log</h2>
          {events.length === 0 ? (
            <p className="sanda-muted">No punch/kick events yet (threshold 0.42).</p>
          ) : (
            <ol>
              {events.map((e, i) => (
                <li key={`${e.type}-${e.side}-${i}`}>
                  <code>
                    {`onStrike({ type: '${e.type}', side: '${e.side}', confidence: ${e.confidence.toFixed(2)} })`}
                  </code>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
