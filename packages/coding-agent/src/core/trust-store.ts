import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { resolvePath } from "../utils/paths.ts";

/** One trusted project package entry for the current cwd. */
export interface TrustStoreEntry {
	/** Exact npm: or git: source string from project settings. */
	source: string;
	/** Immutable resolved identity for the source. */
	hash: string;
	/** Package/display name. */
	name: string;
	/** ISO timestamp when trust was granted. */
	trustedAt: string;
}

/** Cwd-scoped storage abstraction for project package trust entries. */
export interface TrustStore {
	/** List trust entries for the current cwd. */
	listTrustEntries(): Promise<TrustStoreEntry[]>;
	/** Replace trust entries for the current cwd. */
	updateTrustEntries(entries: TrustStoreEntry[]): Promise<void>;
}

/** Project package that can be trusted or untrusted. */
export interface TrustCandidate {
	/** Exact npm: or git: source string from project settings. */
	source: string;
	/** Immutable resolved identity for the source. */
	hash: string;
	/** Package/display name. */
	name: string;
	/** Whether a matching TrustStoreEntry exists for this source and hash. */
	trusted: boolean;
}

type TrustStoreFile = Record<string, TrustStoreEntry[]>;

function parseTrustStoreFile(content: string, path: string): TrustStoreFile {
	try {
		const parsed = JSON.parse(content) as unknown;
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error("Expected top-level object");
		}
		return parsed as TrustStoreFile;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to load trust store at ${path}: ${message}`);
	}
}

export class FilesystemTrustStore implements TrustStore {
	private readonly agentDir: string;
	private readonly cwd: string;
	private readonly trustPath: string;

	constructor(cwd: string, agentDir: string) {
		this.agentDir = resolvePath(agentDir);
		this.cwd = resolvePath(cwd);
		this.trustPath = join(this.agentDir, "trust.json");
	}

	async listTrustEntries(): Promise<TrustStoreEntry[]> {
		const trustFile = this.readTrustStoreFile();
		return trustFile[this.cwd] ?? [];
	}

	async updateTrustEntries(entries: TrustStoreEntry[]): Promise<void> {
		const trustFile = this.readTrustStoreFile();
		trustFile[this.cwd] = entries;
		if (!existsSync(this.agentDir)) {
			mkdirSync(this.agentDir, { recursive: true });
		}
		writeFileSync(this.trustPath, `${JSON.stringify(trustFile, null, 2)}\n`, "utf-8");
	}

	private readTrustStoreFile(): TrustStoreFile {
		if (!existsSync(this.trustPath)) {
			return {};
		}
		return parseTrustStoreFile(readFileSync(this.trustPath, "utf-8"), this.trustPath);
	}
}
