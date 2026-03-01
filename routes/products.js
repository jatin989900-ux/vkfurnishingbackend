const express = require('express');
const multer = require('multer');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const router = express.Router();

// Multer - store in memory for Supabase upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// ── PUBLIC ROUTES ──────────────────────────────────────────────────

// GET /api/products - get all products (prices hidden unless approved retailer)
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch products' });

  const { retailer_phone } = req.query;

  // If retailer phone provided, check if approved
  let isApproved = false;
  if (retailer_phone) {
    const { data: retailer } = await supabase
      .from('retailers')
      .select('status')
      .eq('phone', retailer_phone)
      .single();
    isApproved = retailer?.status === 'approved';
  }

  // Hide wholesale price if not approved
  const products = data.map(p => ({
    ...p,
    wholesale_price: isApproved ? p.wholesale_price : null,
  }));

  res.json({ success: true, products });
});

// GET /api/products/:id - single product
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true, product: data });
});

// ── ADMIN ROUTES (protected) ───────────────────────────────────────

// POST /api/products - add new product
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { name, category, gsm, sizes, colors, moq, wholesale_price, mrp, tag, in_stock, video_url } = req.body;

  if (!name || !category || !wholesale_price || !mrp || !moq)
    return res.status(400).json({ error: 'Name, category, price, MRP and MOQ are required' });

  if (Number(wholesale_price) >= Number(mrp))
    return res.status(400).json({ error: 'Wholesale price must be less than MRP' });

  let image_url = '';

  // Upload image to Supabase Storage if provided
  if (req.file) {
    const fileName = `${Date.now()}-${req.file.originalname.replace(/\s/g, '-')}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Image upload error:', uploadError);
    } else {
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);
      image_url = urlData.publicUrl;
    }
  }

  const { data, error } = await supabase.from('products').insert({
    name, category, gsm, sizes,
    colors: Number(colors) || 1,
    moq: Number(moq),
    wholesale_price: Number(wholesale_price),
    mrp: Number(mrp),
    tag: tag || '',
    in_stock: in_stock === 'true' || in_stock === true,
    image_url,
    video_url: video_url || ''
  }).select().single();

  if (error) return res.status(500).json({ error: 'Failed to add product' });
  res.json({ success: true, product: data, message: 'Product added successfully' });
});

// PUT /api/products/:id - update product
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  const { name, category, gsm, sizes, colors, moq, wholesale_price, mrp, tag, in_stock, video_url } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (category !== undefined) updates.category = category;
  if (gsm !== undefined) updates.gsm = gsm;
  if (sizes !== undefined) updates.sizes = sizes;
  if (colors !== undefined) updates.colors = Number(colors);
  if (moq !== undefined) updates.moq = Number(moq);
  if (wholesale_price !== undefined) updates.wholesale_price = Number(wholesale_price);
  if (mrp !== undefined) updates.mrp = Number(mrp);
  if (tag !== undefined) updates.tag = tag;
  if (in_stock !== undefined) updates.in_stock = in_stock === 'true' || in_stock === true;
  if (video_url !== undefined) updates.video_url = video_url;

  // Upload new image if provided
  if (req.file) {
    const fileName = `${Date.now()}-${req.file.originalname.replace(/\s/g, '-')}`;
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);
      updates.image_url = urlData.publicUrl;
    }
  }

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update product' });
  res.json({ success: true, product: data, message: 'Product updated successfully' });
});

// DELETE /api/products/:id
router.delete('/:id', auth, async (req, res) => {
  // Get product first to delete image from storage
  const { data: product } = await supabase
    .from('products')
    .select('image_url')
    .eq('id', req.params.id)
    .single();

  // Delete image from storage if exists
  if (product?.image_url) {
    const fileName = product.image_url.split('/').pop();
    await supabase.storage.from('product-images').remove([fileName]);
  }

  const { error } = await supabase.from('products').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to delete product' });
  res.json({ success: true, message: 'Product deleted successfully' });
});

module.exports = router;
