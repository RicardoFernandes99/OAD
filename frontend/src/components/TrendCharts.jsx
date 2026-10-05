import { useId } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const COLORS = ['#087e8b', '#7863be', '#bd7818', '#23865c', '#c45d52']
const axis = { axisLine: false, tickLine: false, tick: { fill: '#64748b', fontSize: 11 } }

function ChartTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0].value)
  const formatted = metric === 'modes' ? value.toLocaleString('en-GB') : `${value.toFixed(2)}%`
  return <div className="chart-tooltip"><p>{label}</p><div className="tooltip-row"><span className="tooltip-dot" style={{ background: payload[0].color }} /><span>{metric === 'risk' ? 'Predicted risk' : metric === 'failure-rate' ? 'Failure rate' : 'Recorded failures'}</span><strong>{formatted}</strong></div></div>
}

export default function TrendCharts({ data, metric, categoryKey: categoryOverride, valueKey: valueKeyOverride, variant = 'bar', ariaLabel }) {
  const gradientId = `chart-fill-${useId().replace(/:/g, '')}`
  const isModes = metric === 'modes'
  const categoryKey = categoryOverride ?? (isModes ? 'short' : 'product_type')
  const valueKey = valueKeyOverride ?? (isModes ? 'count' : 'failure_rate_pct')
  const formatAxis = (value) => isModes ? Number(value).toLocaleString('en-GB', { notation: 'compact', maximumFractionDigits: 0 }) : `${Number(value).toFixed(1)}%`
  const label = ariaLabel ?? (isModes ? 'AI4I failure count by mode' : metric === 'risk' ? 'Predicted failure risk by product type' : 'AI4I failure rate by product type')

  if (!data.length) return <div className="chart-empty">Run an analysis to see this chart.</div>

  const horizontal = variant === 'horizontal'
  const axes = <><CartesianGrid stroke="#e6ebef" vertical={horizontal} horizontal={!horizontal} />{horizontal ? <><XAxis type="number" {...axis} tickFormatter={formatAxis} /><YAxis type="category" dataKey={categoryKey} {...axis} width={40} /></> : <><XAxis dataKey={categoryKey} {...axis} tickMargin={10} minTickGap={24} /><YAxis {...axis} width={53} tickFormatter={formatAxis} /></>}<Tooltip content={<ChartTooltip metric={metric} />} cursor={variant === 'line' || variant === 'area' ? { stroke: '#cbd5e1', strokeDasharray: '4 4' } : { fill: '#087e8b09' }} /></>
  const color = variant === 'line' ? COLORS[1] : variant === 'area' ? COLORS[3] : COLORS[0]
  const margin = { top: 12, right: 15, left: horizontal ? -8 : -10, bottom: 2 }
  let chart

  if (variant === 'line') {
    chart = <LineChart data={data} margin={margin}>{axes}<Line type="linear" dataKey={valueKey} stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} /></LineChart>
  } else if (variant === 'area') {
    chart = <AreaChart data={data} margin={margin}><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.2} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>{axes}<Area type="linear" dataKey={valueKey} stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} /></AreaChart>
  } else {
    chart = <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={margin}>{axes}<Bar dataKey={valueKey} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 18 : 52}>{data.map((row, index) => { const productIndex = ['L', 'M', 'H'].indexOf(String(row.product_type ?? '').slice(-1)); return <Cell key={row.key ?? row[categoryKey] ?? index} fill={COLORS[productIndex < 0 ? index % COLORS.length : productIndex]} /> })}</Bar></BarChart>
  }

  return <div className={`chart-frame chart-${variant}`} role="img" aria-label={label}><ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer></div>
}
