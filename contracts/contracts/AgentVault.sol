// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentIdentity.sol";
import "./StrategyArbiter.sol";

/// @title AgentVault — AI-managed yield vault with identity-gated execution
/// @notice Only verified AI agents with sufficient reputation can execute strategies.
///         Integrates with StrategyArbiter for intent-publication + challenge-window flow.
contract AgentVault {
    AgentIdentity public immutable identity;
    StrategyArbiter public arbiter;
    uint256 public immutable agentId;
    address public vaultOwner;

    struct UserPosition {
        uint256 deposited;
        uint256 shares;
        uint256 lastUpdate;
    }

    struct Strategy {
        bytes32 id;
        string name;
        address protocolAddress;
        uint256 currentAPY;
        uint256 totalAllocated;
        bool active;
    }

    mapping(address => UserPosition) public positions;
    mapping(bytes32 => Strategy) public strategies;
    bytes32[] public strategyIds;

    uint256 public totalDeposits;
    uint256 public totalShares;
    uint256 public totalAllocated; // across all strategies, prevents double-allocation
    uint256 public performanceFee = 1000;

    event Deposited(address indexed user, uint256 amount, uint256 shares);
    event StrategyExecuted(bytes32 indexed strategyId, uint256 amount, string reason);
    event Withdrawn(address indexed user, uint256 amount);
    event StrategyAdded(bytes32 indexed strategyId, string name, address protocol);

    constructor(address _identityContract, string memory _agentName, string memory _model, bytes32 _telegramIdHash) {
        identity = AgentIdentity(_identityContract);
        agentId = identity.createAgent(_agentName, _model, _telegramIdHash);
        vaultOwner = msg.sender;
    }

    modifier onlyVaultOwner() {
        require(msg.sender == vaultOwner, "Not vault owner");
        _;
    }

    /// @notice Only verified agent with sufficient reputation can execute strategies
    modifier onlyAgent() {
        (bool valid, ) = identity.verifyAgent(agentId);
        require(valid, "Agent not verified or reputation too low");
        require(msg.sender == vaultOwner, "Not vault owner");
        _;
    }

    function deposit() external payable {
        require(msg.value > 0, "Zero deposit");

        uint256 shares = totalDeposits == 0
            ? msg.value
            : (msg.value * totalShares) / totalDeposits;

        UserPosition storage pos = positions[msg.sender];
        pos.deposited += msg.value;
        pos.shares += shares;
        pos.lastUpdate = block.timestamp;

        totalDeposits += msg.value;
        totalShares += shares;

        emit Deposited(msg.sender, msg.value, shares);
    }

    function addStrategy(
        bytes32 strategyId,
        string calldata name,
        address protocolAddress,
        uint256 initialAPY
    ) external onlyVaultOwner {
        require(!strategies[strategyId].active, "Strategy exists");

        strategies[strategyId] = Strategy({
            id: strategyId,
            name: name,
            protocolAddress: protocolAddress,
            currentAPY: initialAPY,
            totalAllocated: 0,
            active: true
        });
        strategyIds.push(strategyId);

        emit StrategyAdded(strategyId, name, protocolAddress);
    }

    /// @notice AI agent executes a yield strategy — identity must be verified on-chain
    function executeStrategy(
        bytes32 strategyId,
        uint256 amount,
        uint256 apyBasisPoints,
        string calldata reason
    ) external onlyAgent {
        require(amount > 0, "Zero amount");
        Strategy storage strategy = strategies[strategyId];
        require(strategy.active, "Strategy not active");
        require(amount <= totalDeposits - totalAllocated, "Insufficient available balance");

        strategy.currentAPY = apyBasisPoints;
        strategy.totalAllocated += amount;
        totalAllocated += amount;

        identity.logAction(
            agentId,
            keccak256("STRATEGY_EXECUTED"),
            reason,
            amount
        );

        emit StrategyExecuted(strategyId, amount, reason);
    }

    function withdraw(uint256 shares) external {
        UserPosition storage pos = positions[msg.sender];
        require(pos.shares >= shares, "Insufficient shares");

        uint256 amount = (shares * totalDeposits) / totalShares;
        pos.deposited -= amount;
        pos.shares -= shares;
        totalDeposits -= amount;
        totalShares -= shares;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    // ── Agent reputation management (proxied through vault since vault owns the agent) ──

    function endorseOtherAgent(uint256 targetAgentId, uint8 score, string calldata reason)
        external
        onlyVaultOwner
    {
        identity.endorseAgent(agentId, targetAgentId, score, reason);
    }

    function updateAgentReputation(int256 delta, string calldata reason)
        external
        onlyVaultOwner
    {
        identity.updateReputation(agentId, delta, reason);
    }

    function setAgentActive(bool active)
        external
        onlyVaultOwner
    {
        identity.setAgentStatus(agentId, active);
    }

    function updateMinReputation(uint256 threshold)
        external
        onlyVaultOwner
    {
        identity.setMinReputation(threshold);
    }

    /// @notice Set the StrategyArbiter contract address (callable once by vault owner)
    function setArbiter(address payable _arbiter) external onlyVaultOwner {
        require(address(arbiter) == address(0), "Arbiter already set");
        arbiter = StrategyArbiter(_arbiter);
    }

    /// @notice Execute strategy WITH prior intent publication check.
    ///         The intent must have been published, challenge window passed, and not blocked.
    ///         Extension point: strategy steps from arbiter intent could be verified
    ///         against actual on-chain execution trace in future versions using zkTLS.
    function executeStrategyWithIntent(
        uint256 intentId,
        bytes32 strategyId,
        uint256 amount,
        uint256 apyBasisPoints,
        string calldata reason
    ) external onlyAgent {
        require(amount > 0, "Zero amount");
        require(address(arbiter) != address(0), "Arbiter not set");

        // Verify intent is cleared for execution
        (bool ok, string memory errReason) = arbiter.canExecute(intentId);
        require(ok, errReason);

        // Execute as normal
        Strategy storage strategy = strategies[strategyId];
        require(strategy.active, "Strategy not active");
        require(amount <= totalDeposits - totalAllocated, "Insufficient available balance");

        strategy.currentAPY = apyBasisPoints;
        strategy.totalAllocated += amount;
        totalAllocated += amount;

        identity.logAction(
            agentId,
            keccak256("STRATEGY_EXECUTED"),
            reason,
            amount
        );

        // Mark intent as executed in arbiter
        arbiter.markExecuted(intentId);

        emit StrategyExecuted(strategyId, amount, reason);
    }

    function getUserPosition(address user) external view returns (UserPosition memory) {
        return positions[user];
    }

    function getStrategyCount() external view returns (uint256) {
        return strategyIds.length;
    }

    function getAllStrategies() external view returns (Strategy[] memory) {
        Strategy[] memory all = new Strategy[](strategyIds.length);
        for (uint256 i = 0; i < strategyIds.length; i++) {
            all[i] = strategies[strategyIds[i]];
        }
        return all;
    }

    receive() external payable {}
}
