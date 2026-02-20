"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Ticket, Trophy, Users } from "lucide-react";

// Animation variants for staggered reveal
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

const stats = [
  { label: "Total Volume", value: "$4.2M", icon: Ticket },
  { label: "Active Players", value: "1,248", icon: Users },
  { label: "Recent Payouts", value: "$85k", icon: Trophy },
];

const upcomingRounds = [
  { id: 1, name: "Alpha Round", pool: "250 SOL", startsIn: "00:45" },
  { id: 2, name: "Beta Round", pool: "500 SOL", startsIn: "02:15" },
  { id: 3, name: "Gamma Round", pool: "100 SOL", startsIn: "05:00" },
];

const pastWinners = [
  { address: "8x...92a", amount: "42.5 SOL", round: "Alpha #1042" },
  { address: "F4...k9P", amount: "128.0 SOL", round: "Beta #401" },
  { address: "3z...L2q", amount: "15.2 SOL", round: "Gamma #22" },
];

export default function Lobby() {
  return (
    <motion.main
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="container mx-auto max-w-5xl px-6 py-12 space-y-24"
    >
      {/* Hero Section */}
      <motion.section variants={itemVariants} className="text-center space-y-6 pt-12">
        <h1 className="font-serif text-6xl md:text-8xl leading-[0.9] tracking-tight text-foreground">
          Shielded <br />
          <span className="italic text-muted">Micro-Lotteries</span>
        </h1>
        <p className="max-w-xl mx-auto text-lg text-muted font-body leading-relaxed">
          High-frequency trading meets probabilistic outcomes.
          Enter the arena, hold your position, and let the bonding curve decide.
        </p>
        <div className="pt-4">
          {/* Simulate Join Game action */}
          <Link href="/arena/demo-round">
            <button className="group relative inline-flex items-center gap-2 border border-foreground bg-foreground px-8 py-3 text-background transition-transform hover:scale-95 active:scale-90 overflow-hidden">
              <span className="font-medium relative z-10">Enter Arena</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 relative z-10" />
            </button>
          </Link>
        </div>
      </motion.section>

      {/* Stats Strip */}
      <motion.section variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-px bg-black/10 border border-black/10">
        {stats.map((stat, i) => (
          <div key={i} className="bg-background p-6 flex flex-col items-center justify-center gap-2 group hover:bg-surface transition-colors cursor-default">
            <span className="text-muted text-sm uppercase tracking-wider font-medium">{stat.label}</span>
            <span className="font-serif text-3xl md:text-4xl">{stat.value}</span>
          </div>
        ))}
      </motion.section>

      {/* Upcoming Rounds */}
      <motion.section variants={itemVariants} className="space-y-8">
        <div className="flex items-end justify-between border-b border-black/10 pb-4">
          <h2 className="font-serif text-3xl">Upcoming Rounds</h2>
          <span className="text-sm text-muted">Live Feed ●</span>
        </div>

        <div className="space-y-px bg-black/5 border border-black/5">
          {upcomingRounds.map((round) => (
            <div key={round.id} className="grid grid-cols-12 items-center gap-4 bg-background p-4 hover:bg-surface transition-colors">
              <div className="col-span-1 text-muted text-sm">#{round.id}</div>
              <div className="col-span-5 font-serif text-xl">{round.name}</div>
              <div className="col-span-3 text-right font-mono text-sm uppercase text-muted">Pool: {round.pool}</div>
              <div className="col-span-3 flex justify-end">
                <Link href={`/arena/${round.id}`}>
                  <button className="border border-black/10 px-4 py-1.5 text-sm hover:bg-foreground hover:text-background transition-colors">
                    Join in {round.startsIn}
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Past Winners Ticker */}
      <motion.section variants={itemVariants} className="space-y-8 pb-12">
        <h2 className="font-serif text-3xl">Recent Victories</h2>
        <div className="overflow-hidden border-y border-black/5 py-4 relative">
          <div className="flex gap-12 animate-scroll whitespace-nowrap mask-gradient">
            {[...pastWinners, ...pastWinners, ...pastWinners].map((winner, i) => (
              <div key={i} className="flex gap-3 text-lg items-center">
                <span className="font-serif">{winner.amount}</span>
                <span className="text-muted text-sm">won by</span>
                <span className="font-mono text-xs border border-black/10 px-1 py-0.5 rounded-sm">{winner.address}</span>
                <span className="text-black/20 mx-2">•</span>
              </div>
            ))}
          </div>
        </div>
      </motion.section>
    </motion.main>
  );
}
