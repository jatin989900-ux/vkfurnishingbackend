const express = require('express');
const multer = require('multer');
const supabase = require('../supabase');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only image/video files allowed'));
  }
});

const multiUpload = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 }
]);

async function uploadFile(file) {
  const ext = file.mimetype.split('/')[1];
  const filename = Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
  const { error } = await supabase.storage
    .from('product-images')
    .upload(filename, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) return null;
  const { data } = supabase.storage.from('product-images').getPublicUrl(filename);
  return data.publicUrl;
}

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Failed to fetch products' });
  const retailer_phone = req.query.retailer_phone;
  let isApproved = false;
  if (retailer_phone) {
    const { data: retailer } = await supabase
      .from('retailers').select('status')
      .eq('phone', retailer_phone).single();
    isApproved = retailer?.status === 'approved';
  }
  const products = data.map(p => ({
    ...p,
    wholesale_price: isApproved ? p.wholesale_price : null
  }));
  res.json({ success: true, products });
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('products').select('*')
    .eq('id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true, product: data });
});
router.post('/', multiUpload, async (req, res) => {
  const { name, category, wholesale_price, mrp, moq, gsm, sizes, colors, tag, in_stock, video_url } = req.body;
  if (!name || !category || !wholesale_price || !mrp || !moq)
    return res.status(400).json({ error: 'Name, category, wholesale price, MRP and MOQ are required' });
  if (Number(wholesale_price) >= Number(mrp))
    return res.status(400).json({ error: 'Wholesale price must be less than MRP' });
  const imageUrls = [];
  for (const file of (req.files?.images || [])) {
    const url = await uploadFile(file);
    if (url) imageUrls.push(url);
  }
  let video_file_url = null;
  const videoFiles = req.files?.video || [];
  if (videoFiles.length > 0) video_file_url = await uploadFile(videoFiles[0]);
  const { data, error } = await supabase.from('products').insert({
    name, category,
    gsm: gsm || '',
    sizes: sizes || '',
    colors: Number(colors) || 0,
    moq: Number(moq),
    wholesale_price: Number(wholesale_price),
    mrp: Number(mrp),
    tag: tag || '',
    in_stock: in_stock === 'true' || in_stock === true,
    image_url: imageUrls[0] || '',
    images: imageUrls,
    video_url: video_url || '',
    video_file_url: video_file_url || null
  }).select().single();
  if (error) return res.status(500).json({ error: 'Failed to add product: ' + error.message });
  res.json({ success: true, product: data, message: 'Product added successfully' });
});

router.put('/:id', multiUpload, async (req, res) => {
  const { name, category, gsm, sizes, colors, moq, wholesale_price, mrp, tag, in_stock, video_url, existing_images } = req.body;
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
  let allImageUrls = [];
  try { allImageUrls = existing_images ? JSON.parse(existing_images) : []; } catch (e) { allImageUrls = []; }
  for (const file of (req.files?.images || [])) {
    const url = await uploadFile(file);
    if (url) allImageUrls.push(url);
  }
  if (allImageUrls.length > 0) {
    updates.images = allImageUrls;
    updates.image_url = allImageUrls[0];
  }
  const videoFiles = req.files?.video || [];
  if (videoFiles.length > 0) {
    const url = await uploadFile(videoFiles[0]);
    if (url) updates.video_file_url = url;
  }
  const { data, error } = await supabase
    .from('products').update(updates)
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: 'Failed to update product: ' + error.message });
  res.json({ success: true, product: data, message: 'Product updated successfully' });
});

router.delete('/:id', async (req, res) => {
  const { data: product } = await supabase
    .from('products').select('image_url, images')
    .eq('id', req.params.id).single();
  const toDelete = product?.images?.length > 0 ? product.images : (product?.image_url ? [product.image_url] : []);
  for (const url of toDelete) {
    const filename = url.split('/').pop();
    await supabase.storage.from('product-images').remove([filename]);
  }
  const { error } = await supabase.from('products').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to delete product' });
  res.json({ success: true, message: 'Product deleted successfully' });
});

module.exports = router;
