package binproof;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.web3j.crypto.Hash;
import org.web3j.utils.Numeric;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;

/**
 * Off-chain records and batching, in the same files and format as the Node server (data/events.json,
 * data/batches.json). Photos stay in data/images; only their SHA-256 goes into an event.
 */
@Service
public class Ledger {
    // Routes where the sorter sent the drop out of the recycling stream; they never join a recycling pickup.
    static final Set<String> LEFT_RECYCLING = Set.of("diverted", "to_organics");
    private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    private final Path data, events, batches, images;
    private final String salt = Optional.ofNullable(System.getenv("BINPROOF_SALT")).orElse("demo-building-salt-change-me");
    private final SecureRandom random = new SecureRandom();

    public Ledger(@Value("${binproof.root}") String root) throws Exception {
        data = Path.of(root, "data");
        events = data.resolve("events.json");
        batches = data.resolve("batches.json");
        images = data.resolve("images");
        Files.createDirectories(images);
    }

    @SuppressWarnings("unchecked")
    synchronized List<Map<String, Object>> read(Path file) throws Exception {
        if (!Files.exists(file)) return new ArrayList<>();
        return json.readValue(file.toFile(), List.class);
    }

    synchronized void write(Path file, Object value) throws Exception { json.writeValue(file.toFile(), value); }

    public List<Map<String, Object>> events() throws Exception { return read(events); }
    public List<Map<String, Object>> batches() throws Exception { return read(batches); }

    /** A unit is never named on chain: a salted hash the building can map back and an outsider can't. */
    String unitTag(String unit) { return Hash.sha3String(salt + ":" + unit); }

    String saveImage(byte[] bytes, boolean keep) throws Exception {
        String sha = Numeric.toHexStringNoPrefix(MessageDigest.getInstance("SHA-256").digest(bytes));
        if (keep) Files.write(images.resolve(sha + ".jpg"), bytes);
        return "0x" + sha;
    }

    public synchronized Map<String, Object> addEvent(String unit, String imageSha256, Map<String, Object> verdict, boolean seeded) throws Exception {
        return addEvent(unit, imageSha256, verdict, seeded, Map.of());
    }

    /** chute: floor, stream, detected, route, signals (each with its source: camera:live or simulated). */
    public synchronized Map<String, Object> addEvent(String unit, String imageSha256, Map<String, Object> verdict, boolean seeded, Map<String, Object> chute) throws Exception {
        List<Map<String, Object>> all = events();
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("eventId", "ev-" + System.currentTimeMillis() + "-" + HexFormat.of().formatHex(random.generateSeed(3)));
        e.put("unit", unit);
        e.put("unitTag", unitTag(unit));
        e.put("imageSha256", imageSha256);
        e.put("category", verdict.get("category"));
        e.put("contaminated", verdict.get("contaminated"));
        e.put("confidenceBps", (int) Math.round(((Number) verdict.get("confidence")).doubleValue() * 10000));
        e.put("model", verdict.get("model"));
        e.put("timestamp", System.currentTimeMillis() / 1000);
        e.put("seeded", seeded);
        e.put("item", verdict.get("item"));
        e.put("reason", verdict.get("reason"));
        e.put("needsReview", Boolean.TRUE.equals(verdict.get("needsReview")));
        e.put("batchId", null);
        e.putAll(chute);
        all.add(e);
        write(events, all);
        return e;
    }

    public synchronized Map<String, Object> review(String eventId, boolean contaminated) throws Exception { return review(eventId, contaminated, false); }

    /** The superintendent settles a drop from the review tote: recycling (clean or not), or divert to garbage. */
    public synchronized Map<String, Object> review(String eventId, boolean contaminated, boolean divert) throws Exception {
        List<Map<String, Object>> all = events();
        Map<String, Object> e = all.stream().filter(x -> eventId.equals(x.get("eventId"))).findFirst().orElseThrow(() -> new IllegalArgumentException("unknown event"));
        if (e.get("batchId") != null) throw new IllegalArgumentException("already picked up");
        e.put("contaminated", contaminated); e.put("needsReview", false); e.put("humanReviewed", true);
        if (e.get("stream") != null) e.put("route", divert ? "diverted" : "RECYCLING".equals(e.get("stream")) ? "recycling" : ((String) e.get("stream")).toLowerCase());
        write(events, all);
        return e;
    }

    static List<Object> leafValues(Map<String, Object> e) {
        List<Object> v = new ArrayList<>();
        for (String f : Merkle.LEAF_FIELDS) v.add(e.get(f));
        return v;
    }

    /** Close every open, reviewed event into one pickup and build its tree. */
    public synchronized Map<String, Object> closeBatch() throws Exception {
        List<Map<String, Object>> all = events();
        // A pickup is the recycling stream's load: drops that landed in recycling (not diverted to garbage or organics, not in review).
        List<Map<String, Object>> open = all.stream().filter(e -> e.get("batchId") == null && !Boolean.TRUE.equals(e.get("needsReview"))
                && (e.get("stream") == null || "RECYCLING".equals(e.get("stream"))) && !LEFT_RECYCLING.contains(e.get("route"))).toList();
        if (open.isEmpty()) throw new IllegalArgumentException("no reviewed events waiting for pickup");
        List<Map<String, Object>> bs = batches();
        int number = bs.size() + 1;
        String batchId = Hash.sha3String("pickup-" + number + "-" + System.currentTimeMillis());
        List<List<Object>> values = open.stream().map(Ledger::leafValues).toList();
        Merkle.Built built = Merkle.build(values);
        Set<Object> ids = new HashSet<>(); open.forEach(e -> ids.add(e.get("eventId")));
        for (Map<String, Object> e : all) if (ids.contains(e.get("eventId"))) e.put("batchId", batchId);

        List<Map<String, Object>> dumpValues = new ArrayList<>();
        for (int i = 0; i < values.size(); i++) dumpValues.add(Map.of("value", values.get(i), "treeIndex", built.treeIndex()[i]));
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("number", number);
        b.put("batchId", batchId);
        b.put("root", built.root());
        b.put("items", open.size());
        b.put("contaminated", open.stream().filter(e -> Boolean.TRUE.equals(e.get("contaminated"))).count());
        b.put("seeded", open.stream().filter(e -> Boolean.TRUE.equals(e.get("seeded"))).count());
        b.put("model", open.stream().filter(e -> !Boolean.TRUE.equals(e.get("seeded"))).map(e -> e.get("model")).findFirst().orElse(open.get(0).get("model")));
        b.put("tree", Map.of("format", "standard-v1", "leafEncoding", Merkle.LEAF_TYPES, "tree", built.tree(), "values", dumpValues));
        b.put("createdAt", System.currentTimeMillis() / 1000);
        b.put("tx", new LinkedHashMap<>());
        bs.add(b);
        write(events, all);
        write(batches, bs);
        return b;
    }

    @SuppressWarnings("unchecked")
    public synchronized Map<String, Object> updateBatch(String batchId, Map<String, Object> patch) throws Exception {
        List<Map<String, Object>> bs = batches();
        Map<String, Object> b = bs.stream().filter(x -> batchId.equals(x.get("batchId"))).findFirst().orElseThrow(() -> new IllegalArgumentException("unknown batch"));
        for (var entry : patch.entrySet()) {
            if (entry.getKey().equals("tx")) ((Map<String, Object>) b.computeIfAbsent("tx", k -> new LinkedHashMap<>())).putAll((Map<String, Object>) entry.getValue());
            else b.put(entry.getKey(), entry.getValue());
        }
        write(batches, bs);
        return b;
    }

    /** What a resident keeps: the leaf values and the proof. Enough to check on chain without us. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> receipt(String eventId) throws Exception {
        Map<String, Object> event = events().stream().filter(e -> eventId.equals(e.get("eventId"))).findFirst().orElseThrow(() -> new IllegalArgumentException("unknown event"));
        if (event.get("batchId") == null) return Map.of("event", event, "pending", true);
        Map<String, Object> b = batches().stream().filter(x -> event.get("batchId").equals(x.get("batchId"))).findFirst().orElseThrow();
        Map<String, Object> dump = (Map<String, Object>) b.get("tree");
        List<String> tree = (List<String>) dump.get("tree");
        for (Map<String, Object> v : (List<Map<String, Object>>) dump.get("values")) {
            List<Object> value = (List<Object>) v.get("value");
            if (eventId.equals(value.get(0))) {
                int ti = ((Number) v.get("treeIndex")).intValue();
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("batchId", b.get("batchId")); out.put("pickup", b.get("number"));
                out.put("leafTypes", Merkle.LEAF_TYPES); out.put("leafFields", Merkle.LEAF_FIELDS);
                out.put("values", value); out.put("leaf", tree.get(ti)); out.put("proof", Merkle.proof(tree, ti));
                return out;
            }
        }
        throw new IllegalStateException("event not found in its batch");
    }

    File dataDir() { return data.toFile(); }
}
