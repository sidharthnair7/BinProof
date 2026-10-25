package binproof;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** The same API as the Node server, so the same web page works on either backend. */
@RestController
@RequestMapping("/api")
public class ApiController {
    private final Vision vision;
    private final Ledger ledger;
    private final Chain chain;

    public ApiController(Vision vision, Ledger ledger, Chain chain) {
        this.vision = vision;
        this.ledger = ledger;
        this.chain = chain;
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> error(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("error", Chain.errorName(e.getMessage())));
    }

    @GetMapping("/state")
    public Map<String, Object> state() throws Exception {
        Map<String, Object> d = chain.deployment();
        List<Map<String, Object>> batches = new ArrayList<>();
        for (Map<String, Object> b : ledger.batches()) {
            Map<String, Object> on = d == null ? null : chain.batch((String) b.get("batchId"));
            long items = ((Number) b.get("items")).longValue(), dirty = ((Number) b.get("contaminated")).longValue();
            String status = on == null ? "Not on chain" : (String) on.get("status");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("number", b.get("number")); m.put("batchId", b.get("batchId")); m.put("root", b.get("root"));
            m.put("items", items); m.put("contaminated", dirty); m.put("seeded", b.get("seeded")); m.put("model", b.get("model"));
            m.put("tx", b.getOrDefault("tx", Map.of()));
            m.put("binPct", items == 0 ? 0 : 100.0 * dirty / items);
            m.put("status", status);
            m.put("facilityPct", on != null && List.of("Verified", "Flagged").contains(status) ? ((Number) on.get("facilityBps")).intValue() / 100.0 : null);
            m.put("claimed", on != null && Boolean.TRUE.equals(on.get("claimed")));
            batches.add(m);
        }
        List<Map<String, Object>> events = ledger.events();
        List<Map<String, Object>> recent = new ArrayList<>(events.subList(Math.max(0, events.size() - 60), events.size()));
        Collections.reverse(recent);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deployment", d); out.put("model", vision.model); out.put("onDevice", true);
        out.put("events", recent); out.put("batches", batches); out.put("backend", "spring-boot");
        return out;
    }

    /** The bin: a photo comes in, the verdict and the event go out. The photo stays on this device. */
    @PostMapping("/dispose")
    public Map<String, Object> dispose(@RequestBody Map<String, String> body) throws Exception {
        String unit = body.get("unit"), image = body.get("image");
        if (unit == null || image == null) throw new IllegalArgumentException("unit and image are required");
        String b64 = image.replaceFirst("^data:image/\\w+;base64,", "");
        String sha = ledger.saveImage(Base64.getDecoder().decode(b64), true);
        Map<String, Object> verdict = vision.classify(b64);
        Map<String, Object> event = ledger.addEvent(unit.length() > 20 ? unit.substring(0, 20) : unit, sha, verdict, false);
        return Map.of("event", event, "verdict", verdict);
    }

    /** A person settles low-confidence verdicts before they can count against anyone. */
    @PostMapping("/review/{eventId}")
    public Map<String, Object> review(@PathVariable String eventId, @RequestBody Map<String, Object> body) throws Exception {
        return ledger.review(eventId, Boolean.TRUE.equals(body.get("contaminated")));
    }

    /** Pickup: close open events into a batch and commit its Merkle root, signed by the building. */
    @PostMapping("/pickup")
    public Map<String, Object> pickup() throws Exception {
        Map<String, Object> b = ledger.closeBatch();
        String tx = chain.commitBatch((String) b.get("batchId"), (String) b.get("root"), ((Number) b.get("items")).longValue(),
                ((Number) b.get("contaminated")).longValue(), (String) b.get("model"));
        return ledger.updateBatch((String) b.get("batchId"), Map.of("tx", Map.of("commit", tx)));
    }

    /** The facility reports what it measured, signed with its own key. The contract decides. */
    @PostMapping("/facility/{batchId}")
    public Map<String, Object> facility(@PathVariable String batchId, @RequestBody Map<String, Object> body) throws Exception {
        double pct = ((Number) body.get("contaminationPct")).doubleValue();
        if (pct < 0 || pct > 100) throw new IllegalArgumentException("contamination % must be between 0 and 100");
        String tx = chain.reportMeasurement(batchId, (int) Math.round(pct * 100));
        ledger.updateBatch(batchId, Map.of("tx", Map.of("measurement", tx)));
        return Map.of("status", chain.batch(batchId).get("status"), "tx", tx);
    }

    /** One verified batch, one claim. */
    @PostMapping("/claim/{batchId}")
    public Map<String, Object> claim(@PathVariable String batchId) throws Exception {
        Map<String, String> r = chain.issueClaim(batchId);
        ledger.updateBatch(batchId, Map.of("tx", Map.of("claim", r.get("tx")), "claimId", r.get("claimId")));
        return new LinkedHashMap<>(r);
    }

    @GetMapping("/receipt/{eventId}")
    public Map<String, Object> receipt(@PathVariable String eventId) throws Exception { return ledger.receipt(eventId); }

    /** Anyone with a receipt: rebuild the leaf from its values and ask the contract. */
    @PostMapping("/verify")
    @SuppressWarnings("unchecked")
    public Map<String, Object> verify(@RequestBody Map<String, Object> body) throws Exception {
        String leaf = org.web3j.utils.Numeric.toHexString(Merkle.leafHash((List<Object>) body.get("values")));
        return Map.of("ok", chain.verifyEvent((String) body.get("batchId"), leaf, (List<String>) body.get("proof")), "leaf", leaf);
    }

    /** The sealed tree of one pickup, for The Seal: node hashes in heap order and where each item sits. */
    @GetMapping("/batch/{batchId}/tree")
    @SuppressWarnings("unchecked")
    public Map<String, Object> tree(@PathVariable String batchId) throws Exception {
        Map<String, Object> b = ledger.batches().stream().filter(x -> batchId.equals(x.get("batchId"))).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("unknown batch"));
        Map<String, Object> dump = (Map<String, Object>) b.get("tree");
        List<Map<String, Object>> leaves = new ArrayList<>();
        for (Map<String, Object> v : (List<Map<String, Object>>) dump.get("values")) leaves.add(Map.of("treeIndex", v.get("treeIndex"), "value", v.get("value")));
        return Map.of("number", b.get("number"), "root", b.get("root"), "fields", Merkle.LEAF_FIELDS, "tree", dump.get("tree"), "leaves", leaves);
    }
}
