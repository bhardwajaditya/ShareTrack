import React, { useMemo, useState } from 'react';

const StockChart = ({ data, width = 600, height = 300, color = '#2563eb' }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const { points, minPrice, maxPrice } = useMemo(() => {
    if (!data || data.length === 0) return { points: [], minPrice: 0, maxPrice: 0 };

    const prices = data.map(d => d.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.close - minPrice) / priceRange) * height;
      return { x, y, ...d };
    });

    return { points, minPrice, maxPrice };
  }, [data, width, height]);

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-400">No Data</div>;
  }

  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid lines */}
        <line x1="0" y1="0" x2={width} y2="0" stroke="#e5e7eb" strokeDasharray="4" />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#e5e7eb" strokeDasharray="4" />
        <line x1="0" y1={height} x2={width} y2={height} stroke="#e5e7eb" strokeDasharray="4" />

        {/* Chart Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" />

        {/* Hover Area */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - (width / points.length) / 2}
            y={0}
            width={width / points.length}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHoveredPoint(p)}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}

        {/* Hover Indicator */}
        {hoveredPoint && (
          <>
            <line
              x1={hoveredPoint.x}
              y1={0}
              x2={hoveredPoint.x}
              y2={height}
              stroke="#9ca3af"
              strokeDasharray="4"
            />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="4" fill={color} />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="absolute bg-white p-2 rounded shadow-lg border border-gray-200 text-xs pointer-events-none"
          style={{
            left: hoveredPoint.x + 10 > width - 100 ? hoveredPoint.x - 110 : hoveredPoint.x + 10,
            top: hoveredPoint.y - 40 < 0 ? hoveredPoint.y + 10 : hoveredPoint.y - 40
          }}
        >
          <div className="font-bold">{hoveredPoint.date}</div>
          <div>Price: {hoveredPoint.close.toFixed(2)}</div>
          <div>Vol: {hoveredPoint.volume.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
};

export default StockChart;
