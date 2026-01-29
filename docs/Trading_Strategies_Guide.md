# ShareTrack Trading Strategies Guide

## Overview

ShareTrack uses **4 distinct trading strategies** to analyze NSE stocks. Each strategy has unique entry/exit criteria and is designed for different market conditions. The backtester runs all strategies with **₹1,00,000 initial capital** per stock.

---

## Strategy 1: Trend-Pullback (Weighted Scoring)

**Style:** Trend-following with pullback entries  
**Best For:** Catching retracements in strong uptrends

### Scoring System (100 points total)

| Phase | Criteria | Points |
|-------|----------|--------|
| **Phase 1: Filter** | Price > 50 EMA | 20 |
| | Volume > 20-day average | 20 |
| **Phase 2: Setup** | Near Lower Bollinger Band (%B < 20%) | 8 |
| | Stochastic %K < 40 | 7 |
| **Phase 3: Trigger** | MACD histogram rising | 10 |
| | MACD bullish crossover | 10 |
| **Volume Validation** | Volume spike > 1.3× average | 15 |
| | Broke 20-day resistance | 10 |

### Buy Signals
- **STRONG BUY:** Score ≥ 80
- **BUY:** Score ≥ 60
- ⚠️ If Phase 1 fails, score is capped at 15 (prevents counter-trend trades)

### Sell Signals
Bearish score calculated from:
- +40 pts: Price below 50 EMA
- +20 pts: MACD bearish crossover
- +15 pts: Stochastic overbought (%K > 80 and %K < %D)
- +15 pts: MACD histogram negative and declining

**STRONG SELL:** Bearish Score ≥ 80  
**SELL:** Bearish Score ≥ 60

---

## Strategy 2: MFI Momentum Trend

**Style:** Trend-following with volume-weighted momentum
**Best For:** Buying pullbacks in uptrends using MFI (volume-weighted RSI)

### Why MFI?
- MFI is a **volume-weighted RSI** - combines price AND volume in one indicator
- More reliable than pure RSI for Indian equities where volume spikes signal institutional activity
- Less extreme thresholds (30-40 vs 10-25) generate more signals
- Follows the proven 3-phase pattern from the successful Trend-Pullback strategy

### Scoring System (100 points max)

| Phase | Condition | Points | Purpose |
|-------|-----------|--------|---------|
| **Phase 1: Trend Filter** | Price > 50 EMA | +25 | Uptrend required |
| | 20 EMA > 50 EMA | +15 | Trend alignment |
| **Phase 2: MFI Setup** | MFI(14) < 40 | +20 | Volume-weighted pullback |
| | MFI rising vs prev day | +10 | Momentum turning |
| **Phase 3: Confirmation** | ADX > 20 | +15 | Trending market (not ranging) |
| | Volume > 1.3x 10-day avg | +15 | Institutional interest |

**Critical Rule:** If Phase 1 fails (price below 50 EMA), cap score at 20 max.

### Buy Signals

| Signal | Condition |
|--------|-----------|
| STRONG BUY | Score >= 80 AND MFI < 30 |
| BUY | Score >= 60 |
| NEUTRAL | Score < 60 |

### Sell/Exit Conditions

| Condition | Signal |
|-----------|--------|
| MFI > 80 | SELL (overbought - take profit) |
| Price < 20 EMA + MFI falling | STRONG SELL (exit) |

### Key Indicators
- **50 EMA:** Trend filter (required)
- **20 EMA:** Intermediate trend + exit level
- **MFI(14):** Volume-weighted momentum (core signal)
- **ADX(14):** Trend strength confirmation
- **Volume:** 1.3x average for confirmation

---

## Strategy 3: Momentum Breakout (Donchian Breakout)

**Style:** Trend-following breakout  
**Best For:** Catching strong momentum moves with trend and volume confirmation

### Buy Conditions

| Condition | Signal | Score |
|-----------|--------|-------|
| Broke above 10-day high | STRONG BUY | +25 |
| Price above 10-day high | BUY | +10 |
| ADX > 25 (Strong Trend) | Bonus | +20 |
| Volume > 1.5x average | Confirmation | +20 |
| Above 20 EMA | Trend Filter | +10 |
| Above 50 EMA | Trend Filter | +20 |
| RSI 50-70 | Momentum Zone | +15 |

### Sell Conditions

| Condition | Signal |
|-----------|--------|
| Price below 10 EMA | SELL (Losing trend) |
| RSI > 80 | SELL (Overbought) |
| Price below 50 EMA | STRONG SELL (Trend Reversal) |

### Key Indicators
- **10-day High:** Entry level (breakout trigger)
- **10 EMA:** Early exit signal
- **50 EMA:** Major trend filter
- **ADX(14):** Trend strength (>25 is strong)
- **RSI(14):** Momentum zone (50-70)

---

## Strategy 4: Opening Range Breakout (Improved)

**Style:** Range breakout  
**Best For:** Capturing volatility expansion after 3-day consolidation

### Buy Conditions

| Condition | Score |
|-----------|-------|
| Broke above 3-day range high | +35 |
| Price above VWAP | +20 |
| Volume spike > 1.5× average | +25 |
| Holding above range + above VWAP | +30 |

**STRONG BUY:** Score ≥ 80
**BUY:** Score ≥ 60

### Sell Conditions

| Condition | Signal |
|-----------|--------|
| Broke below 3-day range low | SELL |
| Price below range | SELL |

### Stop Loss
Stop loss is placed at the **midpoint** of the 3-day range.

### Price Target
```
Target = Range High + (2 × Range Width)
```

---

## Strategy Comparison

| Strategy | Entry Type | Exit Type | Holding Period | Win Rate |
|----------|------------|-----------|----------------|----------|
| Trend-Pullback | Pullback in uptrend | Momentum reversal | Medium (days-weeks) | ~55-65% |
| MFI Momentum | Volume-weighted pullback | MFI overbought/EMA exit | Medium (days-weeks) | ~60%+ |
| Momentum Breakout | Breakout (10-day high) | Trailing stop (10 EMA)/RSI | Medium (days-weeks) | ~45-55% |
| Opening Range | Range breakout (3-day) | Range breakdown | Short-Medium | ~50-60% |

---

## Backtest Methodology

1. **Initial Capital:** ₹1,00,000 per stock
2. **Start Point:** Day 51 (requires 50 days for indicator calculation)
3. **Position Sizing:** All-in (buy max affordable shares)
4. **Entry:** Execute on BUY/STRONG BUY signal when not in position
5. **Exit:** Execute on SELL/STRONG SELL signal when holding position
6. **End of Period:** Close any open positions at last price

### Metrics Tracked
- Total P&L (₹)
- Percentage Return
- Win Rate (%)
- False Positives (losing trades after buy signal)
- False Negatives (missed >2% gains)
- Maximum Drawdown

---

## Benchmark

All strategies are compared against **Buy & Hold**:
```
Buy & Hold Return = (Last Price - First Price) / First Price × 100
```

---

## Key Technical Indicators Used

| Indicator | Period | Usage |
|-----------|--------|-------|
| EMA | 20, 50 | Trend filter (Trend-Pullback, MFI Momentum) |
| MFI | 14 | Volume-weighted momentum (MFI Momentum) |
| ADX | 14 | Trend strength (MFI Momentum, Momentum Breakout) |
| MACD | 12, 26, 9 | Momentum trigger (Trend-Pullback) |
| Bollinger Bands | 20, 2σ | Pullback detection |
| Stochastic | 14, 3 | Overbought/Oversold |
| ATR | 14 | Volatility/Stop loss |
| Donchian Channel | 20/10 | Breakout levels (Turtle) |
| VWAP | 10-day | Fair value (Opening Range) |

---

*Generated by ShareTrack Backtest Engine*  
*Document Date: January 2026*
