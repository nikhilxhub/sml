import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import lotryIdlJson from "@/lib/idl/lotry.json";

type PrimitiveIdlType = "u8" | "u64" | "i64" | "pubkey" | "bytes" | "bool";
type IdlType =
  | PrimitiveIdlType
  | {
      array: [PrimitiveIdlType, number];
    }
  | {
      vec: PrimitiveIdlType;
    };

interface IdlInstructionArg {
  name: string;
  type: IdlType;
}

interface IdlInstructionAccount {
  name: string;
  writable?: boolean;
  signer?: boolean;
  optional?: boolean;
  address?: string;
}

interface IdlInstruction {
  name: string;
  discriminator: number[];
  accounts: IdlInstructionAccount[];
  args: IdlInstructionArg[];
}

interface IdlAccountDefinition {
  name: string;
  discriminator: number[];
}

interface IdlErrorDefinition {
  code: number;
  name: string;
  msg?: string;
}

interface LotryIdl {
  address: string;
  instructions: IdlInstruction[];
  accounts?: IdlAccountDefinition[];
  errors?: IdlErrorDefinition[];
}

type PublicKeyInput = PublicKey | string;
export type U64Input = bigint | number | string;
export type I64Input = bigint | number | string;

const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const MAX_U64 = (BIGINT_ONE << BigInt(64)) - BIGINT_ONE;
const MIN_I64 = -(BIGINT_ONE << BigInt(63));
const MAX_I64 = (BIGINT_ONE << BigInt(63)) - BIGINT_ONE;
const SEED_LOTTERY_POOL = Buffer.from("lottery_pool", "utf8");
const SEED_PLAYER_TICKET = Buffer.from("player_ticket", "utf8");
const SEED_SESSION = Buffer.from("session", "utf8");
const SEED_BUFFER = Buffer.from("buffer", "utf8");
const SEED_DELEGATION = Buffer.from("delegation", "utf8");
const SEED_DELEGATION_METADATA = Buffer.from("delegation-metadata", "utf8");

const lotryIdl = lotryIdlJson as LotryIdl;

export const LOTRY_PROGRAM_ID = new PublicKey(lotryIdl.address);
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111"
);
export const LOTRY_ERROR_BY_CODE = new Map<number, string>(
  (lotryIdl.errors ?? []).map((errorDef) => [
    errorDef.code,
    errorDef.msg ?? errorDef.name,
  ])
);

function toPublicKey(value: PublicKeyInput): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function assertInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
}

export function toU64(value: U64Input): bigint {
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed < BIGINT_ZERO || parsed > MAX_U64) {
    throw new Error(`u64 value out of range: ${value.toString()}`);
  }
  return parsed;
}

function toI64(value: I64Input): bigint {
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed < MIN_I64 || parsed > MAX_I64) {
    throw new Error(`i64 value out of range: ${value.toString()}`);
  }
  return parsed;
}

function encodeU8(value: unknown): Uint8Array {
  if (typeof value !== "number") {
    throw new Error("u8 value must be a number.");
  }
  assertInteger(value, "u8");
  if (value < 0 || value > 255) {
    throw new Error(`u8 value out of range: ${value.toString()}`);
  }
  return Uint8Array.of(value);
}

function encodeU32(value: number): Uint8Array {
  assertInteger(value, "u32");
  if (value < 0 || value > 0xffffffff) {
    throw new Error(`u32 value out of range: ${value.toString()}`);
  }
  const data = new Uint8Array(4);
  const view = new DataView(data.buffer);
  view.setUint32(0, value, true);
  return data;
}

function encodeU64(value: U64Input): Uint8Array {
  const data = new Uint8Array(8);
  const view = new DataView(data.buffer);
  view.setBigUint64(0, toU64(value), true);
  return data;
}

function encodeI64(value: I64Input): Uint8Array {
  const data = new Uint8Array(8);
  const view = new DataView(data.buffer);
  view.setBigInt64(0, toI64(value), true);
  return data;
}

function encodeBool(value: unknown): Uint8Array {
  if (typeof value !== "boolean") {
    throw new Error("bool value must be true or false.");
  }
  return Uint8Array.of(value ? 1 : 0);
}

function toByteArray(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  throw new Error("Value must be a Uint8Array or number[] for byte encoding.");
}

function encodeBytes(value: unknown): Uint8Array {
  const bytes = toByteArray(value);
  return concatBytes([encodeU32(bytes.length), bytes]);
}

function encodePrimitive(type: PrimitiveIdlType, value: unknown): Uint8Array {
  switch (type) {
    case "u8":
      return encodeU8(value);
    case "u64":
      return encodeU64(value as U64Input);
    case "i64":
      return encodeI64(value as I64Input);
    case "bool":
      return encodeBool(value);
    case "pubkey":
      return toPublicKey(value as PublicKeyInput).toBytes();
    case "bytes":
      return encodeBytes(value);
    default: {
      const unreachableType: never = type;
      throw new Error(`Unsupported primitive IDL type: ${String(unreachableType)}`);
    }
  }
}

function encodeIdlType(type: IdlType, value: unknown): Uint8Array {
  if (typeof type === "string") {
    return encodePrimitive(type, value);
  }

  if ("array" in type) {
    const [elementType, length] = type.array;
    const bytes = toByteArray(value);
    if (bytes.length !== length) {
      throw new Error(
        `Expected array length ${length.toString()}, got ${bytes.length.toString()}.`
      );
    }
    if (elementType !== "u8") {
      throw new Error(`Unsupported fixed array element type: ${elementType}.`);
    }
    return bytes;
  }

  if ("vec" in type) {
    if (!Array.isArray(value)) {
      throw new Error("Vector value must be an array.");
    }
    const elements = value as unknown[];
    const encodedElements = elements.map((item) => encodeIdlType(type.vec, item));
    return concatBytes([encodeU32(elements.length), ...encodedElements]);
  }

  throw new Error("Unsupported IDL type.");
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function getInstructionDefinition(name: string): IdlInstruction {
  const definition = lotryIdl.instructions.find((instruction) => instruction.name === name);
  if (!definition) {
    throw new Error(`Instruction "${name}" not found in lotry IDL.`);
  }
  return definition;
}

function buildInstructionData(
  instruction: IdlInstruction,
  args: Record<string, unknown>
): Buffer {
  const encodedArgs: Uint8Array[] = [];
  for (const argDef of instruction.args) {
    if (!(argDef.name in args)) {
      throw new Error(
        `Missing required argument "${argDef.name}" for instruction "${instruction.name}".`
      );
    }
    encodedArgs.push(encodeIdlType(argDef.type, args[argDef.name]));
  }

  return Buffer.from(
    concatBytes([Uint8Array.from(instruction.discriminator), ...encodedArgs])
  );
}

function buildInstructionAccounts(
  instruction: IdlInstruction,
  accounts: Record<string, PublicKeyInput | undefined>,
  programId: PublicKey,
  accountRoleOverrides: Record<string, { isSigner?: boolean; isWritable?: boolean }> = {}
): AccountMeta[] {
  const metas: AccountMeta[] = [];

  for (const accountDef of instruction.accounts) {
    const override = accountRoleOverrides[accountDef.name];
    const providedAccount = accounts[accountDef.name];

    if (accountDef.optional && !accountDef.address && !providedAccount) {
      metas.push({
        // Anchor optional accounts consume a slot; program ID means "None".
        pubkey: programId,
        isSigner: Boolean(override?.isSigner),
        isWritable: Boolean(override?.isWritable),
      });
      continue;
    }

    const pubkey = providedAccount
      ? toPublicKey(providedAccount)
      : accountDef.address
      ? new PublicKey(accountDef.address)
      : undefined;

    if (!pubkey) {
      throw new Error(
        `Missing account "${accountDef.name}" for instruction "${instruction.name}".`
      );
    }

    metas.push({
      pubkey,
      isSigner: override?.isSigner ?? Boolean(accountDef.signer),
      isWritable: override?.isWritable ?? Boolean(accountDef.writable),
    });
  }

  return metas;
}

export function buildLotryInstruction(params: {
  instructionName: string;
  args: Record<string, unknown>;
  accounts: Record<string, PublicKeyInput | undefined>;
  programId?: PublicKeyInput;
  accountRoleOverrides?: Record<string, { isSigner?: boolean; isWritable?: boolean }>;
}): TransactionInstruction {
  const instruction = getInstructionDefinition(params.instructionName);
  const programId = params.programId ? toPublicKey(params.programId) : LOTRY_PROGRAM_ID;
  return new TransactionInstruction({
    programId,
    keys: buildInstructionAccounts(
      instruction,
      params.accounts,
      programId,
      params.accountRoleOverrides
    ),
    data: buildInstructionData(instruction, params.args),
  });
}

function asU64Seed(value: U64Input): Buffer {
  return Buffer.from(encodeU64(value));
}

export function u64ToLeBytes(value: U64Input): Uint8Array {
  return encodeU64(value);
}

export function findLotteryPoolPda(
  epochId: U64Input,
  programId: PublicKeyInput = LOTRY_PROGRAM_ID
): [PublicKey, number] {
  const resolvedProgramId = toPublicKey(programId);
  return PublicKey.findProgramAddressSync(
    [SEED_LOTTERY_POOL, asU64Seed(epochId)],
    resolvedProgramId
  );
}

export function findPlayerTicketPda(
  epochId: U64Input,
  ticketCount: U64Input,
  programId: PublicKeyInput = LOTRY_PROGRAM_ID
): [PublicKey, number] {
  const resolvedProgramId = toPublicKey(programId);
  return PublicKey.findProgramAddressSync(
    [SEED_PLAYER_TICKET, asU64Seed(epochId), asU64Seed(ticketCount)],
    resolvedProgramId
  );
}

export function findSessionTokenPda(
  authority: PublicKeyInput,
  ephemeralKey: PublicKeyInput,
  programId: PublicKeyInput = LOTRY_PROGRAM_ID
): [PublicKey, number] {
  const resolvedProgramId = toPublicKey(programId);
  return PublicKey.findProgramAddressSync(
    [SEED_SESSION, toPublicKey(authority).toBuffer(), toPublicKey(ephemeralKey).toBuffer()],
    resolvedProgramId
  );
}

export function findBufferPda(
  baseAccount: PublicKeyInput,
  ownerProgramId: PublicKeyInput = LOTRY_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_BUFFER, toPublicKey(baseAccount).toBuffer()],
    toPublicKey(ownerProgramId)
  );
}

export function findDelegationRecordPda(
  baseAccount: PublicKeyInput,
  delegationProgramId: PublicKeyInput = DELEGATION_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_DELEGATION, toPublicKey(baseAccount).toBuffer()],
    toPublicKey(delegationProgramId)
  );
}

export function findDelegationMetadataPda(
  baseAccount: PublicKeyInput,
  delegationProgramId: PublicKeyInput = DELEGATION_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_DELEGATION_METADATA, toPublicKey(baseAccount).toBuffer()],
    toPublicKey(delegationProgramId)
  );
}

export function buildInitializeLotteryIx(params: {
  authority: PublicKeyInput;
  epochId: U64Input;
  lotteryPool?: PublicKeyInput;
  programId?: PublicKeyInput;
}): TransactionInstruction {
  const programId = params.programId ?? LOTRY_PROGRAM_ID;
  const lotteryPool = params.lotteryPool ?? findLotteryPoolPda(params.epochId, programId)[0];
  return buildLotryInstruction({
    instructionName: "initialize_lottery",
    args: { epoch_id: toU64(params.epochId) },
    programId,
    accounts: {
      lottery_pool: lotteryPool,
      authority: params.authority,
      system_program: SystemProgram.programId,
    },
  });
}

export function buildInitPlayerTicketIx(params: {
  feePayer: PublicKeyInput;
  epochId: U64Input;
  ticketCount: U64Input;
  playerTicket?: PublicKeyInput;
  programId?: PublicKeyInput;
}): TransactionInstruction {
  const programId = params.programId ?? LOTRY_PROGRAM_ID;
  const playerTicket =
    params.playerTicket ??
    findPlayerTicketPda(params.epochId, params.ticketCount, programId)[0];
  return buildLotryInstruction({
    instructionName: "init_player_ticket",
    args: {
      _epoch_id: toU64(params.epochId),
      _ticket_count: toU64(params.ticketCount),
    },
    programId,
    accounts: {
      player_ticket: playerTicket,
      fee_payer: params.feePayer,
      system_program: SystemProgram.programId,
    },
  });
}

export function buildIssueSessionIx(params: {
  authority: PublicKeyInput;
  ephemeralKey: PublicKeyInput;
  validUntil: I64Input;
  sessionToken?: PublicKeyInput;
  programId?: PublicKeyInput;
}): TransactionInstruction {
  const programId = params.programId ?? LOTRY_PROGRAM_ID;
  const sessionToken =
    params.sessionToken ??
    findSessionTokenPda(params.authority, params.ephemeralKey, programId)[0];
  return buildLotryInstruction({
    instructionName: "issue_session",
    args: {
      ephemeral_key: params.ephemeralKey,
      valid_until: params.validUntil,
    },
    programId,
    accounts: {
      session_token: sessionToken,
      authority: params.authority,
      system_program: SystemProgram.programId,
    },
  });
}

export function buildBuyTicketIx(params: {
  authority: PublicKeyInput;
  feePayer: PublicKeyInput;
  ephemeralSigner: PublicKeyInput;
  epochId: U64Input;
  ticketCount: U64Input;
  ticketData: Uint8Array | number[];
  lotteryPool?: PublicKeyInput;
  playerTicket?: PublicKeyInput;
  sessionToken?: PublicKeyInput;
  programId?: PublicKeyInput;
}): TransactionInstruction {
  const programId = params.programId ?? LOTRY_PROGRAM_ID;
  const lotteryPool = params.lotteryPool ?? findLotteryPoolPda(params.epochId, programId)[0];
  const playerTicket =
    params.playerTicket ??
    findPlayerTicketPda(params.epochId, params.ticketCount, programId)[0];
  const sessionToken =
    params.sessionToken ??
    findSessionTokenPda(params.authority, params.ephemeralSigner, programId)[0];

  return buildLotryInstruction({
    instructionName: "buy_ticket",
    args: {
      epoch_id: toU64(params.epochId),
      ticket_count: toU64(params.ticketCount),
      ticket_data: toByteArray(params.ticketData),
    },
    programId,
    accounts: {
      lottery_pool: lotteryPool,
      player_ticket: playerTicket,
      authority: params.authority,
      session_token: sessionToken,
      ephemeral_signer: params.ephemeralSigner,
      fee_payer: params.feePayer,
      system_program: SystemProgram.programId,
    },
  });
}

export function buildRequestWinnerIx(params: {
  authority: PublicKeyInput;
  ephemeralSigner: PublicKeyInput;
  epochId: U64Input;
  clientSeed: number;
  lotteryPool?: PublicKeyInput;
  sessionToken?: PublicKeyInput;
  programId?: PublicKeyInput;
}): TransactionInstruction {
  const programId = params.programId ?? LOTRY_PROGRAM_ID;
  const lotteryPool = params.lotteryPool ?? findLotteryPoolPda(params.epochId, programId)[0];
  const sessionToken =
    params.sessionToken ??
    findSessionTokenPda(params.authority, params.ephemeralSigner, programId)[0];

  return buildLotryInstruction({
    instructionName: "request_winner",
    args: {
      epoch_id: toU64(params.epochId),
      client_seed: params.clientSeed,
    },
    programId,
    accounts: {
      lottery_pool: lotteryPool,
      authority: params.authority,
      session_token: sessionToken,
      ephemeral_signer: params.ephemeralSigner,
    },
  });
}

export function buildDelegateLotteryIx(params: {
  authority: PublicKeyInput;
  epochId: U64Input;
  bufferLotteryPool: PublicKeyInput;
  delegationRecordLotteryPool: PublicKeyInput;
  delegationMetadataLotteryPool: PublicKeyInput;
  validator?: PublicKeyInput;
  lotteryPool?: PublicKeyInput;
  programId?: PublicKeyInput;
  delegationProgramId?: PublicKeyInput;
}): TransactionInstruction {
  const programId = params.programId ?? LOTRY_PROGRAM_ID;
  const delegationProgramId = params.delegationProgramId ?? DELEGATION_PROGRAM_ID;
  const lotteryPool = params.lotteryPool ?? findLotteryPoolPda(params.epochId, programId)[0];

  return buildLotryInstruction({
    instructionName: "delegate_lottery",
    args: {
      epoch_id: toU64(params.epochId),
    },
    programId,
    accounts: {
      lottery_pool: lotteryPool,
      authority: params.authority,
      validator: params.validator ?? undefined,
      buffer_lottery_pool: params.bufferLotteryPool,
      delegation_record_lottery_pool: params.delegationRecordLotteryPool,
      delegation_metadata_lottery_pool: params.delegationMetadataLotteryPool,
      delegation_program: delegationProgramId,
      owner_program: programId,
      system_program: SystemProgram.programId,
    },
  });
}

export function buildDelegatePlayerTicketIx(params: {
  feePayer: PublicKeyInput;
  epochId: U64Input;
  ticketCount: U64Input;
  bufferPlayerTicket: PublicKeyInput;
  delegationRecord: PublicKeyInput;
  delegationMetadata: PublicKeyInput;
  validator?: PublicKeyInput;
  playerTicket?: PublicKeyInput;
  programId?: PublicKeyInput;
  delegationProgramId?: PublicKeyInput;
}): TransactionInstruction {
  const programId = params.programId ?? LOTRY_PROGRAM_ID;
  const delegationProgramId = params.delegationProgramId ?? DELEGATION_PROGRAM_ID;
  const playerTicket =
    params.playerTicket ??
    findPlayerTicketPda(params.epochId, params.ticketCount, programId)[0];

  return buildLotryInstruction({
    instructionName: "delegate_player_ticket",
    args: {
      epoch_id: toU64(params.epochId),
      ticket_count: toU64(params.ticketCount),
    },
    programId,
    accounts: {
      player_ticket: playerTicket,
      fee_payer: params.feePayer,
      validator: params.validator ?? undefined,
      buffer_player_ticket: params.bufferPlayerTicket,
      delegation_record: params.delegationRecord,
      delegation_metadata: params.delegationMetadata,
      ephemeral_rollups_program: delegationProgramId,
      owner_program: programId,
      system_program: SystemProgram.programId,
    },
  });
}

export function buildUndelegatePoolIx(params: {
  payer: PublicKeyInput;
  epochId: U64Input;
  lotteryPool?: PublicKeyInput;
  magicProgram?: PublicKeyInput;
  magicContext?: PublicKeyInput;
  programId?: PublicKeyInput;
}): TransactionInstruction {
  const programId = params.programId ?? LOTRY_PROGRAM_ID;
  const lotteryPool = params.lotteryPool ?? findLotteryPoolPda(params.epochId, programId)[0];
  return buildLotryInstruction({
    instructionName: "undelegate_pool",
    args: {
      _epoch_id: toU64(params.epochId),
    },
    programId,
    accounts: {
      lottery_pool: lotteryPool,
      payer: params.payer,
      magic_program: params.magicProgram ?? MAGIC_PROGRAM_ID,
      magic_context: params.magicContext ?? MAGIC_CONTEXT_ID,
    },
  });
}

export function buildProcessUndelegationIx(params: {
  baseAccount: PublicKeyInput;
  buffer: PublicKeyInput;
  payer: PublicKeyInput;
  accountSeeds: Array<Uint8Array | number[]>;
  systemProgram?: PublicKeyInput;
  programId?: PublicKeyInput;
}): TransactionInstruction {
  return buildLotryInstruction({
    instructionName: "process_undelegation",
    args: {
      account_seeds: params.accountSeeds.map((seedBytes) => toByteArray(seedBytes)),
    },
    programId: params.programId,
    // IDL marks `payer` as non-signer but runtime requires signer.
    accountRoleOverrides: {
      payer: { isSigner: true, isWritable: true },
    },
    accounts: {
      base_account: params.baseAccount,
      buffer: params.buffer,
      payer: params.payer,
      system_program: params.systemProgram ?? SystemProgram.programId,
    },
  });
}

export interface LotteryPoolAccount {
  authority: PublicKey;
  epochId: bigint;
  ticketCount: bigint;
  totalFunds: bigint;
  isActive: boolean;
  vrfRequestId: PublicKey | null;
  winnerTicketId: bigint | null;
}

export interface PlayerTicketAccount {
  owner: PublicKey;
  epochId: bigint;
  ticketId: bigint;
  ticketData: Uint8Array;
}

function readU64(data: Uint8Array, offset: number): [bigint, number] {
  const end = offset + 8;
  if (end > data.length) {
    throw new Error("Unexpected end of account data while reading u64.");
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return [view.getBigUint64(0, true), end];
}

function readBool(data: Uint8Array, offset: number): [boolean, number] {
  const end = offset + 1;
  if (end > data.length) {
    throw new Error("Unexpected end of account data while reading bool.");
  }
  return [data[offset] === 1, end];
}

function readOptionTag(data: Uint8Array, offset: number): [number, number] {
  const end = offset + 1;
  if (end > data.length) {
    throw new Error("Unexpected end of account data while reading option tag.");
  }
  return [data[offset], end];
}

function readPublicKey(data: Uint8Array, offset: number): [PublicKey, number] {
  const end = offset + 32;
  if (end > data.length) {
    throw new Error("Unexpected end of account data while reading pubkey.");
  }
  return [new PublicKey(data.slice(offset, end)), end];
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function decodeLotteryPoolAccount(data: Buffer | Uint8Array): LotteryPoolAccount {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  const discriminator = lotryIdl.accounts?.find(
    (accountDef) => accountDef.name === "LotteryPool"
  )?.discriminator;

  if (!discriminator) {
    throw new Error("LotteryPool discriminator missing from IDL.");
  }

  const expectedDiscriminator = Uint8Array.from(discriminator);
  if (bytes.length < expectedDiscriminator.length) {
    throw new Error("Account data is shorter than discriminator length.");
  }
  if (!bytesEqual(bytes.slice(0, expectedDiscriminator.length), expectedDiscriminator)) {
    throw new Error("Account discriminator does not match LotteryPool.");
  }

  let offset = expectedDiscriminator.length;

  const [authority, authorityOffset] = readPublicKey(bytes, offset);
  offset = authorityOffset;

  const [epochId, epochOffset] = readU64(bytes, offset);
  offset = epochOffset;

  const [ticketCount, ticketOffset] = readU64(bytes, offset);
  offset = ticketOffset;

  const [totalFunds, fundsOffset] = readU64(bytes, offset);
  offset = fundsOffset;

  const [isActive, activeOffset] = readBool(bytes, offset);
  offset = activeOffset;

  const [vrfTag, vrfTagOffset] = readOptionTag(bytes, offset);
  offset = vrfTagOffset;

  let vrfRequestId: PublicKey | null = null;
  if (vrfTag === 1) {
    const [vrfPubkey, vrfOffset] = readPublicKey(bytes, offset);
    vrfRequestId = vrfPubkey;
    offset = vrfOffset;
  }

  const [winnerTag, winnerTagOffset] = readOptionTag(bytes, offset);
  offset = winnerTagOffset;

  let winnerTicketId: bigint | null = null;
  if (winnerTag === 1) {
    const [winner, winnerOffset] = readU64(bytes, offset);
    winnerTicketId = winner;
    offset = winnerOffset;
  }

  return {
    authority,
    epochId,
    ticketCount,
    totalFunds,
    isActive,
    vrfRequestId,
    winnerTicketId,
  };
}

export function decodePlayerTicketAccount(
  data: Buffer | Uint8Array
): PlayerTicketAccount {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  const discriminator = lotryIdl.accounts?.find(
    (accountDef) => accountDef.name === "PlayerTicket"
  )?.discriminator;

  if (!discriminator) {
    throw new Error("PlayerTicket discriminator missing from IDL.");
  }

  const expectedDiscriminator = Uint8Array.from(discriminator);
  if (bytes.length < expectedDiscriminator.length) {
    throw new Error("Account data is shorter than discriminator length.");
  }
  if (!bytesEqual(bytes.slice(0, expectedDiscriminator.length), expectedDiscriminator)) {
    throw new Error("Account discriminator does not match PlayerTicket.");
  }

  let offset = expectedDiscriminator.length;

  const [owner, ownerOffset] = readPublicKey(bytes, offset);
  offset = ownerOffset;

  const [epochId, epochOffset] = readU64(bytes, offset);
  offset = epochOffset;

  const [ticketId, ticketOffset] = readU64(bytes, offset);
  offset = ticketOffset;

  const ticketDataEnd = offset + 32;
  if (ticketDataEnd > bytes.length) {
    throw new Error("Unexpected end of account data while reading ticket data.");
  }
  const ticketData = bytes.slice(offset, ticketDataEnd);

  return {
    owner,
    epochId,
    ticketId,
    ticketData,
  };
}

export function createRandomTicketData(): Uint8Array {
  const data = new Uint8Array(32);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(data);
    return data;
  }
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.floor(Math.random() * 256);
  }
  return data;
}

export function explainLotryError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);

  const codeFromHex = message.match(/custom program error:\s*(0x[0-9a-f]+)/i);
  if (codeFromHex) {
    const code = Number.parseInt(codeFromHex[1], 16);
    const mapped = LOTRY_ERROR_BY_CODE.get(code);
    if (mapped) {
      return mapped;
    }
  }

  const codeFromAnchor = message.match(/Error Number:\s*(\d+)/i);
  if (codeFromAnchor) {
    const code = Number.parseInt(codeFromAnchor[1], 10);
    const mapped = LOTRY_ERROR_BY_CODE.get(code);
    if (mapped) {
      return mapped;
    }
  }

  return null;
}
