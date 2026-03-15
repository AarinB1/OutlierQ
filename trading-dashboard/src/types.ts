export interface TradingSignal {
  id: string
  ticker: string
  direction: 'BUY' | 'SELL' | 'SHORT'
  strategy_name: string
  model_name: string | null
  entry_price: number | null
  target_price: number | null
  stop_loss: number | null
  confidence: number
  timeframe: string | null
  status: string
  pnl: number | null
  created_at: string | null
  metadata: Record<string, unknown> | null
}

export interface BacktestResult {
  id: string
  metrics: BacktestMetrics
  equity_curve: { dates: string[]; values: number[] }
  trades: TradeRecord[]
  config: Record<string, unknown>
}

export interface BacktestMetrics {
  sharpe_ratio: number
  sortino_ratio: number
  calmar_ratio: number
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
  alpha_vs_spy: number
  beta: number
  avg_holding_period_days: number
  total_pnl: number
}

export interface TradeRecord {
  trade_id: string
  ticker: string
  direction: string
  entry_time: string
  exit_time: string
  entry_price: number
  exit_price: number
  quantity: number
  pnl_dollars: number
  pnl_pct: number
  fees: number
  exit_reason: string
  strategy_name: string
}

export interface BacktestSummary {
  id: string
  strategy_name: string
  ticker: string | null
  sharpe: number | null
  total_return_pct: number | null
  max_drawdown: number | null
  win_rate: number | null
  total_trades: number | null
  created_at: string | null
}

export interface ModelInfo {
  id: string
  model_name: string
  model_type: string
  version: number
  val_accuracy: number | null
  val_sharpe: number | null
  trained_at: string | null
  hyperparameters: Record<string, unknown> | null
}

export interface PortfolioData {
  cash: number
  total_value: number
  positions: PortfolioPosition[]
  daily_pnl: number
  cumulative_pnl: number
  max_drawdown: number
  timestamp?: string
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

export interface RegimeData {
  regime: string
  confidence: number
  vix_level: number | null
  vix_percentile?: number | null
  timestamp?: string
}

export interface TradingMetrics {
  total_signals: number
  active_signals: number
  closed_signals: number
  total_executions: number
  total_pnl: number
  win_rate: number
}

export type Page =
  | 'signals'
  | 'backtest'
  | 'models'
  | 'portfolio'
  | 'risk'
  | 'strategy'
  | 'chart'
