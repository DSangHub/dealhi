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
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Google Gemini SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------------------------------------------------------
// ENDPOINT 1: AI Product Finder (Google Gemini)
// -----------------------------------------------------------------------------
app.post('/api/search-deal', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    // Call Gemini with Structured JSON Output Enforcement
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Find the best single buy option for: "${query}" across Indian e-commerce (Amazon India, Flipkart, Myntra, Meesho, Ajio). Provide estimated pricing in INR, rating, and platform link metadata.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            productName: { type: Type.STRING },
            platform: { type: Type.STRING, enum: ['Amazon India', 'Flipkart', 'Myntra', 'Meesho', 'Ajio'] },
            priceINR: { type: Type.NUMBER },
            rating: { type: Type.NUMBER },
            skuId: { type: Type.STRING },
            estimatedDelivery: { type: Type.STRING }
          },
          required: ['productName', 'platform', 'priceINR', 'rating', 'skuId']
        }
      }
    });

    const productData = JSON.parse(response.text);
    return res.status(200).json({ success: true, data: productData });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({ error: 'Failed to resolve query via AI Engine.' });
  }
});

// -----------------------------------------------------------------------------
// ENDPOINT 2: Trigger 1-Click Purchase Execution
// -----------------------------------------------------------------------------
app.post('/api/trigger-checkout', async (req, res) => {
  try {
    const { userId, platform, productDetails } = req.body;

    // 1. Retrieve encrypted retailer access token from Supabase
    const { data: account, error: authError } = await supabase
      .from('linked_accounts')
      .select('auth_token')
      .eq('user_id', userId)
      .eq('platform', platform.toLowerCase())
      .single();

    if (authError || !account) {
      return res.status(400).json({
        success: false,
        message: `Account for ${platform} is not linked. Please connect your account first.`
      });
    }

    // 2. Fetch User Shipping & Payment Details
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('default_address, upi_id')
      .eq('id', userId)
      .single();

    // 3. Dispatch payload to the platform checkout bridge
    // (Simulating direct API bridge response)
    const triggerSuccess = true; 

    // 4. Log transaction event in Supabase DB
    await supabase.from('order_triggers').insert({
      user_id: userId,
      platform: platform,
      product_name: productDetails.productName,
      price_inr: productDetails.priceINR,
      status: triggerSuccess ? 'SUCCESS' : 'FAILED'
    });

    return res.status(200).json({
      success: true,
      message: `Purchase triggered on ${platform}!`,
      orderDetails: {
        product: productDetails.productName,
        platform: platform,
        amountPaid: productDetails.priceINR,
        deliveryAddress: userProfile?.default_address || "Default Address"
      }
    });

  } catch (error) {
    console.error('Checkout Trigger Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 DealHi Backend running on http://localhost:${PORT}`);
});// Fetch AI Product details from Node.js Express server
async function handleItemSelect() {
  const item = document.getElementById("popular-dropdown").value;
  if (!item) return;

  document.getElementById("product-card").classList.add("hidden");
  document.getElementById("ai-loader").classList.remove("hidden");

  try {
    const response = await fetch("http://localhost:5000/api/search-deal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: item })
    });

    const result = await response.json();

    if (result.success) {
      const data = result.data;
      
      // Update UI with Gemini response
      document.getElementById("res-title").innerText = data.productName;
      document.getElementById("res-price").innerText = `₹${data.priceINR}`;
      document.getElementById("res-platform").innerText = data.platform;
      document.getElementById("res-rating").innerText = `★ ${data.rating}`;
      
      document.getElementById("ai-loader").classList.add("hidden");
      document.getElementById("product-card").classList.remove("hidden");
    }
  } catch (err) {
    console.error("Fetch Error:", err);
    document.getElementById("ai-loader").classList.add("hidden");
  }
}
