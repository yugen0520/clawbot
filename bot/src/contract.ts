import { ethers } from "ethers";

// Inject proxy agent into ethers' HTTP stack (uses Node http/https, not fetch)
let _proxyAgent: any = null;
export function setEthersProxy(agent: any) {
  if (!agent) return;
  _proxyAgent = agent;
  const { FetchRequest } = require("ethers") as any;
  FetchRequest.registerGetUrl(FetchRequest.createGetUrlFunc({ agent }));
}

const AGENT_VAULT_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 shares) external",
  "function executeStrategy(bytes32 strategyId, uint256 amount, uint256 apyBasisPoints, string calldata reason) external",
  "function executeStrategyWithIntent(uint256 intentId, bytes32 strategyId, uint256 amount, uint256 apyBasisPoints, string calldata reason) external",
  "function addStrategy(bytes32 strategyId, string calldata name, address protocolAddress, uint256 initialAPY) external",
  "function updateAgentReputation(int256 delta, string calldata reason) external",
  "function setAgentActive(bool active) external",
  "function updateMinReputation(uint256 threshold) external",
  "function endorseOtherAgent(uint256 targetAgentId, uint8 score, string calldata reason) external",
  "function setArbiter(address payable _arbiter) external",
  "function getUserPosition(address user) external view returns (tuple(uint256 deposited, uint256 shares, uint256 lastUpdate))",
  "function getAllStrategies() external view returns (tuple(bytes32 id, string name, address protocolAddress, uint256 currentAPY, uint256 totalAllocated, bool active)[])",
  "function totalDeposits() external view returns (uint256)",
  "function totalAllocated() external view returns (uint256)",
  "function identity() external view returns (address)",
  "function agentId() external view returns (uint256)",
  "function arbiter() external view returns (address)",
];

const AGENT_IDENTITY_ABI = [
  "function createAgent(string name, string modelProvider, bytes32 telegramIdHash) external returns (uint256)",
  "function linkTelegram(uint256 agentId, bytes32 telegramIdHash) external",
  "function setAgentStatus(uint256 agentId, bool active) external",
  "function setMinReputation(uint256 threshold) external",
  "function updateReputation(uint256 agentId, int256 delta, string calldata reason) external",
  "function updateReputationByUpdater(uint256 agentId, int256 delta, string calldata reason) external",
  "function setAuthorizedUpdater(address updater, bool authorized) external",
  "function verifyAgent(uint256 agentId) external view returns (bool valid, uint256 score)",
  "function logAction(uint256 agentId, bytes32 actionType, string calldata description, uint256 amount) external",
  "function getAgent(uint256 agentId) external view returns (tuple(uint256 id, address owner, string name, string modelProvider, bytes32 telegramIdHash, uint256 createdAt, uint256 actionCount, uint256 totalValueManaged, uint256 reputationScore, bool isActive))",
  "function getAction(uint256 agentId, uint256 index) external view returns (tuple(uint256 agentId, bytes32 actionType, string description, uint256 amount, uint256 timestamp))",
  "function getActionCount(uint256 agentId) external view returns (uint256)",
  "function getOwnerAgents(address owner) external view returns (uint256[])",
  "function getReputationHistoryLength(uint256 agentId) external view returns (uint256)",
  "function getReputationChange(uint256 agentId, uint256 index) external view returns (tuple(int256 delta, uint256 newScore, string reason, uint256 timestamp))",
  "function minReputationForAction() external view returns (uint256)",
  "function agentOwner(uint256 agentId) external view returns (address)",
  "function endorseAgent(uint256 raterAgentId, uint256 targetAgentId, uint8 score, string calldata reason) external",
  "function getAgentCount() external view returns (uint256)",
  "function getEndorsement(uint256 targetAgentId, uint256 raterAgentId) external view returns (tuple(uint256 raterAgentId, uint256 targetAgentId, uint8 score, string reason, uint256 timestamp))",
  "function getEndorsementStats(uint256 agentId) external view returns (uint256 count, uint256 aggregateScore)",
];

const REPUTATION_ABI = [
  "function stakeAsSubmitter() external payable",
  "function stakeAsGuardian() external payable",
  "function withdrawSubmitterStake(uint256 amount) external",
  "function unstakeGuardian() external",
  "function submitStrategyResult(uint256 agentId, bytes32 strategyId, uint256 apyBasisPoints, uint256 amount, uint256 executionTimestamp, uint256 expectedExecutionTime, string reason) external returns (uint256)",
  "function challengeResult(uint256 resultId) external returns (uint256)",
  "function voteOnChallenge(uint256 resultId, bool voteValid) external",
  "function resolveChallenge(uint256 resultId) external",
  "function finalizeResult(uint256 resultId) external",
  "function reportDefault(uint256 agentId, string reason) external",
  "function getEffectiveReputation(uint256 agentId) external view returns (uint256)",
  "function getSubmitterInfo(address submitter) external view returns (uint256 totalStake, uint256 lockedStake, uint256 slashCount, uint256 available)",
  "function getGuardianCount() external view returns (uint256)",
  "function resultCount() external view returns (uint256)",
  "function guardianStakes(address) external view returns (uint256)",
  "function submitterStakes(address) external view returns (uint256)",
];

const ARBITER_ABI = [
  "function stakeAsBot() external payable",
  "function stakeAsGuardian() external payable",
  "function withdrawBotStake(uint256 amount) external",
  "function unstakeGuardian() external",
  "function publishIntent(uint256 agentId, address vaultAddress, bytes32 strategyId, uint256 amount, uint256 apyBasisPoints, string stepsJson) external returns (uint256)",
  "function challengeIntent(uint256 intentId, string reason) external payable returns (uint256)",
  "function resolveChallenge(uint256 intentId, bool uphold) external",
  "function canExecute(uint256 intentId) external view returns (bool ok, string reason)",
  "function markExecuted(uint256 intentId) external",
  "function getBotInfo(address bot) external view returns (uint256 totalStake, uint256 lockedStake, uint256 slashCount, uint256 available)",
  "function getGuardianCount() external view returns (uint256)",
  "function intents(uint256) external view returns (uint256 intentId, uint256 agentId, address vaultAddress, bytes32 strategyId, uint256 amount, uint256 apyBasisPoints, string stepsJson, uint256 publishedAt, uint256 challengeWindow, bool executed, bool challenged, bool challengeResolved, bool challengeUpheld, address executor)",
  "function intentCount() external view returns (uint256)",
  "function guardianStakes(address) external view returns (uint256)",
  "function botStakes(address) external view returns (uint256)",
  "function minBotStake() external view returns (uint256)",
  "function minGuardianStake() external view returns (uint256)",
  "function defaultChallengeWindow() external view returns (uint256)",
];

const ECONOMIC_ABI = [
  "function chargeRegistrationFee(address payer, uint256 agentId) external payable",
  "function chargeQueryFee(address payer) external payable",
  "function getFeeParams() external view returns (uint256 registrationFee, uint256 queryFee, uint256 matchingFeeBasisPoints, uint256 treasuryShare, uint256 guardianShare, uint256 agentIncentiveShare)",
  "function getPendingPools() external view returns (uint256 treasuryPool, uint256 guardianPool, uint256 agentPool)",
  "function totalFeesCollected() external view returns (uint256)",
];

let provider: ethers.JsonRpcProvider;
let signer: ethers.Wallet;
let vaultContract: ethers.Contract;
let identityContract: ethers.Contract;
let reputationContract: ethers.Contract | null = null;
let arbiterContract: ethers.Contract | null = null;
let economicContract: ethers.Contract | null = null;

export function initContracts(
  rpcUrl: string,
  privateKey: string,
  vaultAddress: string,
  identityAddress: string,
  reputationAddress?: string,
  arbiterAddress?: string,
  economicAddress?: string
) {
  provider = new ethers.JsonRpcProvider(rpcUrl);
  signer = new ethers.Wallet(privateKey, provider);
  vaultContract = new ethers.Contract(vaultAddress, AGENT_VAULT_ABI, signer);
  identityContract = new ethers.Contract(identityAddress, AGENT_IDENTITY_ABI, provider);
  if (reputationAddress) {
    reputationContract = new ethers.Contract(reputationAddress, REPUTATION_ABI, signer);
  }
  if (arbiterAddress) {
    arbiterContract = new ethers.Contract(arbiterAddress, ARBITER_ABI, signer);
  }
  if (economicAddress) {
    economicContract = new ethers.Contract(economicAddress, ECONOMIC_ABI, signer);
  }
}

export async function getUserPosition(address: string) {
  return vaultContract.getUserPosition(address);
}

export async function getAgentInfo(agentId: number) {
  return identityContract.getAgent(agentId);
}

export async function getAgentActions(agentId: number, count: number = 5) {
  const total = Number(await identityContract.getActionCount(agentId));
  const start = Math.max(0, total - count);
  const actions = [];
  for (let i = start; i < total; i++) {
    actions.push(await identityContract.getAction(agentId, i));
  }
  return actions;
}

export async function verifyAgent(agentId: number): Promise<{ valid: boolean; score: number }> {
  const [valid, score] = await identityContract.verifyAgent(agentId);
  return { valid, score: Number(score) };
}

export async function getAllStrategies() {
  return vaultContract.getAllStrategies();
}

export async function executeStrategy(
  strategyId: string,
  amountEth: string,
  apyBps: number,
  reason: string
) {
  const { valid } = await verifyAgent(0);
  if (!valid) throw new Error("Agent identity verification failed — reputation too low or agent inactive");

  const tx = await vaultContract.executeStrategy(
    ethers.encodeBytes32String(strategyId),
    ethers.parseEther(amountEth),
    apyBps,
    reason
  );
  return tx.wait();
}

export async function deposit(amountEth: string) {
  const tx = await vaultContract.deposit({
    value: ethers.parseEther(amountEth),
  });
  return tx.wait();
}

export async function getTotalDeposits() {
  const raw = await vaultContract.totalDeposits();
  return ethers.formatEther(raw);
}

export async function updateAgentReputation(delta: number, reason: string) {
  const tx = await vaultContract.updateAgentReputation(delta, reason);
  return tx.wait();
}

export async function setAgentActive(active: boolean) {
  const tx = await vaultContract.setAgentActive(active);
  return tx.wait();
}

export async function updateMinReputation(threshold: number) {
  const tx = await vaultContract.updateMinReputation(threshold);
  return tx.wait();
}

export async function getReputationHistory(agentId: number) {
  const len = Number(await identityContract.getReputationHistoryLength(agentId));
  const history = [];
  for (let i = 0; i < len; i++) {
    history.push(await identityContract.getReputationChange(agentId, i));
  }
  return history;
}

export interface AgentDirectoryEntry {
  id: number;
  name: string;
  modelProvider: string;
  reputationScore: number;
  isActive: boolean;
  actionCount: number;
  endorsementCount: number;
  avgEndorsement: string;
}

export async function getAgentCount(): Promise<number> {
  const count = await identityContract.getAgentCount();
  return Number(count);
}

export async function getAllAgents(): Promise<AgentDirectoryEntry[]> {
  const count = await getAgentCount();
  const agents: AgentDirectoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const a = await identityContract.getAgent(i);
      const stats = await identityContract.getEndorsementStats(i);
      agents.push({
        id: Number(a.id),
        name: a.name,
        modelProvider: a.modelProvider,
        reputationScore: Number(a.reputationScore),
        isActive: a.isActive,
        actionCount: Number(a.actionCount),
        endorsementCount: Number(stats.count),
        avgEndorsement: stats.count > 0
          ? (Number(stats.aggregateScore) / Number(stats.count)).toFixed(1)
          : "N/A",
      });
    } catch {
      // skip uninitialized agents
    }
  }
  return agents;
}

export async function endorseOtherAgent(
  targetAgentId: number,
  score: number,
  reason: string
) {
  const tx = await vaultContract.endorseOtherAgent(targetAgentId, score, reason);
  return tx.wait();
}

export async function getEndorsement(targetAgentId: number, raterAgentId: number) {
  return identityContract.getEndorsement(targetAgentId, raterAgentId);
}

// ── Strategy Arbiter ──

export async function getArbiter() {
  if (!arbiterContract) throw new Error("Arbiter contract not configured");
  return arbiterContract;
}

export async function stakeAsBot(amountEth: string) {
  if (!arbiterContract) throw new Error("Arbiter not configured");
  const tx = await arbiterContract.stakeAsBot({ value: ethers.parseEther(amountEth) });
  return tx.wait();
}

export async function stakeAsGuardianArbiter(amountEth: string) {
  if (!arbiterContract) throw new Error("Arbiter not configured");
  const tx = await arbiterContract.stakeAsGuardian({ value: ethers.parseEther(amountEth) });
  return tx.wait();
}

export async function publishIntent(
  agentId: number, strategyId: string, amountEth: string, apyBp: number, stepsJson: string
): Promise<number> {
  if (!arbiterContract) throw new Error("Arbiter not configured");
  if (!vaultContract) throw new Error("Vault not configured");
  const vaultAddr = await vaultContract.getAddress();
  const tx = await arbiterContract.publishIntent(
    agentId, vaultAddr, ethers.encodeBytes32String(strategyId),
    ethers.parseEther(amountEth), apyBp, stepsJson
  );
  const receipt = await tx.wait();
  const event = receipt.logs.find((l: any) => {
    try { return arbiterContract!.interface.parseLog(l)?.name === "IntentPublished"; } catch { return false; }
  });
  return event ? Number(arbiterContract!.interface.parseLog(event)!.args.intentId) : 0;
}

export async function challengeIntent(intentId: number, reason: string, feeEth: string) {
  if (!arbiterContract) throw new Error("Arbiter not configured");
  const tx = await arbiterContract.challengeIntent(intentId, reason, {
    value: ethers.parseEther(feeEth),
  });
  return tx.wait();
}

export async function resolveArbiterChallenge(intentId: number, uphold: boolean) {
  if (!arbiterContract) throw new Error("Arbiter not configured");
  const tx = await arbiterContract.resolveChallenge(intentId, uphold);
  return tx.wait();
}

export async function canExecute(intentId: number): Promise<{ ok: boolean; reason: string }> {
  if (!arbiterContract) throw new Error("Arbiter not configured");
  const [ok, reason] = await arbiterContract.canExecute(intentId);
  return { ok, reason };
}

export async function getIntent(intentId: number) {
  if (!arbiterContract) throw new Error("Arbiter not configured");
  const i = await arbiterContract.intents(intentId);
  return {
    intentId: Number(i.intentId),
    agentId: Number(i.agentId),
    vaultAddress: i.vaultAddress,
    strategyId: ethers.decodeBytes32String(i.strategyId),
    amount: ethers.formatEther(i.amount),
    apyBasisPoints: Number(i.apyBasisPoints),
    stepsJson: i.stepsJson,
    publishedAt: Number(i.publishedAt),
    challengeWindow: Number(i.challengeWindow),
    executed: i.executed,
    challenged: i.challenged,
    challengeResolved: i.challengeResolved,
    challengeUpheld: i.challengeUpheld,
    executor: i.executor,
  };
}

export async function getBotInfo(address: string) {
  if (!arbiterContract) throw new Error("Arbiter not configured");
  const info = await arbiterContract.getBotInfo(address);
  return {
    totalStake: ethers.formatEther(info.totalStake),
    lockedStake: ethers.formatEther(info.lockedStake),
    slashCount: Number(info.slashCount),
    available: ethers.formatEther(info.available),
  };
}

export async function getArbiterIntentCount(): Promise<number> {
  if (!arbiterContract) return 0;
  return Number(await arbiterContract.intentCount());
}

// ── Reputation Calculator ──

export async function getReputation() {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  return reputationContract;
}

export async function stakeAsSubmitter(amountEth: string) {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  const tx = await reputationContract.stakeAsSubmitter({ value: ethers.parseEther(amountEth) });
  return tx.wait();
}

export async function stakeAsGuardianReputation(amountEth: string) {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  const tx = await reputationContract.stakeAsGuardian({ value: ethers.parseEther(amountEth) });
  return tx.wait();
}

export async function submitStrategyResult(
  agentId: number, strategyName: string, apyBp: number,
  amountEth: string, execTs: number, expectedTs: number, reason: string
): Promise<number> {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  const strategyId = ethers.encodeBytes32String(strategyName);
  const tx = await reputationContract.submitStrategyResult(
    agentId, strategyId, apyBp, ethers.parseEther(amountEth), execTs, expectedTs, reason
  );
  const receipt = await tx.wait();
  const event = receipt.logs.find((l: any) => {
    try { return reputationContract!.interface.parseLog(l)?.name === "StrategyResultSubmitted"; } catch { return false; }
  });
  return event ? Number(reputationContract!.interface.parseLog(event)!.args.resultId) : 0;
}

export async function challengeResult(resultId: number) {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  const tx = await reputationContract.challengeResult(resultId);
  return tx.wait();
}

export async function voteOnChallenge(resultId: number, voteValid: boolean) {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  const tx = await reputationContract.voteOnChallenge(resultId, voteValid);
  return tx.wait();
}

export async function resolveReputationChallenge(resultId: number) {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  const tx = await reputationContract.resolveChallenge(resultId);
  return tx.wait();
}

export async function finalizeResult(resultId: number) {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  const tx = await reputationContract.finalizeResult(resultId);
  return tx.wait();
}

export async function getEffectiveReputation(agentId: number): Promise<number> {
  if (!reputationContract) return 0;
  return Number(await reputationContract.getEffectiveReputation(agentId));
}

export async function reportDefault(agentId: number, reason: string) {
  if (!reputationContract) throw new Error("Reputation calculator not configured");
  const tx = await reputationContract.reportDefault(agentId, reason);
  return tx.wait();
}

export async function getSubmitterInfo(address: string) {
  if (!reputationContract) return null;
  const info = await reputationContract.getSubmitterInfo(address);
  return {
    totalStake: ethers.formatEther(info.totalStake),
    lockedStake: ethers.formatEther(info.lockedStake),
    slashCount: Number(info.slashCount),
    available: ethers.formatEther(info.available),
  };
}

// ── Economic Model ──

export async function getEconomic() {
  if (!economicContract) throw new Error("Economic model not configured");
  return economicContract;
}

export async function getFeeParams() {
  if (!economicContract) return null;
  const p = await economicContract.getFeeParams();
  return {
    registrationFee: ethers.formatEther(p[0]),
    queryFee: ethers.formatEther(p[1]),
    matchingFeeBasisPoints: Number(p[2]),
    treasuryShare: Number(p[3]),
    guardianShare: Number(p[4]),
    agentIncentiveShare: Number(p[5]),
  };
}

export async function getPendingPools() {
  if (!economicContract) return null;
  const [treasury, guardian, agent] = await economicContract.getPendingPools();
  return {
    treasury: ethers.formatEther(treasury),
    guardian: ethers.formatEther(guardian),
    agent: ethers.formatEther(agent),
  };
}

export async function getTotalFeesCollected(): Promise<string> {
  if (!economicContract) return "0";
  return ethers.formatEther(await economicContract.totalFeesCollected());
}

export { provider, signer, vaultContract, identityContract };
