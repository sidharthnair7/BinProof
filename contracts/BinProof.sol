// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title BinProof
/// @notice Two parties who don't trust each other's numbers each sign their own measurement of
/// one pickup. The building's bin commits what its AI saw (a Merkle root of disposal events,
/// photos kept off-chain). The recycling facility reports what it measured. If they agree within
/// a tolerance the batch is verified and exactly one diversion claim can be issued. If not, it is
/// flagged and nothing can be claimed.
contract BinProof {
    enum Status { None, Committed, Verified, Flagged }

    struct Batch {
        bytes32 root;          // Merkle root of the disposal events in this pickup
        uint32 items;          // events in the batch
        uint32 contaminated;   // events the bin's AI flagged as contamination
        bytes32 modelId;       // which model made the verdicts
        uint16 facilityBps;    // contamination the facility measured, in basis points
        Status status;
        bool claimed;
    }

    address public immutable building;   // signs what the bin saw
    address public immutable facility;   // signs what the facility measured
    uint16 public immutable toleranceBps;

    mapping(bytes32 => Batch) public batches;

    event BatchCommitted(bytes32 indexed batchId, bytes32 root, uint32 items, uint32 contaminated, bytes32 modelId);
    event MeasurementReported(bytes32 indexed batchId, uint16 facilityBps, uint16 binBps);
    event BatchVerified(bytes32 indexed batchId);
    event BatchFlagged(bytes32 indexed batchId, uint16 binBps, uint16 facilityBps);
    event ClaimIssued(bytes32 indexed batchId, bytes32 claimId, address to);

    error NotBuilding();
    error NotFacility();
    error AlreadyCommitted();
    error NotCommitted();
    error NotVerified();
    error AlreadyClaimed();
    error BadCounts();

    constructor(address building_, address facility_, uint16 toleranceBps_) {
        building = building_;
        facility = facility_;
        toleranceBps = toleranceBps_;
    }

    function commitBatch(bytes32 batchId, bytes32 root, uint32 items, uint32 contaminated, bytes32 modelId) external {
        if (msg.sender != building) revert NotBuilding();
        if (batches[batchId].status != Status.None) revert AlreadyCommitted();
        if (items == 0 || contaminated > items) revert BadCounts();
        batches[batchId] = Batch(root, items, contaminated, modelId, 0, Status.Committed, false);
        emit BatchCommitted(batchId, root, items, contaminated, modelId);
    }

    function reportMeasurement(bytes32 batchId, uint16 facilityBps) external {
        if (msg.sender != facility) revert NotFacility();
        Batch storage b = batches[batchId];
        if (b.status != Status.Committed) revert NotCommitted();
        uint16 binBps = binContaminationBps(batchId);
        b.facilityBps = facilityBps;
        emit MeasurementReported(batchId, facilityBps, binBps);
        uint16 gap = binBps > facilityBps ? binBps - facilityBps : facilityBps - binBps;
        if (gap <= toleranceBps) {
            b.status = Status.Verified;
            emit BatchVerified(batchId);
        } else {
            b.status = Status.Flagged;
            emit BatchFlagged(batchId, binBps, facilityBps);
        }
    }

    /// @notice One verified batch, one claim. A second call reverts.
    function issueClaim(bytes32 batchId, address to) external returns (bytes32 claimId) {
        Batch storage b = batches[batchId];
        if (b.status != Status.Verified) revert NotVerified();
        if (b.claimed) revert AlreadyClaimed();
        b.claimed = true;
        claimId = keccak256(abi.encode(address(this), batchId, b.root));
        emit ClaimIssued(batchId, claimId, to);
    }

    /// @notice Anyone holding a receipt can check their disposal event is inside a committed batch.
    function verifyEvent(bytes32 batchId, bytes32 leaf, bytes32[] calldata proof) external view returns (bool) {
        Batch storage b = batches[batchId];
        return b.status != Status.None && MerkleProof.verify(proof, b.root, leaf);
    }

    function binContaminationBps(bytes32 batchId) public view returns (uint16) {
        Batch storage b = batches[batchId];
        if (b.items == 0) return 0;
        return uint16((uint256(b.contaminated) * 10000) / b.items);
    }
}
