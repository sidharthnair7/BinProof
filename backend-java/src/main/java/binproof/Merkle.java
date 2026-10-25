package binproof;

import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Bool;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.Utf8String;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint16;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.Hash;
import org.web3j.utils.Numeric;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * OpenZeppelin's StandardMerkleTree, byte for byte, so receipts from the Node server and this one agree
 * and the contract's MerkleProof.verify accepts them. Leaf = keccak256(keccak256(abi.encode(values))).
 */
public final class Merkle {
    public static final List<String> LEAF_TYPES = List.of("string", "bytes32", "bytes32", "string", "bool", "uint16", "string", "uint256", "bool");
    public static final List<String> LEAF_FIELDS = List.of("eventId", "unitTag", "imageSha256", "category", "contaminated", "confidenceBps", "model", "timestamp", "seeded");

    private Merkle() {}

    /** values follow LEAF_FIELDS order, as JSON-ish Java values (String, Boolean, Number). */
    public static byte[] leafHash(List<Object> v) {
        List<Type> params = List.of(
                new Utf8String((String) v.get(0)),
                new Bytes32(Numeric.hexStringToByteArray((String) v.get(1))),
                new Bytes32(Numeric.hexStringToByteArray((String) v.get(2))),
                new Utf8String((String) v.get(3)),
                new Bool((Boolean) v.get(4)),
                new Uint16(BigInteger.valueOf(((Number) v.get(5)).longValue())),
                new Utf8String((String) v.get(6)),
                new Uint256(BigInteger.valueOf(((Number) v.get(7)).longValue())),
                new Bool((Boolean) v.get(8)));
        byte[] encoded = Numeric.hexStringToByteArray(FunctionEncoder.encodeConstructor(params));
        return Hash.sha3(Hash.sha3(encoded));
    }

    private static int compare(byte[] a, byte[] b) { return new BigInteger(1, a).compareTo(new BigInteger(1, b)); }

    private static byte[] hashPair(byte[] a, byte[] b) {
        byte[] lo = compare(a, b) <= 0 ? a : b, hi = lo == a ? b : a;
        byte[] both = Arrays.copyOf(lo, 64);
        System.arraycopy(hi, 0, both, 32, 32);
        return Hash.sha3(both);
    }

    /** Result of building a tree: node hashes in heap order and each value's index in it. */
    public record Built(List<String> tree, int[] treeIndex) {
        public String root() { return tree.get(0); }
    }

    public static Built build(List<List<Object>> values) {
        int n = values.size();
        Integer[] order = new Integer[n];
        byte[][] hashes = new byte[n][];
        for (int i = 0; i < n; i++) { order[i] = i; hashes[i] = leafHash(values.get(i)); }
        Arrays.sort(order, (x, y) -> compare(hashes[x], hashes[y]));
        byte[][] tree = new byte[2 * n - 1][];
        int[] treeIndex = new int[n];
        for (int i = 0; i < n; i++) {
            tree[tree.length - 1 - i] = hashes[order[i]];
            treeIndex[order[i]] = tree.length - 1 - i;
        }
        for (int i = tree.length - 1 - n; i >= 0; i--) tree[i] = hashPair(tree[2 * i + 1], tree[2 * i + 2]);
        List<String> hex = new ArrayList<>();
        for (byte[] h : tree) hex.add(Numeric.toHexString(h));
        return new Built(hex, treeIndex);
    }

    /** Sibling hashes from a leaf up to the root, the same as OpenZeppelin's getProof. */
    public static List<String> proof(List<String> tree, int index) {
        List<String> out = new ArrayList<>();
        while (index > 0) {
            out.add(tree.get(index % 2 == 1 ? index + 1 : index - 1));
            index = (index - 1) / 2;
        }
        return out;
    }
}
