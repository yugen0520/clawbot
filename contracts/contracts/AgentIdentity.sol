// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentIdentity — On-chain AI Agent identity with reputation
/// @notice Each AI agent gets a non-transferable identity with verifiable action log and dynamic reputation
contract AgentIdentity {
    uint256 private _nextTokenId;

    struct Agent {
        uint256 id;
        address owner;
        string name;
        string modelProvider;
        bytes32 telegramIdHash;
        uint256 createdAt;
        uint256 actionCount;
        uint256 totalValueManaged;
        uint256 reputationScore; // 0-10000 basis points, 10000 = perfect
        bool isActive;
    }

    struct Action {
        uint256 agentId;
        bytes32 actionType;
        string description;
        uint256 amount;
        uint256 timestamp;
    }

    struct ReputationChange {
        int256 delta;
        uint256 newScore;
        string reason;
        uint256 timestamp;
    }

    mapping(uint256 => Agent) public agents;
    mapping(uint256 => Action[]) public agentActions;
    mapping(uint256 => ReputationChange[]) public reputationHistory;
    mapping(uint256 => address) public agentOwner;
    mapping(address => uint256[]) public ownerAgents;

    uint256 public minReputationForAction = 1000; // 10% minimum reputation

    event AgentCreated(uint256 indexed agentId, address indexed owner, string name, bytes32 telegramIdHash);
    event AgentAction(uint256 indexed agentId, bytes32 actionType, uint256 amount, string description);
    event ReputationUpdated(uint256 indexed agentId, int256 delta, uint256 newScore, string reason);
    event AgentStatusChanged(uint256 indexed agentId, bool active);
    event TelegramLinked(uint256 indexed agentId, bytes32 telegramIdHash);
    event MinReputationUpdated(uint256 oldThreshold, uint256 newThreshold);

    modifier onlyAgentOwner(uint256 agentId) {
        require(agentOwner[agentId] == msg.sender, "Not agent owner");
        _;
    }

    function createAgent(
        string memory name,
        string memory modelProvider,
        bytes32 telegramIdHash
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        agents[tokenId] = Agent({
            id: tokenId,
            owner: msg.sender,
            name: name,
            modelProvider: modelProvider,
            telegramIdHash: telegramIdHash,
            createdAt: block.timestamp,
            actionCount: 0,
            totalValueManaged: 0,
            reputationScore: 5000,
            isActive: true
        });
        agentOwner[tokenId] = msg.sender;
        ownerAgents[msg.sender].push(tokenId);

        emit AgentCreated(tokenId, msg.sender, name, telegramIdHash);
        return tokenId;
    }

    function linkTelegram(uint256 agentId, bytes32 telegramIdHash)
        external
        onlyAgentOwner(agentId)
    {
        agents[agentId].telegramIdHash = telegramIdHash;
        emit TelegramLinked(agentId, telegramIdHash);
    }

    function setAgentStatus(uint256 agentId, bool active)
        external
        onlyAgentOwner(agentId)
    {
        agents[agentId].isActive = active;
        emit AgentStatusChanged(agentId, active);
    }

    function setMinReputation(uint256 threshold) external {
        require(ownerAgents[msg.sender].length > 0, "Not an agent owner");
        emit MinReputationUpdated(minReputationForAction, threshold);
        minReputationForAction = threshold;
    }

    function updateReputation(uint256 agentId, int256 delta, string calldata reason)
        external
        onlyAgentOwner(agentId)
    {
        Agent storage agent = agents[agentId];
        uint256 current = agent.reputationScore;

        if (delta > 0) {
            uint256 increase = uint256(delta);
            agent.reputationScore = current + increase > 10000 ? 10000 : current + increase;
        } else {
            uint256 decrease = uint256(-delta);
            agent.reputationScore = decrease >= current ? 0 : current - decrease;
        }

        reputationHistory[agentId].push(ReputationChange({
            delta: delta,
            newScore: agent.reputationScore,
            reason: reason,
            timestamp: block.timestamp
        }));

        emit ReputationUpdated(agentId, delta, agent.reputationScore, reason);
    }

    function verifyAgent(uint256 agentId) external view returns (bool valid, uint256 score) {
        Agent storage agent = agents[agentId];
        valid = agent.isActive && agent.reputationScore >= minReputationForAction;
        score = agent.reputationScore;
    }

    function logAction(uint256 agentId, bytes32 actionType, string calldata description, uint256 amount)
        external
        onlyAgentOwner(agentId)
    {
        require(agents[agentId].isActive, "Agent inactive");
        require(agents[agentId].reputationScore >= minReputationForAction, "Reputation too low");

        Agent storage agent = agents[agentId];
        agent.actionCount++;
        agent.totalValueManaged += amount;

        agentActions[agentId].push(Action({
            agentId: agentId,
            actionType: actionType,
            description: description,
            amount: amount,
            timestamp: block.timestamp
        }));

        emit AgentAction(agentId, actionType, amount, description);
    }

    // ── View functions ──

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getActionCount(uint256 agentId) external view returns (uint256) {
        return agentActions[agentId].length;
    }

    function getAction(uint256 agentId, uint256 index) external view returns (Action memory) {
        return agentActions[agentId][index];
    }

    function getOwnerAgents(address owner) external view returns (uint256[] memory) {
        return ownerAgents[owner];
    }

    function getReputationHistoryLength(uint256 agentId) external view returns (uint256) {
        return reputationHistory[agentId].length;
    }

    function getReputationChange(uint256 agentId, uint256 index) external view returns (ReputationChange memory) {
        return reputationHistory[agentId][index];
    }
}
