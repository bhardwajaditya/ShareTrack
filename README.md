# Share Track

An application to track stocks using technical analysis.

## Features

- **Portfolio Tracking**: Manually enter and track your stock portfolio with current prices and overall performance
- **Strategy Backtesting**: Backtest trading strategies on one year of historical index data to evaluate their effectiveness
- **Portfolio Analysis**: Run detailed analysis reports on your portfolio using technical indicators
- **Index Analysis**: Analyze stocks within major indexes and get buy/sell signals based on multiple trading strategies

## Requirements

- **Node.js**: v22.16.0
- **Package Manager**: Yarn

## Environment Setup

1. Copy the example environment file to create your local configuration:
   ```bash
   cp .env.example .env.local
   ```

2. Update `.env.local` with your MongoDB connection details as needed.

## Steps to run dev server

1. Install dependencies:
   ```bash
   yarn install
   ```

2. Start the development server:
   ```bash
   yarn dev
   ```
