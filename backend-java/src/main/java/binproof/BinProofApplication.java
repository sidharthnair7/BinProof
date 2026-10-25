package binproof;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** BinProof backend in Spring Boot: the bin's verdict, the ledger, and the two signers. */
@SpringBootApplication
public class BinProofApplication {
    public static void main(String[] args) {
        SpringApplication.run(BinProofApplication.class, args);
    }
}
