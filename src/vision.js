// The bin's eye. One function, two providers:
//   ollama (default): runs on the device, so the photo never has to leave the bin.
//   gemini: the hosted demo, so judges can try it from a browser. The photo is sent for the
//           verdict and not kept; only its SHA-256 is recorded.
const PROVIDER = (process.env.BINPROOF_VISION || "ollama").toLowerCase();
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.BINPROOF_MODEL || "gemma4:e4b-it-qat";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MODEL = PROVIDER === "gemini" ? GEMINI_MODEL : OLLAMA_MODEL;
const REVIEW_BELOW = 0.6; // verdicts under this confidence go to a person, never straight to a score

// Demo rules for a residential blue (recycling) bin. Kept here, not in the model, so they can be
// changed per municipality and quoted in the README.
const BLUE_BIN_RULES = `ACCEPTED in the blue recycling bin (if empty and reasonably clean):
paper, newspaper, flattened cardboard, paper cups and cartons, plastic bottles and rigid plastic
containers, metal cans and foil, glass bottles and jars.
CONTAMINATION (does not belong): food scraps and organics, greasy or food-soiled paper or
cardboard, containers with food or liquid left in them, plastic bags and film, styrofoam,
textiles, electronics and batteries, diapers, general garbage.`;

const PROMPT = `You are the camera inside a residential BLUE recycling bin. Look at the item being
put in and decide whether it belongs.
${BLUE_BIN_RULES}
If no single item is clearly visible, say so with a low confidence.
Reply with JSON only:
{"item": short name of the item,
 "category": one of "paper","cardboard","plastic","metal","glass","carton","organics","film","styrofoam","garbage","hazardous","unknown",
 "contaminated": true if it does NOT belong in the blue bin as shown,
 "reason": one short sentence a resident would understand,
 "confidence": number from 0 to 1}`;

async function askOllama(imageBase64) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL, stream: false, format: "json", options: { temperature: 0 },
      messages: [{ role: "user", content: PROMPT, images: [imageBase64] }],
    }),
  });
  if (!res.ok) throw new Error(`vision model returned ${res.status}`);
  return (await res.json()).message?.content || "{}";
}

async function askGemini(imageBase64) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (res.status === 429) throw new Error("the demo's free vision quota is used up for now; try again in a minute");
  if (!res.ok) throw new Error(`vision model returned ${res.status}`);
  const body = await res.json();
  return body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
}

async function classify(imageBase64) {
  const started = Date.now();
  const raw = PROVIDER === "gemini" ? await askGemini(imageBase64) : await askOllama(imageBase64);
  let v;
  try { v = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim()); } catch { v = {}; }
  const confidence = Math.max(0, Math.min(1, Number(v.confidence) || 0));
  return {
    item: String(v.item || "unknown item").slice(0, 80),
    category: String(v.category || "unknown").toLowerCase().slice(0, 20),
    contaminated: Boolean(v.contaminated),
    reason: String(v.reason || "").slice(0, 200),
    confidence,
    needsReview: confidence < REVIEW_BELOW,
    model: MODEL,
    onDevice: PROVIDER !== "gemini",
    ms: Date.now() - started,
  };
}

module.exports = { classify, MODEL, PROVIDER, BLUE_BIN_RULES, REVIEW_BELOW };
