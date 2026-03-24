#!/usr/bin/env python3
"""Validate prediction market fetchers against live API responses.

Usage:
    python scripts/validate_fetchers.py
    python scripts/validate_fetchers.py --verbose
    python scripts/validate_fetchers.py --polymarket-only
    python scripts/validate_fetchers.py --kalshi-only
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def validate_polymarket(verbose: bool = False) -> bool:
    """Validate PolymarketFetcher against live Gamma API."""
    from src.predictions.polymarket_fetcher import PolymarketFetcher

    print("\n" + "=" * 60)
    print("  POLYMARKET GAMMA API VALIDATION")
    print("=" * 60)

    fetcher = PolymarketFetcher()
    markets = fetcher.fetch_active_markets(limit=10, min_volume=1000)

    if not markets:
        print("  FAILED: No markets returned")
        return False

    print(f"  Fetched {len(markets)} markets")

    errors = []
    for i, m in enumerate(markets[:5]):
        # Validate required fields
        for field in ["platform", "market_id", "question", "yes_price", "no_price", "volume"]:
            if field not in m:
                errors.append(f"  Market {i}: missing field '{field}'")
            elif m[field] is None or m[field] == "":
                if field not in ("category", "slug"):  # these can be empty
                    errors.append(f"  Market {i}: empty field '{field}'")

        # Validate price range
        if not (0.01 <= m["yes_price"] <= 0.99):
            errors.append(f"  Market {i}: yes_price={m['yes_price']} out of range")
        if not (0.01 <= m["no_price"] <= 0.99):
            errors.append(f"  Market {i}: no_price={m['no_price']} out of range")

        # Validate volume is positive
        if m["volume"] <= 0:
            errors.append(f"  Market {i}: volume={m['volume']} not positive")

        # Validate platform
        if m["platform"] != "polymarket":
            errors.append(f"  Market {i}: platform='{m['platform']}' expected 'polymarket'")

        if verbose:
            print(f"\n  [{i}] {m['question'][:60]}")
            print(f"      YES={m['yes_price']:.2f}  NO={m['no_price']:.2f}  Vol={m['volume']:,.0f}")
            print(f"      ID={m['market_id'][:20]}...  Cat={m.get('category', 'N/A')}")

    if errors:
        print(f"\n  {len(errors)} validation errors:")
        for e in errors:
            print(f"    {e}")
        return False

    print(f"  All {min(len(markets), 5)} markets validated successfully")
    return True


def validate_kalshi(verbose: bool = False) -> bool:
    """Validate KalshiFetcher against live Kalshi API."""
    from src.predictions.kalshi_fetcher import KalshiFetcher

    print("\n" + "=" * 60)
    print("  KALSHI API VALIDATION")
    print("=" * 60)

    fetcher = KalshiFetcher()
    markets = fetcher.fetch_active_markets(limit=10, min_volume=100)

    if not markets:
        print("  FAILED: No markets returned (API may require auth or be rate-limited)")
        return False

    print(f"  Fetched {len(markets)} markets")

    errors = []
    for i, m in enumerate(markets[:5]):
        for field in ["platform", "market_id", "question", "yes_price", "no_price", "volume"]:
            if field not in m:
                errors.append(f"  Market {i}: missing field '{field}'")
            elif m[field] is None or m[field] == "":
                if field not in ("category", "slug"):
                    errors.append(f"  Market {i}: empty field '{field}'")

        if not (0.01 <= m["yes_price"] <= 0.99):
            errors.append(f"  Market {i}: yes_price={m['yes_price']} out of range")

        if m["volume"] <= 0:
            errors.append(f"  Market {i}: volume={m['volume']} not positive")

        if m["platform"] != "kalshi":
            errors.append(f"  Market {i}: platform='{m['platform']}' expected 'kalshi'")

        if verbose:
            print(f"\n  [{i}] {m['question'][:60]}")
            print(f"      YES={m['yes_price']:.2f}  NO={m['no_price']:.2f}  Vol={m['volume']:,.0f}")
            print(f"      Ticker={m['market_id']}  Cat={m.get('category', 'N/A')}")

    if errors:
        print(f"\n  {len(errors)} validation errors:")
        for e in errors:
            print(f"    {e}")
        return False

    print(f"  All {min(len(markets), 5)} markets validated successfully")
    return True


def validate_raw_responses(verbose: bool = False) -> None:
    """Fetch raw API responses and print field names for debugging."""
    import requests

    print("\n" + "=" * 60)
    print("  RAW API RESPONSE INSPECTION")
    print("=" * 60)

    # Polymarket
    print("\n  --- Polymarket Gamma API ---")
    try:
        resp = requests.get(
            "https://gamma-api.polymarket.com/markets",
            params={"limit": 2, "active": True, "closed": False},
            headers={"User-Agent": "OutlierQ/1.0"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if data and len(data) > 0:
            first = data[0]
            print(f"  Fields ({len(first)} total): {sorted(first.keys())[:20]}...")
            print(f"  outcomePrices type: {type(first.get('outcomePrices')).__name__} = {repr(first.get('outcomePrices'))[:80]}")
            print(f"  volume type: {type(first.get('volume')).__name__} = {repr(first.get('volume'))}")
            print(f"  volumeNum type: {type(first.get('volumeNum')).__name__} = {repr(first.get('volumeNum'))}")
            if verbose:
                print(f"\n  Full first market:\n  {json.dumps(first, indent=2, default=str)[:2000]}")
    except Exception as e:
        print(f"  Polymarket request failed: {e}")

    # Kalshi
    print("\n  --- Kalshi API v2 ---")
    try:
        resp = requests.get(
            "https://api.elections.kalshi.com/trade-api/v2/markets",
            params={"limit": 2, "status": "open"},
            headers={"User-Agent": "OutlierQ/1.0"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        raw_markets = data.get("markets", [])
        if raw_markets:
            first = raw_markets[0]
            print(f"  Fields ({len(first)} total): {sorted(first.keys())[:20]}...")
            print(f"  yes_bid_dollars type: {type(first.get('yes_bid_dollars')).__name__} = {repr(first.get('yes_bid_dollars'))}")
            print(f"  volume_fp type: {type(first.get('volume_fp')).__name__} = {repr(first.get('volume_fp'))}")
            print(f"  title: {repr(first.get('title'))[:80]}")
            if verbose:
                print(f"\n  Full first market:\n  {json.dumps(first, indent=2, default=str)[:2000]}")
    except Exception as e:
        print(f"  Kalshi request failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="Validate prediction market fetchers")
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--polymarket-only", action="store_true")
    parser.add_argument("--kalshi-only", action="store_true")
    parser.add_argument("--raw", action="store_true", help="Inspect raw API responses")
    args = parser.parse_args()

    if args.raw:
        validate_raw_responses(args.verbose)
        return

    results = {}
    if not args.kalshi_only:
        results["polymarket"] = validate_polymarket(args.verbose)
    if not args.polymarket_only:
        results["kalshi"] = validate_kalshi(args.verbose)

    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    all_pass = True
    for platform, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  {platform}: {status}")
        if not passed:
            all_pass = False

    if all_pass:
        print("\n  All validations passed!\n")
    else:
        print("\n  Some validations failed. Check errors above.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
