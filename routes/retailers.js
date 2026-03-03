const express = require('express');
const multer = require('multer');
const supabase = require('../supabase');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET all retailers (admin only)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('retailers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, retailers: data });
  } catch (e) {
    console.error('Get retailers error:', e);
    res.status(500).json({ error: 'Failed to fetch retailers' });
  }
});

// POST register retailer
router.post('/register', upload.single('business_card'), async (req, res) => {
  try {
    const { name, shop_name, city, phone, gst } = req.body;
    if (!name || !shop_name || !city || !phone)
      return res.status(400).json({ error: 'Name, shop name, city and phone are required' });

    // Check if already registered
    const { data: existing } = await supabase
      .from('retailers')
      .select('*')
      .eq('phone', phone)
      .single();

    if (existing)
      return res.status(400).json({ error: 'This phone number is already registered' });

    // Upload business card if provided
    let bizCardUrl = null;
    if (req.file) {
      const fileName = `business-cards/${Date.now()}_${phone}.${req.file.mimetype.split('/')[1]}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);
        bizCardUrl = urlData.publicUrl;
      }
    }

    const { data, error } = await supabase
      .from('retailers')
      .insert({
        name, shop_name, city, phone,
        gst: gst || null,
        status: 'pending',
        business_card_url: bizCardUrl,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, retailer: data, message: 'Registration successful! Awaiting approval.' });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST login retailer
router.post('/login', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    const { data, error } = await supabase
      .from('retailers')
      .select('*')
      .eq('phone', phone)
      .single();
    if (error || !data)
      return res.status(404).json({ error: 'Phone number not registered. Please register first.' });
    res.json({ success: true, retailer: data });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// PUT approve retailer (admin only)
router.put('/:id/approve', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('retailers')
      .update({ status: 'approved' })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, retailer: data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to approve retailer' });
  }
});

// PUT reject retailer (admin only)
router.put('/:id/reject', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('retailers')
      .update({ status: 'rejected' })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, retailer: data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reject retailer' });
  }
});

// DELETE remove retailer (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('retailers')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, message: 'Retailer removed' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to remove retailer' });
  }
});

module.exports = router;
