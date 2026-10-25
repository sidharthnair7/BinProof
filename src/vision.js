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

// The model only says what it sees. The rules decide. Tested Oct 24: asked to judge directly, the
// model let a plastic bag in as a "paper bag", rejected paper cups the rules accept, and reported
// 100% confidence every time. So the verdict comes from this table, not from the model's opinion.
const ACCEPTED = {
  paper: "Paper goes in the blue bin.",
  cardboard: "Clean cardboard goes in the blue bin.",
  paper_cup: "Paper cups go in the blue bin when empty.",
  carton: "Cartons go in the blue bin when empty.",
  rigid_plastic: "Rigid plastic bottles and containers go in the blue bin.",
  metal: "Metal cans and foil go in the blue bin.",
  glass: "Glass bottles and jars go in the blue bin.",
};
const REJECTED = {
  plastic_film: "Plastic bags and film tangle the sorting machines. They don't belong in the blue bin.",
  organics: "Food and organics go in the green bin, not the blue bin.",
  styrofoam: "Styrofoam doesn't belong in the blue bin.",
  textile: "Clothes and fabric don't belong in the blue bin.",
  electronics: "Electronics and batteries need a drop-off depot, not the blue bin.",
  garbage: "This is garbage, not recycling.",
};
const DIRTY_REASON = "It still has food or liquid in it, which contaminates the load. Empty it first.";

// Rules as text, for the README and anyone checking what the bin enforces.
const BLUE_BIN_RULES = `ACCEPTED (empty and clean): ${Object.keys(ACCEPTED).join(", ")}.
REJECTED: ${Object.keys(REJECTED).join(", ")}; anything with food or liquid left in it.`;

const MATERIALS = [...Object.keys(ACCEPTED), ...Object.keys(REJECTED), "unknown"];

const PROMPT = `You are a camera looking at one item someone is about to throw away.
Describe only what you can see. Do not decide where it goes.
First look closely: is it thin flexible plastic film (a bag or wrap), or paper? Is it food or a peel?
Reply with JSON only, in this order:
{"what_i_see": one sentence describing the object, its material and its condition,
 "item": short name of the item,
 "material": one of ${MATERIALS.map((m) => `"${m}"`).join(",")},
 "has_food_or_liquid": true if food, grease or liquid is visibly left on or in it,
 "clearly_visible": true only if one item fills a good part of the picture,
 "confidence": number from 0 to 1 for how sure you are of the material}`;

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
  const material = MATERIALS.includes(v.material) ? v.material : "unknown";
  const dirty = Boolean(v.has_food_or_liquid) && material in ACCEPTED;
  const contaminated = material in REJECTED || dirty;
  // The model's own confidence is not trusted alone: an unknown material or an unclear picture
  // also goes to a person.
  const confidence = Math.max(0, Math.min(1, Number(v.confidence) || 0));
  const needsReview = material === "unknown" || v.clearly_visible === false || confidence < REVIEW_BELOW;
  const reason = needsReview ? "The bin isn't sure what this is, so a person will check it."
    : dirty ? DIRTY_REASON : (REJECTED[material] || ACCEPTED[material]);
  return {
    item: String(v.item || "unknown item").slice(0, 80),
    category: material,
    contaminated,
    reason,
    seen: String(v.what_i_see || "").slice(0, 240),
    confidence,
    needsReview,
    model: MODEL,
    onDevice: PROVIDER !== "gemini",
    ms: Date.now() - started,
  };
}

module.exports = { classify, MODEL, PROVIDER, BLUE_BIN_RULES, REVIEW_BELOW };
