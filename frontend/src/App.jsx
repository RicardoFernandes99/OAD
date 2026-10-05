import { lazy, Suspense, useEffect, useState, useTransition } from 'react'
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Boxes, Check, ChevronLeft,
  ChevronRight, CircleHelp, Clock3, Database, Factory, Gauge, Layers3, LoaderCircle,
  RefreshCw, Server, Settings2, ShieldCheck, Sparkles, TriangleAlert,
} from 'lucide-react'
import { Badge } from './components/ui/badge.jsx'
import { Button } from './components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.jsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.jsx'

const TrendCharts = lazy(() => import('./components/TrendCharts.jsx'))
const DATASET_ROWS = 5_000_000
const PAGE_SIZE = 10
const LINES = ['LINE-01', 'LINE-02', 'LINE-03', 'LINE-04']
const SERIES_COLORS = ['#5ee3f5', '#9b8cff', '#f2b66d', '#7bd9aa']
const numberFormat = new Intl.NumberFormat('pt-PT')
const compactFormat = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 })
const dateFormat = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', timeZone: 'UTC' })
const timeFormat = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' })

function makeChartRows(rows) {
  const weeks = new Map()
  for (const row of rows ?? []) {
    const weekStart = row.week_start.slice(0, 10)
    let week = weeks.get(weekStart)
    if (!week) {
      week = { weekStart, weekLabel: dateFormat.format(new Date(`${weekStart}T12:00:00Z`)) }
      weeks.set(weekStart, week)
    }
    week[row.line_id] = Number(row.units_produced)
    week[`${row.line_id}_defect`] = Number(row.defect_rate_pct)
  }
  return [...weeks.values()]
}

function prettyDuration(milliseconds) {
  if (milliseconds == null) return '—'
  if (milliseconds < 1000) return `${milliseconds.toFixed(1)} ms`
  return `${(milliseconds / 1000).toFixed(2)} s`
}

function StatusDot({ state = 'online' }) {
  return <span aria-hidden="true" className={`status-dot status-dot-${state}`} />
}

function MiniSpark({ color }) {
  return (
    <svg className="mini-spark" viewBox="0 0 110 38" aria-hidden="true" focusable="false">
      <path d="M2 30 C13 26 15 28 22 19 S33 25 39 17 S50 20 56 11 S66 18 73 14 S83 18 89 9 S100 12 108 5" fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function MetricCard({ label, value, detail, icon: Icon, color, spark = false }) {
  return (
    <Card className="metric-card">
      <div className="metric-topline"><span>{label}</span><span className="metric-icon" style={{ color }}><Icon size={16} aria-hidden="true" /></span></div>
      <div className="metric-value-row"><strong className="metric-value">{value}</strong>{spark ? <MiniSpark color={color} /> : null}</div>
      <p className="metric-detail">{detail}</p>
    </Card>
  )
}

function Legend() {
  return (
    <div className="chart-legend" aria-label="Linhas de produção">
      {LINES.map((line, index) => <span key={line}><i style={{ background: SERIES_COLORS[index] }} />{line}</span>)}
    </div>
  )
}

function EngineCard({ result, configured }) {
  const isPostgres = result.engine === 'PostgreSQL'
  const success = result.status === 'ok'
  const Icon = isPostgres ? Database : Layers3
  return (
    <Card className={`engine-card ${isPostgres ? 'engine-card-postgres' : 'engine-card-snowflake'} ${!success ? 'engine-card-error' : ''}`}>
      <div className="engine-heading">
        <div className="engine-name-wrap"><span className={`engine-logo ${isPostgres ? 'pg-logo' : 'sf-logo'}`}><Icon size={17} aria-hidden="true" /></span><div><h3>{result.engine}</h3><span className="engine-subtitle">{isPostgres ? 'OLTP · Local container' : 'Cloud analytics warehouse'}</span></div></div>
        <Badge variant={success ? 'success' : configured ? 'warning' : 'muted'}><StatusDot state={success ? 'online' : 'idle'} />{success ? 'QUERY OK' : configured ? 'ERRO' : 'SETUP'}</Badge>
      </div>
      {success ? (
        <div className="engine-stats">
          <div><span>Tempo de execução</span><strong className="engine-duration">{prettyDuration(result.elapsed_ms)}</strong></div>
          <div><span>Registos analisados</span><strong>{compactFormat.format(result.rows_scanned ?? DATASET_ROWS)}</strong></div>
          <div><span>Resultados agregados</span><strong>{numberFormat.format(result.rows.length)}</strong></div>
        </div>
      ) : (
        <div className="engine-error"><TriangleAlert size={17} aria-hidden="true" /><p>{result.error}</p></div>
      )}
    </Card>
  )
}

function LoadingChart() {
  return <div className="chart-loading" role="status"><LoaderCircle size={20} className="spin" aria-hidden="true" /><span>A preparar os gráficos…</span></div>
}

export default function App() {
  const [source, setSource] = useState('postgres')
  const [benchmark, setBenchmark] = useState(null)
  const [backendStatus, setBackendStatus] = useState({ postgres: 'checking', snowflake: 'setup_required' })
  const [requestError, setRequestError] = useState('')
  const [page, setPage] = useState(0)
  const [isPending, startTransition] = useTransition()

  const loadStatus = async (signal) => {
    try {
      const response = await fetch('/api/status', { signal })
      if (!response.ok) throw new Error('Não foi possível verificar o estado das bases de dados.')
      setBackendStatus(await response.json())
    } catch (error) {
      if (error.name !== 'AbortError') setBackendStatus((current) => ({ ...current, postgres: 'offline' }))
    }
  }

  const runBenchmark = (nextSource = source) => {
    setRequestError('')
    startTransition(async () => {
      try {
        const response = await fetch('/api/benchmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: nextSource }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'A consulta falhou. Tenta novamente.')
        setBenchmark({ ...payload, completedAt: new Date() })
        setPage(0)
      } catch (error) {
        setRequestError(error.message || 'A consulta falhou. Verifica a configuração da base de dados.')
      }
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadStatus(controller.signal)
    runBenchmark('postgres')
    return () => controller.abort()
    // Initial dashboard load intentionally runs once; subsequent runs are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const successfulResults = benchmark?.results?.filter((result) => result.status === 'ok') ?? []
  const primaryResult = successfulResults[0]
  const sourceRows = primaryResult?.rows ?? []
  const chartRows = makeChartRows(sourceRows)
  const totalProduced = sourceRows.reduce((total, row) => total + Number(row.units_produced), 0)
  const totalDefects = sourceRows.reduce((total, row) => total + Number(row.units_defective), 0)
  const defectRate = totalProduced ? (totalDefects / totalProduced) * 100 : null
  const maxPages = Math.max(1, Math.ceil(sourceRows.length / PAGE_SIZE))
  const visibleRows = sourceRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const onlineCount = Number(backendStatus.postgres === 'online') + Number(backendStatus.snowflake === 'ready')

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar para o conteúdo</a>
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="OAD — início">
          <span className="brand-symbol"><Factory size={20} strokeWidth={2.1} aria-hidden="true" /></span>
          <span className="brand-wordmark">OAD<span> / LAB</span></span>
        </a>
        <div className="workspace-switcher"><span className="workspace-avatar">A</span><span><strong>Atlas Factory</strong><small>Workspace industrial</small></span><ChevronRight size={14} aria-hidden="true" /></div>
        <p className="sidebar-label">ESPAÇO DE TRABALHO</p>
        <nav className="side-nav" aria-label="Navegação principal">
          <a className="nav-link active" href="#overview"><BarChart3 size={16} aria-hidden="true" />Visão geral</a>
          <a className="nav-link" href="#engines"><Database size={16} aria-hidden="true" />Motores de dados</a>
          <a className="nav-link" href="#results"><Boxes size={16} aria-hidden="true" />Registos de produção</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-connection">
          <div className="connection-title"><span>ESTADO DO SISTEMA</span><span className="connection-count">{onlineCount}/2</span></div>
          <div className="connection-row"><StatusDot state={backendStatus.postgres === 'online' ? 'online' : 'offline'} /><span>PostgreSQL</span><small>{backendStatus.postgres === 'online' ? 'ligado' : 'offline'}</small></div>
          <div className="connection-row"><StatusDot state={backendStatus.snowflake === 'ready' ? 'online' : 'idle'} /><span>Snowflake</span><small>{backendStatus.snowflake === 'ready' ? 'ligado' : 'configurar'}</small></div>
        </div>
        <div className="sidebar-user"><span className="user-avatar">FF</span><span><strong>Factory floor</strong><small>Demo account</small></span><Settings2 size={15} aria-hidden="true" /></div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs"><span>Análise</span><span>/</span><strong>Desempenho</strong></div>
          <div className="topbar-actions"><Badge variant="outline" className="demo-badge"><span className="demo-pulse" />AMBIENTE DE DEMONSTRAÇÃO</Badge><button type="button" className="help-button" aria-label="Sobre esta demonstração" title="Dados industriais sintéticos"><CircleHelp size={17} aria-hidden="true" /></button></div>
        </header>

        <main id="main-content" className="dashboard" tabIndex="-1">
          <section className="page-heading" id="overview">
            <div><p className="overline"><span className="heading-marker" />INTELIGÊNCIA INDUSTRIAL <span className="overline-separator">/</span> VISÃO GERAL</p><h1>Análise da produção</h1><p className="page-subtitle">Acompanhe produção e qualidade, e compare a mesma carga analítica nos dois motores.</p></div>
            <div className="run-controls">
              <div className="source-picker"><label htmlFor="source-select">Executar em</label><Select value={source} onValueChange={setSource}>
                <SelectTrigger id="source-select" aria-label="Escolher base de dados"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                  <SelectItem value="snowflake">Snowflake</SelectItem>
                  <SelectItem value="both">Comparar ambos</SelectItem>
                </SelectContent>
              </Select></div>
              <Button onClick={() => runBenchmark()} disabled={isPending} className="run-button">
                {isPending ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}
                {isPending ? 'A executar…' : 'Executar consulta'}
              </Button>
            </div>
          </section>

          <div className="dataset-strip" role="status" aria-live="polite">
            <div className="dataset-icon"><Database size={15} aria-hidden="true" /></div>
            <span><strong>{numberFormat.format(DATASET_ROWS)}</strong> leituras sintéticas</span><span className="strip-divider" />
            <span><strong>4</strong> linhas de produção</span><span className="strip-divider" />
            <span><strong>~1 ano</strong> de atividade</span><span className="strip-fill" />
            <span className="last-run">{benchmark?.completedAt ? `Última execução às ${timeFormat.format(benchmark.completedAt)}` : isPending ? 'A preparar a consulta…' : 'À espera da primeira execução'}</span>
            <button className="refresh-icon" type="button" onClick={() => runBenchmark()} disabled={isPending} aria-label="Atualizar dados"><RefreshCw size={14} aria-hidden="true" className={isPending ? 'spin' : ''} /></button>
          </div>

          {requestError ? <div className="alert alert-error" role="alert"><TriangleAlert size={16} aria-hidden="true" /><span>{requestError}</span></div> : null}

          <section className="metrics-grid" aria-label="Indicadores principais">
            <MetricCard label="UNIDADES PRODUZIDAS" value={primaryResult ? compactFormat.format(totalProduced) : '—'} detail="Total no período analisado" icon={Factory} color="#60dff0" spark />
            <MetricCard label="TAXA DE AVARIAS" value={defectRate == null ? '—' : `${defectRate.toFixed(2)}%`} detail={totalDefects ? `${compactFormat.format(totalDefects)} unidades com avaria` : 'Sem registos para apresentar'} icon={Gauge} color="#f2b66d" />
            <MetricCard label="EVENTOS ANALISADOS" value={primaryResult ? compactFormat.format(primaryResult.rows_scanned) : compactFormat.format(DATASET_ROWS)} detail="Consulta agregada semanal" icon={Layers3} color="#9b8cff" />
            <MetricCard label="TEMPO DE CONSULTA" value={primaryResult ? prettyDuration(primaryResult.elapsed_ms) : isPending ? '…' : '—'} detail="Execução + leitura do resultado" icon={Clock3} color="#7bd9aa" />
          </section>

          <section className="chart-grid" aria-label="Tendências de produção e qualidade">
            <Card className="chart-card production-chart-card">
              <CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar cyan" />VOLUME DE PRODUÇÃO</div><CardTitle>Unidades por semana</CardTitle><CardDescription>Produção agregada ao longo do tempo, por linha</CardDescription></div><Badge variant="muted" className="range-badge">{chartRows.length} semanas</Badge></CardHeader>
              <CardContent className="chart-content"><Suspense fallback={<LoadingChart />}><TrendCharts data={chartRows} /></Suspense></CardContent>
              <footer className="chart-footer"><Legend /><span className="chart-footer-note"><ArrowUpRight size={13} aria-hidden="true" /> Séries semanais</span></footer>
            </Card>
            <Card className="chart-card quality-chart-card">
              <CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar amber" />QUALIDADE</div><CardTitle>Taxa de avarias</CardTitle><CardDescription>Percentagem de unidades com avaria</CardDescription></div><span className="quality-icon"><ShieldCheck size={16} aria-hidden="true" /></span></CardHeader>
              <CardContent className="quality-content">
                <div className="quality-summary"><strong>{defectRate == null ? '—' : `${defectRate.toFixed(2)}%`}</strong><span className="quality-label">média global</span><span className="quality-context">no conjunto de dados</span></div>
                <Suspense fallback={<LoadingChart />}><TrendCharts data={chartRows} metric="defects" /></Suspense>
                <Legend />
              </CardContent>
            </Card>
          </section>

          <section className="lower-grid">
            <Card className="results-card" id="results">
              <CardHeader className="results-header"><div><div className="card-eyebrow"><span className="legend-bar violet" />SAÍDA DA CONSULTA</div><CardTitle>Resumo semanal por linha</CardTitle><CardDescription>Unidades produzidas e qualidade, agregadas a partir de {compactFormat.format(DATASET_ROWS)} de eventos</CardDescription></div><Badge variant="muted" className="row-badge">{numberFormat.format(sourceRows.length)} linhas</Badge></CardHeader>
              <CardContent className="table-content">
                {isPending && !primaryResult ? <div className="table-empty"><LoaderCircle size={20} className="spin" aria-hidden="true" />A carregar resultados…</div> : sourceRows.length ? <>
                  <div className="table-scroll"><table className="data-table"><caption className="sr-only">Resumo semanal de produção e avarias por linha de produção</caption><thead><tr><th scope="col">SEMANA</th><th scope="col">LINHA</th><th scope="col" className="num">UNIDADES</th><th scope="col" className="num">AVARIAS</th><th scope="col" className="num">TAXA</th></tr></thead><tbody>
                    {visibleRows.map((row) => <tr key={`${row.week_start}-${row.line_id}`}><td>{dateFormat.format(new Date(`${row.week_start.slice(0, 10)}T12:00:00Z`))}</td><td><span className="table-line"><i style={{ background: SERIES_COLORS[LINES.indexOf(row.line_id)] }} />{row.line_id}</span></td><td className="num">{numberFormat.format(row.units_produced)}</td><td className="num">{numberFormat.format(row.units_defective)}</td><td className="num"><span className="rate-value">{Number(row.defect_rate_pct).toFixed(2)}%</span></td></tr>)}
                  </tbody></table></div>
                  <div className="table-pagination"><span>A mostrar <strong>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sourceRows.length)}</strong> de {numberFormat.format(sourceRows.length)} linhas</span><div><Button variant="outline" size="icon" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} aria-label="Página anterior"><ChevronLeft size={15} aria-hidden="true" /></Button><span className="page-count">{page + 1} / {maxPages}</span><Button variant="outline" size="icon" onClick={() => setPage((current) => Math.min(maxPages - 1, current + 1))} disabled={page >= maxPages - 1} aria-label="Página seguinte"><ChevronRight size={15} aria-hidden="true" /></Button></div></div>
                </> : <div className="table-empty"><Database size={20} aria-hidden="true" /><span>Executa uma consulta para carregar a tabela.</span></div>}
              </CardContent>
            </Card>

            <div className="engine-column" id="engines">
              <Card className="engine-section-card"><CardHeader className="engine-section-header"><div><div className="card-eyebrow"><span className="legend-bar green" />PLATAFORMAS</div><CardTitle>Estado dos motores</CardTitle></div><span className="engine-total"><span className="online-count">{onlineCount}</span> / 2 online</span></CardHeader>
                <CardContent className="engine-list">
                  {benchmark?.results?.length ? benchmark.results.map((result) => <EngineCard key={result.engine} result={result} configured={backendStatus.snowflake === 'ready'} />) : <div className="engine-placeholder"><Server size={18} aria-hidden="true" /><span>Executa uma consulta para comparar os motores.</span></div>}
                  {backendStatus.snowflake !== 'ready' ? <div className="setup-callout"><Sparkles size={15} aria-hidden="true" /><span>Configura o Snowflake no <code>.env</code> para ativar a comparação cloud.</span></div> : null}
                </CardContent>
              </Card>
            </div>
          </section>

          <footer className="dashboard-footer"><span>OAD · INDUSTRIAL ANALYTICS DEMO</span><span className="footer-note"><ArrowDownRight size={13} aria-hidden="true" /> Tempos variam com cache, recursos locais e configuração do warehouse.</span><span className="footer-build">Dados sintéticos · v1.0</span></footer>
        </main>
      </div>
    </div>
  )
}
