"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TaxIndicatorProps {
    initialTax?: number; // e.g., 40
    targetTax?: number;  // e.g., 11
    duration?: number;   // seconds for demo
}

export default function TaxIndicator({
    initialTax = 40,
    targetTax = 11,
    duration = 60
}: TaxIndicatorProps) {
    const [currentTax, setCurrentTax] = useState(initialTax);

    // Simulation of tax decay
    useEffect(() => {
        const start = Date.now();
        const interval = setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            const progress = Math.min(elapsed / duration, 1);
            const newTax = initialTax - (initialTax - targetTax) * progress;

            setCurrentTax(newTax);

            if (progress >= 1) clearInterval(interval);
        }, 100);
        return () => clearInterval(interval);
    }, [initialTax, targetTax, duration]);

    // Determine color based on tax level (High = Red, Low = Green)
    // Muted brick red: #b91c1c (Tailwind red-700 approx, defined in config as tax-high)
    // Soft sage green: #15803d (Tailwind green-700 approx, defined in config as tax-low)
    const isHighTax = currentTax > 25;

    return (
        <div className="space-y-2 border border-black/10 p-6 bg-surface">
            <div className="flex justify-between items-baseline font-serif">
                <h3 className="text-lg text-foreground">Sell Ticket Tax</h3>
                <span className={cn(
                    "text-2xl font-bold transition-colors duration-500",
                    isHighTax ? "text-tax-high" : "text-tax-low"
                )}>
                    {currentTax.toFixed(1)}%
                </span>
            </div>

            <div className="h-2 w-full bg-black/5 overflow-hidden rounded-full">
                <motion.div
                    className={cn("h-full transition-colors duration-500", isHighTax ? "bg-tax-high" : "bg-tax-low")}
                    style={{ width: `${(currentTax / initialTax) * 100}%` }}
                    transition={{ ease: "linear" }}
                />
            </div>

            <p className="text-xs text-muted font-mono pt-1">
                Decays to {targetTax}% over time. Hold to reduce penalty.
            </p>
        </div>
    );
}
