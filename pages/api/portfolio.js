import { getPortfolioCollection } from '../../utils/mongodb';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { method } = req;

  try {
    const collection = await getPortfolioCollection();

    switch (method) {
      case 'GET': {
        // List all portfolio holdings
        const holdings = await collection.find({}).sort({ symbol: 1 }).toArray();
        return res.status(200).json({ success: true, data: holdings });
      }

      case 'POST': {
        // Add new holding
        const { symbol, quantity, avgBuyPrice, notes } = req.body;

        if (!symbol || !quantity || !avgBuyPrice) {
          return res.status(400).json({ 
            success: false, 
            error: 'symbol, quantity, and avgBuyPrice are required' 
          });
        }

        // Check if symbol already exists
        const existing = await collection.findOne({ symbol: symbol.toUpperCase() });
        if (existing) {
          return res.status(400).json({ 
            success: false, 
            error: `${symbol} already exists in portfolio. Use PUT to update.` 
          });
        }

        const newHolding = {
          symbol: symbol.toUpperCase(),
          quantity: Number(quantity),
          avgBuyPrice: Number(avgBuyPrice),
          notes: notes || '',
          addedAt: new Date(),
          updatedAt: new Date()
        };

        const result = await collection.insertOne(newHolding);
        return res.status(201).json({ 
          success: true, 
          data: { ...newHolding, _id: result.insertedId } 
        });
      }

      case 'PUT': {
        // Update existing holding
        const { id, symbol, quantity, avgBuyPrice, notes } = req.body;

        if (!id) {
          return res.status(400).json({ success: false, error: 'id is required for update' });
        }

        const updateData = { updatedAt: new Date() };
        if (symbol) updateData.symbol = symbol.toUpperCase();
        if (quantity !== undefined) updateData.quantity = Number(quantity);
        if (avgBuyPrice !== undefined) updateData.avgBuyPrice = Number(avgBuyPrice);
        if (notes !== undefined) updateData.notes = notes;

        const result = await collection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: updateData },
          { returnDocument: 'after' }
        );

        if (!result) {
          return res.status(404).json({ success: false, error: 'Holding not found' });
        }

        return res.status(200).json({ success: true, data: result });
      }

      case 'DELETE': {
        // Delete holding
        const { id } = req.query;

        if (!id) {
          return res.status(400).json({ success: false, error: 'id query parameter is required' });
        }

        const result = await collection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ success: false, error: 'Holding not found' });
        }

        return res.status(200).json({ success: true, message: 'Holding deleted successfully' });
      }

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({ success: false, error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Portfolio API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
