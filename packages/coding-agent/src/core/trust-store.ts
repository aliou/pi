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
