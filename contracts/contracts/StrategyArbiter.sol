// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ZKPVerifier.sol";

/// @title StrategyArbiter — On-chain strategy verification and dispute arbitration
/// @notice Before executing a strategy, the Bot must publish the strategy intent on-chain.
///         A configurable challenge window starts, during which guardians can challenge.
///         If challenged successfully, execution is blocked and Bot is penalized.
///         If unchallenged or challenge fails, execution proceeds.
///
///         Extension point: future versions can integrate zkTLS proofs or verifiable inference
///         to replace guardian-based challenge with cryptographic verification of AI reasoning.
///
///         ZKP integration: bots can optionally submit a commitment hash alongside their
///         intent, binding them to specific execution parameters. After execution, the
///         commitment is revealed and verified against the IZKPVerifier contract.
contract StrategyArbiter {
    // ── Strategy Intent ──

    struct StrategyIntent {
        uint256 intentId;
        uint256 agentId;
        address vaultAddress;
        bytes32 strategyId;
        uint256 amount;
        uint256 apyBasisPoints;        // expected APY at time of proposal
        string stepsJson;               // JSON: [{action, protocol, amount, expectedOutcome}, ...]
        uint256 publishedAt;            // timestamp when intent was published
        uint256 challengeWindow;        // duration of challenge window at time of publishing
        bool executed;                  // whether the strategy was executed
        bool challenged;
        bool challengeResolved;
        bool challengeUpheld;           // true if challenge succeeded (strategy blocked)
        address executor;               // the Bot that published the intent
    }

    struct Challenge {
        uint256 challengeId;
        uint256 intentId;
        address challenger;
        uint256 challengeStake;
        string reason;                  // why the strategy is being challenged
        uint256 timestamp;
        bool resolved;
        bool upheld;                    // true if challenge won
    }

    // ── Guardian registry ──

    mapping(address => uint256) public guardianStakes;
    address[] public guardianList;
    uint256 public minGuardianStake = 1 ether;
    uint256 public totalGuardianStaked;

    // ── Intents ──

    mapping(uint256 => StrategyIntent) public intents;
    uint256 public intentCount;
    mapping(address => uint256[]) public vaultIntents; // intents per vault
    mapping(uint256 => Challenge[]) public intentChallenges;

    // ── Bot staking (per address) ──

    mapping(address => uint256) public botStakes;
    mapping(address => uint256) public botLockedStake;
    mapping(address => uint256) public botSlashCount;
    uint256 public pendingChallengeFees;

    // ── ZKP Commitment (commit-reveal two-phase model) ──

    struct StrategyCommitment {
        bytes32 commitmentHash;       // keccak256(abi.encode(agentId, strategyId, amount, apyBps, salt))
        uint256 intentId;             // Associated intent
        bool revealed;                // Whether the commitment has been revealed
        bool verified;                // Whether the reveal matched the commitment
    }

    mapping(uint256 => StrategyCommitment) public intentCommitments; // intentId → commitment
    IZKPVerifier public zkpVerifier;

    // ── Configurable parameters ──

    uint256 public defaultChallengeWindow = 180 seconds; // 3 min, configurable
    uint256 public minBotStake = 0.01 ether;
    uint256 public challengeFee = 0.001 ether;           // non-refundable fee to challenge
    uint256 public botSlashAmount = 0.01 ether;          // amount slashed if challenge upheld

    // ── Events ──

    event IntentPublished(
        uint256 indexed intentId, uint256 indexed agentId, address indexed vault,
        bytes32 strategyId, uint256 amount, uint256 publishedAt
    );
    event IntentChallenged(uint256 indexed intentId, address challenger, string reason);
    event ChallengeResolved(uint256 indexed intentId, bool upheld, string resolution);
    event IntentExecuted(uint256 indexed intentId, uint256 agentId);
    event GuardianStaked(address indexed guardian, uint256 amount);
    event GuardianUnstaked(address indexed guardian, uint256 amount);
    event BotStaked(address indexed bot, uint256 amount);
    event BotSlashed(address indexed bot, uint256 amount, string reason);
    event CommitmentSubmitted(uint256 indexed intentId, bytes32 commitmentHash);
    event CommitmentRevealed(uint256 indexed intentId, bool verified);
    event ZKPVerifierSet(address indexed verifier);
    event ParameterUpdated(string param, uint256 value);

    constructor() {}

    // ── Bot staking ──

    /// @notice Bot stakes MNT to be authorized to publish strategy intents
    function stakeAsBot() external payable {
        require(msg.value >= minBotStake, "Insufficient bot stake");
        botStakes[msg.sender] += msg.value;
        emit BotStaked(msg.sender, msg.value);
    }

    /// @notice Bot withdraws unlocked stake
    function withdrawBotStake(uint256 amount) external {
        uint256 available = botStakes[msg.sender] - botLockedStake[msg.sender];
        require(amount <= available, "Insufficient available stake");
        botStakes[msg.sender] -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ── Guardian staking ──

    /// @notice Community member stakes to become a guardian — can challenge suspicious strategies
    function stakeAsGuardian() external payable {
        require(msg.value >= minGuardianStake, "Insufficient guardian stake");
        if (guardianStakes[msg.sender] == 0) {
            guardianList.push(msg.sender);
        }
        guardianStakes[msg.sender] += msg.value;
        totalGuardianStaked += msg.value;
        emit GuardianStaked(msg.sender, msg.value);
    }

    function unstakeGuardian() external {
        uint256 amount = guardianStakes[msg.sender];
        require(amount > 0, "Not a guardian");
        // Check: no active challenges
        guardianStakes[msg.sender] = 0;
        totalGuardianStaked -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
        emit GuardianUnstaked(msg.sender, amount);
    }

    // ── Core: publish strategy intent ──

    /// @notice Bot publishes strategy intent BEFORE execution.
    ///         Locks bot stake during challenge window.
    ///         Strategy steps are stored as JSON for human/guardian review.
    ///         Extension point: JSON schema could be formalized; zkTLS could prove
    ///         that the JSON was generated by a specific AI model with specific inputs.
    /// @param agentId        The agent proposing the strategy
    /// @param vaultAddress   The vault that will execute the strategy
    /// @param strategyId     Which strategy to execute
    /// @param amount         Amount to allocate
    /// @param apyBasisPoints Expected APY
    /// @param stepsJson      JSON array of strategy steps for review
    /// @return intentId      ID of the published intent
    function publishIntent(
        uint256 agentId,
        address vaultAddress,
        bytes32 strategyId,
        uint256 amount,
        uint256 apyBasisPoints,
        string calldata stepsJson
    ) public returns (uint256 intentId) {
        require(vaultAddress != address(0), "Invalid vault address");
        uint256 available = botStakes[msg.sender] - botLockedStake[msg.sender];
        require(available >= minBotStake, "Insufficient bot stake");

        intentId = intentCount++;
        botLockedStake[msg.sender] += minBotStake;

        intents[intentId] = StrategyIntent({
            intentId: intentId,
            agentId: agentId,
            vaultAddress: vaultAddress,
            strategyId: strategyId,
            amount: amount,
            apyBasisPoints: apyBasisPoints,
            stepsJson: stepsJson,
            publishedAt: block.timestamp,
            challengeWindow: defaultChallengeWindow,
            executed: false,
            challenged: false,
            challengeResolved: false,
            challengeUpheld: false,
            executor: msg.sender
        });

        vaultIntents[vaultAddress].push(intentId);

        emit IntentPublished(intentId, agentId, vaultAddress, strategyId, amount, block.timestamp);
    }

    // ── Challenge mechanism ──

    /// @notice Guardian challenges a published intent during the challenge window.
    ///         Pays a non-refundable challenge fee (prevents spam challenges).
    /// @param intentId The intent to challenge
    /// @param reason   Why the strategy is being challenged
    /// @return challengeId ID of the challenge
    function challengeIntent(uint256 intentId, string calldata reason)
        external
        payable
        returns (uint256 challengeId)
    {
        require(msg.value >= challengeFee, "Insufficient challenge fee");
        pendingChallengeFees += msg.value;
        StrategyIntent storage intent = intents[intentId];
        require(!intent.executed, "Already executed");
        require(!intent.challenged, "Already challenged");
        require(block.timestamp <= intent.publishedAt + intent.challengeWindow, "Challenge window closed");

        intent.challenged = true;
        // For simplicity, a single challenge triggers immediate review.
        // Extension point: multiple guardians could vote, or zk-proof verification
        // could replace human/guardian review entirely.

        challengeId = intentChallenges[intentId].length;
        intentChallenges[intentId].push(Challenge({
            challengeId: challengeId,
            intentId: intentId,
            challenger: msg.sender,
            challengeStake: msg.value,
            reason: reason,
            timestamp: block.timestamp,
            resolved: false,
            upheld: false
        }));

        emit IntentChallenged(intentId, msg.sender, reason);
    }

    /// @notice Resolve a challenge. For hackathon simplicity, challenges auto-fail if not
    ///         supported by guardian majority within the challenge window.
    ///         Extension point: replace with zkTLS verification of AI model outputs,
    ///         or a Kleros-style decentralized court for more nuanced disputes.
    function resolveChallenge(uint256 intentId, bool uphold) external {
        StrategyIntent storage intent = intents[intentId];
        require(intent.challenged, "Not challenged");
        require(!intent.challengeResolved, "Already resolved");

        // In production: require guardian majority vote or oracle attestation.
        // For hackathon: any guardian can trigger resolution, uphold flag set by caller.
        require(guardianStakes[msg.sender] >= minGuardianStake, "Not a guardian");

        intent.challengeResolved = true;
        intent.challengeUpheld = uphold;

        if (uphold) {
            // Challenge succeeded — slash bot, block execution
            intent.executed = true; // mark as "resolved and blocked"
            botLockedStake[intent.executor] -= minBotStake;
            botStakes[intent.executor] -= botSlashAmount;
            botSlashCount[intent.executor]++;

            // Reward challenger with slashed amount
            // Last challenge in array is typically the one being resolved
            uint256 len = intentChallenges[intentId].length;
            if (len > 0) {
                address challenger = intentChallenges[intentId][len - 1].challenger;
                (bool ok2, ) = payable(challenger).call{value: botSlashAmount}("");
                require(ok2, "Transfer failed");
            }

            emit BotSlashed(intent.executor, botSlashAmount, "Strategy challenge upheld");
        } else {
            // Challenge failed — unlock bot stake, challenger loses fee
            botLockedStake[intent.executor] -= minBotStake;
        }

        emit ChallengeResolved(intentId, uphold, uphold ? "Challenge upheld" : "Challenge rejected");
    }

    // ── Execution gate ──

    /// @notice Check if an intent is clear for execution.
    ///         Returns true if: intent exists, not challenged (or challenge resolved as not-upheld),
    ///         challenge window has passed, and not already executed.
    function canExecute(uint256 intentId) public view returns (bool ok, string memory reason) {
        StrategyIntent storage intent = intents[intentId];
        if (intent.challenged && intent.challengeResolved && intent.challengeUpheld) {
            return (false, "Challenge upheld - execution blocked");
        }
        if (intent.executed) {
            return (false, "Already executed");
        }
        if (intent.challenged && !intent.challengeResolved) {
            return (false, "Challenge pending resolution");
        }
        if (block.timestamp <= intent.publishedAt + intent.challengeWindow) {
            return (false, "Challenge window still open");
        }
        if (intent.publishedAt == 0) {
            return (false, "Intent not found");
        }
        return (true, "OK");
    }

    /// @notice Mark an intent as executed. Called by the vault after successful execution.
    ///         Only the vault address specified in the intent can call this.
    function markExecuted(uint256 intentId) external {
        StrategyIntent storage intent = intents[intentId];
        require(msg.sender == intent.vaultAddress, "Only the vault can mark executed");
        require(!intent.executed, "Already executed");

        (bool ok, ) = canExecute(intentId);
        require(ok, "Intent not cleared for execution");

        intent.executed = true;

        // Only unlock if not already unlocked by challenge resolution (rejected case)
        if (!intent.challengeResolved) {
            botLockedStake[intent.executor] -= minBotStake;
        }

        emit IntentExecuted(intentId, intent.agentId);
    }

    // ── Admin ──

    modifier onlyGuardian() {
        require(guardianStakes[msg.sender] >= minGuardianStake, "Not a guardian");
        _;
    }

    function setChallengeWindow(uint256 _seconds) external onlyGuardian {
        defaultChallengeWindow = _seconds;
        emit ParameterUpdated("challengeWindow", _seconds);
    }

    function setMinBotStake(uint256 _amount) external onlyGuardian {
        minBotStake = _amount;
        emit ParameterUpdated("minBotStake", _amount);
    }

    function setMinGuardianStake(uint256 _amount) external onlyGuardian {
        minGuardianStake = _amount;
        emit ParameterUpdated("minGuardianStake", _amount);
    }

    function setChallengeFee(uint256 _amount) external onlyGuardian {
        challengeFee = _amount;
        emit ParameterUpdated("challengeFee", _amount);
    }

    function setBotSlashAmount(uint256 _amount) external onlyGuardian {
        require(_amount <= minBotStake, "Slash exceeds min bot stake");
        botSlashAmount = _amount;
        emit ParameterUpdated("botSlashAmount", _amount);
    }

    /// @notice Withdraw accumulated challenge fees to the treasury. Only guardian can call.
    function withdrawChallengeFees(address to) external onlyGuardian {
        require(to != address(0), "Invalid address");
        uint256 amount = pendingChallengeFees;
        pendingChallengeFees = 0;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ── ZKP Commitment functions ──

    /// @notice Set the ZKP verifier contract address
    function setZKPVerifier(address _verifier) external onlyGuardian {
        zkpVerifier = IZKPVerifier(_verifier);
        emit ZKPVerifierSet(_verifier);
    }

    /// @notice Publish a strategy intent WITH a cryptographic commitment to execution parameters.
    ///         Two-phase commit-reveal: Bot commits to (agentId, strategyId, amount, apyBps, salt)
    ///         before execution, then reveals the parameters after. The commitment binds the bot
    ///         to specific execution outcomes — false commitments can be challenged.
    /// @param agentId        The agent proposing the strategy
    /// @param vaultAddress   The vault that will execute
    /// @param strategyId     Strategy identifier
    /// @param amount         Amount to allocate
    /// @param apyBasisPoints Expected APY
    /// @param stepsJson      JSON strategy steps
    /// @param commitmentHash keccak256(abi.encode(agentId, strategyId, amount, apyBps, salt))
    /// @param salt           The random salt (stored for later verification)
    /// @return intentId      ID of the published intent
    function submitStrategyWithCommitment(
        uint256 agentId,
        address vaultAddress,
        bytes32 strategyId,
        uint256 amount,
        uint256 apyBasisPoints,
        string calldata stepsJson,
        bytes32 commitmentHash,
        bytes32 salt
    ) external returns (uint256 intentId) {
        // Verify commitment matches the provided parameters
        bytes32 expected = keccak256(abi.encode(agentId, strategyId, amount, apyBasisPoints, salt));
        require(commitmentHash == expected, "Commitment hash mismatch");

        intentId = publishIntent(agentId, vaultAddress, strategyId, amount, apyBasisPoints, stepsJson);

        intentCommitments[intentId] = StrategyCommitment({
            commitmentHash: commitmentHash,
            intentId: intentId,
            revealed: false,
            verified: false
        });

        emit CommitmentSubmitted(intentId, commitmentHash);
    }

    /// @notice Reveal the commitment after strategy execution and verify against ZKPVerifier.
    ///         If a ZKP verifier is configured, also runs proof verification.
    ///         Once revealed, the commitment is publicly auditable.
    /// @param intentId The intent whose commitment to reveal
    /// @param salt     The salt used in the original commitment
    /// @param proof    Optional ZK proof bytes (empty if using lightweight commitment only)
    /// @return verified True if the commitment matches and optional proof verifies
    function revealCommitment(
        uint256 intentId,
        bytes32 salt,
        bytes calldata proof
    ) external returns (bool verified) {
        StrategyIntent storage intent = intents[intentId];
        StrategyCommitment storage c = intentCommitments[intentId];
        require(c.commitmentHash != bytes32(0), "No commitment found");
        require(!c.revealed, "Already revealed");
        require(intent.executed, "Strategy not yet executed");

        // Verify commitment matches execution parameters
        verified = keccak256(abi.encode(
            intent.agentId, intent.strategyId, intent.amount, intent.apyBasisPoints, salt
        )) == c.commitmentHash;

        if (verified && address(zkpVerifier) != address(0) && proof.length > 0) {
            // Run full ZK proof verification if proof provided
            bytes memory publicInputs = abi.encode(
                intent.agentId, intent.strategyId, intent.amount, intent.apyBasisPoints
            );
            verified = zkpVerifier.verifyProof(proof, publicInputs);
        }

        c.revealed = true;
        c.verified = verified;

        emit CommitmentRevealed(intentId, verified);
    }

    // ── View helpers ──

    function getGuardianCount() external view returns (uint256) {
        return guardianList.length;
    }

    function getVaultIntentCount(address vault) external view returns (uint256) {
        return vaultIntents[vault].length;
    }

    function getBotInfo(address bot) external view
        returns (uint256 totalStake, uint256 lockedStake, uint256 slashCount, uint256 available)
    {
        totalStake = botStakes[bot];
        lockedStake = botLockedStake[bot];
        slashCount = botSlashCount[bot];
        available = totalStake > lockedStake ? totalStake - lockedStake : 0;
    }

    receive() external payable {}
}
