

// Sample OHLC data
const ohlcData = [
    { date: '2023-01-01', open: 100, high: 102, low: 99, close: 101 },
    { date: '2023-01-02', open: 101, high: 103, low: 100, close: 102 },
    { date: '2023-01-03', open: 102, high: 104, low: 101, close: 103 },
    { date: '2023-01-04', open: 103, high: 105, low: 102, close: 104 },
    { date: '2023-01-05', open: 104, high: 106, low: 103, close: 105 },
    { date: '2023-01-06', open: 105, high: 107, low: 104, close: 106 },
    { date: '2023-01-07', open: 106, high: 108, low: 105, close: 107 },
    { date: '2023-01-08', open: 107, high: 109, low: 106, close: 108 },
    { date: '2023-01-09', open: 108, high: 110, low: 107, close: 109 },
    { date: '2023-01-10', open: 109, high: 111, low: 108, close: 110 },
    { date: '2023-01-11', open: 110, high: 112, low: 109, close: 111 },
    { date: '2023-01-12', open: 111, high: 113, low: 110, close: 112 },
    { date: '2023-01-13', open: 112, high: 114, low: 111, close: 113 },
    { date: '2023-01-14', open: 113, high: 115, low: 112, close: 114 },
    { date: '2023-01-15', open: 114, high: 116, low: 113, close: 115 },
    { date: '2023-01-16', open: 115, high: 117, low: 114, close: 116 },
    { date: '2023-01-17', open: 116, high: 118, low: 115, close: 117 },
    { date: '2023-01-18', open: 117, high: 119, low: 116, close: 118 },
    { date: '2023-01-19', open: 118, high: 120, low: 117, close: 119 },
    { date: '2023-01-20', open: 119, high: 121, low: 118, close: 120 },
    { date: '2023-01-21', open: 120, high: 122, low: 119, close: 121},
{ date: '2023-01-22', open: 121, high: 123, low: 120, close: 122 },
{ date: '2023-01-23', open: 122, high: 124, low: 121, close: 123 },
  ];
  
  // Calculate the moving average
  function calculateMovingAverage(data, period) {
    const movingAverage = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, curr) => acc + curr.close, 0);
      movingAverage.push({ date: data[i].date, value: sum / period });
    }
    return movingAverage;
  }
  
  // Implement the moving average crossover strategy
  function executeTradeSignals(shortTermMA, longTermMA) {
    let position = 0; // 0 = no position, 1 = long, -1 = short
    let trades = [];
  
    for (let i = 0; i < shortTermMA?.length; i++) {
      if (position === 0) {
        if (shortTermMA[i]?.value > longTermMA[i]?.value) {
          position = 1;
          trades.push({ type: 'buy', date: shortTermMA[i]?.date, price: ohlcData[i + 4]?.close });
        } else if (shortTermMA[i]?.value < longTermMA[i]?.value) {
          position = -1;
          trades.push({ type: 'sell', date: shortTermMA[i]?.date, price: ohlcData[i + 4]?.close });
        }
      } else if (position === 1) {
        if (shortTermMA[i]?.value < longTermMA[i]?.value) {
          position = 0;
          trades.push({ type: 'sell', date: shortTermMA[i]?.date, price: ohlcData[i + 4]?.close });
        }
      } else if (position === -1) {
        if (shortTermMA[i]?.value > longTermMA[i]?.value) {
          position = 0;
          trades.push({ type: 'buy', date: shortTermMA[i]?.date, price: ohlcData[i + 4]?.close });
        }
      }
    }
  
    return trades;
  }

  const test = () => {
    const shortTermMA = calculateMovingAverage(ohlcData, 5);
  const longTermMA = calculateMovingAverage(ohlcData, 20);

  console.log(shortTermMA);
    console.log(longTermMA);

    const trades = executeTradeSignals(shortTermMA, longTermMA);
  console.log(trades);
  
  // Plot the chart using Plotly.js
  const trace1 = {
    x: ohlcData.map(d => d.date),
    open: ohlcData.map(d => d.open),
    high: ohlcData.map(d => d.high),
    low: ohlcData.map(d => d.low),
    close: ohlcData.map(d => d.close),
    type: 'candlestick',
    name: 'OHLC'
  };
  
  const trace2 = {
    x: shortTermMA.map(d => d.date),
    y: shortTermMA.map(d => d.value),
    type: 'scatter',
    name: '5-day MA'
  };
  
  const trace3 = {
    x: longTermMA.map(d => d.date),
    y: longTermMA.map(d => d.value),
    type: 'scatter',
    name: '20-day MA'
  };
  
  const data = [trace1, trace2, trace3];
  
  const layout = {
    title: 'OHLC with Moving Averages',
    xaxis: {
      title: 'Date'
    },
    yaxis: {
      title: 'Price'
    }
  };


  return (
    // <div id="chart">{Plotly.newPlot('chart', data, layout)}</div>
    <div>Test</div>
  );
  }

  export default test;
  
