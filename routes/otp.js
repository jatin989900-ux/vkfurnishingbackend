const express = require('express');
const axios = require('axios');
const supabase = require('../supabase');
const router = express.Router();

// POST /api/otp/send
router.post('/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10)
    return res.status(400).json({ error: 'Valid 10-digit phone number required' });

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any previous unused OTPs for this phone
  await supabase.from('otps').delete().eq('phone', phone).eq('used', false);

  // Store OTP in database
  const { error: dbError } = await supabase.from('otps').insert({
    phone,
    otp_code: otp,
    expires_at: expiresAt.toISOString(),
    used: false
  });

  if (dbError) {
    console.error('OTP DB error:', dbError);
    return res.status(500).json({ error: 'Failed to generate OTP' });
  }

  // Send SMS via MSG91
  try {
    await axios.post(
      'https://control.msg91.com/api/v5/otp',
      {
        template_id: process.env.MSG91_TEMPLATE_ID,
        mobile: `91${phone}`,
        authkey: process.env.MSG91_AUTH_KEY,
        otp: otp
      }
    );
    res.json({ success: true, message: `OTP sent to +91 ${phone}` });
  } catch (smsErr) {
    console.error('MSG91 error:', smsErr.message);
    // In development, return OTP directly so you can test
    if (process.env.NODE_ENV === 'development') {
      return res.json({ success: true, message: 'Dev mode - OTP: ' + otp, dev_otp: otp });
    }
    res.status(500).json({ error: 'Failed to send SMS. Please try again.' });
  }
});

// POST /api/otp/verify
router.post('/verify', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp)
    return res.status(400).json({ error: 'Phone and OTP required' });

  // Find OTP record
  const { data, error } = await supabase
    .from('otps')
    .select('*')
    .eq('phone', phone)
    .eq('otp_code', otp)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data)
    return res.status(400).json({ error: 'Invalid OTP. Please try again.' });

  // Check expiry
  if (new Date() > new Date(data.expires_at))
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });

  // Mark OTP as used
  await supabase.from('otps').update({ used: true }).eq('id', data.id);

  res.json({ success: true, message: 'OTP verified successfully' });
});

module.exports = router;
