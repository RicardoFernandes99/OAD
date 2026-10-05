import { useEffect, useRef, useState } from 'react'
import { ArrowUp, LoaderCircle, MessageSquare, Plus } from 'lucide-react'
import { Button } from './ui/button.jsx'
import { Card } from './ui/card.jsx'
import { Badge } from './ui/badge.jsx'

const prompts = ['Which product type has the highest failure rate?', 'Compare tool wear for failed and healthy machines.', 'How many failures are in the sample?']
const format = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 })
const cell = (value) => value == null ? '—' : typeof value === 'number' ? format.format(value) : String(value)
const heading = (column) => column.toLowerCase().replace(/_pct$/, ' (%)').replace(/_k$/, ' (K)').replace(/_nm$/, ' (Nm)').replace(/_rpm$/, ' (rpm)').replace(/_min$/, ' (min)').replaceAll('_', ' ')
const visibleSql = (message) => message.table_sql || (/\bSEMANTIC_VIEW\s*\(/i.test(message.sql || '') ? null : message.sql)

export default function DataChat({ connected }) {
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const end = useRef(null)
  const controller = useRef(null)
  const busy = useRef(false)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { if (messages.length || loading) end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, loading])

  async function ask(text = question) {
    if (!text.trim() || busy.current || !connected) return
    busy.current = true
    setLoading(true)
    setError('')
    setQuestion('')
    const previous = messages.filter((message) => message.role === 'analyst')
    const history = previous.slice(-5).flatMap((message) => [
      { role: 'user', content: [{ type: 'text', text: message.question }] }, message.analyst_message,
    ])
    setMessages((current) => [...current, { role: 'user', text }])
    controller.current = new AbortController()
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, history }), signal: controller.current.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not answer this question.')
      setMessages((current) => [...current, { ...result, role: 'analyst', question: text }])
    } catch (failure) {
      if (failure.name !== 'AbortError') {
        setError(failure.message)
        setQuestion(text)
        setMessages((current) => current.slice(0, -1))
      }
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  return <Card className="chat-card" aria-label="Ask the data">
    <header className="chat-header"><div><div className="card-eyebrow"><MessageSquare size={13} aria-hidden="true" />CORTEX ANALYST</div><h2 className="card-title">Ask the data</h2><p className="chat-caption">2,500 original records · up to 50 result rows</p></div><div className="chat-actions"><Badge variant="muted">SAMPLE</Badge>{messages.length ? <Button variant="ghost" size="sm" disabled={loading} onClick={() => { setMessages([]); setError(''); setQuestion('') }}><Plus size={13} aria-hidden="true" />New chat</Button> : null}</div></header>
    <div className="chat-conversation" role="log" aria-label="Conversation" aria-busy={loading}>
      {!messages.length ? <div className="chat-starters"><p>Ask about failures, product types or sensor readings.</p>{prompts.map((prompt) => <button key={prompt} type="button" disabled={!connected || loading} onClick={() => void ask(prompt)}>{prompt}<ArrowUp size={13} aria-hidden="true" /></button>)}</div> : messages.map((message, index) => <article key={index} className={`chat-message chat-${message.role}`}><span className="chat-speaker">{message.role === 'user' ? 'You' : 'Cortex Analyst'}</span><p>{message.text || (message.rows?.length ? 'Query results' : 'No answer returned.')}</p>{message.sql ? <><div className="chat-table-wrap">{message.rows.length ? <table className="chat-table"><caption className="sr-only">Results for {message.question}</caption><thead><tr>{message.columns.map((column, i) => <th key={i} scope="col">{heading(column)}</th>)}</tr></thead><tbody>{message.rows.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j}>{cell(value)}</td>)}</tr>)}</tbody></table> : <p>No matching records.</p>}</div>{visibleSql(message) ? <details className="chat-sql"><summary>View SQL · {message.rows.length} result {message.rows.length === 1 ? 'row' : 'rows'}</summary><pre><code>{visibleSql(message)}</code></pre></details> : null}</> : null}{message.suggestions?.length ? <div className="chat-suggestions">{message.suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={loading || !connected} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div> : null}</article>)}
      {loading ? <div className="chat-thinking" role="status"><LoaderCircle size={15} className="spin" aria-hidden="true" />Querying the sample…</div> : null}<div ref={end} />
    </div>
    {error ? <div className="chat-error" role="alert">{error}</div> : null}
    <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); void ask() }}><label className="sr-only" htmlFor="chat-question">Question about the sample</label><textarea id="chat-question" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!connected || loading} maxLength={2000} rows={2} placeholder={connected ? 'Ask a question about the sample…' : 'Connect Snowflake to ask a question.'} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} /><Button type="submit" size="icon" disabled={!connected || loading || !question.trim()} aria-label="Send question">{loading ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ArrowUp size={17} aria-hidden="true" />}</Button></form>
    <p className="chat-footnote">Synthetic sample · results limited to 50 rows.</p>
  </Card>
}
