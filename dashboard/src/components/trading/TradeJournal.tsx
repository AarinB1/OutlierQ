import { useEffect, useMemo, useState } from 'react'
import {
  createJournalEntry,
  deleteJournalEntry,
  fetchJournalEntries,
  fetchJournalStats,
  updateJournalEntry,
} from '../../api'
import type { JournalEntry, JournalStats } from '../../types'
import { useToast } from '../../hooks/useToast'
import EmptyState from './EmptyState'

interface JournalFormState {
  ticker: string
  direction: string
  entry_price: string
  exit_price: string
  pnl_dollars: string
  setup_notes: string
  review_notes: string
  tags: string
  rating: number
}

const emptyForm: JournalFormState = {
  ticker: '',
  direction: 'BUY',
  entry_price: '',
  exit_price: '',
  pnl_dollars: '',
  setup_notes: '',
  review_notes: '',
  tags: '',
  rating: 3,
}

export default function TradeJournal() {
  const { addToast } = useToast()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [stats, setStats] = useState<JournalStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [form, setForm] = useState<JournalFormState>(emptyForm)

  const load = async () => {
    setLoading(true)
    try {
      const [nextEntries, nextStats] = await Promise.all([
        fetchJournalEntries(),
        fetchJournalStats(),
      ])
      setEntries(nextEntries)
      setStats(nextStats)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load journal'
      addToast('error', 'Journal error', message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => {
    setEditingEntry(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (entry: JournalEntry) => {
    setEditingEntry(entry)
    setForm({
      ticker: entry.ticker,
      direction: entry.direction ?? 'BUY',
      entry_price: entry.entry_price?.toString() ?? '',
      exit_price: entry.exit_price?.toString() ?? '',
      pnl_dollars: entry.pnl_dollars?.toString() ?? '',
      setup_notes: entry.setup_notes ?? '',
      review_notes: entry.review_notes ?? '',
      tags: entry.tags.join(', '),
      rating: entry.rating ?? 3,
    })
    setShowForm(true)
  }

  const topTag = useMemo(() => {
    if (!stats) return '—'
    const entries = Object.entries(stats.tag_counts)
    if (entries.length === 0) return '—'
    return entries.sort((a, b) => b[1] - a[1])[0][0]
  }, [stats])

  const saveForm = async () => {
    const payload = {
      ticker: form.ticker.trim().toUpperCase(),
      direction: form.direction,
      entry_price: form.entry_price ? Number(form.entry_price) : null,
      exit_price: form.exit_price ? Number(form.exit_price) : null,
      pnl_dollars: form.pnl_dollars ? Number(form.pnl_dollars) : null,
      setup_notes: form.setup_notes || null,
      review_notes: form.review_notes || null,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      rating: form.rating,
    }
    try {
      if (editingEntry) {
        await updateJournalEntry(editingEntry.id, payload)
        addToast('info', 'Journal entry updated', editingEntry.ticker)
      } else {
        await createJournalEntry(payload)
        addToast('trade', 'Journal entry created', payload.ticker)
      }
      setShowForm(false)
      setEditingEntry(null)
      setForm(emptyForm)
      await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save journal entry'
      addToast('error', 'Save failed', message)
    }
  }

  const removeEntry = async (entry: JournalEntry) => {
    if (!window.confirm(`Delete journal entry for ${entry.ticker}?`)) return
    try {
      await deleteJournalEntry(entry.id)
      await load()
      addToast('info', 'Journal entry deleted', entry.ticker)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete journal entry'
      addToast('error', 'Delete failed', message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Entries" value={String(stats?.total_entries ?? 0)} />
        <StatCard label="Avg Rating" value={stats ? `${stats.avg_rating.toFixed(1)}/5` : '0/5'} />
        <StatCard
          label="Total P&L"
          value={`$${(stats?.total_pnl ?? 0).toFixed(2)}`}
          className={(stats?.total_pnl ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}
        />
        <StatCard label="Top Tag" value={topTag} />
      </div>

      <div className="flex justify-between items-center">
        <h2 className="font-mono font-bold text-lg">Journal</h2>
        <button className="btn-primary" onClick={openCreate}>
          Add Journal Entry
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              value={form.ticker}
              onChange={(e) => setForm((prev) => ({ ...prev, ticker: e.target.value }))}
              className="bg-surface-tertiary border border-border rounded px-3 py-2 font-mono"
              placeholder="Ticker"
            />
            <select
              value={form.direction}
              onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value }))}
              className="bg-surface-tertiary border border-border rounded px-3 py-2"
            >
              <option value="BUY">BUY</option>
              <option value="SHORT">SHORT</option>
              <option value="SELL">SELL</option>
            </select>
            <input
              value={form.entry_price}
              onChange={(e) => setForm((prev) => ({ ...prev, entry_price: e.target.value }))}
              className="bg-surface-tertiary border border-border rounded px-3 py-2"
              placeholder="Entry Price"
            />
            <input
              value={form.exit_price}
              onChange={(e) => setForm((prev) => ({ ...prev, exit_price: e.target.value }))}
              className="bg-surface-tertiary border border-border rounded px-3 py-2"
              placeholder="Exit Price"
            />
          </div>
          <input
            value={form.pnl_dollars}
            onChange={(e) => setForm((prev) => ({ ...prev, pnl_dollars: e.target.value }))}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
            placeholder="P&L ($)"
          />
          <textarea
            value={form.setup_notes}
            onChange={(e) => setForm((prev) => ({ ...prev, setup_notes: e.target.value }))}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 min-h-[88px]"
            placeholder="Setup notes"
          />
          <textarea
            value={form.review_notes}
            onChange={(e) => setForm((prev) => ({ ...prev, review_notes: e.target.value }))}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 min-h-[88px]"
            placeholder="Review notes"
          />
          <input
            value={form.tags}
            onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
            placeholder="Tags (comma separated)"
          />
          <div className="flex items-center gap-2">
            <span className="label">Rating</span>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, rating: value }))}
                className={`px-2 py-1 rounded ${
                  form.rating >= value ? 'bg-accent-amber/20 text-accent-amber' : 'bg-surface-tertiary text-txt-tertiary'
                }`}
              >
                ★
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={saveForm}>
              {editingEntry ? 'Update Entry' : 'Create Entry'}
            </button>
            <button
              className="px-3 py-2 border border-border rounded text-sm text-txt-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="card space-y-3">
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-12 w-full" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="✎&#xFE0E;"
            title="No journal entries yet"
            subtitle="Track your trades with notes, ratings, and tags to identify patterns and improve your strategy over time."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-lg">{entry.ticker}</span>
                    <span className={`pill text-[10px] ${entry.direction === 'BUY' ? 'bg-accent-green-muted text-accent-green' : 'bg-accent-red-muted text-accent-red'}`}>
                      {entry.direction ?? '—'}
                    </span>
                    <span className={(entry.pnl_dollars ?? 0) >= 0 ? 'text-accent-green font-mono' : 'text-accent-red font-mono'}>
                      ${(entry.pnl_dollars ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-txt-tertiary mt-1">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs text-txt-secondary" onClick={() => openEdit(entry)}>
                    Edit
                  </button>
                  <button className="text-xs text-accent-red" onClick={() => removeEntry(entry)}>
                    Delete
                  </button>
                </div>
              </div>

              {entry.setup_notes && (
                <div className="mt-3">
                  <div className="label mb-1">Setup</div>
                  <div className="text-sm text-txt-secondary">{entry.setup_notes}</div>
                </div>
              )}
              {entry.review_notes && (
                <div className="mt-3">
                  <div className="label mb-1">Review</div>
                  <div className="text-sm text-txt-secondary">{entry.review_notes}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {entry.tags.map((tag) => (
                  <span key={tag} className="pill bg-surface-tertiary text-txt-secondary">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="text-sm text-txt-secondary mt-3">{'★'.repeat(entry.rating ?? 0)}{'☆'.repeat(5 - (entry.rating ?? 0))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="card">
      <div className="label mb-1">{label}</div>
      <div className={`font-mono font-bold text-xl ${className ?? ''}`}>{value}</div>
    </div>
  )
}
