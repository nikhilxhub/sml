"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function TradingPanel() {
    const [amount, setAmount] = useState("1.0");

    return (
        <div className="border border-black/10 bg-background p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg">Trade Tickets</h3>
                <span className="text-xs font-mono text-muted">Balance: 12.5 SOL</span>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="text-xs uppercase text-muted font-medium mb-1.5 block">Amount (SOL)</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full border border-black/10 bg-surface px-4 py-3 font-serif text-xl focus:outline-none focus:border-black/30 transition-colors"
                            placeholder="0.00"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">SOL</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button className="group flex items-center justify-center gap-2 bg-foreground text-background py-3 font-medium hover:bg-black/90 active:scale-[0.98] transition-all">
                        Buy
                        <ArrowUpRight className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </button>

                    <button className="group flex items-center justify-center gap-2 border border-black/10 bg-transparent text-foreground py-3 font-medium hover:bg-black/5 active:scale-[0.98] transition-all">
                        Sell
                        <ArrowDownRight className="w-4 h-4 transition-transform group-hover:translate-y-0.5 group-hover:translate-x-0.5" />
                    </button>
                </div>
            </div>

            <div className="pt-2 text-center text-xs text-muted font-serif italic">
                "Fortune favors the bold."
            </div>
        </div>
    );
}
