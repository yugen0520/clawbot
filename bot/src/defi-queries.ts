export interface ProtocolPool {
  name: string;
  protocol: string;
  token: string;
  apy: number; // basis points
  tvl: number;
  riskLabel: "low" | "medium" | "high";
  url: string;
  strategyId: string; // bytes32-encoded on-chain strategy ID (empty if none)
}

const MANTLE_DEFI_POOLS: ProtocolPool[] = [
  {
    name: "Agni Finance USDC-USDT",
    protocol: "Agni Finance",
    token: "USDC",
    apy: 850,
    tvl: 2_400_000,
    riskLabel: "low",
    url: "https://agni.finance",
    strategyId: "AGNI_USDC",
  },
  {
    name: "Merchant Moe MNT-USDC LP",
    protocol: "Merchant Moe",
    token: "MNT",
    apy: 1200,
    tvl: 5_800_000,
    riskLabel: "medium",
    url: "https://merchantmoe.xyz",
    strategyId: "MOE_MNT_USDC",
  },
  {
    name: "Lendle MNT Lending",
    protocol: "Lendle",
    token: "MNT",
    apy: 620,
    tvl: 3_100_000,
    riskLabel: "low",
    url: "https://lendle.xyz",
    strategyId: "LEND_MNT",
  },
  {
    name: "FusionX MNT-USDT Farm",
    protocol: "FusionX",
    token: "MNT",
    apy: 1500,
    tvl: 1_200_000,
    riskLabel: "high",
    url: "https://fusionx.finance",
    strategyId: "FUSIONX_FARM",
  },
  {
    name: "Minterest MNT Supply",
    protocol: "Minterest",
    token: "MNT",
    apy: 450,
    tvl: 8_500_000,
    riskLabel: "low",
    url: "https://minterest.com",
    strategyId: "MINTEREST_MNT",
  },
];

export function getPoolsByRisk(risk?: string): ProtocolPool[] {
  if (!risk) return MANTLE_DEFI_POOLS;
  return MANTLE_DEFI_POOLS.filter((p) => p.riskLabel === risk);
}

export function getHighestAPY(risk?: string): ProtocolPool {
  const pools = risk ? getPoolsByRisk(risk) : MANTLE_DEFI_POOLS;
  return pools.reduce((best, p) => (p.apy > best.apy ? p : best), pools[0]);
}

export function getBestByRisk(riskLevel: "low" | "medium" | "high"): ProtocolPool {
  const pools = MANTLE_DEFI_POOLS.filter((p) => p.riskLabel === riskLevel);
  if (pools.length === 0) return getHighestAPY();
  return pools.reduce((best, p) => (p.apy > best.apy ? p : best), pools[0]);
}

export function getAllPools(): ProtocolPool[] {
  return [...MANTLE_DEFI_POOLS].sort((a, b) => b.apy - a.apy);
}

export function formatPoolSummary(pool: ProtocolPool): string {
  return [
    `🏦 ${pool.name}`,
    `   Protocol: ${pool.protocol}`,
    `   APY: ${(pool.apy / 100).toFixed(1)}%`,
    `   TVL: $${(pool.tvl / 1_000_000).toFixed(1)}M`,
    `   Risk: ${pool.riskLabel.toUpperCase()}`,
  ].join("\n");
}

export function formatAllPools(): string {
  const lines = ["*Top Yield Pools on Mantle:*\n"];
  for (const pool of getAllPools()) {
    lines.push(formatPoolSummary(pool));
    lines.push("");
  }
  return lines.join("\n");
}
