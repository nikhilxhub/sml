"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Simple utility for class merging if not present
function classNames(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(" ");
}

const navItems = [
    { name: "Lobby", path: "/" },
    { name: "Arena", path: "/arena/1" },
    { name: "Treasury", path: "/treasury" },
];

export default function Navbar() {
    const pathname = usePathname();
    const { connection } = useConnection();
    const { publicKey, connected, disconnect } = useWallet();
    const { setVisible } = useWalletModal();
    const [balance, setBalance] = useState<number | null>(null);

    useEffect(() => {
        if (!publicKey) {
            return;
        }

        let cancelled = false;

        const fetchBalance = async () => {
            try {
                const balance = await connection.getBalance(publicKey);
                if (!cancelled) {
                    setBalance(balance / LAMPORTS_PER_SOL);
                }
            } catch (error) {
                console.error("Failed to fetch balance:", error);
            }
        };

        fetchBalance();
        const id = setInterval(fetchBalance, 10000); // 10s refresh

        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [publicKey, connection]);

    const handleConnectClick = () => {
        if (connected) {
            setBalance(null);
            void disconnect();
        } else {
            setVisible(true);
        }
    };

    const displayedBalance = publicKey ? balance : null;

    return (
        <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-black/5 bg-background/80 px-6 backdrop-blur-md">
            <div className="flex items-center gap-8">
                <Link href="/" className="font-serif text-xl font-medium tracking-tight">
                    SML
                </Link>

                <nav className="hidden md:flex items-center gap-6">
                    {navItems.map((item) => {
                        const isActive = pathname === item.path || (item.path !== "/" && pathname?.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={classNames(
                                    "relative text-sm font-medium transition-colors hover:text-foreground/80",
                                    isActive ? "text-foreground" : "text-muted"
                                )}
                            >
                                {item.name}
                                {isActive && (
                                    <motion.div
                                        layoutId="nav-pill"
                                        className="absolute -bottom-[21px] left-0 right-0 h-[1px] bg-foreground"
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="flex items-center gap-4">
                <div className="hidden md:flex flex-col items-end gap-0.5">
                    <div className="text-[10px] text-muted-foreground/60 font-body uppercase tracking-wider leading-none">
                        * devnet
                    </div>
                    {connected && displayedBalance !== null && (
                        <div className="text-xs text-muted font-body">
                            SOL: {displayedBalance.toFixed(4)}
                        </div>
                    )}
                </div>
                <button
                    onClick={handleConnectClick}
                    className="border border-black/10 bg-surface px-4 py-1.5 text-sm font-medium transition-transform hover:scale-95 active:scale-90"
                >
                    {connected ? (
                        <span className="flex items-center gap-2">
                            {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                        </span>
                    ) : (
                        "Connect Wallet"
                    )}
                </button>
            </div>
        </header>
    );
}
