"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils"; // Wait, I might need to create lib/utils or just inline cn
import { motion } from "framer-motion";

// Simple utility for class merging if not present
function classNames(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(" ");
}

const navItems = [
    { name: "Lobby", path: "/" },
    { name: "Arena", path: "/arena/demo-round" }, // Defaulting to a demo round for navigation
    { name: "Treasury", path: "/treasury" },
];

export default function Navbar() {
    const pathname = usePathname();

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
                <div className="hidden md:block text-xs text-muted font-body">
                    SOL: $143.52
                </div>
                <button
                    className="border border-black/10 bg-surface px-4 py-1.5 text-sm font-medium transition-transform hover:scale-95 active:scale-90"
                >
                    Connect Wallet
                </button>
            </div>
        </header>
    );
}
