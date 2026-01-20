// NSE Index definitions
export const NSE_INDEXES = {
  // Major Indices
  NIFTY_50: {
    id: 'NIFTY_50',
    name: 'NIFTY 50',
    symbol: '^NSEI',
    description: 'National Stock Exchange Fifty',
    category: 'Major Indices'
  },
  NIFTY_NEXT_50: {
    id: 'NIFTY_NEXT_50',
    name: 'NIFTY NEXT 50',
    symbol: '^NSEI_NEXT50',
    description: 'Next 50 companies after NIFTY 50',
    category: 'Major Indices'
  },
  NIFTY_100: {
    id: 'NIFTY_100',
    name: 'NIFTY 100',
    symbol: '^NSEI_100',
    description: 'Top 100 companies by market capitalization',
    category: 'Major Indices'
  },
  NIFTY_500: {
    id: 'NIFTY_500',
    name: 'NIFTY 500',
    symbol: '^NSEI_500',
    description: 'Top 500 companies by market capitalization',
    category: 'Major Indices'
  },

  // Market Cap Based Indices
  NIFTY_MIDCAP_100: {
    id: 'NIFTY_MIDCAP_100',
    name: 'NIFTY MIDCAP 100',
    symbol: '^NSEI_MIDCAP100',
    description: 'Top 100 mid-cap companies',
    category: 'Market Cap Indices'
  },
  NIFTY_SMALLCAP_100: {
    id: 'NIFTY_SMALLCAP_100',
    name: 'NIFTY SMALLCAP 100',
    symbol: '^NSEI_SMALLCAP100',
    description: 'Top 100 small-cap companies',
    category: 'Market Cap Indices'
  },
  NIFTY_MIDCAP_150: {
    id: 'NIFTY_MIDCAP_150',
    name: 'NIFTY MIDCAP 150',
    symbol: '^NSEI_MIDCAP150',
    description: 'Top 150 mid-cap companies',
    category: 'Market Cap Indices'
  },
  NIFTY_SMALLCAP_250: {
    id: 'NIFTY_SMALLCAP_250',
    name: 'NIFTY SMALLCAP 250',
    symbol: '^NSEI_SMALLCAP250',
    description: 'Top 250 small-cap companies',
    category: 'Market Cap Indices'
  },

  // Sectoral Indices
  NIFTY_AUTO: {
    id: 'NIFTY_AUTO',
    name: 'NIFTY AUTO',
    symbol: '^NSEI_AUTO',
    description: 'Automobile sector companies',
    category: 'Sectoral Indices'
  },
  NIFTY_BANK: {
    id: 'NIFTY_BANK',
    name: 'NIFTY BANK',
    symbol: '^NSEI_BANK',
    description: 'Banking sector companies',
    category: 'Sectoral Indices'
  },
  NIFTY_FIN_SERVICE: {
    id: 'NIFTY_FIN_SERVICE',
    name: 'NIFTY FINANCIAL SERVICES',
    symbol: '^NSEI_FIN_SERVICE',
    description: 'Financial services companies',
    category: 'Sectoral Indices'
  },
  NIFTY_FMCG: {
    id: 'NIFTY_FMCG',
    name: 'NIFTY FMCG',
    symbol: '^NSEI_FMCG',
    description: 'Fast Moving Consumer Goods companies',
    category: 'Sectoral Indices'
  },
  NIFTY_IT: {
    id: 'NIFTY_IT',
    name: 'NIFTY IT',
    symbol: '^NSEI_IT',
    description: 'Information Technology companies',
    category: 'Sectoral Indices'
  },
  NIFTY_METAL: {
    id: 'NIFTY_METAL',
    name: 'NIFTY METAL',
    symbol: '^NSEI_METAL',
    description: 'Metal sector companies',
    category: 'Sectoral Indices'
  },
  NIFTY_PHARMA: {
    id: 'NIFTY_PHARMA',
    name: 'NIFTY PHARMA',
    symbol: '^NSEI_PHARMA',
    description: 'Pharmaceutical companies',
    category: 'Sectoral Indices'
  },
  NIFTY_REALTY: {
    id: 'NIFTY_REALTY',
    name: 'NIFTY REALTY',
    symbol: '^NSEI_REALTY',
    description: 'Real Estate companies',
    category: 'Sectoral Indices'
  },

  // Thematic Indices
  NIFTY_GROWTH_SECTORS_15: {
    id: 'NIFTY_GROWTH_SECTORS_15',
    name: 'NIFTY GROWTH SECTORS 15',
    symbol: '^NSEI_GROWTH_SECTORS_15',
    description: '15 companies from high-growth sectors',
    category: 'Thematic Indices'
  },
  NIFTY_INDIA_DIGITAL: {
    id: 'NIFTY_INDIA_DIGITAL',
    name: 'NIFTY INDIA DIGITAL',
    symbol: '^NSEI_INDIA_DIGITAL',
    description: 'Companies driving digital transformation',
    category: 'Thematic Indices'
  },
  NIFTY_INDIA_MANUFACTURING: {
    id: 'NIFTY_INDIA_MANUFACTURING',
    name: 'NIFTY INDIA MANUFACTURING',
    symbol: '^NSEI_INDIA_MANUFACTURING',
    description: 'Manufacturing sector companies',
    category: 'Thematic Indices'
  }
};

// Function to get all available indexes
export const getAvailableIndexes = () => {
  return Object.values(NSE_INDEXES);
};

// Function to get indexes by category
export const getIndexesByCategory = () => {
  const indexes = getAvailableIndexes();
  return indexes.reduce((acc, index) => {
    if (!acc[index.category]) {
      acc[index.category] = [];
    }
    acc[index.category].push(index);
    return acc;
  }, {});
};

// Function to get index details by symbol
export const getIndexDetails = (symbol) => {
  return NSE_INDEXES[symbol] || null;
};

// Function to fetch stocks in an index
export const fetchIndexStocks = async (indexSymbol) => {
  try {
    const response = await fetch(`/api/nse-index-stocks?index=${indexSymbol}`);
    if (!response.ok) {
      throw new Error('Failed to fetch index stocks');
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching stocks for index ${indexSymbol}:`, error);
    throw error;
  }
}; 