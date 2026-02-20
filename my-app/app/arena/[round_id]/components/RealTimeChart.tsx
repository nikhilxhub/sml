"use client";

import { motion } from "framer-motion";

export default function RealTimeChart() {
    return (
        <div className="relative h-96 w-full border border-black/10 bg-background p-4">
            <div className="absolute top-4 left-4 text-xs font-mono text-muted uppercase tracking-wider">
                Bonding Curve ($P(S) = a \cdot S + b$)
            </div>

            {/* Dummy Chart Visualization */}
            <div className="flex h-full w-full items-end justify-between gap-1 pt-8 pb-4 pl-4 pr-12 opacity-50">
                {Array.from({ length: 40 }).map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ height: "10%" }}
                        animate={{ height: `${20 + Math.random() * 60}%` }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            repeatType: "reverse",
                            delay: i * 0.05
                        }}
                        className="w-full bg-black/5"
                    />
                ))}
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-surface px-4 py-2 border border-black/5 text-sm text-muted animate-pulse">
                    Connecting to Pyth Oracle...
                </div>
            </div>
        </div>
    );
}
