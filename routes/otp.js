const express = require('express');
const axios = require('axios');
const supabase = require('../supabase');
const router = express.Router();

router.post('/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length !== 10)
    return res.status(400).json({ error: 'Valid 10-digit phone number required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await supabase.from('otps').delete().eq('phone', phone).eq('used', false);

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

  console.log('Attempting MSG91 with:');
  console.log('AUTH KEY:', process.env.MSG91_AUTH_KEY ? 'EXISTS' : 'MISSING');
  console.log('TEMPLATE ID:', process.env.MSG91_TEMPLATE_ID || 'MISSING');
  console.log('SENDER ID:', process.env.MSG91_SENDER_ID || 'MISSING');
  console.log('OTP generated:', otp);

  try {
    const url = `https://control.msg91.com/api/v5/otp?template_id=${process.env.MSG91_TEMPLATE_ID}&mobile=91${phone}&authkey=${process.env.MSG91_AUTH_KEY}&otp=${otp}&sender=${process.env.MSG91_SENDER_ID || 'MSGIND'}`;
    console.log('MSG91 URL:', url);
    const response = await axios.get(url);
    console.log('MSG91 response:', JSON.stringify(response.data));
    res.json({ success: true, message: `OTP sent to +91 ${phone}` });
  } catch (smsErr) {
    console.error('MSG91 error status:', smsErr.response?.status);
    console.error('MSG91 error data:', JSON.stringify(smsErr.response?.data));
    console.error('MSG91 error message:', smsErr.message);
    res.status(500).json({ 
      error: 'Failed to send SMS',
      details: smsErr.response?.data || smsErr.message
    });
  }
});

router.post('/verify', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp)
    return res.status(400).json({ error: 'Phone and OTP required' });

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

  if (new Date() > new Date(data.expires_at))
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });

  await supabase.from('otps').update({ used: true }).eq('id', data.id);

  res.json({ success: true, message: 'OTP verified successfully' });
});

module.exports = router;
