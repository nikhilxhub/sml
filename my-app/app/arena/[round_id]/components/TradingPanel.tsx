"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useLotryProgram } from "@/lib/solana/useLotryProgram";

interface TradingPanelProps {
    epochId: bigint | null;
}

export default function TradingPanel({ epochId }: TradingPanelProps) {
    const [ticketCount, setTicketCount] = useState("1");
    const [clientSeedInput, setClientSeedInput] = useState("");
    const {
        connected,
        isSubmitting,
        lastSignature,
        error,
        buyTicket,
        requestWinner,
        clearError,
    } = useLotryProgram();

    const parsedTicketCount = useMemo(() => {
        if (!/^\d+$/.test(ticketCount)) {
            return null;
        }
        const parsed = BigInt(ticketCount);
        if (parsed < BigInt(1)) {
            return null;
        }
        return parsed;
    }, [ticketCount]);

    const parsedClientSeed = useMemo(() => {
        if (clientSeedInput.trim().length === 0) {
            return null;
        }
        if (!/^\d+$/.test(clientSeedInput)) {
            return null;
        }
        const parsed = Number.parseInt(clientSeedInput, 10);
        if (parsed < 0 || parsed > 255) {
            return null;
        }
        return parsed;
    }, [clientSeedInput]);

    const explorerLink = lastSignature
        ? `https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`
        : null;

    const canBuy =
        connected &&
        epochId !== null &&
        parsedTicketCount !== null &&
        !isSubmitting;

    const canRequestWinner =
        connected &&
        epochId !== null &&
        !isSubmitting &&
        (clientSeedInput.trim().length === 0 || parsedClientSeed !== null);

    const handleBuy = async () => {
        if (!canBuy || epochId === null || parsedTicketCount === null) {
            return;
        }
        clearError();
        try {
            await buyTicket({
                epochId,
                ticketCount: parsedTicketCount,
            });
        } catch {
            // Hook already exposes a readable error state.
        }
    };

    const handleRequestWinner = async () => {
        if (!canRequestWinner || epochId === null) {
            return;
        }
        clearError();
        try {
            await requestWinner({
                epochId,
                clientSeed: parsedClientSeed ?? undefined,
            });
        } catch {
            // Hook already exposes a readable error state.
        }
    };

    return (
        <div className="border border-black/10 bg-background p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg">Trade Tickets</h3>
                <span className="text-xs font-mono text-muted">Balance: 12.5 SOL</span>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
                        Ticket Count
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            value={ticketCount}
                            onChange={(e) => {
                                setTicketCount(e.target.value);
                                clearError();
                            }}
                            min={1}
                            step={1}
                            className="w-full border border-black/10 bg-surface px-4 py-3 font-serif text-xl focus:outline-none focus:border-black/30 transition-colors"
                            placeholder="1"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
                            tickets
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={handleBuy}
                        disabled={!canBuy}
                        className="group flex items-center justify-center gap-2 bg-foreground text-background py-3 font-medium hover:bg-black/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? "Submitting..." : "Buy"}
                        <ArrowUpRight className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </button>

                    <button
                        disabled
                        className="group flex items-center justify-center gap-2 border border-black/10 bg-transparent text-foreground py-3 font-medium transition-all opacity-60 cursor-not-allowed"
                    >
                        Sell (N/A)
                        <ArrowDownRight className="w-4 h-4 transition-transform group-hover:translate-y-0.5 group-hover:translate-x-0.5" />
                    </button>
                </div>
            </div>

            <div className="space-y-3 border-t border-black/10 pt-4">
                <label className="text-xs uppercase text-muted font-medium block">
                    Client Seed (Optional 0-255)
                </label>
                <input
                    type="number"
                    min={0}
                    max={255}
                    step={1}
                    value={clientSeedInput}
                    onChange={(e) => {
                        setClientSeedInput(e.target.value);
                        clearError();
                    }}
                    className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-sm focus:outline-none focus:border-black/30 transition-colors"
                    placeholder="Auto-random if empty"
                />
                <button
                    onClick={handleRequestWinner}
                    disabled={!canRequestWinner}
                    className="w-full border border-black/10 py-2.5 text-sm font-medium hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Request Winner
                </button>
            </div>

            <div className="space-y-2 text-xs">
                {!connected && (
                    <p className="text-muted">Connect your wallet to submit lotry transactions.</p>
                )}
                {epochId === null && (
                    <p className="text-muted">Use a numeric arena route (for example `/arena/1`) to map to `epoch_id`.</p>
                )}
                {error && <p className="text-tax-high">{error}</p>}
                {explorerLink && lastSignature && (
                    <p className="text-tax-low">
                        Tx confirmed:{" "}
                        <Link href={explorerLink} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                            {lastSignature.slice(0, 10)}...
                        </Link>
                    </p>
                )}
            </div>

            <div className="pt-2 text-center text-xs text-muted font-serif italic">
                &quot;Fortune favors the bold.&quot;
            </div>
        </div>
    );
}
