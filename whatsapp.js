const axios = require('axios');

async function sendWhatsApp(message) {
  try {
    const phone = process.env.CALLMEBOT_PHONE;
    const apiKey = process.env.CALLMEBOT_API_KEY;
    const encodedMsg = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMsg}&apikey=${apiKey}`;
    await axios.get(url);
    console.log('WhatsApp notification sent');
  } catch (err) {
    // Don't crash the server if WhatsApp fails
    console.error('WhatsApp notification failed:', err.message);
  }
}

module.exports = { sendWhatsApp };
