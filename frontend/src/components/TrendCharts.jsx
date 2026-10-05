import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const COLORS = ['#5ee3f5', '#9b8cff', '#f2b66d', '#7bd9aa', '#f18383']
const axis = { axisLine: false, tickLine: false, tick: { fill: '#75819b', fontSize: 10 } }

function ChartTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0].value)
  const formatted = metric === 'failure-rate' ? `${value.toFixed(2)}%` : value.toLocaleString('pt-PT')
  return <div className="chart-tooltip"><p>{label}</p><div className="tooltip-row"><span className="tooltip-dot" style={{ background: payload[0].color }} /><span>{metric === 'failure-rate' ? 'Taxa de falhas' : 'Registos com este modo'}</span><strong>{formatted}</strong></div></div>
}

export default function TrendCharts({ data, metric }) {
  const isModes = metric === 'modes'
  const categoryKey = isModes ? 'short' : 'product_type'
  const valueKey = isModes ? 'count' : 'failure_rate_pct'
  const formatAxis = (value) => isModes ? Number(value).toLocaleString('pt-PT', { notation: 'compact', maximumFractionDigits: 0 }) : `${Number(value).toFixed(1)}%`
  return <div className="chart-frame" role="img" aria-label={isModes ? 'Contagem por modo de falha AI4I' : 'Taxa de falhas por variante de produto AI4I'}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 14, left: -11, bottom: 0 }}><CartesianGrid stroke="#ffffff0d" vertical={false} /><XAxis dataKey={categoryKey} {...axis} tickMargin={10} /><YAxis {...axis} width={49} tickFormatter={formatAxis} /><Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: '#ffffff08' }} /><Bar dataKey={valueKey} name={isModes ? 'Falhas identificadas' : 'Taxa de falhas'} radius={[4, 4, 0, 0]} maxBarSize={isModes ? 40 : 66}>{data.map((row, index) => <Cell key={row.key ?? row.product_type} fill={isModes ? COLORS[index % COLORS.length] : COLORS[['L', 'M', 'H'].indexOf(String(row.product_type).slice(-1))]} />)}</Bar></BarChart></ResponsiveContainer></div>
}

