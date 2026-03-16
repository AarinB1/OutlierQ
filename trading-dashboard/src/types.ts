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
  version: string
  trained_at: string | null
  val_accuracy: number | null
  val_sharpe: number | null
  feature_names: string[] | null
  hyperparameters: Record<string, unknown> | null
  model_path: string | null
}

export interface RegimeStatus {
  timestamp?: string | null
  regime: string
  vix_level?: number | null
  vix_percentile?: number | null
  breadth_score?: number | null
  confidence: number
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

