// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GuardianRegistry — Decentralized guardian identity and stake registry
/// @notice On-chain registry of all guardians who can participate in arbitration,
///         challenge validation, and protocol governance. Guardians stake MNT to
///         join, and can be slashed for malicious behavior.
///
///         Integrates with:
///         - ChallengeMechanism: guardians vote on escalated challenges
///         - StrategyArbiter: guardians challenge suspicious intents
///         - EconomicModel: guardian rewards distributed from fee pools
contract GuardianRegistry {
    struct Guardian {
        address guardian;
        uint256 stake;
        uint256 joinedAt;
        uint256 slashCount;
        uint256 challengesParticipated;
        uint256 votesCast;
        bool active;
    }

    mapping(address => Guardian) public guardians;
    address[] public guardianList;
    uint256 public guardianCount;
    uint256 public totalStaked;
    uint256 public minStake = 1 ether;

    mapping(address => uint256) public pendingRewards;

    address public owner;
    mapping(address => bool) public authorizedCallers;
    mapping(address => bool) private _inList;

    event GuardianRegistered(address indexed guardian, uint256 stake);
    event GuardianStakeIncreased(address indexed guardian, uint256 additionalStake);
    event GuardianStakeDecreased(address indexed guardian, uint256 amount);
    event GuardianDeregistered(address indexed guardian);
    event GuardianSlashed(address indexed guardian, uint256 amount, string reason);
    event GuardianParticipated(address indexed guardian, uint256 challengeId);
    event GuardianVoted(address indexed guardian, uint256 challengeId);
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

    modifier onlyGuardian(address addr) {
        require(guardians[addr].active, "Not a registered guardian");
        _;
    }

    /// @notice Register as a guardian by staking the minimum required amount
    function register() external payable {
        require(msg.value >= minStake, "Insufficient stake");
        require(!guardians[msg.sender].active, "Already registered");

        guardianCount++;

        guardians[msg.sender] = Guardian({
            guardian: msg.sender,
            stake: msg.value,
            joinedAt: block.timestamp,
            slashCount: guardians[msg.sender].slashCount,
            challengesParticipated: 0,
            votesCast: 0,
            active: true
        });

        if (!_inList[msg.sender]) {
            _inList[msg.sender] = true;
            guardianList.push(msg.sender);
        }
        totalStaked += msg.value;

        emit GuardianRegistered(msg.sender, msg.value);
    }

    /// @notice Increase guardian stake
    function addStake() external payable onlyGuardian(msg.sender) {
        guardians[msg.sender].stake += msg.value;
        totalStaked += msg.value;
        emit GuardianStakeIncreased(msg.sender, msg.value);
    }

    /// @notice Withdraw partial stake (must remain above minStake)
    function withdrawStake(uint256 amount) external onlyGuardian(msg.sender) {
        Guardian storage g = guardians[msg.sender];
        require(g.stake - amount >= minStake, "Would fall below minimum stake");
        g.stake -= amount;
        totalStaked -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
        emit GuardianStakeDecreased(msg.sender, amount);
    }

    /// @notice Deregister and withdraw full stake
    function deregister() external onlyGuardian(msg.sender) {
        Guardian storage g = guardians[msg.sender];
        uint256 stake = g.stake;
        g.stake = 0;
        g.active = false;
        totalStaked -= stake;
        guardianCount--;
        (bool ok, ) = payable(msg.sender).call{value: stake}("");
        require(ok, "Transfer failed");
        emit GuardianDeregistered(msg.sender);
    }

    /// @notice Slash a guardian for malicious behavior. Only callable by authorized
    ///         contracts (ChallengeMechanism, StrategyArbiter).
    function slash(address guardian, uint256 amount, string calldata reason) external onlyAuthorized {
        Guardian storage g = guardians[guardian];
        require(g.active, "Guardian not active");
        require(amount <= g.stake, "Slash exceeds stake");

        g.stake -= amount;
        g.slashCount++;
        totalStaked -= amount;

        emit GuardianSlashed(guardian, amount, reason);
    }

    /// @notice Record guardian participation in a challenge
    function recordParticipation(address guardian, uint256 challengeId) external onlyAuthorized {
        guardians[guardian].challengesParticipated++;
        emit GuardianParticipated(guardian, challengeId);
    }

    /// @notice Record guardian vote in arbitration
    function recordVote(address guardian, uint256 challengeId) external onlyAuthorized {
        guardians[guardian].votesCast++;
        emit GuardianVoted(guardian, challengeId);
    }

    /// @notice Add pending rewards for a guardian (called by EconomicModel)
    function addRewards(address guardian, uint256 amount) external onlyAuthorized {
        pendingRewards[guardian] += amount;
    }

    /// @notice Claim pending rewards
    function claimRewards() external onlyGuardian(msg.sender) {
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

    function getGuardianCount() external view returns (uint256) {
        return guardianCount;
    }

    function getGuardian(address addr) external view returns (Guardian memory) {
        return guardians[addr];
    }

    function isGuardian(address addr) external view returns (bool) {
        return guardians[addr].active;
    }

    function getAllGuardians() external view returns (Guardian[] memory) {
        Guardian[] memory all = new Guardian[](guardianList.length);
        uint256 idx = 0;
        for (uint256 i = 0; i < guardianList.length; i++) {
            if (guardians[guardianList[i]].active) {
                all[idx] = guardians[guardianList[i]];
                idx++;
            }
        }
        // Resize (note: Solidity memory arrays can't be resized, but this is OK for view)
        return all;
    }
}
