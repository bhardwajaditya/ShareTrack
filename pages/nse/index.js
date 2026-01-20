import { useState, useEffect } from 'react';
import Table from 'react-bootstrap/Table';

const nse = () => {
  const [indexes, setIndexes] = useState([]);
  useEffect(async () => {
    const index = await fetch('https://www.nseindia.com/api/equity-master')
      .then(data => data.json())
      .then(data => console.log(data))
      .catch(error => console.error(error));
      setIndexes(index?.data['Broad Market Indices']);
  }, []);
  console.log(indexes);
  return (
    <div>
      <h1>Available Indexes</h1>
        <Table striped bordered hover>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>SMA-44</th>
                    <th>SMA-200</th>
                    <th>Verdict</th>
                </tr>
            </thead>

            <tbody>
            { indexes?.map((index) => {
                const url = '/nse/' + encodeURIComponent(index.indexName);
                <tr>
                    <td>{index.indexName}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            }) }
            </tbody>
        </Table>
    </div>
  );
};

export default nse;
