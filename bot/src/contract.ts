import { ethers } from "ethers";

const AGENT_VAULT_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 shares) external",
  "function executeStrategy(bytes32 strategyId, uint256 amount, uint256 apyBasisPoints, string calldata reason) external",
  "function addStrategy(bytes32 strategyId, string calldata name, address protocolAddress, uint256 initialAPY) external",
  "function updateAgentReputation(int256 delta, string calldata reason) external",
  "function setAgentActive(bool active) external",
  "function updateMinReputation(uint256 threshold) external",
  "function endorseOtherAgent(uint256 targetAgentId, uint8 score, string calldata reason) external",
  "function getUserPosition(address user) external view returns (tuple(uint256 deposited, uint256 shares, uint256 lastUpdate))",
  "function getAllStrategies() external view returns (tuple(bytes32 id, string name, address protocolAddress, uint256 currentAPY, uint256 totalAllocated, bool active)[])",
  "function totalDeposits() external view returns (uint256)",
  "function identity() external view returns (address)",
  "function agentId() external view returns (uint256)",
];

const AGENT_IDENTITY_ABI = [
  "function createAgent(string name, string modelProvider, bytes32 telegramIdHash) external returns (uint256)",
  "function linkTelegram(uint256 agentId, bytes32 telegramIdHash) external",
  "function setAgentStatus(uint256 agentId, bool active) external",
  "function setMinReputation(uint256 threshold) external",
  "function updateReputation(uint256 agentId, int256 delta, string calldata reason) external",
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

let provider: ethers.JsonRpcProvider;
let signer: ethers.Wallet;
let vaultContract: ethers.Contract;
let identityContract: ethers.Contract;
export function initContracts(
  rpcUrl: string,
  privateKey: string,
  vaultAddress: string,
  identityAddress: string
) {
  provider = new ethers.JsonRpcProvider(rpcUrl);
  signer = new ethers.Wallet(privateKey, provider);
  vaultContract = new ethers.Contract(vaultAddress, AGENT_VAULT_ABI, signer);
  identityContract = new ethers.Contract(identityAddress, AGENT_IDENTITY_ABI, provider);
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

export { provider, signer, vaultContract, identityContract };
