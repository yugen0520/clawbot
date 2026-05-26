// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ZKPVerifier — Standard interface for on-chain ZK proof verification
/// @notice Defines the interface for verifying zero-knowledge proofs related to
///         AI strategy execution. Supports three verification approaches:
///
///         1. zkTLS — Prove that a specific AI model produced a specific output
///            at a specific time, using TLS session proofs (e.g. TLSNotary).
///         2. zkVM — Prove correct execution of AI inference inside a zkVM
///            (e.g. RiscZero, SP1), generating a succinct proof on-chain.
///         3. Lightweight Commitment — Hash-based commit-reveal with optional
///            reputation-based challenge window (pragmatic hackathon approach).
///
///         StrategyArbiter calls into this contract to verify strategy commitments
///         and proofs before allowing execution to proceed.

interface IZKPVerifier {
    /// @notice Verify a zero-knowledge proof of correct strategy execution
    /// @param proof        The ZK proof bytes (format depends on proof system)
    /// @param publicInputs ABI-encoded public inputs to the proof
    /// @return valid       True if the proof verifies against the public inputs
    function verifyProof(
        bytes calldata proof,
        bytes calldata publicInputs
    ) external view returns (bool valid);

    /// @notice Verify that revealed strategy parameters match a prior commitment
    /// @param commitment   The keccak256 commitment hash made before execution
    /// @param agentId      The agent that executed the strategy
    /// @param strategyId   The strategy identifier
    /// @param amount       The amount allocated
    /// @param apyBps       The achieved APY in basis points
    /// @param salt         The random salt used to blind the commitment
    /// @return valid       True if hash(agentId, strategyId, amount, apyBps, salt) == commitment
    function verifyCommitment(
        bytes32 commitment,
        uint256 agentId,
        bytes32 strategyId,
        uint256 amount,
        uint256 apyBps,
        bytes32 salt
    ) external pure returns (bool valid);

    /// @notice Return the proof system identifier (e.g. "groth16", "plonk", "risc0", "tlsnotary")
    function proofSystem() external pure returns (string memory);
}

/// @title CommitmentVerifier — Lightweight hash-based commitment verification
/// @notice Implements the simplest form of commit-reveal: the bot commits to strategy
///         parameters before execution, reveals them after, and anyone can verify
///         the hash matches. This is the "lightweight" approach from ZKP_PROPOSAL.md.
///
///         Security model:
///         - Commitment binds the bot to specific execution parameters
///         - Reveal + challenge window allows guardians to verify
///         - False commitments can be challenged using ChallengeMechanism
///         - Not as strong as zkTLS/zkVM, but gas-efficient and deployable now
contract CommitmentVerifier is IZKPVerifier {
    /// @notice Placeholder for full ZK proof verification.
    ///         In production, this would call into a SNARK verifier contract
    ///         (e.g. Groth16 verifier for RiscZero or SP1 proofs).
    ///         For hackathon: returns true for zero-length proofs (backward compat),
    ///         reverts for non-empty proofs (not yet integrated).
    function verifyProof(
        bytes calldata proof,
        bytes calldata /* publicInputs */
    ) external pure override returns (bool) {
        if (proof.length == 0) revert("Empty proof not valid");
        revert(unicode"Full ZK proof verification not yet integrated — see ZKP_PROPOSAL.md");
    }

    /// @notice Verify that revealed parameters match the pre-execution commitment.
    ///         commitment = keccak256(abi.encode(agentId, strategyId, amount, apyBps, salt))
    function verifyCommitment(
        bytes32 commitment,
        uint256 agentId,
        bytes32 strategyId,
        uint256 amount,
        uint256 apyBps,
        bytes32 salt
    ) external pure override returns (bool valid) {
        bytes32 recomputed = keccak256(abi.encode(agentId, strategyId, amount, apyBps, salt));
        return recomputed == commitment;
    }

    function proofSystem() external pure override returns (string memory) {
        return "commitment-reveal-v1";
    }

    /// @notice Generate commitment hash off-chain helper (pure, for reference)
    function computeCommitment(
        uint256 agentId,
        bytes32 strategyId,
        uint256 amount,
        uint256 apyBps,
        bytes32 salt
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(agentId, strategyId, amount, apyBps, salt));
    }
}
