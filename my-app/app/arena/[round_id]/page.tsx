"use client";

import { motion } from "framer-motion";
import RealTimeChart from "./components/RealTimeChart";
import TradingPanel from "./components/TradingPanel";
import TaxIndicator from "./components/TaxIndicator";
import Leaderboard from "./components/Leaderboard";

// Staggered animation for the grid
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

export default function Arena({ params }: { params: { round_id: string } }) {
    // In a real app, use params.round_id to fetch data

    return (
        <motion.main
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="container mx-auto max-w-7xl px-4 py-8 md:py-12"
        >
            <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black/10 pb-6">
                <div>
                    <motion.h1
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="font-serif text-4xl md:text-5xl"
                    >
                        Round #{params.round_id || "Demo"}
                    </motion.h1>
                    <p className="mt-2 text-muted font-body">
                        Ends in <span className="text-foreground font-medium">04m 12s</span>
                    </p>
                </div>
                <div className="flex gap-4 text-right">
                    <div>
                        <div className="text-xs uppercase text-muted">Pool Size</div>
                        <div className="font-serif text-2xl">450.5 SOL</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase text-muted">Ticket Price</div>
                        <div className="font-serif text-2xl">0.05 SOL</div>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">

                {/* Left Column: Chart & Stats */}
                <div className="lg:col-span-8 space-y-6">
                    <motion.div variants={itemVariants}>
                        <RealTimeChart />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <Leaderboard />
                    </motion.div>
                </div>

                {/* Right Column: Trading & Tax */}
                <div className="lg:col-span-4 space-y-6">
                    <motion.div variants={itemVariants}>
                        <TradingPanel />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <TaxIndicator />
                    </motion.div>

                    {/* Strategy Hint */}
                    <motion.div variants={itemVariants} className="p-4 bg-black/5 items-center justify-center text-center">
                        <p className="text-xs text-muted leading-tight">
                            <span className="font-bold text-foreground">Tip:</span> Buying early increases your win probability multiplier,
                            but selling late incurs lower tax.
                        </p>
                    </motion.div>
                </div>

            </div>
        </motion.main>
    );
}
