import { useState, useEffect } from 'react'
import { fetchJournalEntries, createJournalEntry, updateJournalEntry, deleteJournalEntry, fetchJournalStats } from '../api'
import type { JournalEntry, JournalStats } from '../types'
import { useToast } from '../hooks/useToast'
import EmptyState from './EmptyState'

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          className={`text-lg ${n <= value ? 'text-accent-amber' : 'text-surface-tertiary'} ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function TradeJournal() {
  const { addToast } = useToast()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [stats, setStats] = useState<JournalStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formTicker, setFormTicker] = useState('')
  const [formDirection, setFormDirection] = useState('BUY')
  const [formEntry, setFormEntry] = useState('')
  const [formExit, setFormExit] = useState('')
  const [formPnl, setFormPnl] = useState('')
  const [formSetup, setFormSetup] = useState('')
  const [formReview, setFormReview] = useState('')
  const [formTags, setFormTags] = useState('')
  const [formRating, setFormRating] = useState(3)

  const load = () => {
    setLoading(true)
    Promise.all([fetchJournalEntries(), fetchJournalStats()])
      .then(([e, s]) => { setEntries(e); setStats(s) })
      .catch(() => addToast('error', 'Load failed', 'Could not load journal'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setFormTicker(''); setFormDirection('BUY'); setFormEntry(''); setFormExit('')
    setFormPnl(''); setFormSetup(''); setFormReview(''); setFormTags(''); setFormRating(3)
    setEditingId(null); setShowForm(false)
  }

  const handleSave = async () => {
    const body: Record<string, unknown> = {
      ticker: formTicker.toUpperCase(),
      direction: formDirection,
      entry_price: formEntry ? parseFloat(formEntry) : null,
      exit_price: formExit ? parseFloat(formExit) : null,
      pnl_dollars: formPnl ? parseFloat(formPnl) : null,
      setup_notes: formSetup || null,
      review_notes: formReview || null,
      tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      rating: formRating,
    }
    try {
      if (editingId) {
        await updateJournalEntry(editingId, body)
        addToast('info', 'Entry updated', 'Journal entry updated')
      } else {
        await createJournalEntry(body)
        addToast('info', 'Entry created', 'Journal entry added')
      }
      resetForm()
      load()
    } catch {
      addToast('error', 'Save failed', 'Could not save journal entry')
    }
  }

  const handleEdit = (e: JournalEntry) => {
    setEditingId(e.id)
    setFormTicker(e.ticker)
    setFormDirection(e.direction || 'BUY')
    setFormEntry(e.entry_price?.toString() || '')
    setFormExit(e.exit_price?.toString() || '')
    setFormPnl(e.pnl_dollars?.toString() || '')
    setFormSetup(e.setup_notes || '')
    setFormReview(e.review_notes || '')
    setFormTags(e.tags.join(', '))
    setFormRating(e.rating || 3)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteJournalEntry(id)
      addToast('info', 'Entry deleted', 'Journal entry removed')
      load()
    } catch {
      addToast('error', 'Delete failed', 'Could not delete entry')
    }
  }

  const topTag = stats?.tag_counts ? Object.entries(stats.tag_counts).sort((a, b) => b[1] - a[1])[0]?.[0] : '—'

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-mono font-bold text-lg">Trade Journal</h2>
        <button className="btn-primary text-xs px-4 py-2" onClick={() => { resetForm(); setShowForm(true) }}>Add Journal Entry</button>
      </div>

      {/* Stats */}
      {stats && stats.total_entries > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="card text-center py-3">
            <div className="text-xs text-txt-tertiary">Total Entries</div>
            <div className="font-mono font-bold text-lg">{stats.total_entries}</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xs text-txt-tertiary">Avg Rating</div>
            <div className="font-mono font-bold text-lg">{stats.avg_rating}/5</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xs text-txt-tertiary">Total P&L</div>
            <div className={`font-mono font-bold text-lg ${stats.total_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>${stats.total_pnl.toFixed(2)}</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xs text-txt-tertiary">Top Tag</div>
            <div className="font-mono font-bold text-lg">{topTag}</div>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card space-y-3">
          <h3 className="font-mono font-bold text-sm">{editingId ? 'Edit Entry' : 'New Entry'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="label mb-1">Ticker</div>
              <input value={formTicker} onChange={e => setFormTicker(e.target.value)} className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <div className="label mb-1">Direction</div>
              <select value={formDirection} onChange={e => setFormDirection(e.target.value)} className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm">
                <option value="BUY">BUY</option>
                <option value="SHORT">SHORT</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div>
              <div className="label mb-1">Entry Price</div>
              <input type="number" value={formEntry} onChange={e => setFormEntry(e.target.value)} className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <div className="label mb-1">Exit Price</div>
              <input type="number" value={formExit} onChange={e => setFormExit(e.target.value)} className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">P&L ($)</div>
              <input type="number" value={formPnl} onChange={e => setFormPnl(e.target.value)} className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <div className="label mb-1">Tags (comma-separated)</div>
              <input value={formTags} onChange={e => setFormTags(e.target.value)} className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <div className="label mb-1">Setup Notes</div>
            <textarea value={formSetup} onChange={e => setFormSetup(e.target.value)} rows={2} className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm resize-none" />
          </div>
          <div>
            <div className="label mb-1">Review Notes</div>
            <textarea value={formReview} onChange={e => setFormReview(e.target.value)} rows={2} className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm resize-none" />
          </div>
          <div>
            <div className="label mb-1">Rating</div>
            <StarRating value={formRating} onChange={setFormRating} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-xs px-4 py-2" onClick={handleSave}>{editingId ? 'Update' : 'Save'}</button>
            <button className="text-txt-tertiary text-xs px-3" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Entries */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="card"><div className="skeleton h-32 w-full" /></div>)}</div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="◈"
          title="No journal entries yet"
          subtitle="Track your trades with notes, ratings, and tags to identify patterns and improve your strategy over time."
          action={{ label: 'Add Entry', onClick: () => { resetForm(); setShowForm(true) } }}
        />
      ) : (
        <div className="space-y-3">
          {entries.map(e => (
            <div key={e.id} className="card">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-lg">{e.ticker}</span>
                  {e.direction && (
                    <span className={`pill text-xs ${e.direction === 'BUY' ? 'bg-accent-green-muted text-accent-green' : 'bg-accent-red-muted text-accent-red'}`}>
                      {e.direction}
                    </span>
                  )}
                  {e.pnl_dollars != null && (
                    <span className={`font-mono font-bold ${e.pnl_dollars >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      ${e.pnl_dollars.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {e.rating && <StarRating value={e.rating} />}
                  <span className="text-xs text-txt-tertiary">{e.created_at ? new Date(e.created_at).toLocaleDateString() : ''}</span>
                  <button className="text-txt-tertiary text-xs hover:text-txt-primary" onClick={() => handleEdit(e)}>Edit</button>
                  <button className="text-accent-red text-xs hover:underline" onClick={() => handleDelete(e.id)}>Delete</button>
                </div>
              </div>
              {e.setup_notes && <div className="mb-1"><span className="text-xs text-txt-tertiary">Setup:</span> <span className="text-sm text-txt-secondary">{e.setup_notes}</span></div>}
              {e.review_notes && <div className="mb-1"><span className="text-xs text-txt-tertiary">Review:</span> <span className="text-sm text-txt-secondary">{e.review_notes}</span></div>}
              {e.tags.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {e.tags.map(tag => <span key={tag} className="pill bg-surface-tertiary text-txt-secondary text-xs">{tag}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
