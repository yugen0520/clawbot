import { ethers } from "ethers";

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS || "";
const IDENTITY_ADDRESS = process.env.NEXT_PUBLIC_IDENTITY_ADDRESS || "";
const RPC_URL = process.env.NEXT_PUBLIC_MANTLE_RPC || "https://rpc.sepolia.mantle.xyz";

const VAULT_ABI = [
  "function totalDeposits() external view returns (uint256)",
  "function getAllStrategies() external view returns (tuple(bytes32 id, string name, address protocolAddress, uint256 currentAPY, uint256 totalAllocated, bool active)[])",
];

const IDENTITY_ABI = [
  "function getAgent(uint256 agentId) external view returns (tuple(uint256 id, address owner, string name, string modelProvider, uint256 createdAt, uint256 actionCount, uint256 totalValueManaged))",
  "function getAction(uint256 agentId, uint256 index) external view returns (tuple(uint256 agentId, bytes32 actionType, string description, uint256 amount, uint256 timestamp))",
  "function getActionCount(uint256 agentId) external view returns (uint256)",
];

let provider: ethers.JsonRpcProvider | null = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return provider;
}

export interface StrategyData {
  id: string;
  name: string;
  currentAPY: number;
  totalAllocated: string;
  active: boolean;
}

export interface AgentData {
  name: string;
  model: string;
  actionCount: number;
  totalValueManaged: string;
  createdAt: number;
}

export async function fetchVaultStats(): Promise<{
  totalDeposits: string;
  strategies: StrategyData[];
} | null> {
  try {
    if (!VAULT_ADDRESS) return null;
    const p = getProvider();
    const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, p);
    const deposits = await vault.totalDeposits();
    const strats = await vault.getAllStrategies();

    return {
      totalDeposits: ethers.formatEther(deposits),
      strategies: strats.map((s: any) => ({
        id: ethers.decodeBytes32String(s.id),
        name: s.name,
        currentAPY: Number(s.currentAPY),
        totalAllocated: ethers.formatEther(s.totalAllocated),
        active: s.active,
      })),
    };
  } catch {
    return null;
  }
}

export async function fetchAgentInfo(): Promise<AgentData | null> {
  try {
    if (!IDENTITY_ADDRESS) return null;
    const p = getProvider();
    const identity = new ethers.Contract(IDENTITY_ADDRESS, IDENTITY_ABI, p);
    const agent = await identity.getAgent(0);

    return {
      name: agent.name,
      model: agent.modelProvider,
      actionCount: Number(agent.actionCount),
      totalValueManaged: ethers.formatEther(agent.totalValueManaged),
      createdAt: Number(agent.createdAt),
    };
  } catch {
    return null;
  }
}

export async function fetchRecentActions(count = 5) {
  try {
    if (!IDENTITY_ADDRESS) return [];
    const p = getProvider();
    const identity = new ethers.Contract(IDENTITY_ADDRESS, IDENTITY_ABI, p);
    const total = Number(await identity.getActionCount(0));
    const start = Math.max(0, total - count);
    const actions = [];
    for (let i = start; i < total; i++) {
      const a = await identity.getAction(0, i);
      actions.push({
        type: ethers.decodeBytes32String(a.actionType),
        description: a.description,
        amount: ethers.formatEther(a.amount),
        timestamp: Number(a.timestamp),
      });
    }
    return actions.reverse();
  } catch {
    return [];
  }
}
