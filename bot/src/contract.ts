import { ethers } from "ethers";

const AGENT_VAULT_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 shares) external",
  "function executeStrategy(bytes32 strategyId, uint256 amount, uint256 apyBasisPoints, string calldata reason) external",
  "function addStrategy(bytes32 strategyId, string calldata name, address protocolAddress, uint256 initialAPY) external",
  "function getUserPosition(address user) external view returns (tuple(uint256 deposited, uint256 shares, uint256 lastUpdate))",
  "function getAllStrategies() external view returns (tuple(bytes32 id, string name, address protocolAddress, uint256 currentAPY, uint256 totalAllocated, bool active)[])",
  "function totalDeposits() external view returns (uint256)",
];

const AGENT_IDENTITY_ABI = [
  "function getAgent(uint256 agentId) external view returns (tuple(uint256 id, address owner, string name, string modelProvider, uint256 createdAt, uint256 actionCount, uint256 totalValueManaged))",
  "function getAction(uint256 agentId, uint256 index) external view returns (tuple(uint256 agentId, bytes32 actionType, string description, uint256 amount, uint256 timestamp))",
  "function getActionCount(uint256 agentId) external view returns (uint256)",
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

export async function getAllStrategies() {
  return vaultContract.getAllStrategies();
}

export async function executeStrategy(
  strategyId: string,
  amountEth: string,
  apyBps: number,
  reason: string
) {
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

export { provider, signer, vaultContract, identityContract };
