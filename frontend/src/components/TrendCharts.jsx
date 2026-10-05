import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const SERIES = [
  { key: 'LINE-01', color: '#5ee3f5' },
  { key: 'LINE-02', color: '#9b8cff' },
  { key: 'LINE-03', color: '#f2b66d' },
  { key: 'LINE-04', color: '#7bd9aa' },
]

const axis = {
  axisLine: false,
  tickLine: false,
  tick: { fill: '#75819b', fontSize: 10 },
}

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p>{label}</p>
      {payload.map((entry) => (
        <div className="tooltip-row" key={entry.dataKey}>
          <span className="tooltip-dot" style={{ background: entry.color }} />
          <span>{entry.dataKey}</span>
          <strong>{unit === '%' ? `${Number(entry.value).toFixed(2)}%` : Number(entry.value).toLocaleString('pt-PT')}</strong>
        </div>
      ))}
    </div>
  )
}

function TrendChart({ data, metric }) {
  const isDefect = metric === 'defects'
  return (
    <div className="chart-frame" role="img" aria-label={isDefect ? 'Taxa de avarias por semana e linha de produção' : 'Unidades produzidas por semana e linha de produção'}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 14, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#ffffff0d" vertical={false} />
          <XAxis dataKey="weekLabel" {...axis} tickMargin={12} minTickGap={28} />
          <YAxis {...axis} width={48} tickFormatter={(value) => isDefect ? `${Number(value).toFixed(1)}%` : Number(value).toLocaleString('pt-PT', { notation: 'compact', maximumFractionDigits: 0 })} />
          <Tooltip content={<ChartTooltip unit={isDefect ? '%' : ''} />} cursor={{ stroke: '#98a5c3', strokeDasharray: '3 4' }} />
          {SERIES.map((series) => (
            <Line key={series.key} type="monotone" dataKey={series.key} name={series.key} stroke={series.color} strokeWidth={isDefect ? 1.7 : 2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function TrendCharts({ data, metric = 'production' }) {
  return <TrendChart data={data} metric={metric} />
}
