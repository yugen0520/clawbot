// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EconomicModel — Protocol fee structure and value capture
/// @notice Defines the economic rules for the ClawBot protocol:
///         1. Agent identity registration fee (one-time, configurable)
///         2. Reputation data query fee (per query, prevents spam)
///         3. Agent service matching fee (percentage of transaction volume)
///
///         Fees are distributed among: protocol treasury, guardian nodes,
///         and high-reputation agents as incentives.
///         Distribution ratios are governance-controlled.
interface IEconomicModel {
    /// @notice Charge the one-time Agent registration fee
    function chargeRegistrationFee(address payer, uint256 agentId) external payable;

    /// @notice Charge a per-query fee for reading reputation data
    function chargeQueryFee(address payer) external payable;

    /// @notice Charge a matching fee as percentage of transaction amount
    function chargeMatchingFee(address payer, uint256 agentA, uint256 agentB, uint256 amount) external payable;

    /// @notice Distribute accumulated fees according to configured ratios
    function distributeFees() external;

    /// @notice Get current fee parameters
    function getFeeParams() external view returns (
        uint256 registrationFee,
        uint256 queryFee,
        uint256 matchingFeeBasisPoints,
        uint256 treasuryShare,
        uint256 guardianShare,
        uint256 agentIncentiveShare
    );
}

/// @title EconomicModel — Concrete implementation of protocol economics
/// @notice Implements IEconomicModel with governance-controlled fee distribution.
///         Revenue streams:
///         - Registration fee: paid once when an Agent registers on-chain
///         - Query fee: paid per reputation lookup (rate-limiting / anti-spam)
///         - Matching fee: basis points of transaction amount when Agent A
///           recommends Agent B's services
///
///         Distribution:
///         - treasuryShare → protocol treasury (upgrades, buybacks, ecosystem fund)
///         - guardianShare → distributed to active guardians proportionally
///         - agentIncentiveShare → distributed to top-N agents by reputation
///
///         All ratios sum to 10000 bps, governance-adjustable.
///         Extension point: could integrate a governance token for voting on parameters.
contract EconomicModel is IEconomicModel {
    // ── Fee parameters (configurable) ──

    uint256 public registrationFee = 0.001 ether;          // one-time Agent creation fee
    uint256 public queryFee = 0.0001 ether;               // per reputation lookup
    uint256 public matchingFeeBasisPoints = 10;           // 0.1% of transaction amount

    // ── Distribution ratios (basis points, must sum to 10000) ──

    uint256 public treasuryShare = 5000;   // 50% to treasury
    uint256 public guardianShare = 3000;   // 30% to guardians
    uint256 public agentIncentiveShare = 2000; // 20% to high-reputation agents

    uint256 public constant TOTAL_BPS = 10000;

    // ── Accumulated fee pools ──

    uint256 public pendingTreasuryFees;
    uint256 public pendingGuardianFees;
    uint256 public pendingAgentIncentives;

    // ── Treasury ──

    address public treasury;

    // ── Guardian tracking for distribution ──

    mapping(address => uint256) public guardianAccumulatedRewards;

    // ── Agent incentive tracking ──

    mapping(uint256 => uint256) public agentAccumulatedIncentives;
    uint256 public topAgentCount = 10; // top N agents share incentives

    // ── Total collected ──

    uint256 public totalFeesCollected;
    uint256 public totalFeesDistributed;

    // ── Events ──

    event RegistrationFeeCharged(address payer, uint256 agentId, uint256 amount);
    event QueryFeeCharged(address payer, uint256 amount);
    event MatchingFeeCharged(address payer, uint256 agentA, uint256 agentB, uint256 amount, uint256 fee);
    event FeesDistributed(uint256 treasury, uint256 guardians, uint256 agents);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event DistributionRatiosUpdated(uint256 treasury, uint256 guardian, uint256 agent);
    event FeeParamsUpdated(uint256 registrationFee, uint256 queryFee, uint256 matchingFee);
    event GuardianRewardClaimed(address guardian, uint256 amount);
    event AgentIncentiveClaimed(uint256 agentId, uint256 amount);

    modifier onlyGovernance() {
        // In production: check governance contract / DAO vote.
        // For hackathon: the deployer is governance.
        require(msg.sender == treasury || treasury == address(0), "Not governance");
        _;
    }

    constructor(address _treasury) {
        treasury = _treasury;
    }

    // ── Fee collection ──

    /// @notice Charge one-time Agent registration fee. Fee goes into distribution pools.
    function chargeRegistrationFee(address payer, uint256 agentId) external payable {
        require(msg.value >= registrationFee, "Insufficient registration fee");
        _allocateFee(msg.value);
        totalFeesCollected += msg.value;
        emit RegistrationFeeCharged(payer, agentId, msg.value);
    }

    /// @notice Charge per-query fee for reputation data access. Prevents spam queries.
    function chargeQueryFee(address payer) external payable {
        require(msg.value >= queryFee, "Insufficient query fee");
        _allocateFee(msg.value);
        totalFeesCollected += msg.value;
        emit QueryFeeCharged(payer, msg.value);
    }

    /// @notice Charge matching fee when Agent A recommends Agent B's services.
    ///         Fee is basis points of the transaction amount.
    function chargeMatchingFee(address payer, uint256 agentA, uint256 agentB, uint256 amount) external payable {
        uint256 expectedFee = amount * matchingFeeBasisPoints / TOTAL_BPS;
        require(msg.value >= expectedFee, "Insufficient matching fee");
        _allocateFee(msg.value);
        totalFeesCollected += msg.value;
        emit MatchingFeeCharged(payer, agentA, agentB, amount, msg.value);
    }

    /// @notice Allocate received fee across the three distribution pools
    function _allocateFee(uint256 amount) internal {
        pendingTreasuryFees += amount * treasuryShare / TOTAL_BPS;
        pendingGuardianFees += amount * guardianShare / TOTAL_BPS;
        pendingAgentIncentives += amount * agentIncentiveShare / TOTAL_BPS;
    }

    // ── Fee distribution ──

    /// @notice Distribute accumulated fees to treasury (direct transfer).
    ///         Guardian and agent pools require separate claim transactions.
    function distributeFees() external {
        uint256 treasuryAmount = pendingTreasuryFees;
        pendingTreasuryFees = 0;
        totalFeesDistributed += treasuryAmount;

        if (treasuryAmount > 0 && treasury != address(0)) {
            payable(treasury).transfer(treasuryAmount);
        }

        emit FeesDistributed(treasuryAmount, pendingGuardianFees, pendingAgentIncentives);
    }

    /// @notice Guardian claims their share of accumulated guardian fees.
    ///         Distribution is equal among all guardians (simplified; in production:
    ///         weighted by stake amount or participation in challenges).
    function claimGuardianRewards(address guardian, uint256 totalGuardians) external {
        require(totalGuardians > 0, "No guardians");
        uint256 share = pendingGuardianFees / totalGuardians;
        require(share > 0, "No rewards");
        pendingGuardianFees -= share;
        guardianAccumulatedRewards[guardian] += share;
        payable(guardian).transfer(share);
        emit GuardianRewardClaimed(guardian, share);
    }

    /// @notice Agent claims accumulated incentive rewards.
    function claimAgentIncentives(uint256 agentId) external {
        uint256 amount = agentAccumulatedIncentives[agentId];
        require(amount > 0, "No incentives");
        agentAccumulatedIncentives[agentId] = 0;
        payable(msg.sender).transfer(amount);
        emit AgentIncentiveClaimed(agentId, amount);
    }

    /// @notice Governance allocates agent incentive pool to specific top-performing agents.
    ///         Called periodically (e.g., end of epoch) with ranked agent list.
    function allocateAgentIncentives(uint256[] calldata agentIds, address[] calldata agentOwners) external onlyGovernance {
        require(agentIds.length > 0, "Empty list");
        require(agentIds.length == agentOwners.length, "Length mismatch");
        uint256 total = pendingAgentIncentives;
        uint256 perAgent = total / agentIds.length;
        pendingAgentIncentives = 0;

        for (uint256 i = 0; i < agentIds.length; i++) {
            agentAccumulatedIncentives[agentIds[i]] += perAgent;
        }
    }

    // ── Governance setters ──

    function setTreasury(address _treasury) external onlyGovernance {
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function setDistributionRatios(uint256 _treasury, uint256 _guardian, uint256 _agent) external onlyGovernance {
        require(_treasury + _guardian + _agent == TOTAL_BPS, "Must sum to 10000");
        treasuryShare = _treasury;
        guardianShare = _guardian;
        agentIncentiveShare = _agent;
        emit DistributionRatiosUpdated(_treasury, _guardian, _agent);
    }

    function setFeeParams(uint256 _registration, uint256 _query, uint256 _matchingBps) external onlyGovernance {
        registrationFee = _registration;
        queryFee = _query;
        matchingFeeBasisPoints = _matchingBps;
        emit FeeParamsUpdated(_registration, _query, _matchingBps);
    }

    function setTopAgentCount(uint256 _count) external onlyGovernance {
        topAgentCount = _count;
    }

    // ── View ──

    function getFeeParams() external view returns (
        uint256 _registrationFee,
        uint256 _queryFee,
        uint256 _matchingFeeBasisPoints,
        uint256 _treasuryShare,
        uint256 _guardianShare,
        uint256 _agentIncentiveShare
    ) {
        return (registrationFee, queryFee, matchingFeeBasisPoints, treasuryShare, guardianShare, agentIncentiveShare);
    }

    function getPendingPools() external view returns (uint256 treasuryPool, uint256 guardianPool, uint256 agentPool) {
        return (pendingTreasuryFees, pendingGuardianFees, pendingAgentIncentives);
    }

    receive() external payable {
        // Accept direct fee payments — allocated using default ratios
        _allocateFee(msg.value);
        totalFeesCollected += msg.value;
    }
}
