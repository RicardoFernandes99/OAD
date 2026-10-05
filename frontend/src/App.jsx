import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  Activity, BarChart3, ChevronRight, CircleHelp, Clock3,
  Database, Factory, Gauge, Layers3, LoaderCircle, RefreshCw, Settings2,
  ShieldAlert, Sparkles, TriangleAlert,
} from 'lucide-react'
import { Badge } from './components/ui/badge.jsx'
import { Button } from './components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card.jsx'
import DataChat from './components/DataChat.jsx'

const TrendCharts = lazy(() => import('./components/TrendCharts.jsx'))
const DATASET_ROWS = 5_000_000
const tabLabels = { general: 'Overview', postgres: 'PostgreSQL', snowflake: 'Snowflake', 'snowflake-ai': 'Snowflake AI/ML' }
const numberFormat = new Intl.NumberFormat('en-GB')
const compactFormat = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 })
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const failureModes = [
  { key: 'twf_failures', label: 'Tool wear', short: 'TWF' },
  { key: 'hdf_failures', label: 'Heat dissipation', short: 'HDF' },
  { key: 'pwf_failures', label: 'Power', short: 'PWF' },
  { key: 'osf_failures', label: 'Overstrain', short: 'OSF' },
  { key: 'rnf_failures', label: 'Random failure', short: 'RNF' },
]
const typeColors = { L: '#087e8b', M: '#7863be', H: '#bd7818' }

function prettyDuration(milliseconds) {
  if (milliseconds == null) return '—'
  if (milliseconds < 1000) return `${milliseconds.toFixed(1)} ms`
  return `${(milliseconds / 1000).toFixed(2)} s`
}

function StatusDot({ state = 'online' }) {
  return <span aria-hidden="true" className={`status-dot status-dot-${state}`} />
}

function MetricCard({ label, value, detail, icon: Icon, color }) {
  return <Card className="metric-card"><div className="metric-topline"><span>{label}</span><span className="metric-icon" style={{ color }}><Icon size={16} aria-hidden="true" /></span></div><div className="metric-value-row"><strong className="metric-value">{value}</strong></div><p className="metric-detail">{detail}</p></Card>
}

function LoadingChart({ label = 'Loading…' }) {
  return <div className="chart-loading" role="status"><LoaderCircle size={20} className="spin" aria-hidden="true" /><span>{label}</span></div>
}

function ConnectionCard({ name, detail, state, rows, kind, onRefresh, loading }) {
  const configured = state === 'ready' || state === 'online'
  const connecting = state === 'checking'
  const label = connecting ? 'CHECKING' : configured ? 'CONNECTED' : state === 'setup_required' ? 'SET UP' : 'UNAVAILABLE'
  const variant = configured ? 'success' : state === 'setup_required' ? 'muted' : 'warning'
  const icon = kind === 'snowflake' ? <Layers3 size={17} aria-hidden="true" /> : <Database size={17} aria-hidden="true" />
  return <Card className="connection-overview-card"><div className="connection-overview-heading"><span className={`engine-logo ${kind === 'snowflake' ? 'sf-logo' : 'pg-logo'}`}>{icon}</span><div><h2>{name}</h2><p>{detail}</p></div><Badge variant={variant}><StatusDot state={configured ? 'online' : connecting ? 'idle' : 'offline'} />{label}</Badge></div><div className="connection-overview-count"><strong>{rows == null ? '—' : numberFormat.format(rows)}</strong><span>rows loaded</span></div><p className="connection-overview-note">{kind === 'snowflake' && state === 'setup_required' ? 'Set up the Snowflake connection.' : configured ? 'Data table available.' : 'Connection unavailable.'}</p>{kind === 'snowflake' && state === 'setup_required' ? <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}><RefreshCw size={13} aria-hidden="true" />Check connection</Button> : null}</Card>
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => Object.hasOwn(tabLabels, window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'general')
  const [benchmarks, setBenchmarks] = useState({})
  const [chartSets, setChartSets] = useState({})
  const [modelResult, setModelResult] = useState(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState('')
  const modelRequestStarted = useRef(false)
  const [backendStatus, setBackendStatus] = useState({ postgres: 'checking', postgres_rows: null, snowflake: 'checking', snowflake_rows: null })
  const [requestError, setRequestError] = useState('')
  const [pendingEngine, setPendingEngine] = useState(null)

  const loadStatus = async (signal) => {
    try {
      const response = await fetch('/api/status', { signal })
      if (!response.ok) throw new Error('Could not check the database connections.')
      setBackendStatus(await response.json())
    } catch (error) {
      if (error.name !== 'AbortError') setBackendStatus((current) => ({ ...current, postgres: 'offline' }))
    }
  }

  const runBenchmark = (engine) => {
    if (pendingEngine || modelLoading) return
    setRequestError('')
    setPendingEngine(engine)
    void (async () => {
      try {
        const response = await fetch('/api/benchmark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: engine }) })
        const payload = await response.json()
        if (!response.ok) throw new Error('The query failed. Check the database connection and try again.')
        const result = payload.results?.[0]
        if (result?.status !== 'ok') throw new Error('The query failed. Check the database connection and try again.')
        const chartResponse = await fetch('/api/charts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: engine }) })
        const chartPayload = await chartResponse.json()
        if (!chartResponse.ok) throw new Error('Could not load the chart data. Check the database connection and try again.')
        setBenchmarks((current) => ({ ...current, [engine]: { ...result, completedAt: new Date() } }))
        setChartSets((current) => ({ ...current, [engine]: chartPayload.results }))
      } catch (error) {
        setRequestError(error.message || 'Could not query the database.')
      } finally {
        setPendingEngine(null)
      }
    })()
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadStatus(controller.signal)
    return () => controller.abort()
    // Initial page load only checks the two database states; benchmarks are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeTab !== 'snowflake-ai' || backendStatus.snowflake !== 'ready' || pendingEngine || modelRequestStarted.current) return
    modelRequestStarted.current = true
    setModelLoading(true)
    void (async () => {
      try {
        const response = await fetch('/api/model/sample', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'snowflake' }),
        })
        if (!response.ok) throw new Error('Could not load the AI sample. Check the Snowflake connection.')
        setModelResult(await response.json())
      } catch (error) {
        setModelError(error.message || 'Could not load the AI sample.')
      } finally {
        setModelLoading(false)
      }
    })()
  }, [activeTab, backendStatus.snowflake, pendingEngine])

  useEffect(() => {
    const updateTab = () => {
      const tab = window.location.hash.slice(1)
      if (Object.hasOwn(tabLabels, tab)) setActiveTab(tab)
    }
    window.addEventListener('hashchange', updateTab)
    return () => window.removeEventListener('hashchange', updateTab)
  }, [])

  const source = activeTab.startsWith('snowflake') ? 'snowflake' : 'postgres'
  const isPending = pendingEngine !== null
  const isRefreshing = pendingEngine === source
  const benchmark = benchmarks[source]
  const chartSet = chartSets[source] ?? {}
  const rows = benchmark?.rows ?? []
  const records = rows.reduce((sum, row) => sum + Number(row.record_count), 0)
  const failures = rows.reduce((sum, row) => sum + Number(row.machine_failures), 0)
  const failureRate = records ? (failures / records) * 100 : null
  const chartRows = rows.map((row) => ({ ...row, product_type: `Type ${row.product_type}` }))
  const modeRows = benchmark ? failureModes.map((mode) => ({ ...mode, count: rows.reduce((sum, row) => sum + Number(row[mode.key] ?? 0), 0) })) : []
  const temperatureRows = (chartSet.temperature ?? []).map((row) => ({ ...row, temperature_label: `${numberFormat.format(row.temperature_band_k)} K` }))
  const toolWearRows = chartSet.tool_wear ?? []
  const onlineCount = Number(backendStatus.postgres === 'online') + Number(backendStatus.snowflake === 'ready')

  const selectTab = (tab) => {
    setActiveTab(tab)
    setRequestError('')
    if (tab === 'postgres' && !benchmarks.postgres) runBenchmark('postgres')
    if (tab === 'snowflake' && backendStatus.snowflake === 'ready' && !benchmarks.snowflake) runBenchmark('snowflake')
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <a className="brand" href="#general" aria-label="OAD — home" onClick={() => selectTab('general')}><span className="brand-symbol"><Factory size={20} strokeWidth={2.1} aria-hidden="true" /></span><span className="brand-wordmark">OAD<span> / LAB</span></span></a>
        <div className="workspace-switcher"><span className="workspace-avatar">A</span><span><strong>AI4I Factory</strong><small>Industrial lab</small></span><ChevronRight size={14} aria-hidden="true" /></div>
        <p className="sidebar-label">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          <a className={`nav-link ${activeTab === 'general' ? 'active' : ''}`} href="#general" aria-current={activeTab === 'general' ? 'page' : undefined} onClick={() => selectTab('general')}><BarChart3 size={16} aria-hidden="true" />Overview</a>
          <a className={`nav-link ${activeTab === 'postgres' ? 'active' : ''}`} href="#postgres" aria-current={activeTab === 'postgres' ? 'page' : undefined} onClick={() => selectTab('postgres')}><Database size={16} aria-hidden="true" />PostgreSQL</a>
          <a className={`nav-link ${activeTab === 'snowflake' ? 'active' : ''}`} href="#snowflake" aria-current={activeTab === 'snowflake' ? 'page' : undefined} onClick={() => selectTab('snowflake')}><Layers3 size={16} aria-hidden="true" />Snowflake</a>
          <a className={`nav-link ${activeTab === 'snowflake-ai' ? 'active' : ''}`} href="#snowflake-ai" aria-current={activeTab === 'snowflake-ai' ? 'page' : undefined} onClick={() => selectTab('snowflake-ai')} title="Snowflake AI/ML"><Sparkles size={16} aria-hidden="true" />Snowflake AI/ML</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-connection"><div className="connection-title"><span>CONNECTIONS</span><span className="connection-count">{onlineCount}/2</span></div><div className="connection-row"><StatusDot state={backendStatus.postgres === 'online' ? 'online' : 'offline'} /><span>PostgreSQL</span><small>{backendStatus.postgres === 'online' ? 'connected' : 'unavailable'}</small></div><div className="connection-row"><StatusDot state={backendStatus.snowflake === 'ready' ? 'online' : 'idle'} /><span>Snowflake</span><small>{backendStatus.snowflake === 'ready' ? 'connected' : 'set up'}</small></div></div>
        <div className="sidebar-user"><span className="user-avatar">AI</span><span><strong>AI4I 2020</strong><small>Source: UCI</small></span><Settings2 size={15} aria-hidden="true" /></div>
      </aside>

      <div className="main-column">
        <header className="topbar"><div className="breadcrumbs"><span>OAD</span><span>/</span><strong>{tabLabels[activeTab]}</strong></div><div className="topbar-actions"><Badge variant="outline" className="demo-badge"><span className="demo-pulse" />DEMO</Badge><button type="button" className="help-button" aria-label="About this demo" title="Source: UCI · AI4I 2020"><CircleHelp size={17} aria-hidden="true" /></button></div></header>
        <main id="main-content" className={`dashboard dashboard-${activeTab}`} tabIndex="-1">
          <section className="page-heading"><div><p className="overline"><span className="heading-marker" />INDUSTRIAL ANALYTICS <span className="overline-separator">/</span> {activeTab === 'general' ? 'CONNECTIONS' : activeTab === 'snowflake-ai' ? 'AI/ML' : activeTab.toUpperCase()}</p><h1>{activeTab === 'general' ? 'Connections and data' : activeTab === 'snowflake-ai' ? 'Snowflake AI/ML' : `Failures · ${activeTab === 'postgres' ? 'PostgreSQL' : 'Snowflake'}`}</h1><p className="page-subtitle">{activeTab === 'general' ? 'Connection status and data volume.' : activeTab === 'snowflake-ai' ? 'Chat with the data and explore the failure risk sample.' : 'Failures and operating conditions by product type.'}</p></div>{(activeTab === 'postgres' || activeTab === 'snowflake') ? <Button onClick={() => runBenchmark(source)} disabled={isPending || modelLoading || (source === 'snowflake' && backendStatus.snowflake !== 'ready')} className="run-button">{isPending ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}{isRefreshing ? (benchmark ? 'Refreshing…' : 'Querying…') : benchmark ? 'Refresh data' : 'Run analysis'}</Button> : null}</section>

          {activeTab === 'general' ? <section className="overview-status-grid" aria-label="Database connections"><ConnectionCard name="PostgreSQL" detail="Local database" state={backendStatus.postgres} rows={backendStatus.postgres_rows} kind="postgres" /><ConnectionCard name="Snowflake" detail="Cloud database" state={backendStatus.snowflake} rows={backendStatus.snowflake_rows} kind="snowflake" onRefresh={() => void loadStatus()} loading={isPending} /><Card className="overview-dataset-card"><div className="dataset-icon"><Database size={15} aria-hidden="true" /></div><div><div className="card-eyebrow">DEMO DATA</div><h2>{numberFormat.format(DATASET_ROWS)} rows · AI4I 2020</h2><p>10,000 original rows repeated 500 times. These synthetic repeats are not new observations.</p></div><Badge variant="outline">10,000 originals</Badge></Card><div className="overview-attribution">Source: <a href="https://doi.org/10.24432/C5HS5C" target="_blank" rel="noreferrer">UCI Machine Learning Repository · AI4I 2020</a> · CC BY 4.0</div></section> : activeTab === 'snowflake-ai' ? <>
            {activeTab === 'snowflake-ai' ? <section className="model-section" aria-busy={modelLoading} aria-label="Snowflake failure risk model"><Card className="model-card"><CardHeader className="model-header"><div><div className="card-eyebrow"><span className="legend-bar green" />SNOWFLAKE ML</div><CardTitle>Failure risk classifier</CardTitle><p className="model-description">2,000 training rows · 500 evaluation rows. Original records only.</p></div><Badge variant="muted">SAMPLE</Badge></CardHeader><CardContent className="model-content">{modelError ? <div className="alert alert-error" role="alert"><TriangleAlert size={16} aria-hidden="true" /><span>{modelError}</span></div> : null}{modelLoading ? <LoadingChart label="Running the Snowflake sample…" /> : modelResult ? <><div className="model-sample-note"><span>{numberFormat.format(modelResult.training_rows)} train</span><span>{numberFormat.format(modelResult.test_rows)} held out</span><span>Original records only</span></div><div className="metrics-grid model-metrics"><MetricCard label="HELD-OUT ROWS" value={numberFormat.format(modelResult.test_rows)} detail="Never used for training" icon={Layers3} color="#7863be" /><MetricCard label="PRECISION" value={`${Number(modelResult.metrics.precision_pct).toFixed(1)}%`} detail="Predictions that were failures" icon={Gauge} color="#087e8b" /><MetricCard label="RECALL" value={`${Number(modelResult.metrics.recall_pct).toFixed(1)}%`} detail="Failures the model found" icon={Activity} color="#23865c" /><MetricCard label="F1 SCORE" value={`${Number(modelResult.metrics.f1_pct).toFixed(1)}%`} detail="Precision and recall" icon={ShieldAlert} color="#bd7818" /></div><Card className="model-risk-card"><CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar cyan" />MODEL OUTPUT</div><CardTitle>Average predicted risk by product type</CardTitle></div></CardHeader><CardContent className="chart-content"><Suspense fallback={<LoadingChart />}><TrendCharts data={modelResult.predictions.map((row) => ({ ...row, product_type: `Type ${row.product_type}` }))} metric="risk" valueKey="avg_predicted_risk_pct" ariaLabel="Average predicted failure risk by product type" /></Suspense></CardContent><footer className="chart-footer"><span className="chart-legend">Predicted failure probability (%)</span></footer></Card></> : <div className="model-empty"><Sparkles size={17} aria-hidden="true" /><span>{backendStatus.snowflake === 'checking' ? 'Checking Snowflake…' : backendStatus.snowflake === 'ready' ? 'Loading sample…' : 'Connect Snowflake to load the sample.'}</span></div>}</CardContent></Card></section> : null}
            <DataChat connected={backendStatus.snowflake === 'ready'} />
            </> : <>
            <div className="dataset-strip" role="status" aria-live="polite"><div className="dataset-icon"><Database size={15} aria-hidden="true" /></div><span><strong>{numberFormat.format(benchmark?.rows_scanned ?? backendStatus[`${source}_rows`] ?? DATASET_ROWS)}</strong> rows analyzed</span><span className="strip-divider" /><span><strong>10,000</strong> originals × 500 repeats</span><span className="strip-fill" /><span className="last-run">{isRefreshing ? 'Refreshing data…' : benchmark?.completedAt ? `Last updated at ${timeFormat.format(benchmark.completedAt)}` : 'No analysis yet'}</span><button className="refresh-icon" type="button" onClick={() => runBenchmark(source)} disabled={isPending || modelLoading || (source === 'snowflake' && backendStatus.snowflake !== 'ready')} aria-label="Refresh data" title="Refresh data"><RefreshCw size={14} aria-hidden="true" className={isRefreshing ? 'spin' : ''} /></button></div>
            {requestError ? <div className="alert alert-error" role="alert"><TriangleAlert size={16} aria-hidden="true" /><span>{requestError}</span></div> : null}
            {source === 'snowflake' && backendStatus.snowflake !== 'ready' ? <div className="setup-callout large-callout"><Sparkles size={17} aria-hidden="true" /><div><strong>Snowflake is not connected</strong><p>Set <code>SNOWFLAKE_*</code> in <code>.env</code>, create the tables, and load the UCI data.</p></div></div> : null}

            <section className="metrics-grid" aria-label="Key metrics" aria-busy={isRefreshing}><MetricCard label="ROWS ANALYZED" value={isRefreshing ? '…' : benchmark ? compactFormat.format(benchmark.rows_scanned) : '—'} detail="AI4I records" icon={Layers3} color="#7863be" /><MetricCard label="MACHINE FAILURES" value={isRefreshing ? '…' : benchmark ? compactFormat.format(failures) : '—'} detail="Recorded failures" icon={ShieldAlert} color="#bd7818" /><MetricCard label="FAILURE RATE" value={isRefreshing ? '…' : failureRate == null ? '—' : `${failureRate.toFixed(2)}%`} detail="Across all rows" icon={Gauge} color="#087e8b" /><MetricCard label="QUERY TIME" value={isRefreshing ? '…' : benchmark ? prettyDuration(benchmark.elapsed_ms) : '—'} detail="Execution and fetch" icon={Clock3} color="#23865c" /></section>

            <section className="chart-grid" aria-label="Failure charts" aria-busy={isRefreshing}>
              <Card className="chart-card production-chart-card"><CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar cyan" />BY TYPE</div><CardTitle>Failure rate</CardTitle></div><Badge variant="muted" className="range-badge">3 types</Badge></CardHeader><CardContent className="chart-content">{isRefreshing ? <LoadingChart label="Refreshing…" /> : <Suspense fallback={<LoadingChart />}><TrendCharts data={chartRows} metric="failure-rate" /></Suspense>}</CardContent><footer className="chart-footer"><span className="chart-legend">Failures (%)</span></footer></Card>
              <Card className="chart-card quality-chart-card"><CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar amber" />BY MODE</div><CardTitle>Failure modes</CardTitle></div><span className="quality-icon"><ShieldAlert size={16} aria-hidden="true" /></span></CardHeader><CardContent className="quality-content">{isRefreshing ? <LoadingChart label="Refreshing…" /> : <><Suspense fallback={<LoadingChart />}><TrendCharts data={modeRows} metric="modes" variant="horizontal" /></Suspense><div className="failure-mode-legend">{failureModes.map((mode) => <span key={mode.key}><strong>{mode.short}</strong> {mode.label}</span>)}</div></>}</CardContent></Card>
              <Card className="chart-card"><CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar violet" />BY TEMPERATURE</div><CardTitle>Failure rate by air temperature</CardTitle></div></CardHeader><CardContent className="chart-content">{isRefreshing ? <LoadingChart label="Refreshing…" /> : <Suspense fallback={<LoadingChart />}><TrendCharts data={temperatureRows} metric="failure-rate" variant="line" categoryKey="temperature_label" ariaLabel="Failure rate by air temperature band" /></Suspense>}</CardContent></Card>
              <Card className="chart-card"><CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar green" />BY TOOL WEAR</div><CardTitle>Failure rate by tool-wear range</CardTitle></div></CardHeader><CardContent className="chart-content">{isRefreshing ? <LoadingChart label="Refreshing…" /> : <Suspense fallback={<LoadingChart />}><TrendCharts data={toolWearRows} metric="failure-rate" variant="area" categoryKey="tool_wear_range" ariaLabel="Failure rate by tool-wear range" /></Suspense>}</CardContent></Card>
            </section>


            <section className="lower-grid"><Card className="results-card"><CardHeader className="results-header"><div><div className="card-eyebrow"><span className="legend-bar violet" />RESULTS</div><CardTitle>Summary by type</CardTitle></div><Badge variant="muted" className="row-badge">{isRefreshing ? '…' : `${numberFormat.format(rows.length)} types`}</Badge></CardHeader><CardContent className="table-content">{isRefreshing ? <div className="table-empty" role="status"><LoaderCircle size={20} className="spin" aria-hidden="true" />Refreshing data…</div> : rows.length ? <div className="table-scroll"><table className="data-table"><caption className="sr-only">Failures by product type</caption><thead><tr><th scope="col">TYPE</th><th scope="col" className="num">ROWS</th><th scope="col" className="num">FAILURES</th><th scope="col" className="num">RATE</th><th scope="col" className="num">WEAR P95</th><th scope="col" className="num">AVG. TORQUE</th></tr></thead><tbody>{rows.map((row) => <tr key={row.product_type}><td><span className="table-line"><i style={{ background: typeColors[row.product_type] }} />Type {row.product_type}</span></td><td className="num">{numberFormat.format(row.record_count)}</td><td className="num">{numberFormat.format(row.machine_failures)}</td><td className="num"><span className="rate-value">{Number(row.failure_rate_pct).toFixed(2)}%</span></td><td className="num">{Number(row.p95_tool_wear_min).toFixed(1)} min</td><td className="num">{Number(row.avg_torque_nm).toFixed(1)} Nm</td></tr>)}</tbody></table></div> : <div className="table-empty"><Database size={20} aria-hidden="true" /><span>Run an analysis to see results.</span></div>}</CardContent></Card><Card className="engine-section-card"><CardHeader className="engine-section-header"><div><div className="card-eyebrow"><span className="legend-bar green" />QUERY</div><CardTitle>{source === 'postgres' ? 'PostgreSQL' : 'Snowflake'}</CardTitle></div><span className="engine-total"><span className="online-count">{source === 'postgres' ? backendStatus.postgres === 'online' ? 'Connected' : 'Unavailable' : backendStatus.snowflake === 'ready' ? 'Connected' : 'Unavailable'}</span></span></CardHeader><CardContent className="engine-list">{isRefreshing ? <div className="engine-placeholder" role="status"><LoaderCircle size={17} className="spin" aria-hidden="true" />Refreshing…</div> : benchmark ? <div className="engine-card"><div className="engine-heading"><div className="engine-name-wrap"><span className={`engine-logo ${source === 'postgres' ? 'pg-logo' : 'sf-logo'}`}>{source === 'postgres' ? <Database size={17} aria-hidden="true" /> : <Layers3 size={17} aria-hidden="true" />}</span><div><h3>{benchmark.engine}</h3><span className="engine-subtitle">AI4I analysis</span></div></div><Badge variant="success"><StatusDot />COMPLETE</Badge></div><div className="engine-stats"><div><span>Time</span><strong className="engine-duration">{prettyDuration(benchmark.elapsed_ms)}</strong></div><div><span>Rows</span><strong>{compactFormat.format(benchmark.rows_scanned)}</strong></div><div><span>Types</span><strong>{numberFormat.format(rows.length)}</strong></div></div></div> : <p className="engine-placeholder">No analysis yet.</p>}</CardContent></Card></section>
            </>}
            <footer className="dashboard-footer"><span>OAD · AI4I 2020</span><span className="footer-build">Source: UCI · CC BY 4.0</span></footer>
        </main>
      </div>
    </div>
  )
}
