"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Wallet } from "lucide-react";

// Staggered animation
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
};

export default function Treasury() {
    const balances = [
        { label: "Total Profits", value: "42.50 SOL", sub: "+12.5% this month" },
        { label: "Lottery Winnings", value: "150.00 SOL", sub: "3 wins" },
        { label: "Partial Refunds", value: "8.25 SOL", sub: "From 12 rounds" },
    ];

    return (
        <motion.main
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="container mx-auto max-w-4xl px-6 py-12 space-y-16"
        >
            <motion.section variants={itemVariants} className="text-center space-y-4">
                <h1 className="font-serif text-5xl md:text-6xl text-foreground">Treasury</h1>
                <p className="text-muted font-body max-w-md mx-auto">
                    Manage your earnings, claim round rewards, and withdraw your liquidity.
                </p>
            </motion.section>

            <motion.section variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {balances.map((balance, i) => (
                    <div key={i} className="border border-black/10 bg-background p-8 text-center hover:bg-surface transition-colors">
                        <h3 className="text-sm uppercase tracking-wider text-muted mb-2">{balance.label}</h3>
                        <div className="font-serif text-3xl md:text-4xl mb-2">{balance.value}</div>
                        <div className="text-xs font-mono text-muted">{balance.sub}</div>
                    </div>
                ))}
            </motion.section>

            <motion.section variants={itemVariants} className="bg-surface border border-black/10 p-8 md:p-12 text-center space-y-8">
                <div className="space-y-2">
                    <h2 className="font-serif text-3xl">Ready to Withdraw</h2>
                    <div className="text-5xl md:text-7xl font-serif text-foreground">200.75 SOL</div>
                    <p className="text-sm text-muted font-mono uppercase tracking-wide">Available Balance</p>
                </div>

                <div className="flex justify-center">
                    <button className="group relative inline-flex items-center gap-3 bg-foreground text-background px-8 py-4 text-lg font-medium transition-transform hover:scale-95 active:scale-90">
                        <Wallet className="w-5 h-5" />
                        <span>Claim & Withdraw to Wallet</span>
                        <ArrowUpRight className="w-5 h-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
                    </button>
                </div>

                <p className="text-xs text-muted max-w-sm mx-auto">
                    Withdrawals are processed instantly via the Shielded Pool.
                    A small 0.1% protocol fee applies to all external transfers.
                </p>
            </motion.section>

            <motion.section variants={itemVariants} className="border-t border-black/10 pt-12">
                <h3 className="font-serif text-xl mb-6">Transaction History</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted uppercase font-medium border-b border-black/5">
                            <tr>
                                <th className="py-3 px-4">Date</th>
                                <th className="py-3 px-4">Type</th>
                                <th className="py-3 px-4">Round</th>
                                <th className="py-3 px-4 text-right">Amount</th>
                                <th className="py-3 px-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 font-mono">
                            {[1, 2, 3, 4].map((_, i) => (
                                <tr key={i} className="hover:bg-surface transition-colors">
                                    <td className="py-3 px-4 text-muted">2024-02-1{i}</td>
                                    <td className="py-3 px-4">Claim</td>
                                    <td className="py-3 px-4">Alpha #{1000 + i}</td>
                                    <td className="py-3 px-4 text-right">25.0 SOL</td>
                                    <td className="py-3 px-4 text-right text-muted">Confirmed</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.section>
        </motion.main>
    );
}
