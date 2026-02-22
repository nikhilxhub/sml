"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  LOTRY_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  findBufferPda,
  findDelegationMetadataPda,
  findDelegationRecordPda,
  findLotteryPoolPda,
  findPlayerTicketPda,
  u64ToLeBytes,
} from "@/lib/solana/lotryClient";
import {
  ER_RPC_URL,
  L1_RPC_URL,
  type RpcMode,
  useLotryProgram,
} from "@/lib/solana/useLotryProgram";

const TEE_VALIDATOR = "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseEpoch(raw: string): bigint {
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error("Epoch ID must be a non-negative integer.");
  }
  return BigInt(raw.trim());
}

function parseTicketCount(raw: string): bigint {
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error("Ticket count must be a non-negative integer.");
  }
  return BigInt(raw.trim());
}

function parsePublicKey(raw: string, label: string): PublicKey {
  try {
    return new PublicKey(raw.trim());
  } catch {
    throw new Error(`${label} is not a valid Solana public key.`);
  }
}

interface DerivedAccounts {
  programId: PublicKey;
  delegationProgramId: PublicKey;
  epochId: bigint;
  ticketCount: bigint;
  poolBump: number;
  poolPda: PublicKey;
  bufferLotteryPool: PublicKey;
  delegationRecordLotteryPool: PublicKey;
  delegationMetadataLotteryPool: PublicKey;
  playerTicketPda: PublicKey;
  bufferPlayerTicket: PublicKey;
  delegationRecord: PublicKey;
  delegationMetadata: PublicKey;
  processSeeds: Uint8Array[];
  processSeedText: string;
}

function deriveAccounts(input: {
  epochIdInput: string;
  ticketCountInput: string;
  programIdInput: string;
  delegationProgramIdInput: string;
}): DerivedAccounts {
  const epochId = parseEpoch(input.epochIdInput);
  const ticketCount = parseTicketCount(input.ticketCountInput);
  const programId = parsePublicKey(input.programIdInput, "Program ID");
  const delegationProgramId = parsePublicKey(
    input.delegationProgramIdInput,
    "Delegation Program ID"
  );

  const [poolPda, poolBump] = findLotteryPoolPda(epochId, programId);
  const [bufferLotteryPool] = findBufferPda(poolPda, programId);
  const [delegationRecordLotteryPool] = findDelegationRecordPda(
    poolPda,
    delegationProgramId
  );
  const [delegationMetadataLotteryPool] = findDelegationMetadataPda(
    poolPda,
    delegationProgramId
  );

  const [playerTicketPda] = findPlayerTicketPda(epochId, ticketCount, programId);
  const [bufferPlayerTicket] = findBufferPda(playerTicketPda, programId);
  const [delegationRecord] = findDelegationRecordPda(
    playerTicketPda,
    delegationProgramId
  );
  const [delegationMetadata] = findDelegationMetadataPda(
    playerTicketPda,
    delegationProgramId
  );

  const processSeeds = [
    new TextEncoder().encode("lottery_pool"),
    u64ToLeBytes(epochId),
    Uint8Array.of(poolBump),
  ];
  const processSeedText = [
    "lottery_pool",
    `hex:${toHex(processSeeds[1])}`,
    `bump:${poolBump.toString()} (hex:${toHex(processSeeds[2])})`,
  ].join("\n");

  return {
    programId,
    delegationProgramId,
    epochId,
    ticketCount,
    poolBump,
    poolPda,
    bufferLotteryPool,
    delegationRecordLotteryPool,
    delegationMetadataLotteryPool,
    playerTicketPda,
    bufferPlayerTicket,
    delegationRecord,
    delegationMetadata,
    processSeeds,
    processSeedText,
  };
}

export default function DelegationOpsPanel() {
  const {
    connected,
    isSubmitting,
    error,
    lastSignature,
    debugInfo,
    fetchLotteryPool,
    initializeLottery,
    initPlayerTicket,
    issueSession,
    buyTicket,
    requestWinner,
    delegateLottery,
    delegatePlayerTicket,
    undelegatePool,
    processUndelegation,
    clearError,
  } = useLotryProgram();

  const [epochIdInput, setEpochIdInput] = useState("1");
  const [ticketCountInput, setTicketCountInput] = useState("1");
  const [programIdInput, setProgramIdInput] = useState(LOTRY_PROGRAM_ID.toBase58());
  const [delegationProgramIdInput, setDelegationProgramIdInput] = useState(
    DELEGATION_PROGRAM_ID.toBase58()
  );
  const [magicProgramIdInput, setMagicProgramIdInput] = useState(
    MAGIC_PROGRAM_ID.toBase58()
  );
  const [magicContextIdInput, setMagicContextIdInput] = useState(
    MAGIC_CONTEXT_ID.toBase58()
  );
  const [validatorInput, setValidatorInput] = useState(TEE_VALIDATOR);
  const [clientSeedInput, setClientSeedInput] = useState("");
  const [rpcMode, setRpcMode] = useState<RpcMode>("auto");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDerived, setShowDerived] = useState(false);
  const [seedLinesInput, setSeedLinesInput] = useState("");

  const [phaseStatus, setPhaseStatus] = useState("Idle");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [poolSnapshot, setPoolSnapshot] = useState<Awaited<
    ReturnType<typeof fetchLotteryPool>
  > | null>(null);
  const [poolSnapshotContext, setPoolSnapshotContext] = useState<{
    epochId: string;
    programId: string;
  } | null>(null);

  const derivedResult = useMemo(() => {
    try {
      return {
        value: deriveAccounts({
          epochIdInput,
          ticketCountInput,
          programIdInput,
          delegationProgramIdInput,
        }),
        error: null as string | null,
      };
    } catch (deriveError) {
      return {
        value: null as DerivedAccounts | null,
        error: deriveError instanceof Error ? deriveError.message : "Invalid inputs.",
      };
    }
  }, [delegationProgramIdInput, epochIdInput, programIdInput, ticketCountInput]);

  const parsedValidator = useMemo(() => {
    if (validatorInput.trim().length === 0) {
      return null;
    }
    try {
      return new PublicKey(validatorInput.trim());
    } catch {
      return null;
    }
  }, [validatorInput]);

  const parsedClientSeed = useMemo(() => {
    if (clientSeedInput.trim().length === 0) {
      return null;
    }
    if (!/^\d+$/.test(clientSeedInput.trim())) {
      return null;
    }
    const parsed = Number.parseInt(clientSeedInput.trim(), 10);
    if (parsed < 0 || parsed > 255) {
      return null;
    }
    return parsed;
  }, [clientSeedInput]);

  const explorerLink = useMemo(() => {
    if (!lastSignature) {
      return null;
    }
    return `https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`;
  }, [lastSignature]);

  const visiblePoolSnapshot =
    poolSnapshotContext &&
    poolSnapshotContext.epochId === epochIdInput &&
    poolSnapshotContext.programId === programIdInput
      ? poolSnapshot
      : null;

  const resetFeedback = () => {
    clearError();
    setPanelError(null);
    setPanelMessage(null);
  };

  const withPhase = async (label: string, action: () => Promise<void>) => {
    resetFeedback();
    setPhaseStatus(`${label}: running...`);
    try {
      await action();
      setPhaseStatus(`${label}: success`);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Submission failed.";
      setPanelError(message);
      setPhaseStatus(`${label}: failed`);
    }
  };

  const handleFillSeeds = () => {
    if (!derivedResult.value) {
      return;
    }
    setSeedLinesInput(derivedResult.value.processSeedText);
  };

  const handleLoadPool = async () => {
    await withPhase("Load Pool", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid derived account inputs.");
      }

      const snapshot = await fetchLotteryPool(
        derivedResult.value.epochId,
        derivedResult.value.programId,
        rpcMode === "er" ? "er" : "l1"
      );
      setPoolSnapshot(snapshot);
      setPoolSnapshotContext({
        epochId: epochIdInput,
        programId: programIdInput,
      });

      if (!snapshot) {
        setPanelMessage("Pool not initialized for this epoch.");
        return;
      }

      setTicketCountInput(snapshot.ticketCount.toString());
      setPanelMessage(
        `Pool loaded. ticket_count updated to ${snapshot.ticketCount.toString()}.`
      );
    });
  };

  const routeMode = (phaseDefault: "l1" | "er"): RpcMode =>
    rpcMode === "auto" ? phaseDefault : rpcMode;

  const handleInitialize = async () => {
    await withPhase("Initialize", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid inputs.");
      }
      const result = await initializeLottery({
        epochId: derivedResult.value.epochId,
        programId: derivedResult.value.programId,
        rpcMode: routeMode("l1"),
      });
      if (result === "already-initialized") {
        setPanelMessage("Lottery pool already initialized for this epoch. Skipped.");
      }
    });
  };

  const handleDelegatePool = async () => {
    await withPhase("Delegate Pool", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid inputs.");
      }
      if (validatorInput.trim().length > 0 && !parsedValidator) {
        throw new Error("Validator must be a valid public key.");
      }
      await delegateLottery({
        epochId: derivedResult.value.epochId,
        programId: derivedResult.value.programId,
        rpcMode: routeMode("l1"),
        delegationProgramId: derivedResult.value.delegationProgramId,
        validator: parsedValidator ?? undefined,
        bufferLotteryPool: derivedResult.value.bufferLotteryPool,
        delegationRecordLotteryPool: derivedResult.value.delegationRecordLotteryPool,
        delegationMetadataLotteryPool: derivedResult.value.delegationMetadataLotteryPool,
      });
    });
  };

  const handleIssueSession = async () => {
    await withPhase("Issue Session", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid inputs.");
      }
      const session = await issueSession({
        programId: derivedResult.value.programId,
        rpcMode: routeMode("l1"),
        forceNew: true,
      });
      setPanelMessage(
        `Session token: ${session.sessionToken.toBase58().slice(0, 8)}... signer: ${session.ephemeralSigner
          .toBase58()
          .slice(0, 8)}...`
      );
    });
  };

  const handleInitTicket = async () => {
    await withPhase("Init Ticket", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid inputs.");
      }
      const result = await initPlayerTicket({
        epochId: derivedResult.value.epochId,
        ticketCount: derivedResult.value.ticketCount,
        programId: derivedResult.value.programId,
        rpcMode: routeMode("l1"),
      });
      if (result === "already-initialized") {
        setPanelMessage("Player ticket already initialized for this epoch/ticket count. Skipped.");
      }
    });
  };

  const handleDelegateTicket = async () => {
    await withPhase("Delegate Ticket", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid inputs.");
      }
      if (validatorInput.trim().length > 0 && !parsedValidator) {
        throw new Error("Validator must be a valid public key.");
      }
      await delegatePlayerTicket({
        epochId: derivedResult.value.epochId,
        ticketCount: derivedResult.value.ticketCount,
        programId: derivedResult.value.programId,
        rpcMode: routeMode("l1"),
        delegationProgramId: derivedResult.value.delegationProgramId,
        validator: parsedValidator ?? undefined,
        bufferPlayerTicket: derivedResult.value.bufferPlayerTicket,
        delegationRecord: derivedResult.value.delegationRecord,
        delegationMetadata: derivedResult.value.delegationMetadata,
      });
    });
  };

  const handleBuyTicket = async () => {
    await withPhase("Buy Ticket", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid inputs.");
      }
      await buyTicket({
        epochId: derivedResult.value.epochId,
        ticketCount: derivedResult.value.ticketCount,
        programId: derivedResult.value.programId,
        rpcMode: routeMode("er"),
      });
    });
  };

  const handleRequestWinner = async () => {
    await withPhase("Request Winner", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid inputs.");
      }
      if (clientSeedInput.trim().length > 0 && parsedClientSeed === null) {
        throw new Error("Client seed must be an integer between 0 and 255.");
      }
      await requestWinner({
        epochId: derivedResult.value.epochId,
        programId: derivedResult.value.programId,
        rpcMode: routeMode("er"),
        clientSeed: parsedClientSeed ?? undefined,
      });
    });
  };

  const handleCommitAndUndelegate = async () => {
    await withPhase("Commit & Undelegate", async () => {
      if (!derivedResult.value) {
        throw new Error(derivedResult.error ?? "Invalid inputs.");
      }
      const magicProgram = parsePublicKey(magicProgramIdInput, "Magic Program ID");
      const magicContext = parsePublicKey(magicContextIdInput, "Magic Context ID");

      if (seedLinesInput.trim().length === 0) {
        setSeedLinesInput(derivedResult.value.processSeedText);
      }

      await undelegatePool({
        epochId: derivedResult.value.epochId,
        programId: derivedResult.value.programId,
        rpcMode: routeMode("er"),
        magicProgram,
        magicContext,
      });

      await processUndelegation({
        baseAccount: derivedResult.value.poolPda,
        buffer: derivedResult.value.bufferLotteryPool,
        accountSeeds: derivedResult.value.processSeeds,
        programId: derivedResult.value.programId,
        rpcMode: routeMode("l1"),
      });
    });
  };

  const disableActions =
    !connected || isSubmitting || derivedResult.value === null || parsedValidator === null && validatorInput.trim().length > 0;

  return (
    <section className="space-y-6 border border-black/10 bg-background p-6 md:p-8">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl">Rollup Operations</h2>
        <p className="text-sm text-muted">
          Minimal input flow with auto-derived PDAs and phase-based execution.
        </p>
        <p className="text-xs text-muted font-mono">
          Auto route: L1 setup phases -&gt; {L1_RPC_URL} | ER execution phases -&gt; {ER_RPC_URL}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
            Epoch ID
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={epochIdInput}
            onChange={(event) => setEpochIdInput(event.target.value)}
            className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-sm focus:outline-none focus:border-black/30 transition-colors"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
            Ticket Count
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={ticketCountInput}
            onChange={(event) => setTicketCountInput(event.target.value)}
            className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-sm focus:outline-none focus:border-black/30 transition-colors"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
            Validator (Optional)
          </label>
          <input
            type="text"
            value={validatorInput}
            onChange={(event) => setValidatorInput(event.target.value)}
            placeholder="validator pubkey"
            className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-xs focus:outline-none focus:border-black/30 transition-colors"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={rpcMode}
          onChange={(event) => setRpcMode(event.target.value as RpcMode)}
          className="border border-black/10 bg-surface px-3 py-1.5 text-xs font-mono"
        >
          <option value="auto">Route: Auto</option>
          <option value="l1">Route: L1 Only</option>
          <option value="er">Route: ER Only</option>
        </select>
        <button
          onClick={() => setShowAdvanced((value) => !value)}
          className="border border-black/10 px-3 py-1.5 text-xs hover:bg-black/5 transition-colors"
        >
          {showAdvanced ? "Hide Advanced" : "Show Advanced"}
        </button>
        <button
          onClick={() => setShowDerived((value) => !value)}
          className="border border-black/10 px-3 py-1.5 text-xs hover:bg-black/5 transition-colors"
        >
          {showDerived ? "Hide Derived Accounts" : "Show Derived Accounts"}
        </button>
        <button
          onClick={handleLoadPool}
          disabled={disableActions}
          className="border border-black/10 px-3 py-1.5 text-xs hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Load Pool
        </button>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-black/10 p-4">
          <div>
            <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
              Program ID
            </label>
            <input
              type="text"
              value={programIdInput}
              onChange={(event) => setProgramIdInput(event.target.value)}
              className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-xs focus:outline-none focus:border-black/30 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
              Delegation Program ID
            </label>
            <input
              type="text"
              value={delegationProgramIdInput}
              onChange={(event) => setDelegationProgramIdInput(event.target.value)}
              className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-xs focus:outline-none focus:border-black/30 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
              Magic Program ID
            </label>
            <input
              type="text"
              value={magicProgramIdInput}
              onChange={(event) => setMagicProgramIdInput(event.target.value)}
              className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-xs focus:outline-none focus:border-black/30 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
              Magic Context ID
            </label>
            <input
              type="text"
              value={magicContextIdInput}
              onChange={(event) => setMagicContextIdInput(event.target.value)}
              className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-xs focus:outline-none focus:border-black/30 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
              Request Winner Client Seed (0-255)
            </label>
            <input
              type="number"
              min={0}
              max={255}
              step={1}
              value={clientSeedInput}
              onChange={(event) => setClientSeedInput(event.target.value)}
              className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-xs focus:outline-none focus:border-black/30 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted font-medium mb-1.5 block">
              Process Undelegation Seeds
            </label>
            <textarea
              value={seedLinesInput}
              onChange={(event) => setSeedLinesInput(event.target.value)}
              rows={3}
              className="w-full border border-black/10 bg-surface px-3 py-2 font-mono text-xs focus:outline-none focus:border-black/30 transition-colors"
            />
            <button
              onClick={handleFillSeeds}
              disabled={!derivedResult.value}
              className="mt-2 border border-black/10 px-2 py-1 text-xs hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Fill Seeds
            </button>
          </div>
        </div>
      )}

      {showDerived && derivedResult.value && (
        <div className="border border-black/10 p-4 bg-surface space-y-1 text-xs font-mono">
          <div>poolPda: {derivedResult.value.poolPda.toBase58()}</div>
          <div>buffer_lottery_pool: {derivedResult.value.bufferLotteryPool.toBase58()}</div>
          <div>
            delegation_record_lottery_pool:{" "}
            {derivedResult.value.delegationRecordLotteryPool.toBase58()}
          </div>
          <div>
            delegation_metadata_lottery_pool:{" "}
            {derivedResult.value.delegationMetadataLotteryPool.toBase58()}
          </div>
          <div>playerTicketPda: {derivedResult.value.playerTicketPda.toBase58()}</div>
          <div>buffer_player_ticket: {derivedResult.value.bufferPlayerTicket.toBase58()}</div>
          <div>delegation_record: {derivedResult.value.delegationRecord.toBase58()}</div>
          <div>delegation_metadata: {derivedResult.value.delegationMetadata.toBase58()}</div>
        </div>
      )}

      <div className="border border-black/10 p-4 space-y-3">
        <h3 className="font-serif text-lg">Run Phases</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            onClick={handleInitialize}
            disabled={disableActions}
            className="border border-black/10 py-2 text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Initialize
          </button>
          <button
            onClick={handleDelegatePool}
            disabled={disableActions}
            className="border border-black/10 py-2 text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delegate Pool
          </button>
          <button
            onClick={handleIssueSession}
            disabled={disableActions}
            className="border border-black/10 py-2 text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Issue Session
          </button>
          <button
            onClick={handleInitTicket}
            disabled={disableActions}
            className="border border-black/10 py-2 text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Init Ticket
          </button>
          <button
            onClick={handleDelegateTicket}
            disabled={disableActions}
            className="border border-black/10 py-2 text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delegate Ticket
          </button>
          <button
            onClick={handleBuyTicket}
            disabled={disableActions}
            className="border border-black/10 py-2 text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Buy Ticket
          </button>
          <button
            onClick={handleRequestWinner}
            disabled={disableActions}
            className="border border-black/10 py-2 text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Request Winner
          </button>
          <button
            onClick={handleCommitAndUndelegate}
            disabled={disableActions}
            className="border border-black/10 py-2 text-sm hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed lg:col-span-2"
          >
            Commit & Undelegate
          </button>
        </div>
        <div className="text-xs text-muted">Status: {phaseStatus}</div>
      </div>

      {visiblePoolSnapshot && (
        <div className="border border-black/10 p-4 bg-surface grid grid-cols-1 md:grid-cols-2 gap-1 text-xs font-mono">
          <div>authority: {visiblePoolSnapshot.authority.toBase58()}</div>
          <div>epoch_id: {visiblePoolSnapshot.epochId.toString()}</div>
          <div>ticket_count: {visiblePoolSnapshot.ticketCount.toString()}</div>
          <div>total_funds: {visiblePoolSnapshot.totalFunds.toString()}</div>
          <div>is_active: {visiblePoolSnapshot.isActive ? "true" : "false"}</div>
          <div>
            winner_ticket_id:{" "}
            {visiblePoolSnapshot.winnerTicketId
              ? visiblePoolSnapshot.winnerTicketId.toString()
              : "none"}
          </div>
        </div>
      )}

      <div className="border border-black/10 p-4 bg-surface space-y-1 text-xs font-mono">
        <h4 className="font-serif text-base">Debug</h4>
        <div>rpc mode: {debugInfo?.rpcMode ?? "n/a"}</div>
        <div>rpc endpoint: {debugInfo?.rpcEndpoint ?? "n/a"}</div>
        <div>blockhash: {debugInfo?.blockhash ?? "n/a"}</div>
        <div>fee payer: {debugInfo?.feePayer ?? "n/a"}</div>
        <div>
          signers:{" "}
          {debugInfo?.signerPubkeys.length
            ? debugInfo.signerPubkeys.join(", ")
            : "n/a"}
        </div>
        {debugInfo?.derivedPdas && (
          <div className="pt-1">
            <div>derived PDAs:</div>
            {Object.entries(debugInfo.derivedPdas).map(([name, value]) => (
              <div key={name}>
                {name}: {value}
              </div>
            ))}
          </div>
        )}
        {debugInfo?.logs.length ? (
          <div className="pt-1">
            <div>logs:</div>
            {debugInfo.logs.map((line, index) => (
              <div key={`${line}-${index.toString()}`}>{line}</div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-1 text-xs">
        {!connected && (
          <p className="text-muted">Connect wallet to run rollup operations.</p>
        )}
        {derivedResult.error && <p className="text-tax-high">{derivedResult.error}</p>}
        {(panelError || error) && (
          <p className="text-tax-high">{panelError ?? error}</p>
        )}
        {panelMessage && <p className="text-tax-low">{panelMessage}</p>}
        {explorerLink && lastSignature && (
          <p className="text-tax-low">
            Tx:{" "}
            <Link
              href={explorerLink}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {lastSignature.slice(0, 10)}...
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
