import { useEffect, useState } from 'react'
import {
  createWatchlist,
  deleteWatchlist,
  fetchWatchlists,
  scanWatchlist,
  updateWatchlist,
} from '../../api'
import type { WatchlistSaved } from '../../types'
import { useToast } from '../../hooks/useToast'
import EmptyState from './EmptyState'

export default function WatchlistManager() {
  const { addToast } = useToast()
  const [watchlists, setWatchlists] = useState<WatchlistSaved[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [tickers, setTickers] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTickers, setEditTickers] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setWatchlists(await fetchWatchlists())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load watchlists'
      addToast('error', 'Watchlist error', message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const parseTickers = (value: string) =>
    value
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean)

  const handleCreate = async () => {
    try {
      await createWatchlist({ name: name.trim() || 'Untitled', tickers: parseTickers(tickers) })
      setName('')
      setTickers('')
      setShowCreate(false)
      await load()
      addToast('trade', 'Watchlist created', 'New watchlist saved.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create watchlist'
      addToast('error', 'Create failed', message)
    }
  }

  const handleScan = async (watchlist: WatchlistSaved) => {
    try {
      const result = await scanWatchlist(watchlist.id)
      addToast('signal', `Generated ${result.generated} signals`, `Watchlist: ${watchlist.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to scan watchlist'
      addToast('error', 'Scan failed', message)
    }
  }

  const handleSaveEdit = async (watchlist: WatchlistSaved) => {
    try {
      await updateWatchlist(watchlist.id, { tickers: parseTickers(editTickers) })
      setEditingId(null)
      setEditTickers('')
      await load()
      addToast('info', 'Watchlist updated', watchlist.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update watchlist'
      addToast('error', 'Update failed', message)
    }
  }

  const handleDelete = async (watchlist: WatchlistSaved) => {
    if (!window.confirm(`Delete watchlist "${watchlist.name}"?`)) return
    try {
      await deleteWatchlist(watchlist.id)
      await load()
      addToast('info', 'Watchlist deleted', watchlist.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete watchlist'
      addToast('error', 'Delete failed', message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg">Watchlists</h2>
        <button className="btn-primary" onClick={() => setShowCreate((prev) => !prev)}>
          New Watchlist
        </button>
      </div>

      {showCreate && (
        <div className="card grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-surface-tertiary border border-border rounded px-3 py-2"
            placeholder="Watchlist name"
          />
          <input
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            className="bg-surface-tertiary border border-border rounded px-3 py-2 font-mono"
            placeholder="AAPL, MSFT, NVDA"
          />
          <button className="btn-primary" onClick={handleCreate}>
            Save
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="card space-y-3">
              <div className="skeleton h-6 w-32" />
              <div className="skeleton h-5 w-20 rounded-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          ))}
        </div>
      ) : watchlists.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="⬡"
            title="No watchlists yet"
            subtitle="Create a watchlist to group tickers and scan them for signals in one click."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {watchlists.map((watchlist) => (
            <div key={watchlist.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{watchlist.name}</h3>
                  <span className="pill bg-surface-tertiary text-txt-secondary mt-2">
                    {watchlist.tickers.length} tickers
                  </span>
                </div>
              </div>

              {editingId === watchlist.id ? (
                <div className="mt-4 space-y-3">
                  <input
                    value={editTickers}
                    onChange={(e) => setEditTickers(e.target.value)}
                    className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 font-mono"
                  />
                  <div className="flex gap-2">
                    <button className="btn-primary text-xs px-4 py-2" onClick={() => handleSaveEdit(watchlist)}>
                      Save
                    </button>
                    <button
                      className="px-3 py-2 border border-border rounded text-xs text-txt-secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {watchlist.tickers.map((ticker) => (
                      <span key={ticker} className="pill bg-surface-tertiary text-txt-secondary">
                        {ticker}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <button className="btn-primary text-xs px-4 py-2" onClick={() => handleScan(watchlist)}>
                      Scan All
                    </button>
                    <button
                      className="px-3 py-2 border border-border rounded text-xs text-txt-secondary"
                      onClick={() => {
                        setEditingId(watchlist.id)
                        setEditTickers(watchlist.tickers.join(', '))
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="px-3 py-2 border border-border rounded text-xs text-accent-red"
                      onClick={() => handleDelete(watchlist)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
