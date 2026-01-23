import { getReportsCollection } from '../../utils/mongodb';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const collection = await getReportsCollection();
    const { id, limit = 30 } = req.query;

    if (id) {
      // Get specific report
      const { ObjectId } = await import('mongodb');
      const report = await collection.findOne({ _id: new ObjectId(id) });
      
      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }
      
      return res.status(200).json({ success: true, data: report });
    }

    // List recent reports
    const reports = await collection
      .find({})
      .sort({ generatedAt: -1 })
      .limit(parseInt(limit))
      .project({
        _id: 1,
        generatedAt: 1,
        marketDate: 1,
        type: 1,
        totalHoldings: 1,
        analyzedCount: 1,
        actionRequiredCount: 1,
        actionRequired: 1,
        'summary.totalPnL': 1
      })
      .toArray();

    return res.status(200).json({ success: true, data: reports });

  } catch (error) {
    console.error('Reports API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
