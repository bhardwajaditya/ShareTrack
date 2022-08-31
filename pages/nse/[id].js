import { useState, useEffect } from 'react';
import { useRouter } from 'next/router'

import slugs from '../../utils/constants';
import { INDEX_STOCKS_URL, STOCK_DATA } from '../../public/constant';
import { processData, checkRisingGraph } from '../../utils/dataPreprocessing';

export default function nseShare() {
    const router = useRouter();
    const { id } = router.query;
    const [stocks, setStocks] = useState([]);
    const [bullishStocks, setBullishStocks] = useState([]);
    const [smaRising, setSmaRising] = useState([]);

    const indexStockURL = INDEX_STOCKS_URL + encodeURIComponent(slugs[id] + 'StockWatch.json');
    const bullish = require('technicalindicators').bullish;
    const sma = require('technicalindicators').sma;
    // console.log(indexStockURL);

    useEffect(() => {
        if (id === undefined) {
            return;
        }
        fetch(indexStockURL)
            .then(data => data.json())
            .then(indexStocks => setStocks(indexStocks.data))
            .catch(error => {
                console.error(error);
                router.push('/nse');
            });
    }, id);

    const searchBullishStocks = () => {
      stocks.forEach((stock, index) => {
        setTimeout(async () => {
          const data = await fetch(STOCK_DATA + stock.symbol + '.BSE')
            .then(data => {
                return data.json()
            })
            .then(data => data['Time Series (Daily)'] || []);
          const processedData = processData(data);
          const isBullish = await bullish(processedData);

          const result_sma_first = sma({
              period: 44,
              values: processedData.close
          });

          const result_sma_second = sma({
              period: 90,
              values: processedData.close
          });

          console.log(`${ stock.symbol } is ${ String(isBullish) }`)
          if (isBullish) {
            setBullishStocks((currentData) => [...currentData, stock.symbol]);
          }

          const isFirstSmaRising = checkRisingGraph(result_sma_first);
          const isSecondSmaRising = checkRisingGraph(result_sma_second);

          console.log(result_sma_second);
          const first_sma_value = result_sma_first[0];
          const second_sma_value = result_sma_second[0];
          const close_price = processedData.close[0];

          if (isFirstSmaRising && isSecondSmaRising) {
            const dataToPush = {
              symbol: stock.symbol,
              firstSma: first_sma_value,
              secondSma: second_sma_value,
              lastClosePrice: close_price
            }
            console.log(dataToPush);
            setSmaRising((currentData) => [...currentData, dataToPush]);
          }
        }, 12000 * index)
      });
    }

    return (
        <div>
          <h1>Bullish Stocks</h1>
          <ol>
            { bullishStocks.map((stock) => {
              return (<li key={stock}>{stock}</li>);
            })}
          </ol>
          <h1>Sma Rising Stocks</h1>
          <ol>
            { smaRising.map((stock) => {
              return (<li key={stock.symbol}>{stock.symbol} - {stock.firstSma} - {stock.secondSma} - {stock.lastClosePrice}</li>);
            })}
          </ol>
          <h1>Available Stocks under Index: { id }</h1>
          <button onClick = {() => searchBullishStocks()}>Scan for bullish stocks</button>
          <ol>
          { stocks.map((stock) => {
            const url = '/stock/' + stock.symbol;
            return (<a href={url} key={stock.symbol}><li>{stock.symbol}</li></a>);
          }) }
          </ol>
        </div>
      );
};
