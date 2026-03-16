import { useState, useEffect } from 'react'
import { fetchWatchlists, createWatchlist, updateWatchlist, deleteWatchlist, scanWatchlist } from '../../api'
import type { WatchlistItem } from '../../types'
import { useToast } from '../../hooks/useToast'
import EmptyState from './EmptyState'

export default function WatchlistManager() {
  const { addToast } = useToast()
  const [watchlists, setWatchlists] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTickers, setNewTickers] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTickers, setEditTickers] = useState('')
  const [scanningId, setScanningId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetchWatchlists()
      .then(setWatchlists)
      .catch(() => addToast('error', 'Load failed', 'Could not load watchlists'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const tickers = newTickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    try {
      await createWatchlist({ name: newName.trim(), tickers })
      addToast('info', 'Watchlist created', `"${newName.trim()}" created`)
      setShowCreate(false)
      setNewName('')
      setNewTickers('')
      load()
    } catch {
      addToast('error', 'Create failed', 'Could not create watchlist')
    }
  }

  const handleUpdate = async (id: string) => {
    const tickers = editTickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    try {
      await updateWatchlist(id, { tickers })
      addToast('info', 'Watchlist updated', 'Tickers updated')
      setEditingId(null)
      load()
    } catch {
      addToast('error', 'Update failed', 'Could not update watchlist')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteWatchlist(id)
      addToast('info', 'Watchlist deleted', 'Watchlist removed')
      load()
    } catch {
      addToast('error', 'Delete failed', 'Could not delete watchlist')
    }
  }

  const handleScan = async (wl: WatchlistItem) => {
    setScanningId(wl.id)
    try {
      const result = await scanWatchlist(wl.id)
      addToast('signal', `Generated ${result.generated} signals`, `Scanned ${wl.name}`)
    } catch {
      addToast('error', 'Scan failed', 'Could not scan watchlist')
    } finally {
      setScanningId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-mono font-bold text-lg">Watchlists</h2>
        <button className="btn-primary text-xs px-4 py-2" onClick={() => setShowCreate(true)}>New Watchlist</button>
      </div>

      {showCreate && (
        <div className="card space-y-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Watchlist name" className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm" />
          <input value={newTickers} onChange={e => setNewTickers(e.target.value)} placeholder="Tickers (comma-separated: AAPL, MSFT, NVDA)" className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm font-mono" />
          <div className="flex gap-2">
            <button className="btn-primary text-xs px-4 py-2" onClick={handleCreate}>Create</button>
            <button className="text-txt-tertiary text-xs px-3" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="card"><div className="skeleton h-24 w-full" /></div>)}
        </div>
      ) : watchlists.length === 0 ? (
        <EmptyState
          icon="⬡"
          title="No watchlists yet"
          subtitle="Create a watchlist to group tickers and scan them for signals in one click."
          action={{ label: 'New Watchlist', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {watchlists.map(wl => (
            <div key={wl.id} className="card">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-mono font-bold text-lg">{wl.name}</div>
                  <span className="pill bg-surface-tertiary text-txt-secondary text-xs">{wl.tickers.length} tickers</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary text-xs px-3 py-1" onClick={() => handleScan(wl)} disabled={scanningId === wl.id}>
                    {scanningId === wl.id ? 'Scanning...' : 'Scan All'}
                  </button>
                  <button className="text-txt-tertiary text-xs hover:text-txt-primary" onClick={() => { setEditingId(wl.id); setEditTickers(wl.tickers.join(', ')) }}>Edit</button>
                  <button className="text-accent-red text-xs hover:underline" onClick={() => handleDelete(wl.id)}>Delete</button>
                </div>
              </div>
              {editingId === wl.id ? (
                <div className="flex gap-2 mt-2">
                  <input value={editTickers} onChange={e => setEditTickers(e.target.value)} className="flex-1 bg-surface-tertiary border border-border rounded px-3 py-1 text-sm font-mono" />
                  <button className="btn-primary text-xs px-3" onClick={() => handleUpdate(wl.id)}>Save</button>
                  <button className="text-txt-tertiary text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {wl.tickers.map(t => (
                    <span key={t} className="pill bg-surface-tertiary text-txt-secondary text-xs">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
