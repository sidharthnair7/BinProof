package binproof;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The bin's eye. The model only describes what it sees; the rules table decides. Tested Oct 24: asked to
 * judge directly, the model let a plastic bag in as a "paper bag" and reported 100% confidence every time.
 */
@Service
public class Vision {
    static final double REVIEW_BELOW = 0.6;
    static final Map<String, String> ACCEPTED = new LinkedHashMap<>();
    static final Map<String, String> REJECTED = new LinkedHashMap<>();
    static {
        ACCEPTED.put("paper", "Paper goes in the blue bin.");
        ACCEPTED.put("cardboard", "Clean cardboard goes in the blue bin.");
        ACCEPTED.put("paper_cup", "Paper cups go in the blue bin when empty.");
        ACCEPTED.put("carton", "Cartons go in the blue bin when empty.");
        ACCEPTED.put("rigid_plastic", "Rigid plastic bottles and containers go in the blue bin.");
        ACCEPTED.put("metal", "Metal cans and foil go in the blue bin.");
        ACCEPTED.put("glass", "Glass bottles and jars go in the blue bin.");
        REJECTED.put("plastic_film", "Plastic bags and film tangle the sorting machines. They don't belong in the blue bin.");
        REJECTED.put("organics", "Food and organics go in the green bin, not the blue bin.");
        REJECTED.put("styrofoam", "Styrofoam doesn't belong in the blue bin.");
        REJECTED.put("textile", "Clothes and fabric don't belong in the blue bin.");
        REJECTED.put("electronics", "Electronics and batteries need a drop-off depot, not the blue bin.");
        REJECTED.put("garbage", "This is garbage, not recycling.");
    }
    static final String DIRTY = "It still has food or liquid in it, which contaminates the load. Empty it first.";

    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final String ollama;
    final String model;

    public Vision(@Value("${binproof.ollama}") String ollama, @Value("${binproof.model}") String model) {
        this.ollama = ollama;
        this.model = model;
    }

    private String prompt() {
        StringBuilder materials = new StringBuilder();
        for (String m : ACCEPTED.keySet()) materials.append('"').append(m).append("\",");
        for (String m : REJECTED.keySet()) materials.append('"').append(m).append("\",");
        materials.append("\"unknown\"");
        return """
                You are a camera looking at one item someone is about to throw away.
                Describe only what you can see. Do not decide where it goes.
                First look closely: is it thin flexible plastic film (a bag or wrap), or paper? Is it food or a peel?
                Reply with JSON only, in this order:
                {"what_i_see": one sentence describing the object, its material and its condition,
                 "bag": "opaque_bag" if it is a closed bag you cannot see into (black, dark or coloured), "clear_bag" if it is a see-through bag, "loose" if it is not in a bag,
                 "item": short name of the item, or of what is visible inside a clear bag,
                 "material": one of %s,
                 "has_food_or_liquid": true if food, grease or liquid is visibly left on or in it,
                 "clearly_visible": true only if one item fills a good part of the picture,
                 "confidence": number from 0 to 1 for how sure you are of the material}""".formatted(materials);
    }

    /**
     * Fuse the stream button, the camera and the (simulated) sensors into one routing decision.
     * Routes: "garbage", "organics", "recycling", "diverted" (to garbage by the sorter flap), "to_organics" (to organics
     * by the sorter flap), "review" (review tote).
     * A closed opaque bag in the recycling stream is itself the contamination: recyclables shouldn't be bagged.
     * Food the camera can see in the recycling stream goes to organics. Food hidden inside a container passes the camera;
     * the facility's measurement of the load catches it, so that pickup flags instead of earning a claim.
     */
    public static Map<String, Object> decide(Map<String, Object> v, String stream, double metal, double weightKg) {
        Map<String, Object> d = new LinkedHashMap<>();
        boolean review = Boolean.TRUE.equals(v.get("needsReview"));
        String detected = (String) v.get("detected");
        String route; boolean contaminated; String reason;
        switch (stream) {
            case "GARBAGE" -> { route = "garbage"; contaminated = false; reason = "Garbage stream: sent to garbage."; }
            case "ORGANICS" -> {
                if (metal >= 0.6) { route = "review"; contaminated = true; reason = "Metal detected in organics: sent to the review tote."; }
                else if (weightKg >= 4.0) { route = "review"; contaminated = true; reason = "Unusually heavy for organics (glass or liquid?): sent to the review tote."; }
                else { route = "organics"; contaminated = false; reason = "Organics: food waste goes through, bagged or loose."; }
            }
            default -> {
                if ("OPAQUE_BAG".equals(detected)) { route = "diverted"; contaminated = true;
                    reason = "A closed black bag in recycling can't be checked, and recyclables shouldn't be bagged. Diverted to garbage; your floor gets a notice."; }
                else if (review) { route = "review"; contaminated = false; reason = "The camera isn't sure: sent to the review tote for the superintendent."; }
                else if ("ORGANICS".equals(detected)) { route = "to_organics"; contaminated = true;
                    reason = "Food in recycling contaminates the load. Diverted to organics; recorded against this floor."; }
                else { contaminated = Boolean.TRUE.equals(v.get("contaminated")); route = "recycling";
                    reason = contaminated ? "Doesn't belong in recycling. Recorded against this floor: " + v.get("reason") : (String) v.get("reason"); }
            }
        }
        d.put("route", route); d.put("contaminated", contaminated); d.put("reason", reason);
        d.put("needsReview", route.equals("review"));
        return d;
    }

    public Map<String, Object> classify(String imageBase64) throws Exception {
        long started = System.currentTimeMillis();
        Map<String, Object> body = Map.of("model", model, "stream", false, "format", "json", "options", Map.of("temperature", 0),
                "messages", List.of(Map.of("role", "user", "content", prompt(), "images", List.of(imageBase64))));
        HttpRequest req = HttpRequest.newBuilder(URI.create(ollama + "/api/chat")).timeout(Duration.ofMinutes(3))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new IllegalStateException("vision model returned " + res.statusCode());
        String raw = json.readTree(res.body()).path("message").path("content").asText("{}");
        JsonNode v;
        try { v = json.readTree(raw.replaceAll("^```(json)?|```$", "").trim()); } catch (Exception e) { v = json.createObjectNode(); }

        String bag = v.path("bag").asText("loose");
        String material = v.path("material").asText("unknown");
        if (!ACCEPTED.containsKey(material) && !REJECTED.containsKey(material)) material = "unknown";
        boolean dirty = v.path("has_food_or_liquid").asBoolean(false) && ACCEPTED.containsKey(material);
        boolean contaminated = REJECTED.containsKey(material) || dirty;
        double confidence = Math.max(0, Math.min(1, v.path("confidence").asDouble(0)));
        boolean needsReview = material.equals("unknown") || (v.has("clearly_visible") && !v.path("clearly_visible").asBoolean(true)) || confidence < REVIEW_BELOW;
        String reason = needsReview ? "The bin isn't sure what this is, so a person will check it."
                : dirty ? DIRTY : REJECTED.getOrDefault(material, ACCEPTED.get(material));

        Map<String, Object> out = new LinkedHashMap<>();
        String item = v.path("item").asText("unknown item");
        out.put("item", item.length() > 80 ? item.substring(0, 80) : item);
        out.put("category", material);
        out.put("contaminated", contaminated);
        out.put("reason", reason);
        String seen = v.path("what_i_see").asText("");
        out.put("seen", seen.length() > 240 ? seen.substring(0, 240) : seen);
        out.put("confidence", confidence);
        out.put("needsReview", needsReview);
        out.put("model", model);
        out.put("onDevice", true);
        out.put("bag", bag);
        out.put("detected", bag.equals("opaque_bag") ? "OPAQUE_BAG" : needsReview ? "UNSURE" : material.toUpperCase());
        out.put("ms", System.currentTimeMillis() - started);
        return out;
    }
}
