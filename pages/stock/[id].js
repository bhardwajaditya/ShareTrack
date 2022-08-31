import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

import { STOCK_DATA, GET_QUOTE_URL, SMA_DATA_44 } from '../../public/constant';
import { processData, checkRisingGraph } from '../../utils/dataPreprocessing';

const stock = ({ data }) => {
    const router = useRouter();
    const { id } = router.query;
    const sma = require('technicalindicators').sma;
    const bullish = require('technicalindicators').bullish;

    const [stockData, setStockData] = useState([]);
    const [isBullish, setIsBullish] = useState(false);
    const [isFirstSmaRising, setIsFirstSmaRising] = useState(false);
    const [isSecondSmaRising, setIsSecondSmaRising] = useState(false);

    useEffect(() => {
        if (id === undefined) {
            return;
        }
        fetch(STOCK_DATA + id + '.BSE')
            .then(data => {
                // console.log(data);
                return data.json()
            })
            .then(data => setStockData(data['Time Series (Daily)'] || []))
            .catch(error => {
                console.error(error);
                router.push('/nse');
            });
    }, id);

    useEffect(() => {
        if (stockData.length == 0) {
            return;
        }
        const data = processData(stockData);
        console.log(data);
        const result_sma_first = sma({
            period: 44,
            values: data.close
        });

        const result_sma_second = sma({
            period: 90,
            values: data.close
        });
        console.log(result_sma_first);
        console.log(result_sma_second);
        setIsFirstSmaRising(checkRisingGraph(result_sma_first));
        setIsSecondSmaRising(checkRisingGraph(result_sma_second));
        // console.log(result);
        setIsBullish(bullish(data));
    }, stockData.length);

    return (
        <div>
            <h1>{ id } is bullish: { String(isBullish) }</h1>
            <h3>{ id } 44 SMA is rising: { String(isFirstSmaRising) }</h3>
            <h3>{ id } 90 SMA is rising: { String(isSecondSmaRising) }</h3>
        </div>
    );
  };
  
  export default stock;
  