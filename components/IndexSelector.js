import React, { useState } from 'react';
import { getIndexesByCategory } from '../utils/nseIndexes';

const IndexSelector = ({ onIndexSelect, selectedIndex }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const indexesByCategory = getIndexesByCategory();

  const handleSelect = (index) => {
    onIndexSelect(index);
    setIsOpen(false);
    setSearchTerm('');
  };

  const filteredCategories = Object.entries(indexesByCategory).reduce((acc, [category, indexes]) => {
    const filteredIndexes = indexes.filter(index => 
      index.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      index.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filteredIndexes.length > 0) {
      acc[category] = filteredIndexes;
    }
    return acc;
  }, {});

  return (
    <div className="relative w-full max-w-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 text-left bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {selectedIndex ? selectedIndex.name : 'Select an Index'}
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search indexes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="max-h-96 overflow-y-auto">
            {Object.entries(filteredCategories).map(([category, indexes]) => (
              <div key={category} className="py-2">
                <div className="px-4 py-1 text-sm font-semibold text-gray-600 bg-gray-50">
                  {category}
                </div>
                {indexes.map((index) => (
                  <button
                    key={index.symbol}
                    onClick={() => handleSelect(index)}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-100 ${
                      selectedIndex?.symbol === index.symbol ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="font-medium">{index.name}</div>
                    <div className="text-sm text-gray-500">{index.description}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default IndexSelector; 