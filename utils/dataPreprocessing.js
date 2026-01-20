export const processData = (stockData) => {
    const result = {
        open: [],
        high: [],
        low: [],
        close: []
    }
    console.log(stockData);
    for(var key in stockData) {
        if (stockData.hasOwnProperty(key)) {
            const val = stockData[key];
            result.open.push(parseFloat(val['open']));
            result.high.push(parseFloat(val['high']));
            result.low.push(parseFloat(val['low']));
            result.close.push(parseFloat(val['close']));
        }
    }
    return result;
}

export const checkRisingGraph = (smaData) => {
    for (let i = 1; i < 10; i++) {
        if (smaData[i] < smaData[i-1]) {
            return false;
        }
    }
    return true;
}
