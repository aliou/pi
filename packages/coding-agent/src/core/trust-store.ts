import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PackageSource } from "./settings-manager.ts";

export interface PackageTrustRecord {
	project: string;
	entryHash: string;
	artifactHash: string;
	trustedAt: string;
}

interface TrustData {
	projectPackages: PackageTrustRecord[];
}

export interface PackageTrustInput {
	projectCwd: string;
	entry: PackageSource;
	artifact: string;
}

export interface TrustStoreBackend {
	getProjectPackageTrustRecords(): PackageTrustRecord[];
	updateProjectPackageTrustRecords(update: (records: PackageTrustRecord[]) => PackageTrustRecord[]): void;
}

export class FileTrustStoreBackend implements TrustStoreBackend {
	private path: string;

	constructor(agentDir: string) {
		this.path = join(agentDir, "trust.json");
	}

	getProjectPackageTrustRecords(): PackageTrustRecord[] {
		return [...(this.load().projectPackages ?? [])];
	}

	updateProjectPackageTrustRecords(update: (records: PackageTrustRecord[]) => PackageTrustRecord[]): void {
		const data = this.load();
		this.save({
			...data,
			projectPackages: update([...(data.projectPackages ?? [])]),
		});
	}

	private load(): TrustData {
		if (!existsSync(this.path)) {
			return { projectPackages: [] };
		}
		const data = JSON.parse(readFileSync(this.path, "utf-8")) as Partial<TrustData>;
		return { projectPackages: data.projectPackages ?? [] };
	}

	private save(data: TrustData): void {
		mkdirSync(dirname(this.path), { recursive: true });
		writeFileSync(this.path, JSON.stringify(data, null, 2), "utf-8");
	}
}

export class TrustStore {
	private backend: TrustStoreBackend;

	private constructor(backend: TrustStoreBackend) {
		this.backend = backend;
	}

	static create(_cwd: string, agentDir: string): TrustStore {
		return new TrustStore(new FileTrustStoreBackend(agentDir));
	}

	static fromBackend(backend: TrustStoreBackend): TrustStore {
		return new TrustStore(backend);
	}

	isProjectPackageTrusted(input: PackageTrustInput): boolean {
		const project = this.projectKey(input.projectCwd);
		const entryHash = this.stableHash(input.entry);
		const artifactHash = this.stableHash(input.artifact);
		return this.backend
			.getProjectPackageTrustRecords()
			.some(
				(record) =>
					record.project === project && record.entryHash === entryHash && record.artifactHash === artifactHash,
			);
	}

	untrustProjectPackage(input: PackageTrustInput): void {
		const project = this.projectKey(input.projectCwd);
		const entryHash = this.stableHash(input.entry);
		const artifactHash = this.stableHash(input.artifact);
		this.backend.updateProjectPackageTrustRecords((records) =>
			records.filter(
				(record) =>
					record.project !== project || record.entryHash !== entryHash || record.artifactHash !== artifactHash,
			),
		);
	}

	trustProjectPackage(input: PackageTrustInput): void {
		const record: PackageTrustRecord = {
			project: this.projectKey(input.projectCwd),
			entryHash: this.stableHash(input.entry),
			artifactHash: this.stableHash(input.artifact),
			trustedAt: new Date().toISOString(),
		};
		this.backend.updateProjectPackageTrustRecords((records) => {
			const exists = records.some(
				(existing) =>
					existing.project === record.project &&
					existing.entryHash === record.entryHash &&
					existing.artifactHash === record.artifactHash,
			);
			return exists ? records : [...records, record];
		});
	}

	private projectKey(cwd: string): string {
		return this.stableHash(resolve(cwd));
	}

	private stableHash(value: unknown): string {
		return createHash("sha256").update(JSON.stringify(value)).digest("hex");
	}
}
