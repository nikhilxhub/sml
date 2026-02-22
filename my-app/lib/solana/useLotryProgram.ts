"use client";

import { useCallback, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type Signer,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  LOTRY_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  buildBuyTicketIx,
  buildDelegateLotteryIx,
  buildDelegatePlayerTicketIx,
  buildInitPlayerTicketIx,
  buildInitializeLotteryIx,
  buildIssueSessionIx,
  buildProcessUndelegationIx,
  buildRequestWinnerIx,
  buildUndelegatePoolIx,
  createRandomTicketData,
  decodeLotteryPoolAccount,
  decodePlayerTicketAccount,
  explainLotryError,
  findLotteryPoolPda,
  findPlayerTicketPda,
  findSessionTokenPda,
  toU64,
  type LotteryPoolAccount,
  type U64Input,
} from "@/lib/solana/lotryClient";

const SESSION_STORAGE_PREFIX = "lotry:session:";
const SESSION_TTL_SECONDS = 60 * 60;
const SESSION_RENEW_BUFFER_SECONDS = 30;
export const L1_RPC_URL = "https://api.devnet.solana.com";
export const ER_RPC_URL = "https://devnet-as.magicblock.app/";

export type RpcMode = "auto" | "l1" | "er";
type PhaseNetwork = "l1" | "er";

interface StoredSession {
  secretKey: number[];
  validUntil: number;
}

interface ProgramScopedInput {
  programId?: PublicKey;
  rpcMode?: RpcMode;
}

export interface BuyTicketInput extends ProgramScopedInput {
  epochId: U64Input;
  ticketCount: U64Input;
  ticketData?: Uint8Array | number[];
}

export interface RequestWinnerInput extends ProgramScopedInput {
  epochId: U64Input;
  clientSeed?: number;
}

export interface InitializeLotteryInput extends ProgramScopedInput {
  epochId: U64Input;
}

export interface InitPlayerTicketInput extends ProgramScopedInput {
  epochId: U64Input;
  ticketCount: U64Input;
}

export interface IssueSessionInput extends ProgramScopedInput {
  validForSeconds?: number;
  forceNew?: boolean;
}

export interface DelegateLotteryInput extends ProgramScopedInput {
  epochId: U64Input;
  bufferLotteryPool: PublicKey;
  delegationRecordLotteryPool: PublicKey;
  delegationMetadataLotteryPool: PublicKey;
  validator?: PublicKey;
  delegationProgramId?: PublicKey;
}

export interface DelegatePlayerTicketInput extends ProgramScopedInput {
  epochId: U64Input;
  ticketCount: U64Input;
  bufferPlayerTicket: PublicKey;
  delegationRecord: PublicKey;
  delegationMetadata: PublicKey;
  validator?: PublicKey;
  delegationProgramId?: PublicKey;
}

export interface UndelegatePoolInput extends ProgramScopedInput {
  epochId: U64Input;
  magicProgram?: PublicKey;
  magicContext?: PublicKey;
}

export interface ProcessUndelegationInput extends ProgramScopedInput {
  baseAccount: PublicKey;
  buffer: PublicKey;
  accountSeeds: Uint8Array[];
}

interface SendAndConfirmOptions {
  label?: string;
  simulateFirst?: boolean;
  derivedPdas?: Record<string, string>;
  rpcMode?: PhaseNetwork;
  rpcConnection?: Connection;
}

interface EnsureSessionOptions extends ProgramScopedInput {
  forceNew?: boolean;
  validForSeconds?: number;
  rpcMode?: PhaseNetwork;
}

export interface TxDebugInfo {
  label?: string;
  rpcMode?: PhaseNetwork;
  rpcEndpoint?: string;
  blockhash?: string;
  feePayer?: string;
  signerPubkeys: string[];
  logs: string[];
  lastError?: string;
  derivedPdas?: Record<string, string>;
}

function resolveProgramId(programId?: PublicKey): PublicKey {
  return programId ?? LOTRY_PROGRAM_ID;
}

function resolveRpcMode(
  inputMode: RpcMode | undefined,
  phaseDefault: PhaseNetwork
): PhaseNetwork {
  if (inputMode === "l1" || inputMode === "er") {
    return inputMode;
  }
  return phaseDefault;
}

function getStorageKey(authority: PublicKey, programId: PublicKey): string {
  return `${SESSION_STORAGE_PREFIX}${programId.toBase58()}:${authority.toBase58()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectErrorDetails(error: unknown): { messages: string[]; logs: string[] } {
  const messages: string[] = [];
  const logs: string[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null) {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (typeof current === "string") {
      messages.push(current);
      continue;
    }

    if (current instanceof Error) {
      if (current.message) {
        messages.push(current.message);
      }
      const anyError = current as unknown as Record<string, unknown>;
      if (anyError.cause) {
        queue.push(anyError.cause);
      }
      if (anyError.error) {
        queue.push(anyError.error);
      }
      if (Array.isArray(anyError.logs)) {
        for (const line of anyError.logs) {
          if (typeof line === "string" && line.length > 0) {
            logs.push(line);
          }
        }
      }
      continue;
    }

    if (!isRecord(current)) {
      continue;
    }

    if (typeof current.message === "string" && current.message.length > 0) {
      messages.push(current.message);
    }

    if (Array.isArray(current.logs)) {
      for (const line of current.logs) {
        if (typeof line === "string" && line.length > 0) {
          logs.push(line);
        }
      }
    }

    if (current.error) {
      queue.push(current.error);
    }
    if (current.cause) {
      queue.push(current.cause);
    }
    if (current.data) {
      queue.push(current.data);
    }
  }

  return { messages, logs };
}

function summarizeLogs(logs: string[]): string | null {
  if (logs.length === 0) {
    return null;
  }

  const importantLog =
    logs.find((line) => line.includes("AnchorError")) ??
    logs.find((line) => line.toLowerCase().includes("custom program error")) ??
    logs.find((line) => line.startsWith("Program log: ")) ??
    logs.at(-1) ??
    null;

  if (!importantLog) {
    return null;
  }

  return importantLog.replace(/^Program log:\s*/i, "");
}

function normalizeError(error: unknown): { message: string; logs: string[] } {
  const directMapped = explainLotryError(error);
  const details = collectErrorDetails(error);

  if (directMapped) {
    return { message: directMapped, logs: details.logs };
  }

  if (details.logs.length > 0) {
    if (details.logs.some((line) => /already in use/i.test(line))) {
      return {
        message:
          "Account already exists for this PDA. Skip initialization and continue to the next phase.",
        logs: details.logs,
      };
    }

    const mappedFromLogs = explainLotryError(new Error(details.logs.join("\n")));
    if (mappedFromLogs) {
      return { message: mappedFromLogs, logs: details.logs };
    }
    const summarizedLogs = summarizeLogs(details.logs);
    if (summarizedLogs) {
      return { message: summarizedLogs, logs: details.logs };
    }
  }

  const meaningfulMessage = details.messages.find(
    (item) =>
      item.trim().length > 0 &&
      item.trim().toLowerCase() !== "unexpected error"
  );

  if (meaningfulMessage) {
    return { message: meaningfulMessage, logs: details.logs };
  }

  if (error instanceof Error && error.message.length > 0) {
    return { message: error.message, logs: details.logs };
  }

  return { message: "Transaction failed.", logs: details.logs };
}

function loadStoredSession(authority: PublicKey, programId: PublicKey): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(getStorageKey(authority, programId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!Array.isArray(parsed.secretKey) || typeof parsed.validUntil !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredSession(
  authority: PublicKey,
  programId: PublicKey,
  signer: Keypair,
  validUntil: number
): void {
  if (typeof window === "undefined") {
    return;
  }
  const session: StoredSession = {
    secretKey: Array.from(signer.secretKey),
    validUntil,
  };
  window.localStorage.setItem(getStorageKey(authority, programId), JSON.stringify(session));
}

function clearStoredSession(authority: PublicKey, programId: PublicKey): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(getStorageKey(authority, programId));
}

export function useLotryProgram() {
  const { connected, publicKey, sendTransaction, signTransaction } = useWallet();
  const l1Connection = useMemo(
    () => new Connection(L1_RPC_URL, "confirmed"),
    []
  );
  const erConnection = useMemo(
    () => new Connection(ER_RPC_URL, "confirmed"),
    []
  );
  const getRpcConnection = useCallback(
    (rpcMode: PhaseNetwork): Connection =>
      rpcMode === "er" ? erConnection : l1Connection,
    [erConnection, l1Connection]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<TxDebugInfo | null>(null);

  const handleError = useCallback((errorValue: unknown): never => {
    const normalized = normalizeError(errorValue);
    setError(normalized.message);
    setDebugInfo((previous) => ({
      label: previous?.label,
      rpcMode: previous?.rpcMode,
      rpcEndpoint: previous?.rpcEndpoint,
      blockhash: previous?.blockhash,
      feePayer: previous?.feePayer,
      signerPubkeys: previous?.signerPubkeys ?? [],
      derivedPdas: previous?.derivedPdas,
      logs: normalized.logs.length > 0 ? normalized.logs : previous?.logs ?? [],
      lastError: normalized.message,
    }));
    throw new Error(normalized.message);
  }, []);

  const simulateInstructions = useCallback(
    async (
      rpcConnection: Connection,
      instructions: TransactionInstruction[],
      signers: Signer[] = [],
      label?: string
    ): Promise<void> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      const tx = new Transaction();
      tx.add(...instructions);
      tx.feePayer = publicKey;

      const latestBlockhash = await rpcConnection.getLatestBlockhash("processed");
      tx.recentBlockhash = latestBlockhash.blockhash;

      void signers;
      const simulation = await rpcConnection.simulateTransaction(tx);
      if (!simulation.value.err) {
        return;
      }

      const logs = simulation.value.logs ?? [];
      const mappedFromLogs = explainLotryError(new Error(logs.join("\n")));
      const summarizedLogs = summarizeLogs(logs);
      const prefix = label ? `${label} simulation failed.` : "Simulation failed.";
      const message =
        mappedFromLogs ??
        (summarizedLogs ? `${prefix} ${summarizedLogs}` : `${prefix} ${JSON.stringify(simulation.value.err)}`);

      const simulationError = new Error(message);
      (simulationError as unknown as { logs?: string[] }).logs = logs;
      throw simulationError;
    },
    [publicKey]
  );

  const sendAndConfirm = useCallback(
    async (
      instructions: TransactionInstruction[],
      signers: Signer[] = [],
      options: SendAndConfirmOptions = {}
    ): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (!sendTransaction && !signTransaction) {
        throw new Error("Wallet does not support transaction signing.");
      }

      const rpcMode = options.rpcMode ?? "l1";
      const rpcConnection = options.rpcConnection ?? getRpcConnection(rpcMode);

      const signerPubkeys = signers
        .map((signer) => {
          if ("publicKey" in signer) {
            return signer.publicKey.toBase58();
          }
          return null;
        })
        .filter((item): item is string => item !== null);

      setDebugInfo({
        label: options.label,
        rpcMode,
        rpcEndpoint: rpcConnection.rpcEndpoint,
        feePayer: publicKey.toBase58(),
        signerPubkeys,
        logs: [],
        lastError: undefined,
        derivedPdas: options.derivedPdas,
      });

      const shouldSimulate = options.simulateFirst ?? true;
      if (shouldSimulate) {
        try {
          await simulateInstructions(rpcConnection, instructions, signers, options.label);
        } catch (simulationError) {
          return handleError(simulationError);
        }
      }

      const tx = new Transaction();
      tx.add(...instructions);
      tx.feePayer = publicKey;

      const latestBlockhash = await rpcConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latestBlockhash.blockhash;

      // Apply non-wallet signatures before asking the wallet to sign.
      for (const signer of signers) {
        tx.partialSign(signer);
      }

      setDebugInfo((previous) =>
        previous
          ? {
              ...previous,
              blockhash: latestBlockhash.blockhash,
            }
          : previous
      );

      let signature: string;
      try {
        if (signTransaction) {
          const signed = await signTransaction(tx);
          signature = await rpcConnection.sendRawTransaction(signed.serialize());
        } else if (sendTransaction) {
          signature = await sendTransaction(tx, rpcConnection);
        } else {
          throw new Error("Wallet does not support signing.");
        }
      } catch (sendError) {
        console.error("[lotry] sendTransaction failed:", sendError);
        return handleError(sendError);
      }

      await rpcConnection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      return signature;
    },
    [getRpcConnection, handleError, publicKey, sendTransaction, signTransaction, simulateInstructions]
  );

  const ensureSession = useCallback(
    async (options: EnsureSessionOptions = {}) => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      const programId = resolveProgramId(options.programId);
      const rpcMode = options.rpcMode ?? "l1";
      const rpcConnection = getRpcConnection(rpcMode);
      const now = Math.floor(Date.now() / 1000);

      if (!options.forceNew) {
        const stored = loadStoredSession(publicKey, programId);
        if (stored && stored.validUntil > now + SESSION_RENEW_BUFFER_SECONDS) {
          try {
            const signer = Keypair.fromSecretKey(Uint8Array.from(stored.secretKey));
            const [sessionToken] = findSessionTokenPda(publicKey, signer.publicKey, programId);
            const sessionInfo = await rpcConnection.getAccountInfo(sessionToken, "confirmed");
            if (sessionInfo) {
              return { signer, sessionToken, validUntil: stored.validUntil, signature: null };
            }
          } catch {
            clearStoredSession(publicKey, programId);
          }
        }
      }

      const signer = Keypair.generate();
      const validForSeconds = options.validForSeconds ?? SESSION_TTL_SECONDS;
      const validUntil = now + validForSeconds;
      const [sessionToken] = findSessionTokenPda(publicKey, signer.publicKey, programId);

      const issueSessionIx = buildIssueSessionIx({
        authority: publicKey,
        ephemeralKey: signer.publicKey,
        validUntil,
        sessionToken,
        programId,
      });

      const signature = await sendAndConfirm([issueSessionIx], [], {
        label: "issue_session",
        rpcMode,
        rpcConnection,
        derivedPdas: {
          sessionToken: sessionToken.toBase58(),
        },
      });

      saveStoredSession(publicKey, programId, signer, validUntil);
      return { signer, sessionToken, validUntil, signature };
    },
    [getRpcConnection, publicKey, sendAndConfirm]
  );

  const fetchLotteryPool = useCallback(
    async (
      epochId: U64Input,
      programId?: PublicKey,
      rpcMode: PhaseNetwork = "l1"
    ): Promise<LotteryPoolAccount | null> => {
      const rpcConnection = getRpcConnection(rpcMode);
      const resolvedProgramId = resolveProgramId(programId);
      const [poolAddress] = findLotteryPoolPda(epochId, resolvedProgramId);
      const accountInfo = await rpcConnection.getAccountInfo(poolAddress, "confirmed");
      if (!accountInfo) {
        return null;
      }
      return decodeLotteryPoolAccount(accountInfo.data);
    },
    [getRpcConnection]
  );

  const initializeLottery = useCallback(
    async (input: InitializeLotteryInput): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "l1");
        const rpcConnection = getRpcConnection(rpcMode);
        const programId = resolveProgramId(input.programId);
        const epochId = toU64(input.epochId);
        const [lotteryPool] = findLotteryPoolPda(epochId, programId);

        const existingPool = await rpcConnection.getAccountInfo(lotteryPool, "confirmed");
        if (existingPool) {
          setDebugInfo({
            label: "initialize_lottery",
            rpcMode,
            rpcEndpoint: rpcConnection.rpcEndpoint,
            feePayer: publicKey.toBase58(),
            signerPubkeys: [],
            logs: ["Initialization skipped: lottery pool account already exists."],
            derivedPdas: {
              lotteryPool: lotteryPool.toBase58(),
            },
          });
          return "already-initialized";
        }

        const ix = buildInitializeLotteryIx({
          authority: publicKey,
          epochId,
          lotteryPool,
          programId,
        });
        const signature = await sendAndConfirm([ix], [], {
          label: "initialize_lottery",
          rpcMode,
          rpcConnection,
          derivedPdas: {
            lotteryPool: lotteryPool.toBase58(),
          },
        });
        setLastSignature(signature);
        return signature;
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [getRpcConnection, handleError, publicKey, sendAndConfirm]
  );

  const initPlayerTicket = useCallback(
    async (input: InitPlayerTicketInput): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "l1");
        const rpcConnection = getRpcConnection(rpcMode);
        const programId = resolveProgramId(input.programId);
        const epochId = toU64(input.epochId);
        const ticketCount = toU64(input.ticketCount);
        const [playerTicket] = findPlayerTicketPda(epochId, ticketCount, programId);

        const existingTicket = await rpcConnection.getAccountInfo(playerTicket, "confirmed");
        if (existingTicket) {
          setDebugInfo({
            label: "init_player_ticket",
            rpcMode,
            rpcEndpoint: rpcConnection.rpcEndpoint,
            feePayer: publicKey.toBase58(),
            signerPubkeys: [],
            logs: ["Initialization skipped: player ticket account already exists."],
            derivedPdas: {
              playerTicket: playerTicket.toBase58(),
            },
          });
          return "already-initialized";
        }

        const ix = buildInitPlayerTicketIx({
          feePayer: publicKey,
          epochId,
          ticketCount,
          playerTicket,
          programId,
        });
        const signature = await sendAndConfirm([ix], [], {
          label: "init_player_ticket",
          rpcMode,
          rpcConnection,
          derivedPdas: {
            playerTicket: playerTicket.toBase58(),
          },
        });
        setLastSignature(signature);
        return signature;
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [getRpcConnection, handleError, publicKey, sendAndConfirm]
  );

  const issueSession = useCallback(
    async (
      input: IssueSessionInput = {}
    ): Promise<{
      signature: string | null;
      sessionToken: PublicKey;
      ephemeralSigner: PublicKey;
      validUntil: number;
    }> => {
      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "l1");
        const session = await ensureSession({
          programId: input.programId,
          rpcMode,
          validForSeconds: input.validForSeconds,
          forceNew: input.forceNew ?? true,
        });
        if (session.signature) {
          setLastSignature(session.signature);
        }
        return {
          signature: session.signature,
          sessionToken: session.sessionToken,
          ephemeralSigner: session.signer.publicKey,
          validUntil: session.validUntil,
        };
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [ensureSession, handleError]
  );

  const buyTicket = useCallback(
    async (input: BuyTicketInput): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "er");
        const rpcConnection = getRpcConnection(rpcMode);
        const programId = resolveProgramId(input.programId);
        const epochId = toU64(input.epochId);
        const ticketCount = toU64(input.ticketCount);

        const [lotteryPool] = findLotteryPoolPda(epochId, programId);
        const lotteryPoolInfo = await rpcConnection.getAccountInfo(lotteryPool, "confirmed");
        if (!lotteryPoolInfo) {
          if (rpcMode === "er") {
            throw new Error(
              "Lottery pool not found on ER route. Run Initialize on L1 first, then delegate."
            );
          }
          const initLotteryIx = buildInitializeLotteryIx({
            authority: publicKey,
            epochId,
            lotteryPool,
            programId,
          });
          await sendAndConfirm([initLotteryIx], [], {
            label: "initialize_lottery",
            rpcMode,
            rpcConnection,
            derivedPdas: {
              lotteryPool: lotteryPool.toBase58(),
            },
          });
        } else if (!lotteryPoolInfo.owner.equals(programId)) {
          if (lotteryPoolInfo.owner.equals(DELEGATION_PROGRAM_ID) && rpcMode === "l1") {
            throw new Error(
              "Lottery pool is delegated to the ER program. `buy_ticket` must be sent to the ER execution endpoint, not standard devnet RPC."
            );
          }
          if (
            !lotteryPoolInfo.owner.equals(DELEGATION_PROGRAM_ID) &&
            !lotteryPoolInfo.owner.equals(programId)
          ) {
            throw new Error(
              `Lottery pool owner mismatch. Expected ${programId.toBase58()} but found ${lotteryPoolInfo.owner.toBase58()}.`
            );
          }
        }

        const decodedPool = (() => {
          try {
            return decodeLotteryPoolAccount(lotteryPoolInfo.data);
          } catch {
            return null;
          }
        })();
        if (decodedPool) {
          if (decodedPool.epochId !== epochId) {
            throw new Error(
              `Epoch mismatch before buy: pool epoch is ${decodedPool.epochId.toString()} but input epoch is ${epochId.toString()}. Use the matching epoch or initialize/delegate that epoch first.`
            );
          }
          if (decodedPool.ticketCount !== ticketCount) {
            throw new Error(
              `Ticket count mismatch before buy: pool expects ${decodedPool.ticketCount.toString()} but input is ${ticketCount.toString()}. Set Ticket Count to pool.ticket_count, then run Init Ticket + Delegate Ticket for that count.`
            );
          }
        }

        const [playerTicket] = findPlayerTicketPda(epochId, ticketCount, programId);
        const playerTicketInfo = await rpcConnection.getAccountInfo(playerTicket, "confirmed");
        if (!playerTicketInfo) {
          if (rpcMode === "er") {
            throw new Error(
              "Player ticket not found on ER route. Run Init Ticket on L1 first, then delegate ticket."
            );
          }
          const initPlayerTicketIx = buildInitPlayerTicketIx({
            feePayer: publicKey,
            epochId,
            ticketCount,
            playerTicket,
            programId,
          });
          await sendAndConfirm([initPlayerTicketIx], [], {
            label: "init_player_ticket",
            rpcMode,
            rpcConnection,
            derivedPdas: {
              playerTicket: playerTicket.toBase58(),
            },
          });
        } else if (!playerTicketInfo.owner.equals(programId)) {
          if (playerTicketInfo.owner.equals(DELEGATION_PROGRAM_ID) && rpcMode === "l1") {
            throw new Error(
              "Player ticket is delegated to the ER program. `buy_ticket` must be sent to the ER execution endpoint, not standard devnet RPC."
            );
          }
          if (
            !playerTicketInfo.owner.equals(DELEGATION_PROGRAM_ID) &&
            !playerTicketInfo.owner.equals(programId)
          ) {
            throw new Error(
              `Player ticket owner mismatch. Expected ${programId.toBase58()} but found ${playerTicketInfo.owner.toBase58()}.`
            );
          }
        }

        const decodedTicket = (() => {
          try {
            return decodePlayerTicketAccount(playerTicketInfo.data);
          } catch {
            return null;
          }
        })();
        if (decodedTicket) {
          if (decodedTicket.epochId !== epochId) {
            throw new Error(
              `Epoch mismatch before buy: player ticket epoch is ${decodedTicket.epochId.toString()} but input epoch is ${epochId.toString()}. Recreate this ticket for the current epoch.`
            );
          }
          if (decodedTicket.ticketId !== ticketCount) {
            throw new Error(
              `Ticket mismatch before buy: player ticket id is ${decodedTicket.ticketId.toString()} but input ticket count is ${ticketCount.toString()}. Recreate/delegate the correct ticket PDA first.`
            );
          }
        }

        const { signer, sessionToken } = await ensureSession({
          programId,
          rpcMode: "l1",
          forceNew: false,
        });
        const buyIx = buildBuyTicketIx({
          authority: publicKey,
          feePayer: publicKey,
          ephemeralSigner: signer.publicKey,
          epochId,
          ticketCount,
          ticketData: input.ticketData ?? createRandomTicketData(),
          lotteryPool,
          playerTicket,
          sessionToken,
          programId,
        });

        const signature = await sendAndConfirm([buyIx], [signer], {
          label: "buy_ticket",
          rpcMode,
          rpcConnection,
          derivedPdas: {
            lotteryPool: lotteryPool.toBase58(),
            playerTicket: playerTicket.toBase58(),
            sessionToken: sessionToken.toBase58(),
          },
        });
        setLastSignature(signature);
        return signature;
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [ensureSession, getRpcConnection, handleError, publicKey, sendAndConfirm]
  );

  const requestWinner = useCallback(
    async (input: RequestWinnerInput): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "er");
        const rpcConnection = getRpcConnection(rpcMode);
        const programId = resolveProgramId(input.programId);
        const epochId = toU64(input.epochId);
        const [lotteryPool] = findLotteryPoolPda(epochId, programId);
        const lotteryPoolInfo = await rpcConnection.getAccountInfo(lotteryPool, "confirmed");

        if (!lotteryPoolInfo) {
          throw new Error(
            `Lottery pool not found for epoch ${epochId.toString()}. Buy a ticket first or initialize the pool.`
          );
        }
        if (!lotteryPoolInfo.owner.equals(programId)) {
          if (lotteryPoolInfo.owner.equals(DELEGATION_PROGRAM_ID) && rpcMode === "l1") {
            throw new Error(
              "Lottery pool is delegated to the ER program. `request_winner` must be sent to the ER execution endpoint, not standard devnet RPC."
            );
          }
          if (
            !lotteryPoolInfo.owner.equals(DELEGATION_PROGRAM_ID) &&
            !lotteryPoolInfo.owner.equals(programId)
          ) {
            throw new Error(
              `Lottery pool owner mismatch. Expected ${programId.toBase58()} but found ${lotteryPoolInfo.owner.toBase58()}.`
            );
          }
        }

        const { signer, sessionToken } = await ensureSession({
          programId,
          rpcMode: "l1",
          forceNew: false,
        });
        const clientSeed =
          typeof input.clientSeed === "number"
            ? input.clientSeed
            : Math.floor(Math.random() * 256);

        const requestWinnerIx = buildRequestWinnerIx({
          authority: publicKey,
          ephemeralSigner: signer.publicKey,
          epochId,
          clientSeed,
          lotteryPool,
          sessionToken,
          programId,
        });

        const signature = await sendAndConfirm([requestWinnerIx], [signer], {
          label: "request_winner",
          rpcMode,
          rpcConnection,
          derivedPdas: {
            lotteryPool: lotteryPool.toBase58(),
            sessionToken: sessionToken.toBase58(),
          },
        });
        setLastSignature(signature);
        return signature;
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [ensureSession, getRpcConnection, handleError, publicKey, sendAndConfirm]
  );

  const delegateLottery = useCallback(
    async (input: DelegateLotteryInput): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "l1");
        const rpcConnection = getRpcConnection(rpcMode);
        const programId = resolveProgramId(input.programId);
        const delegationProgramId = input.delegationProgramId ?? DELEGATION_PROGRAM_ID;
        const epochId = toU64(input.epochId);
        const [lotteryPool] = findLotteryPoolPda(epochId, programId);
        const poolInfo = await rpcConnection.getAccountInfo(lotteryPool, "confirmed");
        if (!poolInfo) {
          throw new Error(
            `LotteryPool PDA ${lotteryPool.toBase58()} not found for epoch ${epochId.toString()}. Run initialize_lottery first.`
          );
        }

        const delegationProgramInfo = await rpcConnection.getAccountInfo(
          delegationProgramId,
          "confirmed"
        );
        if (!delegationProgramInfo || !delegationProgramInfo.executable) {
          throw new Error(
            `Delegation program ${delegationProgramId.toBase58()} is missing or not executable on this cluster.`
          );
        }

        const poolState = decodeLotteryPoolAccount(poolInfo.data);
        if (!poolState.authority.equals(publicKey)) {
          throw new Error(
            `Connected wallet does not match pool authority (${poolState.authority.toBase58()}).`
          );
        }

        const ix = buildDelegateLotteryIx({
          authority: publicKey,
          epochId,
          bufferLotteryPool: input.bufferLotteryPool,
          delegationRecordLotteryPool: input.delegationRecordLotteryPool,
          delegationMetadataLotteryPool: input.delegationMetadataLotteryPool,
          validator: input.validator,
          lotteryPool,
          programId,
          delegationProgramId,
        });
        const signature = await sendAndConfirm([ix], [], {
          label: "delegate_lottery",
          rpcMode,
          rpcConnection,
          derivedPdas: {
            delegationProgramId: delegationProgramId.toBase58(),
            lotteryPool: lotteryPool.toBase58(),
            bufferLotteryPool: input.bufferLotteryPool.toBase58(),
            delegationRecordLotteryPool: input.delegationRecordLotteryPool.toBase58(),
            delegationMetadataLotteryPool: input.delegationMetadataLotteryPool.toBase58(),
          },
        });
        setLastSignature(signature);
        return signature;
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [getRpcConnection, handleError, publicKey, sendAndConfirm]
  );

  const delegatePlayerTicket = useCallback(
    async (input: DelegatePlayerTicketInput): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "l1");
        const rpcConnection = getRpcConnection(rpcMode);
        const programId = resolveProgramId(input.programId);
        const delegationProgramId = input.delegationProgramId ?? DELEGATION_PROGRAM_ID;
        const epochId = toU64(input.epochId);
        const ticketCount = toU64(input.ticketCount);
        const [playerTicket] = findPlayerTicketPda(epochId, ticketCount, programId);
        const playerTicketInfo = await rpcConnection.getAccountInfo(playerTicket, "confirmed");
        if (!playerTicketInfo) {
          throw new Error(
            `PlayerTicket PDA ${playerTicket.toBase58()} not found. Run init_player_ticket first for epoch ${epochId.toString()} and ticket_count ${ticketCount.toString()}.`
          );
        }

        const delegationProgramInfo = await rpcConnection.getAccountInfo(
          delegationProgramId,
          "confirmed"
        );
        if (!delegationProgramInfo || !delegationProgramInfo.executable) {
          throw new Error(
            `Delegation program ${delegationProgramId.toBase58()} is missing or not executable on this cluster.`
          );
        }

        const ix = buildDelegatePlayerTicketIx({
          feePayer: publicKey,
          epochId,
          ticketCount,
          bufferPlayerTicket: input.bufferPlayerTicket,
          delegationRecord: input.delegationRecord,
          delegationMetadata: input.delegationMetadata,
          validator: input.validator,
          playerTicket,
          programId,
          delegationProgramId,
        });
        const signature = await sendAndConfirm([ix], [], {
          label: "delegate_player_ticket",
          rpcMode,
          rpcConnection,
          derivedPdas: {
            delegationProgramId: delegationProgramId.toBase58(),
            playerTicket: playerTicket.toBase58(),
            bufferPlayerTicket: input.bufferPlayerTicket.toBase58(),
            delegationRecord: input.delegationRecord.toBase58(),
            delegationMetadata: input.delegationMetadata.toBase58(),
          },
        });
        setLastSignature(signature);
        return signature;
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [getRpcConnection, handleError, publicKey, sendAndConfirm]
  );

  const undelegatePool = useCallback(
    async (input: UndelegatePoolInput): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "er");
        const rpcConnection = getRpcConnection(rpcMode);
        const programId = resolveProgramId(input.programId);
        const epochId = toU64(input.epochId);
        const [lotteryPool] = findLotteryPoolPda(epochId, programId);
        const magicProgram = input.magicProgram ?? MAGIC_PROGRAM_ID;
        const magicContext = input.magicContext ?? MAGIC_CONTEXT_ID;

        const magicProgramInfo = await rpcConnection.getAccountInfo(
          magicProgram,
          "confirmed"
        );
        if (!magicProgramInfo || !magicProgramInfo.executable) {
          throw new Error(
            `Magic program ${magicProgram.toBase58()} is missing or not executable on ${rpcConnection.rpcEndpoint}. Set correct Magic IDs in Advanced settings.`
          );
        }

        const ix = buildUndelegatePoolIx({
          payer: publicKey,
          epochId,
          lotteryPool,
          magicProgram,
          magicContext,
          programId,
        });
        const signature = await sendAndConfirm([ix], [], {
          label: "undelegate_pool",
          rpcMode,
          rpcConnection,
          derivedPdas: {
            lotteryPool: lotteryPool.toBase58(),
            magicProgram: magicProgram.toBase58(),
            magicContext: magicContext.toBase58(),
          },
        });
        setLastSignature(signature);
        return signature;
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [getRpcConnection, handleError, publicKey, sendAndConfirm]
  );

  const processUndelegation = useCallback(
    async (input: ProcessUndelegationInput): Promise<string> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }

      setIsSubmitting(true);
      setError(null);
      setLastSignature(null);

      try {
        const rpcMode = resolveRpcMode(input.rpcMode, "l1");
        const rpcConnection = getRpcConnection(rpcMode);
        const ix = buildProcessUndelegationIx({
          baseAccount: input.baseAccount,
          buffer: input.buffer,
          payer: publicKey,
          accountSeeds: input.accountSeeds,
          programId: input.programId,
        });
        const signature = await sendAndConfirm([ix], [], {
          label: "process_undelegation",
          rpcMode,
          rpcConnection,
          derivedPdas: {
            baseAccount: input.baseAccount.toBase58(),
            buffer: input.buffer.toBase58(),
          },
        });
        setLastSignature(signature);
        return signature;
      } catch (transactionError) {
        return handleError(transactionError);
      } finally {
        setIsSubmitting(false);
      }
    },
    [getRpcConnection, handleError, publicKey, sendAndConfirm]
  );

  return {
    connected,
    isSubmitting,
    lastSignature,
    error,
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
    clearError: () => {
      setError(null);
      setDebugInfo((previous) =>
        previous
          ? {
              ...previous,
              lastError: undefined,
            }
          : previous
      );
    },
  };
}
