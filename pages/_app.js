import '../styles/globals.css'
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import 'ag-grid-community/styles/ag-theme-balham.css';

import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import Layout from '../components/Layout';

ModuleRegistry.registerModules([AllCommunityModule]);

function MyApp({ Component, pageProps }) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}

export default MyApp