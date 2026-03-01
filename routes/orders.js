const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const { sendWhatsApp } = require('../whatsapp');
const router = express.Router();

// POST /api/orders - place new order (approved retailers only)
router.post('/', async (req, res) => {
  const { retailer_phone, items, notes } = req.body;

  if (!retailer_phone || !items || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Retailer phone and at least one item required' });

  // Verify retailer is approved
  const { data: retailer } = await supabase
    .from('retailers')
    .select('*')
    .eq('phone', retailer_phone)
    .single();

  if (!retailer) return res.status(404).json({ error: 'Retailer not found' });
  if (retailer.status !== 'approved') return res.status(403).json({ error: 'Only approved retailers can place orders' });

  // Calculate total value
  let total_value = 0;
  const enrichedItems = [];

  for (const item of items) {
    const { data: product } = await supabase
      .from('products')
      .select('name, wholesale_price, category')
      .eq('id', item.product_id)
      .single();

    if (product) {
      const itemTotal = product.wholesale_price * item.quantity;
      total_value += itemTotal;
      enrichedItems.push({
        product_id: item.product_id,
        product_name: product.name,
        category: product.category,
        quantity: item.quantity,
        size: item.size || '',
        color: item.color || '',
        unit_price: product.wholesale_price,
        total: itemTotal
      });
    }
  }

  // Save order
  const { data: order, error } = await supabase.from('orders').insert({
    retailer_id: retailer.id,
    retailer_name: retailer.name,
    shop_name: retailer.shop_name,
    phone: retailer.phone,
    city: retailer.city,
    items: enrichedItems,
    total_value,
    status: 'new',
    notes: notes || ''
  }).select().single();

  if (error) return res.status(500).json({ error: 'Failed to place order' });

  // Build WhatsApp notification message for admin
  const itemsList = enrichedItems.map(i =>
    `• ${i.product_name} x${i.quantity}${i.size ? ' (' + i.size + ')' : ''}${i.color ? ' - ' + i.color : ''} = ₹${i.total}`
  ).join('\n');

  const msg = `🛒 NEW ORDER #${order.id}\n\nShop: ${retailer.shop_name}\nOwner: ${retailer.name}\nCity: ${retailer.city}\nPhone: ${retailer.phone}\n\nItems:\n${itemsList}\n\n💰 Total: ₹${total_value}\n\nNotes: ${notes || 'None'}\n\nLogin to confirm: https://vkwholesale.netlify.app`;
  await sendWhatsApp(msg);

  res.json({
    success: true,
    order,
    message: `Order #${order.id} placed successfully! Our team will contact you on WhatsApp within 15 minutes.`
  });
});

// ── ADMIN ROUTES ───────────────────────────────────────────────────

// GET /api/orders - get all orders (admin only)
router.get('/', auth, async (req, res) => {
  const { status } = req.query;
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch orders' });
  res.json({ success: true, orders: data });
});

// PUT /api/orders/:id/status - update order status
router.put('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['new', 'confirmed', 'dispatched', 'cancelled'];

  if (!validStatuses.includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update order' });

  // Notify admin of dispatch
  if (status === 'dispatched') {
    await sendWhatsApp(`🚚 Order #${data.id} DISPATCHED\n\nShop: ${data.shop_name}\nPhone: ${data.phone}\nValue: ₹${data.total_value}`);
  }

  res.json({ success: true, order: data, message: `Order marked as ${status}` });
});

module.exports = router;
