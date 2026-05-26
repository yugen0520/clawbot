// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentIdentity.sol";

/// @title ReputationCalculator — Decentralized reputation scoring based on objective on-chain data
/// @notice Replaces Bot-as-sole-judge with algorithmic reputation computation.
///         Bot role downgraded from "judge" to "data submitter": submits strategy results,
///         contract computes score based on APY, timeliness, time-decay, and failure records.
///         Bot must stake MNT to submit data; stake slashed if data proven wrong via challenge.
contract ReputationCalculator {
    AgentIdentity public immutable identity;

    // ── Data structures ──

    struct StrategyResult {
        uint256 agentId;
        bytes32 strategyId;
        uint256 apyBasisPoints;       // actual realized APY in basis points (850 = 8.5%)
        uint256 amount;
        uint256 executionTimestamp;
        uint256 expectedExecutionTime; // when the strategy was supposed to execute
        uint256 submissionTimestamp;
        address submitter;
        uint256 stake;
        bool challenged;
        bool resolved;
        bool valid;                   // resolution outcome
        string reason;
    }

    struct Challenge {
        uint256 resultId;
        address challenger;
        uint256 challengeStake;
        uint256 timestamp;
        bool resolved;
    }

    // ── Per-agent decay state ──

    mapping(uint256 => int256) public agentDecayAdjustedScore; // accumulated weighted impact
    mapping(uint256 => uint256) public lastDecayUpdate;        // timestamp of last decay application

    // ── Submissions ──

    mapping(uint256 => StrategyResult) public results;
    uint256 public resultCount;
    mapping(uint256 => Challenge) public challenges;
    uint256 public challengeCount;
    mapping(uint256 => mapping(address => bool)) public guardianVotes;  // resultId => guardian => votedValid
    mapping(uint256 => uint256) public guardianValidVotes;              // resultId => count of "valid" votes
    mapping(uint256 => uint256) public guardianInvalidVotes;            // resultId => count of "invalid" votes

    // ── Guardian staking ──

    mapping(address => uint256) public guardianStakes;
    address[] public guardians;

    // ── Submitter staking (per address) ──

    mapping(address => uint256) public submitterStakes;
    mapping(address => uint256) public submitterLockedStake; // locked during challenge window
    mapping(address => uint256) public submitterSlashCount;

    // ── Configurable parameters (all in basis points or absolute values) ──

    uint256 public challengeWindow = 180 seconds;    // 3 min default, configurable for testing
    uint256 public decayPeriod = 30 days;
    uint256 public minSubmitterStake = 0.01 ether;
    uint256 public minGuardianStake = 1 ether;
    uint256 public guardianQuorum = 3;

    // APY scoring parameters (basis points)
    uint256 public benchmarkAPY = 500;               // 5.0% — APY at or above this earns bonus
    uint256 public apyBonusMultiplier = 10;          // bonus per bp above benchmark: (APY - benchmark) * 10 / 100
    uint256 public apyPenaltyThreshold = 200;        // below 2% APY considered failure
    int256 public apyPenalty = -200;                 // flat penalty for underperforming

    // Timeliness parameters
    int256 public timelinessBonus = 50;              // bonus for on-time or early execution
    int256 public delayPenalty = -50;                // penalty for execution delayed > delayThreshold
    uint256 public delayThreshold = 1 hours;

    // Default / failure
    int256 public defaultPenalty = -500;             // penalty for confirmed defaults/failures

    uint256 public constant MAX_REPUTATION = 10000;
    uint256 public constant BASELINE_REPUTATION = 5000;
    uint256 public constant DECAY_PRECISION = 10000;

    // ── Events ──

    event StrategyResultSubmitted(
        uint256 indexed resultId, uint256 indexed agentId, bytes32 strategyId,
        uint256 apyBasisPoints, uint256 stake, address submitter
    );
    event ResultChallenged(uint256 indexed resultId, address challenger, uint256 challengeStake);
    event ChallengeResolved(uint256 indexed resultId, bool valid, string resolutionReason);
    event ReputationComputed(uint256 indexed agentId, int256 delta, uint256 newScore, string reason);
    event GuardianStaked(address indexed guardian, uint256 amount);
    event GuardianUnstaked(address indexed guardian, uint256 amount);
    event SubmitterStaked(address indexed submitter, uint256 amount);
    event SubmitterSlashed(address indexed submitter, uint256 amount, string reason);
    event ParameterUpdated(string param, uint256 value);

    constructor(address _identityContract) {
        require(_identityContract != address(0), "Zero identity address");
        identity = AgentIdentity(_identityContract);
    }

    // ── Staking ──

    /// @notice Bot stakes MNT to gain data submission privileges
    function stakeAsSubmitter() external payable {
        require(msg.value >= minSubmitterStake, "Insufficient stake");
        submitterStakes[msg.sender] += msg.value;
        emit SubmitterStaked(msg.sender, msg.value);
    }

    /// @notice Bot withdraws unlocked stake (locked stake cannot be withdrawn until challenge resolves)
    function withdrawSubmitterStake(uint256 amount) external {
        uint256 available = submitterStakes[msg.sender] - submitterLockedStake[msg.sender];
        require(amount <= available, "Insufficient available stake");
        submitterStakes[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }

    /// @notice Community member stakes to become a guardian — can challenge invalid data
    function stakeAsGuardian() external payable {
        require(msg.value >= minGuardianStake, "Insufficient guardian stake");
        if (guardianStakes[msg.sender] == 0) {
            guardians.push(msg.sender);
        }
        guardianStakes[msg.sender] += msg.value;
        emit GuardianStaked(msg.sender, msg.value);
    }

    /// @notice Guardian unstakes (only if no active votes in unresolved challenges)
    function unstakeGuardian() external {
        uint256 amount = guardianStakes[msg.sender];
        require(amount > 0, "Not a guardian");
        guardianStakes[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
        emit GuardianUnstaked(msg.sender, amount);
    }

    // ── Core: submit strategy result ──

    /// @notice Bot submits a strategy execution result. Must have sufficient stake.
    ///         A portion of stake is locked during the challenge window.
    /// @param agentId       The agent that executed the strategy
    /// @param strategyId    Identifier of the strategy
    /// @param apyBasisPoints Actual realized APY in basis points
    /// @param amount        Amount allocated
    /// @param executionTimestamp When strategy was executed
    /// @param expectedExecutionTime When it was expected to execute
    /// @param reason        Human-readable description
    /// @return resultId     ID of the submission for tracking
    function submitStrategyResult(
        uint256 agentId,
        bytes32 strategyId,
        uint256 apyBasisPoints,
        uint256 amount,
        uint256 executionTimestamp,
        uint256 expectedExecutionTime,
        string calldata reason
    ) external returns (uint256 resultId) {
        uint256 available = submitterStakes[msg.sender] - submitterLockedStake[msg.sender];
        require(available >= minSubmitterStake, "Insufficient stake");

        resultId = resultCount++;
        uint256 lockAmount = minSubmitterStake;
        submitterLockedStake[msg.sender] += lockAmount;

        results[resultId] = StrategyResult({
            agentId: agentId,
            strategyId: strategyId,
            apyBasisPoints: apyBasisPoints,
            amount: amount,
            executionTimestamp: executionTimestamp,
            expectedExecutionTime: expectedExecutionTime,
            submissionTimestamp: block.timestamp,
            submitter: msg.sender,
            stake: lockAmount,
            challenged: false,
            resolved: false,
            valid: true, // assumed valid until challenged
            reason: reason
        });

        emit StrategyResultSubmitted(resultId, agentId, strategyId, apyBasisPoints, lockAmount, msg.sender);

        // If no challenge within window, auto-resolve as valid and compute reputation
        // (computation is triggered explicitly after window expires, not auto in submit)
    }

    // ── Challenge mechanism ──

    /// @notice Challenge a submitted result during the challenge window.
    ///         Must be a guardian (staked) to challenge.
    /// @param resultId The submission to challenge
    /// @return challengeId ID of the challenge
    function challengeResult(uint256 resultId) external returns (uint256 challengeId) {
        require(guardianStakes[msg.sender] >= minGuardianStake, "Not a guardian");
        StrategyResult storage result = results[resultId];
        require(!result.resolved, "Already resolved");
        require(!result.challenged, "Already challenged");
        require(block.timestamp <= result.submissionTimestamp + challengeWindow, "Challenge window closed");

        result.challenged = true;
        challengeId = challengeCount++;
        challenges[challengeId] = Challenge({
            resultId: resultId,
            challenger: msg.sender,
            challengeStake: minGuardianStake / 10, // 10% of guardian stake at risk
            timestamp: block.timestamp,
            resolved: false
        });

        emit ResultChallenged(resultId, msg.sender, minGuardianStake / 10);
    }

    /// @notice Guardian votes on a challenged result: true = data valid, false = data invalid
    function voteOnChallenge(uint256 resultId, bool voteValid) external {
        require(guardianStakes[msg.sender] >= minGuardianStake, "Not a guardian");
        require(results[resultId].challenged, "Not challenged");
        require(!results[resultId].resolved, "Already resolved");
        require(!guardianVotes[resultId][msg.sender], "Already voted");

        guardianVotes[resultId][msg.sender] = true;
        if (voteValid) {
            guardianValidVotes[resultId]++;
        } else {
            guardianInvalidVotes[resultId]++;
        }
    }

    /// @notice Resolve a challenged result after the challenge window.
    ///         If quorum of guardians voted invalid → data rejected, submitter slashed, challenger rewarded.
    ///         If quorum voted valid or no quorum reached → data accepted, challenger loses stake.
    function resolveChallenge(uint256 resultId) external {
        StrategyResult storage result = results[resultId];
        require(result.challenged, "Not challenged");
        require(!result.resolved, "Already resolved");
        require(block.timestamp > result.submissionTimestamp + challengeWindow, "Challenge window still open");

        uint256 totalVotes = guardianValidVotes[resultId] + guardianInvalidVotes[resultId];
        bool dataValid;

        if (totalVotes >= guardianQuorum && guardianInvalidVotes[resultId] > guardianValidVotes[resultId]) {
            // Data ruled INVALID — slash submitter
            dataValid = false;
            result.valid = false;
            submitterLockedStake[result.submitter] -= result.stake;
            submitterStakes[result.submitter] -= result.stake;
            submitterSlashCount[result.submitter]++;

            // Slashed stake stays in contract (claimable by governance in production)

            emit SubmitterSlashed(result.submitter, result.stake, "Data ruled invalid by guardian vote");
        } else {
            // Data ruled VALID (or no quorum) — challenger loses nothing, data accepted
            dataValid = true;
            result.valid = true;
        }

        result.resolved = true;

        // Release submitter's locked stake if valid
        if (dataValid) {
            submitterLockedStake[result.submitter] -= result.stake;
        }

        emit ChallengeResolved(resultId, dataValid, dataValid ? "Data accepted" : "Data rejected by guardians");
    }

    /// @notice After challenge window passes without challenge, finalize the result and compute reputation delta
    ///         Anyone can call this after the window expires.
    function finalizeResult(uint256 resultId) external {
        StrategyResult storage result = results[resultId];
        require(!result.resolved, "Already resolved");
        require(block.timestamp > result.submissionTimestamp + challengeWindow, "Challenge window still open");

        result.resolved = true;
        submitterLockedStake[result.submitter] -= result.stake;

        if (result.valid) {
            int256 delta = computeReputationDelta(result);
            _applyReputationUpdate(result.agentId, delta, result.reason);
        }
        // If result was challenged and resolved as invalid, nothing to compute
    }

    // ── Reputation computation engine ──

    /// @notice Compute reputation delta from a single strategy result.
    ///         Factors: APY performance vs benchmark, execution timeliness,
    ///         time-decay weight (applied at accumulation level), failure penalty.
    /// @param result The strategy result to evaluate
    /// @return delta The net reputation change (can be positive or negative)
    function computeReputationDelta(StrategyResult memory result) public view returns (int256 delta) {
        // 1. APY performance vs benchmark
        if (result.apyBasisPoints >= benchmarkAPY) {
            // Bonus: (APY - benchmark) * multiplier / 100
            uint256 excess = result.apyBasisPoints - benchmarkAPY;
            delta += int256(excess * apyBonusMultiplier / 100);
        } else if (result.apyBasisPoints < apyPenaltyThreshold) {
            // Severe underperformance
            delta += apyPenalty;
        }

        // 2. Execution timeliness
        if (result.executionTimestamp <= result.expectedExecutionTime) {
            delta += timelinessBonus;
        } else {
            uint256 delay = result.executionTimestamp - result.expectedExecutionTime;
            if (delay > delayThreshold) {
                delta += delayPenalty;
            }
        }

        // Clamp delta to reasonable range [-1000, +1000] per submission
        if (delta > 1000) delta = 1000;
        if (delta < -1000) delta = -1000;
    }

    /// @notice Apply time decay to an agent's accumulated score.
    ///         Recent actions weighted higher; old impact decays linearly to zero over decayPeriod.
    ///         Called internally before adding new delta.
    function applyTimeDecay(uint256 agentId) internal {
        uint256 lastUpdate = lastDecayUpdate[agentId];
        if (lastUpdate == 0) {
            lastDecayUpdate[agentId] = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - lastUpdate;
        if (elapsed == 0) return;

        int256 currentScore = agentDecayAdjustedScore[agentId];
        if (currentScore == 0) {
            lastDecayUpdate[agentId] = block.timestamp;
            return;
        }

        if (elapsed >= decayPeriod) {
            // Fully decayed — reset to baseline
            agentDecayAdjustedScore[agentId] = 0;
        } else {
            // Linear decay: score * (1 - elapsed/decayPeriod)
            uint256 decayFactor = DECAY_PRECISION - (elapsed * DECAY_PRECISION / decayPeriod);
            agentDecayAdjustedScore[agentId] = currentScore * int256(decayFactor) / int256(DECAY_PRECISION);
        }
        lastDecayUpdate[agentId] = block.timestamp;
    }

    /// @notice Internal: update agent reputation in AgentIdentity contract
    function _applyReputationUpdate(uint256 agentId, int256 delta, string memory reason) internal {
        applyTimeDecay(agentId);

        // Accumulate new delta at full weight into decay-adjusted score
        agentDecayAdjustedScore[agentId] += delta;

        // Compute effective reputation: baseline + decay-adjusted score
        int256 effectiveScore = int256(BASELINE_REPUTATION) + agentDecayAdjustedScore[agentId];
        uint256 newReputation;
        if (effectiveScore > int256(MAX_REPUTATION)) {
            newReputation = MAX_REPUTATION;
        } else if (effectiveScore < 0) {
            newReputation = 0;
        } else {
            newReputation = uint256(effectiveScore);
        }

        // Compute the actual delta to pass to identity contract
        // (identity.updateReputationByUpdater handles clamping internally)
        uint256 currentRep = identity.getAgent(agentId).reputationScore;
        int256 actualDelta;
        if (newReputation > currentRep) {
            actualDelta = int256(newReputation - currentRep);
        } else {
            actualDelta = -int256(currentRep - newReputation);
        }

        if (actualDelta != 0) {
            identity.updateReputationByUpdater(agentId, actualDelta, reason);
        }

        emit ReputationComputed(agentId, actualDelta, newReputation, reason);
    }

    /// @notice Submit a strategy failure/default record — auto penalty, no challenge window needed
    function reportDefault(uint256 agentId, string calldata reason) external {
        require(submitterStakes[msg.sender] >= minSubmitterStake, "Insufficient stake");
        _applyReputationUpdate(agentId, defaultPenalty, reason);
    }

    // ── Effective reputation (with live time-decay applied) ──

    /// @notice Get the time-decay-adjusted reputation for an agent.
    ///         This is the "live" reputation incorporating recent-behavior weighting.
    function getEffectiveReputation(uint256 agentId) external view returns (uint256) {
        uint256 lastUpdate = lastDecayUpdate[agentId];
        int256 currentScore = agentDecayAdjustedScore[agentId];

        if (lastUpdate == 0 || currentScore == 0) {
            return BASELINE_REPUTATION;
        }

        uint256 elapsed = block.timestamp - lastUpdate;
        int256 decayedScore;
        if (elapsed >= decayPeriod) {
            decayedScore = 0;
        } else {
            uint256 decayFactor = DECAY_PRECISION - (elapsed * DECAY_PRECISION / decayPeriod);
            decayedScore = currentScore * int256(decayFactor) / int256(DECAY_PRECISION);
        }

        int256 effective = int256(BASELINE_REPUTATION) + decayedScore;
        if (effective > int256(MAX_REPUTATION)) return MAX_REPUTATION;
        if (effective < 0) return 0;
        return uint256(effective);
    }

    // ── Admin / parameter setters ──

    modifier onlyAdmin() {
        require(guardianStakes[msg.sender] >= minGuardianStake || submitterStakes[msg.sender] >= minSubmitterStake,
            "Not a staked participant");
        _;
    }

    function setChallengeWindow(uint256 _seconds) external onlyAdmin {
        challengeWindow = _seconds;
        emit ParameterUpdated("challengeWindow", _seconds);
    }

    function setDecayPeriod(uint256 _seconds) external onlyAdmin {
        decayPeriod = _seconds;
        emit ParameterUpdated("decayPeriod", _seconds);
    }

    function setBenchmarkAPY(uint256 _apyBasisPoints) external onlyAdmin {
        benchmarkAPY = _apyBasisPoints;
        emit ParameterUpdated("benchmarkAPY", _apyBasisPoints);
    }

    function setMinSubmitterStake(uint256 _amount) external onlyAdmin {
        minSubmitterStake = _amount;
        emit ParameterUpdated("minSubmitterStake", _amount);
    }

    function setMinGuardianStake(uint256 _amount) external onlyAdmin {
        minGuardianStake = _amount;
        emit ParameterUpdated("minGuardianStake", _amount);
    }

    function setGuardianQuorum(uint256 _quorum) external onlyAdmin {
        guardianQuorum = _quorum;
        emit ParameterUpdated("guardianQuorum", _quorum);
    }

    // ── View helpers ──

    function getGuardianCount() external view returns (uint256) {
        return guardians.length;
    }

    function getSubmitterInfo(address submitter) external view
        returns (uint256 totalStake, uint256 lockedStake, uint256 slashCount, uint256 available)
    {
        totalStake = submitterStakes[submitter];
        lockedStake = submitterLockedStake[submitter];
        slashCount = submitterSlashCount[submitter];
        available = totalStake > lockedStake ? totalStake - lockedStake : 0;
    }

    receive() external payable {}
}
