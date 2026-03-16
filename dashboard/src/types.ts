export interface EventData {
  id: string;
  ticker: string;
  event_type: string;
  direction: string;
  confidence: number;
  detected_at: string | null;
  article_ids: string[] | null;
  metadata: EventMetadata | null;
}

export interface TechnicalContext {
  rsi: number;
  rsi_signal: 'overbought' | 'oversold' | 'neutral';
  bollinger_pct_b: number;
  bollinger_signal: string;
  atr_pct: number;
  macd_signal: string;
  relative_volume: number;
  adjustments_applied: string[];
}

export interface EventMetadata {
  options_flow?: {
    direction?: string;
    unusual_contract_count?: number;
    max_conviction?: number;
    dominant_expiry?: string;
    dominant_strike?: number;
    top_contracts?: OptionsFlowContract[];
    put_call_ratio?: number;
  };
  edgar_data?: EdgarResult;
  technical_context?: TechnicalContext;
  technical_notes?: string[];
  [key: string]: unknown;
}

export interface Signal {
  id: string;
  ticker: string;
  direction: string;
  suggested_strike: number | null;
  suggested_expiry: string | null;
  confidence: number;
  outcome: string | null;
  outcome_pnl: number | null;
  created_at: string | null;
  event_id: string;
  event?: EventData;
  exploratory?: boolean;
  discovery_source?: string | null;
}

export interface AccuracyStats {
  total_evaluated: number;
  total_pending: number;
  wins: number;
  losses: number;
  expired_flat: number;
  win_rate: number;
  avg_pnl: number;
  by_event_type: Record<string, {
    count: number;
    wins: number;
    win_rate: number;
    avg_pnl: number;
  }>;
  by_direction: Record<string, {
    count: number;
    wins: number;
    win_rate: number;
  }>;
  recent_signals: {
    id: string;
    ticker: string;
    direction: string;
    strike: number | null;
    expiry: string | null;
    confidence: number;
    outcome: string | null;
    pnl: number | null;
    created_at: string | null;
  }[];
}

export interface ConfusionMatrix {
  true_bullish: number;
  false_bullish: number;
  true_bearish: number;
  false_bearish: number;
  precision_bullish: number;
  precision_bearish: number;
  overall_accuracy: number;
}

export interface TickerSummary {
  ticker: string;
  total_signals: number;
  win_rate: number;
  last_signal_date: string | null;
}

export interface HealthStatus {
  status: string;
  signals_count: number;
  events_count: number;
  last_scan: string | null;
}

export interface AutopilotStatus {
  is_autopilot_running: boolean;
  tickers_monitored: number;
  signals_today: number;
  discoveries_today: number;
  last_scan: string | null;
  next_scan: string | null;
}

export interface ActiveTickers {
  tickers: string[];
  by_source: {
    manual: string[];
    news_scanner: string[];
    volume_screener: string[];
    both: string[];
  };
  count: number;
}

export interface ScanResult {
  signals_generated: number;
  signals: {
    ticker: string;
    direction: string;
    strike: number | null;
    expiry: string | null;
    confidence: number;
  }[];
}

export interface EvaluateResult {
  evaluated: number;
  results: {
    signal_id: string;
    ticker: string;
    direction: string;
    outcome: string;
    estimated_pnl: number;
  }[];
}

export interface DiscoveryRecord {
  id: string;
  ticker: string;
  discovery_method: string;
  discovery_confidence: number;
  mention_count: number | null;
  volume_ratio: number | null;
  sample_headlines: string[];
  discovered_at: string | null;
  scanned: boolean;
  signal_generated: boolean;
}

export interface DiscoveryStats {
  total_discovered: number;
  total_led_to_signals: number;
  discovered_today: number;
  led_to_signals_today: number;
  by_method: Record<string, number>;
}

export interface DiscoverTriggerResult {
  discovered: number;
  tickers: {
    ticker: string;
    discovery_methods: string[];
    discovery_confidence: number;
    mention_count: number | null;
    volume_ratio: number | null;
    sample_headlines: string[];
  }[];
}

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CompanyInfo {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  current_price: number | null;
  previous_close: number | null;
  day_high: number | null;
  day_low: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  avg_volume: number | null;
  beta: number | null;
  change: number | null;
  change_percent: number | null;
}

export interface KeyStats {
  weekly_return: number | null;
  monthly_return: number | null;
  ytd_return: number | null;
  volatility_30d: number | null;
}

export interface SignalOverlay {
  id: string;
  date: string | null;
  direction: string;
  strike: number | null;
  expiry: string | null;
  confidence: number;
  outcome: string | null;
  pnl: number | null;
}

export interface EventOverlay {
  id: string;
  date: string | null;
  event_type: string;
  direction: string;
  confidence: number;
}

export interface ChartData {
  prices: PricePoint[];
  signals: SignalOverlay[];
  events: EventOverlay[];
  indicators?: TechnicalIndicators | null;
}

export interface TickerFullSummary {
  info: CompanyInfo;
  stats: KeyStats;
  signals: SignalOverlay[];
  events: EventOverlay[];
}

export interface OptionsFlowContract {
  contract_symbol: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  volume: number;
  open_interest: number;
  volume_oi_ratio: number;
  implied_volatility: number;
  otm_pct: number;
  days_to_expiry: number;
  conviction_score: number;
  flags: string[];
}

export interface OptionsFlowResult {
  ticker: string;
  unusual_activity: boolean;
  direction?: 'bullish' | 'bearish' | 'neutral';
  bullish_weight?: number;
  bearish_weight?: number;
  total_unusual_call_volume?: number;
  total_unusual_put_volume?: number;
  max_conviction?: number;
  dominant_expiry?: string;
  dominant_strike?: number;
  unusual_contract_count?: number;
  top_contracts?: OptionsFlowContract[];
  unusual_contracts?: OptionsFlowContract[];
  put_call_ratio?: number;
}

export interface TechnicalIndicators {
  ticker: string;
  current_price: number;
  rsi_14: number;
  rsi_signal: 'overbought' | 'oversold' | 'neutral';
  bollinger_pct_b: number;
  bollinger_bandwidth: number;
  bollinger_signal: string;
  atr_14: number;
  atr_pct: number;
  macd_signal: string;
  macd_histogram: number;
  relative_volume: number;
  trend_20d: number | null;
  trend_50d: number | null;
}

export interface EdgarFiling {
  filing_date: string;
  form_type: string;
  description: string;
  url: string;
  items: string[];
}

export interface Edgar8kAnalysis {
  total_filings: number;
  recent_8k_count: number;
  highly_bearish_count: number;
  moderately_bearish_count: number;
  potentially_bullish_count: number;
  most_significant_item: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  severity: number;
  filings: EdgarFiling[];
}

export interface EdgarInsiderAnalysis {
  total_form4s: number;
  days_covered: number;
  filings_per_day: number;
  is_unusual: boolean;
  activity_level: 'high' | 'moderate' | 'normal';
}

export interface EdgarResult {
  ticker: string;
  significant_findings?: boolean;
  combined_direction: 'bullish' | 'bearish' | 'neutral';
  combined_severity: number;
  has_significant_filing: boolean;
  has_unusual_insider_activity: boolean;
  summary: string;
  "8k_analysis": Edgar8kAnalysis;
  insider_analysis: EdgarInsiderAnalysis;
}

export interface MlReadiness {
  total_signals: number;
  signals_with_outcomes: number;
  profit_count: number;
  loss_count: number;
  expired_count: number;
  ready_to_train: boolean;
  message: string;
}

export interface MlTrainingMetrics {
  model_type?: string;
  n_samples?: number;
  n_features?: number;
  train_size?: number;
  test_size?: number;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  confusion_matrix?: number[][];
  feature_importances_top10?: [string, number][];
}

export interface MlComparisonRow {
  ticker: string;
  keyword_prediction: string;
  ml_prediction: string;
  actual_outcome: string;
}

export interface MlComparison {
  n_evaluated: number;
  model_accuracy: number;
  keyword_accuracy: number;
  comparison: MlComparisonRow[];
}

export interface MlStatus {
  is_trained: boolean;
  training_metrics: MlTrainingMetrics;
  feature_importances: [string, number][];
  training_data_size: number;
  readiness_check: MlReadiness;
  recent_comparison: MlComparison;
}

// ── Trading Types ────────────────────────────────────────────────

export interface TradingSignal {
  id: string
  ticker: string
  direction: 'BUY' | 'SELL' | 'SHORT'
  strategy_name: string
  model_name?: string
  entry_price: number
  target_price: number
  stop_loss: number
  confidence: number
  timeframe: 'intraday' | 'swing'
  created_at: string
  status: 'pending' | 'active' | 'closed'
  pnl?: number
}

export interface BacktestResult {
  id: string
  strategy_name: string
  model_name?: string
  start_date: string
  end_date: string
  initial_capital: number
  final_capital: number
  sharpe_ratio: number
  sortino_ratio: number
  max_drawdown: number
  win_rate: number
  total_trades: number
  profit_factor: number
  equity_curve?: { date: string; value: number }[]
  trades?: TradeExecution[]
}

export interface TradeExecution {
  id: string
  signal_id: string
  ticker: string
  direction: string
  entry_time: string
  exit_time?: string
  entry_price: number
  exit_price?: number
  quantity: number
  pnl_dollars?: number
  pnl_percent?: number
  exit_reason?: string
}

export interface PortfolioState {
  cash: number
  total_value: number
  positions: PortfolioPosition[]
  daily_pnl: number
  cumulative_pnl: number
  max_drawdown: number
  timestamp?: string
}

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

export interface ModelStatus {
  model_name: string
  model_type: string
  is_trained: boolean
  val_accuracy?: number
  val_sharpe?: number
  trained_at?: string
  feature_count?: number
}

export interface MarketRegime {
  regime: 'bull_trend' | 'bear_trend' | 'sideways' | 'high_vol' | 'low_vol'
  vix_level: number
  vix_percentile: number
  breadth_score: number
  confidence: number
}

export interface RegimeHistoryPoint {
  timestamp: string
  regime: MarketRegime['regime']
  confidence: number
  vix_level: number | null
  vix_percentile: number | null
}

export interface RiskSummary {
  total_gross_exposure: number
  max_single_name_exposure_pct: number
  realized_pnl: number
  sector_exposure: Record<string, number>
  ticker_exposure: Record<string, number>
}

export interface RiskLimitsConfig {
  max_gross_exposure: number
  max_single_name_pct: number
  max_sector_pct: number
  max_drawdown_pct: number
  max_leverage: number
}

export interface ModelCheckpointEnhanced {
  id: string
  model_name: string
  model_type: string
  version: number
  val_accuracy: number | null
  val_sharpe: number | null
  trained_at: string | null
  hyperparameters: Record<string, unknown> | null
  feature_names: string[] | null
  model_path: string | null
  is_trained: boolean
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

// ── Trading Backtest Types ───────────────────────────────────────────

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
