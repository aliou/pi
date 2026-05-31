import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilesystemTrustStore, type TrustStoreEntry } from "../src/core/trust-store.ts";
import { resolvePath } from "../src/utils/paths.ts";

describe("FilesystemTrustStore", () => {
	let agentDir: string;
	let projectDir: string;
	let otherProjectDir: string;
	let tempDirs: string[];

	beforeEach(() => {
		agentDir = mkdtempSync(join(tmpdir(), "pi-trust-agent-"));
		projectDir = mkdtempSync(join(tmpdir(), "pi-trust-project-"));
		otherProjectDir = mkdtempSync(join(tmpdir(), "pi-trust-other-project-"));
		tempDirs = [agentDir, projectDir, otherProjectDir];
	});

	afterEach(() => {
		for (const tempDir of tempDirs) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("returns no entries when trust.json is missing", async () => {
		const store = new FilesystemTrustStore(projectDir, agentDir);

		await expect(store.listTrustEntries()).resolves.toEqual([]);
		expect(existsSync(join(agentDir, "trust.json"))).toBe(false);
	});

	it("lists entries for the resolved cwd only", async () => {
		const entry: TrustStoreEntry = {
			source: "npm:@scope/pkg",
			hash: "sha512-one",
			name: "@scope/pkg",
			trustedAt: "2026-05-31T12:00:00.000Z",
		};
		const otherEntry: TrustStoreEntry = {
			source: "git:https://example.com/pkg.git",
			hash: "git-sha",
			name: "pkg",
			trustedAt: "2026-05-31T13:00:00.000Z",
		};
		writeFileSync(
			join(agentDir, "trust.json"),
			`${JSON.stringify(
				{
					[resolvePath(projectDir)]: [entry],
					[resolvePath(otherProjectDir)]: [otherEntry],
				},
				null,
				2,
			)}\n`,
		);

		const store = new FilesystemTrustStore(projectDir, agentDir);

		await expect(store.listTrustEntries()).resolves.toEqual([entry]);
	});

	it("updates only the current cwd and preserves other cwd entries", async () => {
		const existingOtherEntry: TrustStoreEntry = {
			source: "npm:other",
			hash: "sha512-other",
			name: "other",
			trustedAt: "2026-05-31T11:00:00.000Z",
		};
		writeFileSync(
			join(agentDir, "trust.json"),
			`${JSON.stringify({ [resolvePath(otherProjectDir)]: [existingOtherEntry] }, null, 2)}\n`,
		);
		const nextEntry: TrustStoreEntry = {
			source: "npm:@scope/pkg",
			hash: "sha512-one",
			name: "@scope/pkg",
			trustedAt: "2026-05-31T12:00:00.000Z",
		};

		const store = new FilesystemTrustStore(projectDir, agentDir);
		await store.updateTrustEntries([nextEntry]);

		const content = readFileSync(join(agentDir, "trust.json"), "utf-8");
		expect(content.endsWith("\n")).toBe(true);
		expect(JSON.parse(content)).toEqual({
			[resolvePath(otherProjectDir)]: [existingOtherEntry],
			[resolvePath(projectDir)]: [nextEntry],
		});
	});

	it("does not overwrite invalid JSON", async () => {
		const trustPath = join(agentDir, "trust.json");
		writeFileSync(trustPath, "{ invalid json\n");
		const store = new FilesystemTrustStore(projectDir, agentDir);
		const entry: TrustStoreEntry = {
			source: "npm:@scope/pkg",
			hash: "sha512-one",
			name: "@scope/pkg",
			trustedAt: "2026-05-31T12:00:00.000Z",
		};

		await expect(store.listTrustEntries()).rejects.toThrow("Failed to load trust store");
		await expect(store.updateTrustEntries([entry])).rejects.toThrow("Failed to load trust store");
		expect(readFileSync(trustPath, "utf-8")).toBe("{ invalid json\n");
	});

	it("creates the agent dir when writing", async () => {
		const missingAgentDir = join(
			tmpdir(),
			`pi-trust-missing-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		tempDirs.push(missingAgentDir);
		const store = new FilesystemTrustStore(projectDir, missingAgentDir);
		const entry: TrustStoreEntry = {
			source: "npm:@scope/pkg",
			hash: "sha512-one",
			name: "@scope/pkg",
			trustedAt: "2026-05-31T12:00:00.000Z",
		};

		await store.updateTrustEntries([entry]);

		expect(JSON.parse(readFileSync(join(missingAgentDir, "trust.json"), "utf-8"))).toEqual({
			[resolvePath(projectDir)]: [entry],
		});
	});
});
