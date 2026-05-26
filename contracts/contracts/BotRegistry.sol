// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BotRegistry — Decentralized bot identity and stake registry
/// @notice On-chain registry of all strategy-executing bots. Bots stake MNT to
///         register, can be slashed for fraudulent strategies, and earn rewards
///         for high-performance execution.
///
///         Integrates with:
///         - StrategyArbiter: bots must be registered to publish intents
///         - ChallengeMechanism: bot stake at risk during challenges
///         - EconomicModel: top-performing bots earn agent incentives
contract BotRegistry {
    struct Bot {
        address bot;
        uint256 agentId;              // Linked AgentIdentity ID
        uint256 stake;
        uint256 joinedAt;
        uint256 slashCount;
        uint256 strategiesPublished;
        uint256 strategiesExecuted;
        uint256 challengesSurvived;
        uint256 challengesLost;
        uint256 totalVolumeExecuted;  // Cumulative amount handled
        bool active;
    }

    mapping(address => Bot) public bots;
    address[] public botList;
    uint256 public botCount;
    uint256 public totalStaked;
    uint256 public minStake = 0.01 ether;

    mapping(address => uint256) public pendingRewards;

    address public owner;
    mapping(address => bool) public authorizedCallers;
    mapping(address => bool) private _inList;

    event BotRegistered(address indexed bot, uint256 agentId, uint256 stake);
    event BotStakeIncreased(address indexed bot, uint256 additionalStake);
    event BotDeregistered(address indexed bot);
    event BotSlashed(address indexed bot, uint256 amount, string reason);
    event StrategyPublished(address indexed bot, uint256 intentId);
    event StrategyExecuted(address indexed bot, uint256 intentId, uint256 volume);
    event ChallengeOutcome(address indexed bot, bool survived);
    event MinStakeUpdated(uint256 oldMin, uint256 newMin);
    event AuthorizedCallerSet(address indexed caller, bool authorized);

    constructor() {
        owner = msg.sender;
        authorizedCallers[msg.sender] = true;
    }

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "Not authorized");
        _;
    }

    modifier onlyBot(address addr) {
        require(bots[addr].active, "Not a registered bot");
        _;
    }

    /// @notice Register as a bot by staking the minimum required amount
    function register(uint256 agentId) external payable {
        require(msg.value >= minStake, "Insufficient stake");
        require(!bots[msg.sender].active, "Already registered");

        botCount++;

        bots[msg.sender] = Bot({
            bot: msg.sender,
            agentId: agentId,
            stake: msg.value,
            joinedAt: block.timestamp,
            slashCount: bots[msg.sender].slashCount,
            strategiesPublished: 0,
            strategiesExecuted: 0,
            challengesSurvived: 0,
            challengesLost: 0,
            totalVolumeExecuted: 0,
            active: true
        });

        if (!_inList[msg.sender]) {
            _inList[msg.sender] = true;
            botList.push(msg.sender);
        }
        totalStaked += msg.value;

        emit BotRegistered(msg.sender, agentId, msg.value);
    }

    /// @notice Increase bot stake
    function addStake() external payable onlyBot(msg.sender) {
        bots[msg.sender].stake += msg.value;
        totalStaked += msg.value;
        emit BotStakeIncreased(msg.sender, msg.value);
    }

    /// @notice Withdraw partial stake (must remain above minStake)
    function withdrawStake(uint256 amount) external onlyBot(msg.sender) {
        Bot storage b = bots[msg.sender];
        require(b.stake - amount >= minStake, "Would fall below minimum stake");
        b.stake -= amount;
        totalStaked -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    /// @notice Deregister and withdraw full stake
    function deregister() external onlyBot(msg.sender) {
        Bot storage b = bots[msg.sender];
        uint256 stake = b.stake;
        b.stake = 0;
        b.active = false;
        totalStaked -= stake;
        botCount--;
        (bool ok, ) = payable(msg.sender).call{value: stake}("");
        require(ok, "Transfer failed");
        emit BotDeregistered(msg.sender);
    }

    /// @notice Slash a bot for malicious behavior. Only callable by authorized contracts.
    function slash(address bot, uint256 amount, string calldata reason) external onlyAuthorized {
        Bot storage b = bots[bot];
        require(b.active, "Bot not active");
        require(amount <= b.stake, "Slash exceeds stake");

        b.stake -= amount;
        b.slashCount++;
        b.challengesLost++;
        totalStaked -= amount;

        emit BotSlashed(bot, amount, reason);
        emit ChallengeOutcome(bot, false);
    }

    /// @notice Record strategy publication
    function recordStrategyPublished(address bot, uint256 intentId) external onlyAuthorized {
        bots[bot].strategiesPublished++;
        emit StrategyPublished(bot, intentId);
    }

    /// @notice Record successful strategy execution
    function recordStrategyExecuted(address bot, uint256 intentId, uint256 volume) external onlyAuthorized {
        Bot storage b = bots[bot];
        b.strategiesExecuted++;
        b.totalVolumeExecuted += volume;
        emit StrategyExecuted(bot, intentId, volume);
    }

    /// @notice Record challenge survival (challenge was rejected)
    function recordChallengeSurvived(address bot) external onlyAuthorized {
        Bot storage b = bots[bot];
        b.challengesSurvived++;
        emit ChallengeOutcome(bot, true);
    }

    /// @notice Add pending rewards (called by EconomicModel)
    function addRewards(address bot, uint256 amount) external onlyAuthorized {
        pendingRewards[bot] += amount;
    }

    /// @notice Claim pending rewards
    function claimRewards() external onlyBot(msg.sender) {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "No pending rewards");
        pendingRewards[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function setMinStake(uint256 _minStake) external onlyAuthorized {
        emit MinStakeUpdated(minStake, _minStake);
        minStake = _minStake;
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyAuthorized {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerSet(caller, authorized);
    }

    function getBotCount() external view returns (uint256) {
        return botCount;
    }

    function getBot(address addr) external view returns (Bot memory) {
        return bots[addr];
    }

    function isBot(address addr) external view returns (bool) {
        return bots[addr].active;
    }

    function getAllBots() external view returns (Bot[] memory) {
        Bot[] memory all = new Bot[](botList.length);
        uint256 idx = 0;
        for (uint256 i = 0; i < botList.length; i++) {
            if (bots[botList[i]].active) {
                all[idx] = bots[botList[i]];
                idx++;
            }
        }
        return all;
    }

    /// @notice Get top N bots by total volume executed (for incentive distribution)
    function getTopBots(uint256 n) external view returns (address[] memory addrs, uint256[] memory volumes) {
        uint256 count = botList.length;
        // Simple: just return all active bots sorted by volume.
        // In production, use a heap or maintain sorted list on each execution.
        addrs = new address[](n);
        volumes = new uint256[](n);

        uint256[] memory indices = new uint256[](count);
        uint256 activeCount = 0;
        for (uint256 i = 0; i < count; i++) {
            if (bots[botList[i]].active) {
                indices[activeCount] = i;
                activeCount++;
            }
        }

        // Bubble sort by volume (OK for small N, not for production)
        for (uint256 i = 0; i < activeCount && i < n; i++) {
            uint256 bestIdx = i;
            for (uint256 j = i + 1; j < activeCount; j++) {
                if (bots[botList[indices[j]]].totalVolumeExecuted >
                    bots[botList[indices[bestIdx]]].totalVolumeExecuted) {
                    bestIdx = j;
                }
            }
            if (bestIdx != i) {
                (indices[i], indices[bestIdx]) = (indices[bestIdx], indices[i]);
            }
            if (i < n) {
                addrs[i] = botList[indices[i]];
                volumes[i] = bots[botList[indices[i]]].totalVolumeExecuted;
            }
        }
    }
}
