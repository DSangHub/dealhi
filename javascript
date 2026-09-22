// A-Z Popular Category & Search Term Aggregator
const popularItemsAZ = {
  A: ["Air Conditioners (1.5 Ton 5 Star)", "Adidas Running Shoes", "Ajio Kurti Sets"],
  B: ["Boat Airdopes", "Bedsheets Cotton Double", "Bhai Dooj Gift Sets"],
  C: ["Crocs Clogs", "Casual Shirts Men", "Cetaphil Cleanser"],
  M: ["Meesho Sarees", "Mixer Grinders 750W", "Mobile Covers iPhone 15"],
  S: ["Sarees Kanjivaram", "Smartwatches Noise", "Skechers Walking Shoes"],
  Z: ["Zara Jackets", "Zaveri Pearls Jewelry"]
};

export function getAlphabeticalSuggestions(letter) {
  return popularItemsAZ[letter.toUpperCase()] || [];
}import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function findBestProductDeal(query, userPreferences) {
  const model = genAI.getGenerativeAIModel({ 
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `
    Find the best single buy link and product details for the search query: "${query}" across Indian marketplaces (Amazon India, Flipkart, Myntra, Meesho, Ajio).
    Prioritize highest rated, fastest delivery, and best deal price.
    
    Return strict JSON format:
    {
      "productName": "string",
      "platform": "Amazon | Flipkart | Myntra | Meesho | Ajio",
      "priceINR": number,
      "rating": number,
      "directPurchaseUrl": "string",
      "skuId": "string",
      "estimatedDeliveryDays": number
    }
  `;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
} 
// pages/api/trigger-checkout.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { userId, platform, productDetails } = req.body;

  try {
    // 1. Fetch encrypted platform auth token
    const { data: account, error: authError } = await supabase
      .from('linked_accounts')
      .select('auth_token')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (authError || !account) {
      return res.status(400).json({ error: `Please connect your ${platform} account first.` });
    }

    // 2. Fetch default shipping address and UPI/Card credentials
    const { data: user } = await supabase
      .from('user_profiles')
      .select('default_address, upi_id')
      .eq('id', userId)
      .single();

    // 3. Dispatch automated purchase payload to platform API middleware
    const purchaseResponse = await fetch(`https://api.dealhi.app/v1/bridge/${platform}/buy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.auth_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        skuId: productDetails.skuId,
        shippingAddress: user.default_address,
        paymentMethod: 'UPI_DIRECT',
        upiId: user.upi_id
      })
    });

    const result = await purchaseResponse.json();

    // 4. Log trigger event
    await supabase.from('order_triggers').insert({
      user_id: userId,
      platform: platform,
      product_name: productDetails.productName,
      price_inr: productDetails.priceINR,
      status: result.success ? 'SUCCESS' : 'FAILED'
    });

    return res.status(200).json({ success: true, message: 'Purchase triggered successfully!', details: result });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
