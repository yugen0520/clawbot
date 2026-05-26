// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ChallengeMechanism — Pandora's Box multi-round escalation challenge
/// @notice Implements a game-theoretic challenge mechanism where challenger and Bot
///         engage in escalating stake rounds. Each round requires the opposing party
///         to match the current stake. Failure to match results in forfeiture.
///         If max rounds reached without resolution, guardians arbitrate.
///
///         Economic design (Pandora's Box):
///         - Challenger opens the box by staking initial amount
///         - Bot must match to keep the box open
///         - Each subsequent round increases the required stake by escalationMultiplier
///         - Neither party knows how deep the other is willing to go
///         - Malicious challengers lose ALL accumulated stake if guardians rule against them
///         - Honest challengers are rewarded from bot's stake if challenge succeeds
///
///         Parameters chosen to make Sybil attacks economically irrational:
///         - Initial stake: 0.1 MNT (high enough to deter spam, low enough for legitimate challenges)
///         - Escalation: 150% per round (rapid cost escalation deters frivolous escalation)
///         - Max 5 rounds (caps gas and capital lockup)
///         - Total cost for full escalation: ~1.32 MNT per challenge
contract ChallengeMechanism {
    // ── Escalation state ──

    enum Status {
        None,              // No active challenge
        ChallengerTurn,    // Challenger has staked, waiting for bot to counter-stake
        BotTurn,           // Bot has counter-staked, waiting for challenger to escalate or concede
        Arbitration,       // Max rounds reached, guardians must resolve
        Resolved           // Final outcome determined
    }

    enum Outcome {
        Unresolved,        // No outcome yet
        ChallengerWon,     // Challenge succeeded (bot penalized)
        BotWon             // Challenge failed (challenger penalized)
    }

    struct EscalationChallenge {
        uint256 challengeId;
        uint256 intentId;              // Reference to StrategyArbiter intent
        address challenger;
        address bot;                   // The bot that published the intent
        uint256 currentRound;          // 1-based round counter
        uint256 challengerTotalStake;  // Accumulated challenger stake
        uint256 botTotalStake;         // Accumulated bot stake
        uint256 currentRequiredStake;  // What the NEXT party must stake
        uint256 lastActionTimestamp;   // When the last action occurred
        Status status;
        Outcome outcome;
        string reason;                 // Initial challenge reason
    }

    // ── Guardian arbitration ──

    struct Arbitration {
        uint256 challengeId;
        mapping(address => bool) hasVoted;
        address[] voters;
        uint256 votesForChallenger;
        uint256 votesForBot;
        uint256 voteCount;
        bool resolved;
    }

    // ── Storage ──

    mapping(uint256 => EscalationChallenge) public challenges;
    uint256 public challengeCount;
    mapping(uint256 => Arbitration) public arbitrations;

    // ── Guardian tracking ──

    mapping(address => uint256) public guardianStakes;
    address[] public guardianList;
    mapping(address => uint256) public guardianActiveVotes;

    // ── Configurable parameters (all in wei or basis points) ──

    /// @notice Initial stake required to open a Pandora's Box challenge
    /// @dev 0.1 MNT — high enough to deter spam, low enough for legitimate challenges.
    ///      A Sybil attacker creating 100 challenges commits 10 MNT minimum.
    uint256 public initialStake = 0.1 ether;

    /// @notice Multiplier applied to required stake each escalation round (basis points)
    /// @dev 15000 = 150%. Round 2 requires 1.5x of round 1, round 3 requires 1.5x of round 2.
    ///      This geometric growth makes deep escalation prohibitively expensive.
    uint256 public escalationBasisPoints = 15000; // 150%

    /// @notice Maximum number of escalation rounds before forced arbitration
    /// @dev 5 rounds. More rounds = more capital at stake but higher gas costs.
    ///      At 150% escalation, round 5 requires ~5.06x the initial stake.
    uint256 public maxRounds = 5;

    /// @notice Timeout for each round before opponent can claim victory
    /// @dev 300 seconds (5 minutes). Balances bot responsiveness with attack prevention.
    ///      In production, this should be longer (hours) since bots may need time to react.
    uint256 public roundTimeout = 300 seconds;

    /// @notice Minimum number of guardians that must vote for arbitration to be valid
    /// @dev 3 guardians. Below 3, a single malicious guardian could sway outcomes.
    ///      Above 3, coordination cost increases linearly for attackers.
    uint256 public minGuardianConsensus = 3;

    /// @notice Minimum stake to become a guardian
    uint256 public minGuardianStake = 1 ether;

    /// @notice Basis points constant
    uint256 public constant BPS = 10000;

    // ── Events ──

    event ChallengeOpened(
        uint256 indexed challengeId, uint256 indexed intentId,
        address challenger, address bot, uint256 stake, string reason
    );
    event BotCounterStaked(uint256 indexed challengeId, uint256 round, uint256 amount);
    event ChallengeEscalated(uint256 indexed challengeId, uint256 round, uint256 amount, uint256 totalAtStake);
    event ChallengeTimeout(uint256 indexed challengeId, address winner, uint256 reward);
    event ArbitrationRequested(uint256 indexed challengeId, uint256 totalStake);
    event GuardianVoted(uint256 indexed challengeId, address guardian, bool forChallenger);
    event ArbitrationResolved(uint256 indexed challengeId, Outcome outcome, string resolution);
    event GuardianStaked(address indexed guardian, uint256 amount);
    event GuardianUnstaked(address indexed guardian, uint256 amount);
    event ParameterUpdated(string param, uint256 value);

    modifier onlyGuardian() {
        require(guardianStakes[msg.sender] >= minGuardianStake, "Not a guardian");
        _;
    }

    // ── Guardian staking ──

    /// @notice Stake MNT to become a guardian (can vote in arbitrations)
    function stakeAsGuardian() external payable {
        require(msg.value >= minGuardianStake, "Insufficient guardian stake");
        if (guardianStakes[msg.sender] == 0) {
            guardianList.push(msg.sender);
        }
        guardianStakes[msg.sender] += msg.value;
        emit GuardianStaked(msg.sender, msg.value);
    }

    function unstakeGuardian() external {
        uint256 amount = guardianStakes[msg.sender];
        require(amount > 0, "Not a guardian");
        require(guardianActiveVotes[msg.sender] == 0, "Active arbitration votes");
        guardianStakes[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
        emit GuardianUnstaked(msg.sender, amount);
    }

    // ── Core: Open challenge ──

    /// @notice Open a Pandora's Box challenge against a strategy intent.
    ///         Challenger stakes initialStake. Bot must counter-stake to continue.
    ///         If bot doesn't respond within roundTimeout, challenger wins by default.
    /// @param intentId The StrategyArbiter intent being challenged
    /// @param botAddr  The address of the bot that published the intent
    /// @param reason   Why the strategy is being challenged
    /// @return challengeId The ID of the new escalation challenge
    function challenge(
        uint256 intentId,
        address botAddr,
        string calldata reason
    ) external payable returns (uint256 challengeId) {
        require(msg.value == initialStake, "Must stake exact initialStake");
        require(botAddr != address(0), "Invalid bot address");
        require(botAddr != msg.sender, "Cannot challenge self");

        challengeId = challengeCount++;

        challenges[challengeId] = EscalationChallenge({
            challengeId: challengeId,
            intentId: intentId,
            challenger: msg.sender,
            bot: botAddr,
            currentRound: 1,
            challengerTotalStake: msg.value,
            botTotalStake: 0,
            currentRequiredStake: msg.value, // bot must match this
            lastActionTimestamp: block.timestamp,
            status: Status.ChallengerTurn,
            outcome: Outcome.Unresolved,
            reason: reason
        });

        emit ChallengeOpened(challengeId, intentId, msg.sender, botAddr, msg.value, reason);
    }

    // ── Bot counter-stake ──

    /// @notice Bot matches the challenger's stake to keep the challenge alive.
    ///         Must be called by the bot specified in the challenge.
    /// @param challengeId The challenge to counter-stake in
    function counterStake(uint256 challengeId) external payable {
        EscalationChallenge storage c = challenges[challengeId];
        require(c.status == Status.ChallengerTurn, "Not challenger turn");
        require(msg.sender == c.bot, "Only the challenged bot");
        require(msg.value == c.currentRequiredStake, "Must match required stake");
        require(c.currentRound <= maxRounds, "Max rounds exceeded");

        c.botTotalStake += msg.value;
        c.lastActionTimestamp = block.timestamp;

        emit BotCounterStaked(challengeId, c.currentRound, msg.value);

        // If max rounds reached, move to arbitration
        if (c.currentRound >= maxRounds) {
            c.status = Status.Arbitration;
            emit ArbitrationRequested(challengeId, c.challengerTotalStake + c.botTotalStake);
        } else {
            // Next: challenger can escalate
            c.status = Status.BotTurn;
            c.currentRequiredStake = msg.value * escalationBasisPoints / BPS;
        }
    }

    // ── Challenger escalate ──

    /// @notice Challenger escalates by staking the increased amount for the next round.
    ///         Required stake increases by escalationBasisPoints each round.
    /// @param challengeId The challenge to escalate
    function escalate(uint256 challengeId) external payable {
        EscalationChallenge storage c = challenges[challengeId];
        require(c.status == Status.BotTurn, "Not bot turn to escalate from");
        require(msg.sender == c.challenger, "Only the challenger");
        require(msg.value == c.currentRequiredStake, "Must stake exact required amount");
        require(c.currentRound < maxRounds, "Max rounds reached, request arbitration");

        c.currentRound++;
        c.challengerTotalStake += msg.value;
        c.lastActionTimestamp = block.timestamp;
        c.status = Status.ChallengerTurn;
        c.currentRequiredStake = msg.value; // bot must match this new amount

        emit ChallengeEscalated(challengeId, c.currentRound, msg.value, c.challengerTotalStake);
    }

    // ── Timeout claim ──

    /// @notice If the opposing party fails to act within roundTimeout, claim victory.
    ///         Winner takes the loser's accumulated stake.
    /// @param challengeId The challenge where timeout occurred
    function claimTimeout(uint256 challengeId) external {
        EscalationChallenge storage c = challenges[challengeId];
        require(c.status == Status.ChallengerTurn || c.status == Status.BotTurn, "Not in active round");
        require(block.timestamp > c.lastActionTimestamp + roundTimeout, "Timeout not yet expired");

        address winner;
        Outcome outcome;

        if (c.status == Status.ChallengerTurn) {
            winner = c.challenger;
            outcome = Outcome.ChallengerWon;
        } else {
            winner = c.bot;
            outcome = Outcome.BotWon;
        }

        c.status = Status.Resolved;
        c.outcome = outcome;

        uint256 totalReward = c.challengerTotalStake + c.botTotalStake;
        (bool ok, ) = payable(winner).call{value: totalReward}("");
        require(ok, "Transfer failed");

        emit ChallengeTimeout(challengeId, winner, totalReward);
    }

    // ── Arbitration ──

    /// @notice Request arbitration after max rounds reached.
    ///         Any guardian can call this once escalation rounds are exhausted.
    /// @param challengeId The challenge to arbitrate
    function requestArbitration(uint256 challengeId) external {
        EscalationChallenge storage c = challenges[challengeId];
        require(c.status == Status.BotTurn || c.status == Status.ChallengerTurn, "Wrong status");
        require(c.currentRound >= maxRounds, "Not enough rounds for arbitration");

        c.status = Status.Arbitration;
        emit ArbitrationRequested(challengeId, c.challengerTotalStake + c.botTotalStake);
    }

    /// @notice Guardian votes on an arbitration. Each guardian votes once.
    /// @param challengeId  The challenge to vote on
    /// @param forChallenger true = side with challenger, false = side with bot
    function voteOnArbitration(uint256 challengeId, bool forChallenger) external onlyGuardian {
        EscalationChallenge storage c = challenges[challengeId];
        require(c.status == Status.Arbitration, "Not in arbitration");
        require(c.outcome == Outcome.Unresolved, "Already resolved");

        Arbitration storage arb = arbitrations[challengeId];
        arb.challengeId = challengeId;
        require(!arb.hasVoted[msg.sender], "Already voted");

        arb.hasVoted[msg.sender] = true;
        arb.voters.push(msg.sender);
        guardianActiveVotes[msg.sender]++;
        arb.voteCount++;
        if (forChallenger) {
            arb.votesForChallenger++;
        } else {
            arb.votesForBot++;
        }

        emit GuardianVoted(challengeId, msg.sender, forChallenger);
    }

    /// @notice Resolve arbitration once minimum consensus is reached.
    ///         Winning party gets both stakes. Malicious challenger loses all.
    ///         Honest challenger gets bot's stake as compensation.
    function resolveArbitration(uint256 challengeId) external {
        EscalationChallenge storage c = challenges[challengeId];
        require(c.status == Status.Arbitration, "Not in arbitration");

        Arbitration storage arb = arbitrations[challengeId];
        require(!arb.resolved, "Already resolved");
        require(arb.voteCount >= minGuardianConsensus, "Insufficient guardian votes");

        arb.resolved = true;
        address winner;
        bool challengerWon;

        if (arb.votesForChallenger > arb.votesForBot) {
            // Challenge upheld — challenger wins, bot loses all stake
            challengerWon = true;
            winner = c.challenger;
            c.outcome = Outcome.ChallengerWon;
        } else {
            // Challenge rejected — bot wins, challenger loses all stake
            challengerWon = false;
            winner = c.bot;
            c.outcome = Outcome.BotWon;
        }

        c.status = Status.Resolved;

        // Release guardian active vote tracking
        for (uint256 i = 0; i < arb.voters.length; i++) {
            address voter = arb.voters[i];
            if (guardianActiveVotes[voter] > 0) {
                guardianActiveVotes[voter]--;
            }
        }

        // Pay total accumulated stakes to winner
        uint256 totalStake = c.challengerTotalStake + c.botTotalStake;
        (bool ok, ) = payable(winner).call{value: totalStake}("");
        require(ok, "Transfer failed");

        emit ArbitrationResolved(
            challengeId,
            c.outcome,
            challengerWon ? unicode"Challenge upheld — bot penalized" : unicode"Challenge rejected — challenger penalized"
        );
    }

    // ── Parameter setters (guardian governance) ──

    function setInitialStake(uint256 _amount) external onlyGuardian {
        initialStake = _amount;
        emit ParameterUpdated("initialStake", _amount);
    }

    function setEscalationBasisPoints(uint256 _bps) external onlyGuardian {
        require(_bps >= BPS, "Multiplier must be >= 100%");
        escalationBasisPoints = _bps;
        emit ParameterUpdated("escalationBasisPoints", _bps);
    }

    function setMaxRounds(uint256 _rounds) external onlyGuardian {
        require(_rounds >= 2 && _rounds <= 20, "Rounds must be 2-20");
        maxRounds = _rounds;
        emit ParameterUpdated("maxRounds", _rounds);
    }

    function setRoundTimeout(uint256 _seconds) external onlyGuardian {
        require(_seconds >= 60, "Timeout must be >= 60s");
        roundTimeout = _seconds;
        emit ParameterUpdated("roundTimeout", _seconds);
    }

    function setMinGuardianConsensus(uint256 _count) external onlyGuardian {
        require(_count >= 2, "Need at least 2 guardians");
        minGuardianConsensus = _count;
        emit ParameterUpdated("minGuardianConsensus", _count);
    }

    function setMinGuardianStake(uint256 _amount) external onlyGuardian {
        minGuardianStake = _amount;
        emit ParameterUpdated("minGuardianStake", _amount);
    }

    // ── View functions ──

    function getGuardianCount() external view returns (uint256) {
        return guardianList.length;
    }

    function getChallenge(uint256 challengeId) external view returns (EscalationChallenge memory) {
        return challenges[challengeId];
    }

    function getArbitrationVotes(uint256 challengeId)
        external view
        returns (uint256 forChallenger, uint256 forBot, uint256 total)
    {
        Arbitration storage arb = arbitrations[challengeId];
        return (arb.votesForChallenger, arb.votesForBot, arb.voteCount);
    }

    /// @notice Calculate the total cost for a full escalation from round 1 to maxRounds.
    ///         Useful for UI display and attacker cost estimation.
    /// @return totalChallengerCost Total MNT a challenger would stake across all rounds
    function estimateFullEscalationCost() external view returns (uint256 totalChallengerCost) {
        uint256 stake = initialStake;
        totalChallengerCost = stake;
        for (uint256 i = 1; i < maxRounds; i++) {
            stake = stake * escalationBasisPoints / BPS;
            totalChallengerCost += stake;
        }
    }

    receive() external payable {}
}
