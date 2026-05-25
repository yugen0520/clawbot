// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentIdentity — ERC-8004 inspired on-chain agent identity
/// @notice Each AI agent gets an NFT identity with immutable action log
contract AgentIdentity {
    uint256 private _nextTokenId;

    struct Agent {
        uint256 id;
        address owner;
        string name;
        string modelProvider;
        uint256 createdAt;
        uint256 actionCount;
        uint256 totalValueManaged;
    }

    struct Action {
        uint256 agentId;
        bytes32 actionType;
        string description;
        uint256 amount;
        uint256 timestamp;
    }

    mapping(uint256 => Agent) public agents;
    mapping(uint256 => Action[]) public agentActions;
    mapping(uint256 => address) public agentOwner;
    mapping(address => uint256[]) public ownerAgents;

    event AgentCreated(uint256 indexed agentId, address indexed owner, string name);
    event AgentAction(uint256 indexed agentId, bytes32 actionType, uint256 amount, string description);

    function createAgent(string memory name, string memory modelProvider)
        external
        returns (uint256)
    {
        uint256 tokenId = _nextTokenId++;
        agents[tokenId] = Agent({
            id: tokenId,
            owner: msg.sender,
            name: name,
            modelProvider: modelProvider,
            createdAt: block.timestamp,
            actionCount: 0,
            totalValueManaged: 0
        });
        agentOwner[tokenId] = msg.sender;
        ownerAgents[msg.sender].push(tokenId);

        emit AgentCreated(tokenId, msg.sender, name);
        return tokenId;
    }

    function logAction(uint256 agentId, bytes32 actionType, string calldata description, uint256 amount)
        external
    {
        require(agentOwner[agentId] == msg.sender, "Not agent owner");

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
}
