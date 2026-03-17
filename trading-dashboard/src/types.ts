export interface TradingSignal {
  id: string
  ticker: string
  direction: 'BUY' | 'SELL' | 'SHORT' | string
  strategy_name: string
  model_name: string | null
  entry_price: number | null
  target_price: number | null
  stop_loss: number | null
  confidence: number
  timeframe: string
  status: string
  pnl: number | null
  created_at: string | null
}

export interface BacktestRun {
  id: string
  strategy_name: string
  start_date: string | null
  end_date: string | null
  initial_capital: number
  final_capital: number
  sharpe: number | null
  sortino: number | null
  max_drawdown: number | null
  win_rate: number | null
  total_trades: number | null
  profit_factor: number | null
  config_json: Record<string, unknown> | null
}

export interface TradingMetrics {
  sharpe: number | null
  sortino: number | null
  max_drawdown: number | null
  win_rate: number | null
  profit_factor: number | null
  total_trades: number
}

export interface PortfolioSnapshot {
  timestamp?: string | null
  cash: number
  total_value: number
  positions_json: PortfolioPosition[]
  daily_pnl: number | null
  cumulative_pnl: number | null
  max_drawdown: number | null
}

export interface ModelCheckpoint {
  id: string
  model_name: string
  model_type: string
  version: number
  trained_at: string | null
  val_accuracy: number | null
  val_sharpe: number | null
  feature_names: string[] | null
  hyperparameters: Record<string, unknown> | null
  model_path: string | null
  is_trained?: boolean | null
}

export interface RegimeStatus {
  timestamp?: string | null
  regime: string
  vix_level?: number | null
  vix_percentile?: number | null
  breadth_score?: number | null
  confidence: number
}

export interface RegimeHistoryPoint {
  timestamp: string
  regime: string
  confidence: number
  vix_level: number | null
  vix_percentile: number | null
}

export interface PositionConcentration {
  ticker: string
  direction: string
  value: number
  weight_pct: number
}

export interface RiskSummary {
  total_value: number
  cash: number
  cash_pct: number
  daily_pnl: number
  cumulative_pnl: number
  max_drawdown_pct: number
  exposure_pct: number
  position_count: number
  active_signals: number
  pending_signals: number
  win_rate: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  concentration: PositionConcentration[]
  sector_exposure: Record<string, number>
  risk_limits: {
    max_positions: number
    current_positions: number
    max_drawdown_limit_pct: number
    current_drawdown_pct: number
    daily_loss_limit_pct: number
    current_daily_loss_pct: number
    max_sector_positions: number
  }
}

export interface RiskLimitsConfig {
  max_positions: number
  max_same_sector: number
  max_drawdown_pct: number
  min_reward_risk_ratio: number
  daily_loss_limit_pct: number
  no_entry_minutes_before_close: number
}

export interface ModelVersionHistoryEntry {
  id: string
  version: number
  val_accuracy: number | null
  val_sharpe: number | null
  trained_at: string | null
  hyperparameters: Record<string, unknown> | null
}

export interface ModelTrainResult {
  status: 'completed' | 'failed'
  model_type: string
  result?: unknown
  error?: string
}

// ── Backtest Types ───────────────────────────────────────────────────

export interface BacktestFullResult {
  id: string
  metrics: {
    sharpe_ratio: number
    sortino_ratio: number
    calmar_ratio: number
    alpha_vs_spy: number
    beta: number
    max_drawdown_pct: number
    max_drawdown_duration_days: number
    win_rate: number
    profit_factor: number
    expectancy: number
    avg_trade_pnl: number
    best_trade_pnl: number
    worst_trade_pnl: number
    total_trades: number
    total_return_pct: number
    cagr: number
    avg_holding_period_days: number
    total_pnl: number
  }
  equity_curve: { dates: string[]; values: number[] }
  drawdown_curve: { dates: string[]; values: number[] }
  monthly_returns: { month: string; return_pct: number }[]
  trades: BacktestTrade[]
  config: Record<string, unknown>
  benchmark_curve?: { dates: string[]; values: number[]; ticker: string }
  benchmark_return_pct?: number
}

export interface BacktestTrade {
  trade_id: string
  ticker: string
  direction: string
  entry_price: number
  exit_price: number
  entry_time: string
  exit_time: string
  quantity: number
  pnl_dollars: number
  pnl_pct: number
  exit_reason: string
  holding_days: number
}

export interface BacktestSummary {
  id: string
  strategy_name: string
  ticker: string
  total_return_pct: number
  sharpe: number
  total_trades: number
  created_at: string
}

// ── Portfolio Types ──────────────────────────────────────────────────

export interface PortfolioHistoryPoint {
  timestamp: string
  cash: number
  total_value: number
  daily_pnl: number
  cumulative_pnl: number
  max_drawdown: number
}

export interface PortfolioPosition {
  ticker: string
  direction: string
  entry_price: number
  quantity: number
  current_price: number
  unrealized_pnl: number
  strategy?: string
}

export interface ClosedTrade {
  id: string
  signal_id: string | null
  ticker: string
  direction: string
  entry_time: string | null
  exit_time: string | null
  entry_price: number
  exit_price: number
  quantity: number
  pnl_dollars: number
  pnl_percent: number
  fees: number
  slippage: number
  exit_reason: string
  strategy_name: string
}

// ── Sprint 4: Strategy & Chart Types ────────────────────────────

export interface StrategyDefaults {
  momentum: Record<string, number>
  mean_reversion: Record<string, number>
  breakout: Record<string, number>
}

export interface StrategyConfigSaved {
  id: string
  name: string
  strategy_name: string
  regime: string | null
  params: Record<string, number> | null
  toggles: Record<string, boolean> | null
  created_at: string | null
}

export interface ChartOHLCV {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ChartMarker {
  time: number
  position: 'aboveBar' | 'belowBar'
  color: string
  shape: 'arrowUp' | 'arrowDown'
  text: string
  id: string
  direction: string
  confidence: number
  entry_price: number | null
  target_price: number | null
  stop_loss: number | null
}

export interface TradingChartData {
  ticker: string
  ohlcv: ChartOHLCV[]
  markers: ChartMarker[]
}

// ── Sprint 5: Watchlist & Journal Types ─────────────────────────

export interface WatchlistItem {
  id: string
  name: string
  tickers: string[]
  created_at: string | null
}

export interface JournalEntry {
  id: string
  execution_id: string | null
  ticker: string
  direction: string | null
  entry_price: number | null
  exit_price: number | null
  pnl_dollars: number | null
  setup_notes: string | null
  review_notes: string | null
  tags: string[]
  rating: number | null
  created_at: string | null
}

export interface JournalStats {
  total_entries: number
  avg_rating: number
  total_pnl: number
  tag_counts: Record<string, number>
}

// ── Sprint 6: Settings & Performance Types ──────────────────────

export interface UserSettingsData {
  notifications_enabled: boolean
  notify_on_signal: boolean
  notify_on_backtest_complete: boolean
  notify_on_drawdown_breach: boolean
  min_signal_confidence: number
  drawdown_alert_threshold: number
  email: string | null
  watched_tickers_only: boolean
}

export interface PerformanceAttribution {
  by_strategy: Record<string, {
    total: number
    wins: number
    losses: number
    total_pnl: number
    win_rate: number
    avg_pnl: number
  }>
  by_direction: Record<string, {
    total: number
    wins: number
    total_pnl: number
    win_rate: number
  }>
  by_exit_reason: Record<string, {
    total: number
    total_pnl: number
  }>
  rolling_accuracy: {
    trade_index: number
    accuracy: number
    timestamp: string | null
  }[]
  total_executions: number
}

