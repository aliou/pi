import {
	type Component,
	Container,
	type Focusable,
	getKeybindings,
	Input,
	matchesKey,
	ProcessTerminal,
	Spacer,
	TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { DefaultPackageManager, ProjectPackageTrustCandidate } from "../core/package-manager.ts";
import type { SettingsManager } from "../core/settings-manager.ts";
import { DynamicBorder } from "../modes/interactive/components/dynamic-border.ts";
import { rawKeyHint } from "../modes/interactive/components/keybinding-hints.ts";
import { initTheme, stopThemeWatcher, theme } from "../modes/interactive/theme/theme.ts";

interface TrustSelectorOptions {
	packageManager: DefaultPackageManager;
	settingsManager: SettingsManager;
	candidates: ProjectPackageTrustCandidate[];
}

class TrustSelectorHeader implements Component {
	invalidate(): void {}

	render(width: number): string[] {
		const title = theme.bold("Project Package Trust");
		const sep = theme.fg("muted", " · ");
		const hint = rawKeyHint("space", "toggle") + sep + rawKeyHint("esc", "close");
		const spacing = Math.max(1, width - visibleWidth(title) - visibleWidth(hint));
		return [
			truncateToWidth(`${title}${" ".repeat(spacing)}${hint}`, width, ""),
			theme.fg("muted", "Type to filter project packages"),
		];
	}
}

class TrustList implements Component, Focusable {
	private candidates: ProjectPackageTrustCandidate[];
	private filteredCandidates: ProjectPackageTrustCandidate[];
	private selectedIndex = 0;
	private searchInput = new Input();
	private maxVisible: number;
	private packageManager: DefaultPackageManager;
	private _focused = false;
	public onCancel?: () => void;
	public onExit?: () => void;
	public onToggle?: () => void;

	constructor(
		packageManager: DefaultPackageManager,
		candidates: ProjectPackageTrustCandidate[],
		terminalHeight?: number,
	) {
		this.packageManager = packageManager;
		this.candidates = candidates;
		this.filteredCandidates = [...candidates];
		const chrome = 8;
		this.maxVisible = Math.max(5, (terminalHeight ?? 24) - chrome);
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];
		lines.push(...this.searchInput.render(width));
		lines.push("");

		if (this.filteredCandidates.length === 0) {
			lines.push(theme.fg("muted", "  No project packages found"));
			return lines;
		}

		const startIndex = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(this.maxVisible / 2),
				this.filteredCandidates.length - this.maxVisible,
			),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, this.filteredCandidates.length);

		for (let i = startIndex; i < endIndex; i++) {
			const candidate = this.filteredCandidates[i];
			const isSelected = i === this.selectedIndex;
			const cursor = isSelected ? "> " : "  ";
			const checkbox = candidate.trusted ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
			const source = isSelected ? theme.bold(candidate.source) : candidate.source;
			lines.push(truncateToWidth(`${cursor}  ${checkbox} ${source}`, width, "..."));
			lines.push(truncateToWidth(`      ${theme.fg("muted", candidate.displayArtifact)}`, width, "..."));
		}

		if (startIndex > 0 || endIndex < this.filteredCandidates.length) {
			lines.push(theme.fg("dim", `  (${this.selectedIndex + 1}/${this.filteredCandidates.length})`));
		}

		return lines;
	}

	handleInput(data: string): void {
		const kb = getKeybindings();
		if (kb.matches(data, "tui.select.up")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			return;
		}
		if (kb.matches(data, "tui.select.down")) {
			this.selectedIndex = Math.min(this.filteredCandidates.length - 1, this.selectedIndex + 1);
			return;
		}
		if (kb.matches(data, "tui.select.pageUp")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - this.maxVisible);
			return;
		}
		if (kb.matches(data, "tui.select.pageDown")) {
			this.selectedIndex = Math.min(this.filteredCandidates.length - 1, this.selectedIndex + this.maxVisible);
			return;
		}
		if (kb.matches(data, "tui.select.cancel")) {
			this.onCancel?.();
			return;
		}
		if (matchesKey(data, "ctrl+c")) {
			this.onExit?.();
			return;
		}
		if (data === " " || kb.matches(data, "tui.select.confirm")) {
			const candidate = this.filteredCandidates[this.selectedIndex];
			if (!candidate) return;
			candidate.trusted = !candidate.trusted;
			this.packageManager.setProjectPackageTrust(candidate.source, candidate.artifact, candidate.trusted);
			this.onToggle?.();
			return;
		}

		this.searchInput.handleInput(data);
		this.filterItems(this.searchInput.getValue());
	}

	private filterItems(query: string): void {
		if (!query.trim()) {
			this.filteredCandidates = [...this.candidates];
			this.selectedIndex = 0;
			return;
		}
		const lowerQuery = query.toLowerCase();
		this.filteredCandidates = this.candidates.filter(
			(candidate) =>
				candidate.source.toLowerCase().includes(lowerQuery) ||
				candidate.artifact.toLowerCase().includes(lowerQuery) ||
				candidate.displayArtifact.toLowerCase().includes(lowerQuery),
		);
		this.selectedIndex = 0;
	}
}

class TrustSelectorComponent extends Container implements Focusable {
	private trustList: TrustList;
	private _focused = false;

	constructor(
		packageManager: DefaultPackageManager,
		candidates: ProjectPackageTrustCandidate[],
		onClose: () => void,
		onExit: () => void,
		requestRender: () => void,
		terminalHeight?: number,
	) {
		super();
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new TrustSelectorHeader());
		this.addChild(new Spacer(1));
		this.trustList = new TrustList(packageManager, candidates, terminalHeight);
		this.trustList.onCancel = onClose;
		this.trustList.onExit = onExit;
		this.trustList.onToggle = requestRender;
		this.addChild(this.trustList);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.trustList.focused = value;
	}

	getTrustList(): TrustList {
		return this.trustList;
	}
}

export async function selectTrust(options: TrustSelectorOptions): Promise<void> {
	initTheme(options.settingsManager.getTheme(), true);

	return new Promise((resolve) => {
		const ui = new TUI(new ProcessTerminal());
		let resolved = false;
		const selector = new TrustSelectorComponent(
			options.packageManager,
			options.candidates,
			() => {
				if (!resolved) {
					resolved = true;
					ui.stop();
					stopThemeWatcher();
					resolve();
				}
			},
			() => {
				ui.stop();
				stopThemeWatcher();
				process.exit(0);
			},
			() => ui.requestRender(),
			ui.terminal.rows,
		);
		ui.addChild(selector);
		ui.setFocus(selector.getTrustList());
		ui.start();
	});
}
