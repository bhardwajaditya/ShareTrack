import { useState, useEffect } from 'react';

const nse = () => {
  const [indexes, setIndexes] = useState([]);
  useEffect(async () => {
    const index = await fetch('https://www1.nseindia.com/live_market/dynaContent/live_watch/stock_watch/liveIndexWatchData.json')
      .then(data => data.json())
      .catch(error => console.error(error));
      setIndexes(index.data);
  }, []);
  return (
    <div>
      <h1>Available Indexes</h1>
      { indexes.map((index) => {
        const url = '/nse/' + encodeURIComponent(index.indexName);
        return (<a href={url} key={url}><li>{index.indexName}</li></a>);
      }) }
    </div>
  );
};

export default nse;
