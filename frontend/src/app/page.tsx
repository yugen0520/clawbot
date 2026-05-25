"use client";

import { useEffect, useState } from "react";
import {
  fetchVaultStats,
  fetchAgentInfo,
  fetchRecentActions,
  StrategyData,
  AgentData,
} from "@/lib/contracts";

const DEMO_STRATEGIES: StrategyData[] = [
  { id: "AGNI_USDC", name: "Agni Finance USDC-USDT Pool", currentAPY: 850, totalAllocated: "12.5", active: true },
  { id: "MOE_MNT_USDC", name: "Merchant Moe MNT-USDC LP", currentAPY: 1200, totalAllocated: "25.0", active: true },
  { id: "LEND_MNT", name: "Lendle MNT Lending", currentAPY: 620, totalAllocated: "8.3", active: true },
  { id: "FUSION_MNT", name: "FusionX MNT-USDT Farm", currentAPY: 1500, totalAllocated: "3.1", active: true },
];

const DEMO_ACTIONS = [
  { type: "STRATEGY_EXECUTED", description: "AI routed 5.0 MNT to Merchant Moe LP (12.0% APY)", amount: "5.0", timestamp: Date.now() / 1000 - 3600 },
  { type: "STRATEGY_EXECUTED", description: "AI rebalanced: moved 2.5 MNT from Lendle to Agni Finance", amount: "2.5", timestamp: Date.now() / 1000 - 7200 },
  { type: "STRATEGY_EXECUTED", description: "Auto-compound: claimed 0.12 MNT rewards, re-deposited", amount: "0.12", timestamp: Date.now() / 1000 - 14400 },
];

export default function Dashboard() {
  const [totalDeposits, setTotalDeposits] = useState("48.9");
  const [strategies, setStrategies] = useState<StrategyData[]>(DEMO_STRATEGIES);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [actions, setActions] = useState(DEMO_ACTIONS);

  useEffect(() => {
    async function load() {
      const stats = await fetchVaultStats();
      if (stats) {
        setTotalDeposits(stats.totalDeposits);
        setStrategies(stats.strategies.length > 0 ? stats.strategies : DEMO_STRATEGIES);
      }
      const agentInfo = await fetchAgentInfo();
      if (agentInfo) setAgent(agentInfo);
      const recentActions = await fetchRecentActions(3);
      if (recentActions.length > 0) setActions(recentActions as any);
    }
    load();
  }, []);

  const highestAPY = Math.max(...strategies.filter((s) => s.active).map((s) => s.currentAPY));
  const weightedAPY = strategies
    .filter((s) => s.active)
    .reduce((sum, s) => sum + s.currentAPY * parseFloat(s.totalAllocated || "0"), 0) /
    strategies.filter((s) => s.active).reduce((sum, s) => sum + parseFloat(s.totalAllocated || "0"), 1);

  return (
    <main>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <span className="text-black font-bold text-sm">C</span>
            </div>
            <span className="font-semibold text-lg">ClawBot</span>
            <span className="text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full border border-[var(--accent)]/30">
              AI Agent
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[var(--text-dim)]">
            <a href="#stats" className="hover:text-[var(--text)] transition-colors">Stats</a>
            <a href="#strategies" className="hover:text-[var(--text)] transition-colors">Strategies</a>
            <a href="#actions" className="hover:text-[var(--text)] transition-colors">Activity</a>
            <a
              href="https://t.me/ClawBot" target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 bg-[var(--accent)] text-black font-semibold rounded-lg hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all"
            >
              Open Bot
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[var(--accent)] opacity-[0.03] blur-[120px] pointer-events-none" />
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--text-dim)] mb-8">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse-slow" />
            Live on Mantle Sepolia Testnet
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
            Your AI DeFi
            <br />
            <span className="text-[var(--accent)] glow-text">Butler on Mantle</span>
          </h1>
          <p className="text-lg text-[var(--text-dim)] max-w-xl mx-auto mb-10">
            ClawBot understands natural language. Tell it what you want —
            &ldquo;find me the highest stable yield&rdquo; — and it executes
            the best strategy on-chain via Mantle smart contracts.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://t.me/ClawBot" target="_blank" rel="noopener noreferrer"
              className="px-8 py-3.5 bg-[var(--accent)] text-black font-semibold rounded-lg hover:shadow-xl hover:shadow-[var(--accent-glow)] transition-all text-lg"
            >
              Try on Telegram
            </a>
            <a
              href="https://github.com/yugen0520/clawbot" target="_blank" rel="noopener noreferrer"
              className="px-8 py-3.5 border border-[var(--border)] text-[var(--text)] font-semibold rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all text-lg"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { label: "Total Deposits", value: `${totalDeposits} MNT`, sub: "Vault TVL" },
              { label: agent ? "AI Agent" : "Model", value: agent?.name || "ClawBot v1", sub: agent?.model || "DeepSeek-v4" },
              { label: "Active Strategies", value: String(strategies.filter((s) => s.active).length), sub: `${strategies.length} total configured` },
              { label: "Weighted APY", value: `${(weightedAPY / 100).toFixed(1)}%`, sub: `Best: ${(highestAPY / 100).toFixed(1)}%` },
            ].map((stat) => (
              <div key={stat.label} className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <div className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">{stat.label}</div>
                <div className="text-2xl font-bold mb-1 font-mono">{stat.value}</div>
                <div className="text-sm text-[var(--text-dim)]">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Strategies */}
      <section id="strategies" className="py-20 px-6 bg-[var(--card)]/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-10">Active Strategies</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strategies
              .filter((s) => s.active)
              .sort((a, b) => b.currentAPY - a.currentAPY)
              .map((s) => (
                <div
                  key={s.id}
                  className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/30 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold mb-1">{s.name}</h3>
                      <div className="text-xs text-[var(--text-dim)] font-mono">{s.id}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold font-mono ${s.currentAPY >= 1000 ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                        {(s.currentAPY / 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-[var(--text-dim)]">APY</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-dim)]">Allocated</span>
                    <span className="font-mono font-semibold">{s.totalAllocated} MNT</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all"
                      style={{
                        width: `${Math.min(100, (parseFloat(s.totalAllocated) / parseFloat(totalDeposits || "1")) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Agent Actions Feed */}
      <section id="actions" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-10">
            <h2 className="text-3xl font-bold">Agent Activity</h2>
            <span className="text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full border border-[var(--accent)]/30">
              On-chain Log
            </span>
          </div>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/20 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{a.description}</p>
                  <p className="text-xs text-[var(--text-dim)] mt-1">
                    {new Date(a.timestamp * 1000).toLocaleString()} · {a.amount} MNT · {a.type}
                  </p>
                </div>
                <div className="text-xs bg-[var(--border)] px-2 py-1 rounded font-mono text-[var(--accent)]">
                  TX
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[var(--card)]/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to put your MNT to work?</h2>
          <p className="text-[var(--text-dim)] mb-8">
            Open ClawBot on Telegram and start managing your DeFi portfolio with natural language.
          </p>
          <a
            href="https://t.me/ClawBot" target="_blank" rel="noopener noreferrer"
            className="inline-flex px-10 py-4 bg-[var(--accent)] text-black font-bold rounded-xl hover:shadow-2xl hover:shadow-[var(--accent-glow)] transition-all text-lg"
          >
            Open ClawBot on Telegram
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-[var(--text-dim)]">
          <span>ClawBot — Mantle Turing Test Hackathon 2026</span>
          <span>Built with AI + Mantle + Telegram</span>
        </div>
      </footer>
    </main>
  );
}
