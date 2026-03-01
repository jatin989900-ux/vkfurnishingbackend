const express = require('express');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const { sendWhatsApp } = require('../whatsapp');
const router = express.Router();

// POST /api/retailers/register - new retailer registration (after OTP verified)
router.post('/register', async (req, res) => {
  const { name, shop_name, city, phone, gst } = req.body;

  if (!name || !shop_name || !city || !phone)
    return res.status(400).json({ error: 'Name, shop name, city and phone are required' });

  // Check if already registered
  const { data: existing } = await supabase
    .from('retailers')
    .select('id, status')
    .eq('phone', phone)
    .single();

  if (existing) {
    if (existing.status === 'approved')
      return res.status(400).json({ error: 'This phone number is already a verified retailer.' });
    if (existing.status === 'pending')
      return res.status(400).json({ error: 'Your application is already pending approval.' });
  }

  // Insert new retailer
  const { data, error } = await supabase.from('retailers').insert({
    name, shop_name, city, phone,
    gst: gst || '',
    status: 'pending'
  }).select().single();

  if (error) return res.status(500).json({ error: 'Registration failed. Please try again.' });

  // Send WhatsApp notification to admin
  const msg = `🆕 NEW RETAILER REGISTRATION\n\nShop: ${shop_name}\nOwner: ${name}\nCity: ${city}\nPhone: ${phone}\nGST: ${gst || 'Not provided'}\n\nLogin to admin panel to approve:\nhttps://vkwholesale.netlify.app`;
  await sendWhatsApp(msg);

  res.json({
    success: true,
    retailer: data,
    message: 'Registration successful. Awaiting admin approval.'
  });
});

// GET /api/retailers/status/:phone - check approval status
router.get('/status/:phone', async (req, res) => {
  const { data, error } = await supabase
    .from('retailers')
    .select('id, name, shop_name, city, phone, status, created_at')
    .eq('phone', req.params.phone)
    .single();

  if (error || !data)
    return res.status(404).json({ error: 'Retailer not found' });

  res.json({ success: true, retailer: data });
});

// ── ADMIN ROUTES ───────────────────────────────────────────────────

// GET /api/retailers - get all retailers (admin only)
router.get('/', auth, async (req, res) => {
  const { status } = req.query;
  let query = supabase.from('retailers').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch retailers' });
  res.json({ success: true, retailers: data });
});

// PUT /api/retailers/:id/approve - approve retailer
router.put('/:id/approve', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('retailers')
    .update({ status: 'approved' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to approve retailer' });

  // Notify admin confirmation
  await sendWhatsApp(`✅ Retailer APPROVED\n\nShop: ${data.shop_name}\nOwner: ${data.name}\nCity: ${data.city}\nPhone: ${data.phone}`);

  res.json({ success: true, retailer: data, message: 'Retailer approved successfully' });
});

// PUT /api/retailers/:id/reject - reject retailer
router.put('/:id/reject', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('retailers')
    .update({ status: 'rejected' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to reject retailer' });
  res.json({ success: true, retailer: data, message: 'Retailer rejected' });
});

module.exports = router;
