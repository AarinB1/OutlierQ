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
  positions_json: Array<Record<string, unknown>>
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

