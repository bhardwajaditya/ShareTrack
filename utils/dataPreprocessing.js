export const processData = (stockData) => {
    const result = {
        open: [],
        high: [],
        low: [],
        close: []
    }
    for(var key in stockData) {
        if (stockData.hasOwnProperty(key)) {
            const val = stockData[key];
            result.open.push(parseFloat(val['1. open']));
            result.high.push(parseFloat(val['2. high']));
            result.low.push(parseFloat(val['3. low']));
            result.close.push(parseFloat(val['4. close']));
        }
    }
    return result;
}

export const checkRisingGraph = (smaData) => {
    for (let i = 1; i< 10; i++) {
        if (smaData[i] > smaData[i-1]) {
            return false;
        }
    }
    return true;
}
