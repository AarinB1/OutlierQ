export interface EventData {
  id: string;
  ticker: string;
  event_type: string;
  direction: string;
  confidence: number;
  detected_at: string | null;
  article_ids: string[] | null;
  metadata: Record<string, unknown> | null;
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
