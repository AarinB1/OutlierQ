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
