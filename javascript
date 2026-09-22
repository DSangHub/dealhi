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
