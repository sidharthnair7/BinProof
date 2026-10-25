package binproof;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.FunctionReturnDecoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Bool;
import org.web3j.abi.datatypes.DynamicArray;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.*;
import org.web3j.crypto.Credentials;
import org.web3j.crypto.Hash;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.request.Transaction;
import org.web3j.protocol.core.methods.response.EthCall;
import org.web3j.protocol.core.methods.response.EthSendTransaction;
import org.web3j.protocol.http.HttpService;
import org.web3j.tx.RawTransactionManager;
import org.web3j.utils.Numeric;

import java.io.File;
import java.math.BigInteger;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Two signers who don't trust each other: the building (what the bin saw) and the facility (what it
 * measured). Locally they are Hardhat's first two dev accounts (public test keys, never real money).
 * The contract address comes from deployment.json, written by `npm start` / `npm run deploy:testnet`.
 */
@Service
public class Chain {
    static final List<String> STATUS = List.of("None", "Committed", "Verified", "Flagged");
    private static final String HARDHAT_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    private static final String HARDHAT_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

    private final Web3j web3;
    private final File deploymentFile;
    private final Credentials building, facility;
    private final ObjectMapper json = new ObjectMapper();

    public Chain(@Value("${binproof.rpc}") String rpc, @Value("${binproof.root}") String root) {
        web3 = Web3j.build(new HttpService(rpc));
        deploymentFile = new File(root, "deployment.json");
        building = Credentials.create(Optional.ofNullable(System.getenv("BUILDING_KEY")).orElse(HARDHAT_0));
        facility = Credentials.create(Optional.ofNullable(System.getenv("FACILITY_KEY")).orElse(HARDHAT_1));
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> deployment() throws Exception {
        return deploymentFile.exists() ? json.readValue(deploymentFile, Map.class) : null;
    }

    private String address() throws Exception {
        Map<String, Object> d = deployment();
        if (d == null) throw new IllegalStateException("contract not deployed: run npm start");
        return (String) d.get("address");
    }

    static String modelId(String model) { return Hash.sha3String(model); }

    private static Bytes32 b32(String hex) { return new Bytes32(Numeric.hexStringToByteArray(hex)); }

    /** Reverts come back as custom errors; name them so the page can show them (e.g. AlreadyClaimed). */
    static String errorName(String message) {
        if (message == null) return "transaction failed";
        Matcher m = Pattern.compile("custom error '?([A-Za-z0-9_]+)").matcher(message);
        return m.find() ? m.group(1) : message;
    }

    private String call(Credentials from, Function f) throws Exception {
        EthCall res = web3.ethCall(Transaction.createEthCallTransaction(from.getAddress(), address(), FunctionEncoder.encode(f)), DefaultBlockParameterName.LATEST).send();
        if (res.hasError() || res.isReverted()) throw new IllegalStateException(errorName(res.hasError() ? res.getError().getMessage() : res.getRevertReason()));
        return res.getValue();
    }

    /** Simulate first (clean error names), then send, signed by the given party. Hardhat mines at once. */
    private String send(Credentials who, Function f) throws Exception {
        call(who, f);
        long chainId = web3.ethChainId().send().getChainId().longValue();
        RawTransactionManager tm = new RawTransactionManager(web3, who, chainId);
        BigInteger gasPrice = web3.ethGasPrice().send().getGasPrice();
        EthSendTransaction tx = tm.sendTransaction(gasPrice, BigInteger.valueOf(600_000), address(), FunctionEncoder.encode(f), BigInteger.ZERO);
        if (tx.hasError()) throw new IllegalStateException(errorName(tx.getError().getMessage()));
        return tx.getTransactionHash();
    }

    public String commitBatch(String batchId, String root, long items, long contaminated, String model) throws Exception {
        return send(building, new Function("commitBatch", List.of(b32(batchId), b32(root), new Uint32(items), new Uint32(contaminated), b32(modelId(model))), List.of()));
    }

    public String reportMeasurement(String batchId, int facilityBps) throws Exception {
        return send(facility, new Function("reportMeasurement", List.of(b32(batchId), new Uint16(facilityBps)), List.of()));
    }

    /** One verified batch, one claim. The second attempt is refused by the contract, not by us. */
    public Map<String, String> issueClaim(String batchId) throws Exception {
        Function f = new Function("issueClaim", List.of(b32(batchId), new Address(building.getAddress())), List.of(new TypeReference<Bytes32>() {}));
        List<Type> out = FunctionReturnDecoder.decode(call(building, f), f.getOutputParameters());
        String claimId = Numeric.toHexString(((Bytes32) out.get(0)).getValue());
        return Map.of("claimId", claimId, "tx", send(building, f));
    }

    public boolean verifyEvent(String batchId, String leaf, List<String> proof) throws Exception {
        List<Bytes32> p = proof.stream().map(Chain::b32).toList();
        Function f = new Function("verifyEvent", List.of(b32(batchId), b32(leaf), new DynamicArray<>(Bytes32.class, p)), List.of(new TypeReference<Bool>() {}));
        return ((Bool) FunctionReturnDecoder.decode(call(building, f), f.getOutputParameters()).get(0)).getValue();
    }

    /** batches(batchId) -> root, items, contaminated, modelId, facilityBps, status, claimed. */
    public Map<String, Object> batch(String batchId) throws Exception {
        Function f = new Function("batches", List.of(b32(batchId)), List.of(
                new TypeReference<Bytes32>() {}, new TypeReference<Uint32>() {}, new TypeReference<Uint32>() {}, new TypeReference<Bytes32>() {},
                new TypeReference<Uint16>() {}, new TypeReference<Uint8>() {}, new TypeReference<Bool>() {}));
        List<Type> out = FunctionReturnDecoder.decode(call(building, f), f.getOutputParameters());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("facilityBps", ((Uint16) out.get(4)).getValue().intValue());
        m.put("status", STATUS.get(((Uint8) out.get(5)).getValue().intValue()));
        m.put("claimed", ((Bool) out.get(6)).getValue());
        return m;
    }
}
