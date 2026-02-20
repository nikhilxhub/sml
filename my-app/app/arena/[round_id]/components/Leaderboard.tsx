export default function Leaderboard() {
    const players = [
        { rank: 1, address: "8x...92a", tickets: 1420, held: "12m", prob: "32%" },
        { rank: 2, address: "F4...k9P", tickets: 980, held: "8m", prob: "18%" },
        { rank: 3, address: "3z...L2q", tickets: 550, held: "15m", prob: "9%" },
        { rank: 4, address: "9a...M1x", tickets: 320, held: "2m", prob: "4%" },
        { rank: 5, address: "B2...P9o", tickets: 110, held: "1m", prob: "1%" },
    ];

    return (
        <div className="border border-black/10 bg-background">
            <div className="flex items-center justify-between border-b border-black/10 p-4 bg-surface/50">
                <h3 className="font-serif text-lg">Live Probabilities</h3>
                <span className="text-xs text-muted animate-pulse">● Live</span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-black/5 text-left text-xs uppercase text-muted font-medium tracking-wider">
                            <th className="px-4 py-3 font-normal">Rank</th>
                            <th className="px-4 py-3 font-normal">Player</th>
                            <th className="px-4 py-3 font-normal text-right">Tickets</th>
                            <th className="px-4 py-3 font-normal text-right">Held</th>
                            <th className="px-4 py-3 font-normal text-right">Win %</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                        {players.map((player) => (
                            <tr key={player.rank} className="group hover:bg-surface transition-colors">
                                <td className="px-4 py-3 font-mono text-muted">{player.rank}</td>
                                <td className="px-4 py-3 font-mono text-foreground">{player.address}</td>
                                <td className="px-4 py-3 text-right font-serif">{player.tickets}</td>
                                <td className="px-4 py-3 text-right text-muted">{player.held}</td>
                                <td className="px-4 py-3 text-right font-bold">{player.prob}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
