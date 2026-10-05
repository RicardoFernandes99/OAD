import { lazy, Suspense, useEffect, useState, useTransition } from 'react'
import {
  Activity, ArrowDownRight, BarChart3, ChevronRight, CircleHelp, Clock3,
  Database, Factory, Gauge, Layers3, LoaderCircle, RefreshCw, Settings2,
  ShieldAlert, Sparkles, TriangleAlert,
} from 'lucide-react'
import { Badge } from './components/ui/badge.jsx'
import { Button } from './components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.jsx'

const TrendCharts = lazy(() => import('./components/TrendCharts.jsx'))
const DATASET_ROWS = 5_000_000
const numberFormat = new Intl.NumberFormat('pt-PT')
const compactFormat = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 })
const timeFormat = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' })
const failureModes = [
  { key: 'twf_failures', label: 'Desgaste da ferramenta', short: 'TWF' },
  { key: 'hdf_failures', label: 'Dissipação de calor', short: 'HDF' },
  { key: 'pwf_failures', label: 'Potência', short: 'PWF' },
  { key: 'osf_failures', label: 'Sobrecarga', short: 'OSF' },
  { key: 'rnf_failures', label: 'Aleatória', short: 'RNF' },
]
const typeColors = { L: '#5ee3f5', M: '#9b8cff', H: '#f2b66d' }

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

function LoadingChart() {
  return <div className="chart-loading" role="status"><LoaderCircle size={20} className="spin" aria-hidden="true" /><span>A preparar os gráficos…</span></div>
}

function ConnectionCard({ name, detail, state, rows, kind, onRefresh, loading }) {
  const configured = state === 'ready' || state === 'online'
  const connecting = state === 'checking'
  const label = connecting ? 'A VERIFICAR' : configured ? 'LIGADO' : state === 'setup_required' ? 'CONFIGURAR' : 'INDISPONÍVEL'
  const variant = configured ? 'success' : state === 'setup_required' ? 'muted' : 'warning'
  const icon = kind === 'snowflake' ? <Layers3 size={17} aria-hidden="true" /> : <Database size={17} aria-hidden="true" />
  return <Card className="connection-overview-card"><div className="connection-overview-heading"><span className={`engine-logo ${kind === 'snowflake' ? 'sf-logo' : 'pg-logo'}`}>{icon}</span><div><h2>{name}</h2><p>{detail}</p></div><Badge variant={variant}><StatusDot state={configured ? 'online' : connecting ? 'idle' : 'offline'} />{label}</Badge></div><div className="connection-overview-count"><strong>{rows == null ? '—' : numberFormat.format(rows)}</strong><span>registos carregados</span></div><p className="connection-overview-note">{kind === 'snowflake' && state === 'setup_required' ? 'Credenciais e tabela de destino por configurar.' : configured ? 'Tabela AI4I_READINGS disponível.' : 'Não foi possível confirmar a ligação ou a tabela.'}</p>{kind === 'snowflake' && state === 'setup_required' ? <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}><RefreshCw size={13} aria-hidden="true" />Verificar novamente</Button> : null}</Card>
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => ['general', 'postgres', 'snowflake'].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'general')
  const [benchmarks, setBenchmarks] = useState({})
  const [backendStatus, setBackendStatus] = useState({ postgres: 'checking', postgres_rows: null, snowflake: 'checking', snowflake_rows: null })
  const [requestError, setRequestError] = useState('')
  const [isPending, startTransition] = useTransition()

  const loadStatus = async (signal) => {
    try {
      const response = await fetch('/api/status', { signal })
      if (!response.ok) throw new Error('Não foi possível verificar as bases de dados.')
      setBackendStatus(await response.json())
    } catch (error) {
      if (error.name !== 'AbortError') setBackendStatus((current) => ({ ...current, postgres: 'offline' }))
    }
  }

  const runBenchmark = (engine) => {
    if (isPending) return
    setRequestError('')
    startTransition(async () => {
      try {
        const response = await fetch('/api/benchmark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: engine }) })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'A consulta falhou. Tenta novamente.')
        const result = payload.results?.[0]
        if (result?.status !== 'ok') throw new Error(result?.error ?? 'A consulta falhou nesta base de dados.')
        setBenchmarks((current) => ({ ...current, [engine]: { ...result, completedAt: new Date() } }))
      } catch (error) {
        setRequestError(error.message || 'A consulta falhou. Verifica a configuração da base de dados.')
      }
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadStatus(controller.signal)
    return () => controller.abort()
    // Initial page load only checks the two database states; benchmarks are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const source = activeTab === 'snowflake' ? 'snowflake' : 'postgres'
  const benchmark = benchmarks[source]
  const rows = benchmark?.rows ?? []
  const records = rows.reduce((sum, row) => sum + Number(row.record_count), 0)
  const failures = rows.reduce((sum, row) => sum + Number(row.machine_failures), 0)
  const failureRate = records ? (failures / records) * 100 : null
  const chartRows = rows.map((row) => ({ ...row, product_type: `Tipo ${row.product_type}` }))
  const modeRows = failureModes.map((mode) => ({ ...mode, count: rows.reduce((sum, row) => sum + Number(row[mode.key] ?? 0), 0) }))
  const onlineCount = Number(backendStatus.postgres === 'online') + Number(backendStatus.snowflake === 'ready')

  const selectTab = (tab) => {
    setActiveTab(tab)
    setRequestError('')
    if (tab === 'postgres' && !benchmarks.postgres) runBenchmark('postgres')
    if (tab === 'snowflake' && backendStatus.snowflake === 'ready' && !benchmarks.snowflake) runBenchmark('snowflake')
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar para o conteúdo</a>
      <aside className="sidebar">
        <a className="brand" href="#general" aria-label="OAD — início" onClick={() => selectTab('general')}><span className="brand-symbol"><Factory size={20} strokeWidth={2.1} aria-hidden="true" /></span><span className="brand-wordmark">OAD<span> / LAB</span></span></a>
        <div className="workspace-switcher"><span className="workspace-avatar">A</span><span><strong>AI4I Factory</strong><small>Laboratório industrial</small></span><ChevronRight size={14} aria-hidden="true" /></div>
        <p className="sidebar-label">ESPAÇO DE TRABALHO</p>
        <nav className="side-nav" aria-label="Navegação principal">
          <a className={`nav-link ${activeTab === 'general' ? 'active' : ''}`} href="#general" aria-current={activeTab === 'general' ? 'page' : undefined} onClick={() => selectTab('general')}><BarChart3 size={16} aria-hidden="true" />Geral</a>
          <a className={`nav-link ${activeTab === 'postgres' ? 'active' : ''}`} href="#postgres" aria-current={activeTab === 'postgres' ? 'page' : undefined} onClick={() => selectTab('postgres')}><Database size={16} aria-hidden="true" />PostgreSQL</a>
          <a className={`nav-link ${activeTab === 'snowflake' ? 'active' : ''}`} href="#snowflake" aria-current={activeTab === 'snowflake' ? 'page' : undefined} onClick={() => selectTab('snowflake')}><Layers3 size={16} aria-hidden="true" />Snowflake</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-connection"><div className="connection-title"><span>ESTADO DO SISTEMA</span><span className="connection-count">{onlineCount}/2</span></div><div className="connection-row"><StatusDot state={backendStatus.postgres === 'online' ? 'online' : 'offline'} /><span>PostgreSQL</span><small>{backendStatus.postgres === 'online' ? 'ligado' : 'offline'}</small></div><div className="connection-row"><StatusDot state={backendStatus.snowflake === 'ready' ? 'online' : 'idle'} /><span>Snowflake</span><small>{backendStatus.snowflake === 'ready' ? 'ligado' : 'configurar'}</small></div></div>
        <div className="sidebar-user"><span className="user-avatar">AI</span><span><strong>AI4I 2020</strong><small>Dataset UCI</small></span><Settings2 size={15} aria-hidden="true" /></div>
      </aside>

      <div className="main-column">
        <header className="topbar"><div className="breadcrumbs"><span>OAD</span><span>/</span><strong>{activeTab === 'general' ? 'Geral' : activeTab === 'postgres' ? 'PostgreSQL' : 'Snowflake'}</strong></div><div className="topbar-actions"><Badge variant="outline" className="demo-badge"><span className="demo-pulse" />AMBIENTE DE DEMONSTRAÇÃO</Badge><button type="button" className="help-button" aria-label="Sobre esta demonstração" title="AI4I 2020 · UCI Machine Learning Repository"><CircleHelp size={17} aria-hidden="true" /></button></div></header>
        <main id="main-content" className={`dashboard dashboard-${activeTab}`} tabIndex="-1">
          <section className="page-heading"><div><p className="overline"><span className="heading-marker" />ANÁLISE INDUSTRIAL <span className="overline-separator">/</span> {activeTab === 'general' ? 'ESTADO DA PLATAFORMA' : activeTab.toUpperCase()}</p><h1>{activeTab === 'general' ? 'Estado das ligações e dos dados' : `Análise de falhas · ${activeTab === 'postgres' ? 'PostgreSQL' : 'Snowflake'}`}</h1><p className="page-subtitle">{activeTab === 'general' ? 'Confirma as ligações e quantos registos AI4I estão carregados em cada plataforma.' : 'A mesma consulta resume falhas de máquina e condições de operação nesta base de dados.'}</p></div>{activeTab !== 'general' ? <Button onClick={() => runBenchmark(source)} disabled={isPending || (source === 'snowflake' && backendStatus.snowflake !== 'ready')} className="run-button">{isPending ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}{isPending ? 'A executar…' : 'Executar análise'}</Button> : null}</section>

          {activeTab === 'general' ? <section className="overview-status-grid" aria-label="Estado das ligações"><ConnectionCard name="PostgreSQL" detail="Base de dados local" state={backendStatus.postgres} rows={backendStatus.postgres_rows} kind="postgres" /><ConnectionCard name="Snowflake" detail="Data warehouse na cloud" state={backendStatus.snowflake} rows={backendStatus.snowflake_rows} kind="snowflake" onRefresh={() => void loadStatus()} loading={isPending} /><Card className="overview-dataset-card"><div className="dataset-icon"><Database size={15} aria-hidden="true" /></div><div><div className="card-eyebrow">FONTE E VOLUME DE DADOS</div><h2>{numberFormat.format(DATASET_ROWS)} registos · AI4I 2020</h2><p>10 mil observações originais da UCI, repetidas 500 vezes para criar uma carga analítica grande. A repetição serve para o exercício de escala; não representa novas observações independentes.</p></div><Badge variant="outline">10 000 originais</Badge></Card><div className="overview-attribution">Fonte: <a href="https://doi.org/10.24432/C5HS5C" target="_blank" rel="noreferrer">UCI Machine Learning Repository · AI4I 2020</a> · CC BY 4.0</div></section> : <>
            <div className="dataset-strip" role="status" aria-live="polite"><div className="dataset-icon"><Database size={15} aria-hidden="true" /></div><span><strong>{numberFormat.format(benchmark?.rows_scanned ?? backendStatus[`${source}_rows`] ?? DATASET_ROWS)}</strong> observações analisadas</span><span className="strip-divider" /><span><strong>10 000</strong> originais × 500 repetições</span><span className="strip-fill" /><span className="last-run">{benchmark?.completedAt ? `Última execução às ${timeFormat.format(benchmark.completedAt)}` : isPending ? 'A preparar a análise…' : 'Executa a análise para começar'}</span><button className="refresh-icon" type="button" onClick={() => runBenchmark(source)} disabled={isPending || (source === 'snowflake' && backendStatus.snowflake !== 'ready')} aria-label="Atualizar análise"><RefreshCw size={14} aria-hidden="true" className={isPending ? 'spin' : ''} /></button></div>
            {requestError ? <div className="alert alert-error" role="alert"><TriangleAlert size={16} aria-hidden="true" /><span>{requestError}</span></div> : null}
            {source === 'snowflake' && backendStatus.snowflake !== 'ready' ? <div className="setup-callout large-callout"><Sparkles size={17} aria-hidden="true" /><div><strong>Snowflake ainda não está ligado</strong><p>Preenche as variáveis <code>SNOWFLAKE_*</code> no <code>.env</code>, executa <code>snowflake/001_setup.sql</code>, carrega <code>data/ai4i2020.csv</code> para <code>AI4I_SOURCE</code> e depois executa <code>snowflake/002_expand.sql</code>.</p></div></div> : null}

            <section className="metrics-grid" aria-label="Indicadores principais"><MetricCard label="REGISTOS ANALISADOS" value={benchmark ? compactFormat.format(benchmark.rows_scanned) : '—'} detail="Observações AI4I no workload" icon={Layers3} color="#9b8cff" /><MetricCard label="FALHAS DE MÁQUINA" value={benchmark ? compactFormat.format(failures) : '—'} detail="Rótulo machine_failure = 1" icon={ShieldAlert} color="#f2b66d" /><MetricCard label="TAXA DE FALHAS" value={failureRate == null ? '—' : `${failureRate.toFixed(2)}%`} detail="Média sobre os registos analisados" icon={Gauge} color="#60dff0" /><MetricCard label="TEMPO DE CONSULTA" value={benchmark ? prettyDuration(benchmark.elapsed_ms) : '—'} detail="Execução + leitura do resultado" icon={Clock3} color="#7bd9aa" /></section>

            <section className="chart-grid" aria-label="Análise de falhas e variantes"><Card className="chart-card production-chart-card"><CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar cyan" />FALHAS POR VARIANTE</div><CardTitle>Taxa de falhas por tipo de produto</CardTitle><CardDescription>AI4I classifica produtos como L, M ou H</CardDescription></div><Badge variant="muted" className="range-badge">3 variantes</Badge></CardHeader><CardContent className="chart-content"><Suspense fallback={<LoadingChart />}><TrendCharts data={chartRows} metric="failure-rate" /></Suspense></CardContent><footer className="chart-footer"><span className="chart-legend">Taxa machine_failure por tipo</span><span className="chart-footer-note"><ArrowDownRight size={13} aria-hidden="true" /> Dados AI4I</span></footer></Card><Card className="chart-card quality-chart-card"><CardHeader className="chart-card-header"><div><div className="card-eyebrow"><span className="legend-bar amber" />MODOS DE FALHA</div><CardTitle>Falhas por categoria</CardTitle><CardDescription>As etiquetas de modo podem sobrepor-se</CardDescription></div><span className="quality-icon"><ShieldAlert size={16} aria-hidden="true" /></span></CardHeader><CardContent className="quality-content"><Suspense fallback={<LoadingChart />}><TrendCharts data={modeRows} metric="modes" /></Suspense><div className="failure-mode-legend">{failureModes.map((mode) => <span key={mode.key}><strong>{mode.short}</strong> {mode.label}</span>)}</div></CardContent></Card></section>

            <section className="lower-grid"><Card className="results-card"><CardHeader className="results-header"><div><div className="card-eyebrow"><span className="legend-bar violet" />RESULTADO DA CONSULTA</div><CardTitle>Resumo por tipo de produto</CardTitle><CardDescription>Falhas, condições médias dos sensores e rótulos AI4I</CardDescription></div><Badge variant="muted" className="row-badge">{numberFormat.format(rows.length)} tipos</Badge></CardHeader><CardContent className="table-content">{isPending && !benchmark ? <div className="table-empty"><LoaderCircle size={20} className="spin" aria-hidden="true" />A carregar resultados…</div> : rows.length ? <div className="table-scroll"><table className="data-table"><caption className="sr-only">Taxa de falhas e métricas AI4I por tipo de produto</caption><thead><tr><th scope="col">TIPO</th><th scope="col" className="num">REGISTOS</th><th scope="col" className="num">FALHAS</th><th scope="col" className="num">TAXA</th><th scope="col" className="num">DESGASTE P95</th><th scope="col" className="num">BINÁRIO MÉDIO</th></tr></thead><tbody>{rows.map((row) => <tr key={row.product_type}><td><span className="table-line"><i style={{ background: typeColors[row.product_type] }} />Tipo {row.product_type}</span></td><td className="num">{numberFormat.format(row.record_count)}</td><td className="num">{numberFormat.format(row.machine_failures)}</td><td className="num"><span className="rate-value">{Number(row.failure_rate_pct).toFixed(2)}%</span></td><td className="num">{Number(row.p95_tool_wear_min).toFixed(1)} min</td><td className="num">{Number(row.avg_torque_nm).toFixed(1)} Nm</td></tr>)}</tbody></table></div> : <div className="table-empty"><Database size={20} aria-hidden="true" /><span>Executa a análise para apresentar resultados.</span></div>}</CardContent></Card><Card className="engine-section-card"><CardHeader className="engine-section-header"><div><div className="card-eyebrow"><span className="legend-bar green" />EXECUÇÃO ATUAL</div><CardTitle>{source === 'postgres' ? 'PostgreSQL' : 'Snowflake'}</CardTitle></div><span className="engine-total"><span className="online-count">{source === 'postgres' ? backendStatus.postgres === 'online' : backendStatus.snowflake === 'ready' ? 'Ligado' : '—'}</span></span></CardHeader><CardContent className="engine-list">{benchmark ? <div className="engine-card"><div className="engine-heading"><div className="engine-name-wrap"><span className={`engine-logo ${source === 'postgres' ? 'pg-logo' : 'sf-logo'}`}>{source === 'postgres' ? <Database size={17} aria-hidden="true" /> : <Layers3 size={17} aria-hidden="true" />}</span><div><h3>{benchmark.engine}</h3><span className="engine-subtitle">Agregação analítica · AI4I</span></div></div><Badge variant="success"><StatusDot />CONSULTA OK</Badge></div><div className="engine-stats"><div><span>Tempo medido</span><strong className="engine-duration">{prettyDuration(benchmark.elapsed_ms)}</strong></div><div><span>Registos</span><strong>{compactFormat.format(benchmark.rows_scanned)}</strong></div><div><span>Tipos de produto</span><strong>{numberFormat.format(rows.length)}</strong></div></div></div> : <p className="engine-placeholder">A consulta ainda não foi executada.</p>}{backendStatus.snowflake !== 'ready' && source === 'snowflake' ? <div className="setup-callout"><Sparkles size={15} aria-hidden="true" /><span>Usa as instruções de ligação acima para ativar esta análise.</span></div> : null}</CardContent></Card></section>
            </>}
            <footer className="dashboard-footer"><span>OAD · DEMO ANALÍTICA</span><span className="footer-note"><ArrowDownRight size={13} aria-hidden="true" /> Tempos variam com hardware, cache, rede e configuração do warehouse.</span><span className="footer-build">Fonte UCI · carga expandida</span></footer>
        </main>
      </div>
    </div>
  )
}

