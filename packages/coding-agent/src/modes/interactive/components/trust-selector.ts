import {
	type Component,
	type Focusable,
	getKeybindings,
	Input,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { TrustCandidate } from "../../../core/trust-store.ts";
import { theme } from "../theme/theme.ts";
import { rawKeyHint } from "./keybinding-hints.ts";

class TrustSelectorHeader implements Component {
	invalidate(): void {}

	render(width: number): string[] {
		const title = theme.bold("Project Package Trust");
		const sep = theme.fg("muted", " · ");
		const hint = rawKeyHint("space", "toggle") + sep + rawKeyHint("enter", "save") + sep + rawKeyHint("esc", "close");
		const spacing = Math.max(1, width - visibleWidth(title) - visibleWidth(hint));
		return [
			truncateToWidth(`${title}${" ".repeat(spacing)}${hint}`, width, ""),
			theme.fg("muted", "Trust only project packages you expect this repo to load"),
		];
	}
}

export class TrustSelectorComponent implements Component, Focusable {
	private readonly header = new TrustSelectorHeader();
	private readonly searchInput = new Input();
	private readonly candidates: TrustCandidate[];
	private filteredCandidates: TrustCandidate[];
	private selectedIndex = 0;
	private readonly maxVisible: number;
	private readonly onSave: (candidates: TrustCandidate[]) => void;
	private readonly onCancel: () => void;
	private readonly requestRender: () => void;
	private focusedValue = false;

	constructor(
		candidates: TrustCandidate[],
		onSave: (candidates: TrustCandidate[]) => void,
		onCancel: () => void,
		requestRender: () => void,
		terminalRows: number,
	) {
		this.candidates = candidates.map((candidate) => ({ ...candidate }));
		this.filteredCandidates = [...this.candidates];
		this.maxVisible = Math.max(5, terminalRows - 8);
		this.onSave = onSave;
		this.onCancel = onCancel;
		this.requestRender = requestRender;
	}

	get focused(): boolean {
		return this.focusedValue;
	}

	set focused(value: boolean) {
		this.focusedValue = value;
		this.searchInput.focused = value;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines = [...this.header.render(width), "", ...this.searchInput.render(width), ""];
		if (this.candidates.length === 0) {
			lines.push(theme.fg("muted", "No project npm: or git: packages with resolved trust identity."));
			return lines;
		}

		if (this.filteredCandidates.length === 0) {
			lines.push(theme.fg("muted", "No matching packages."));
			return lines;
		}

		const start = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(this.maxVisible / 2),
				this.filteredCandidates.length - this.maxVisible,
			),
		);
		const end = Math.min(this.filteredCandidates.length, start + this.maxVisible);
		for (let index = start; index < end; index++) {
			const candidate = this.filteredCandidates[index];
			const cursor = index === this.selectedIndex ? "> " : "  ";
			const checkbox = candidate.trusted ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
			const name = index === this.selectedIndex ? theme.bold(candidate.name) : candidate.name;
			lines.push(
				truncateToWidth(`${cursor}${checkbox} ${name} ${theme.fg("muted", candidate.source)}`, width, "..."),
			);
		}

		if (start > 0 || end < this.filteredCandidates.length) {
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
		if (data === " " && this.filteredCandidates.length > 0) {
			const candidate = this.filteredCandidates[this.selectedIndex];
			candidate.trusted = !candidate.trusted;
			const original = this.candidates.find(
				(entry) => entry.source === candidate.source && entry.hash === candidate.hash,
			);
			if (original) {
				original.trusted = candidate.trusted;
			}
			this.requestRender();
			return;
		}
		if (kb.matches(data, "tui.select.confirm")) {
			this.onSave(this.candidates);
			return;
		}
		if (kb.matches(data, "tui.select.cancel") || matchesKey(data, "ctrl+c")) {
			this.onCancel();
			return;
		}

		this.searchInput.handleInput(data);
		this.filterCandidates(this.searchInput.getValue());
		this.requestRender();
	}

	private filterCandidates(query: string): void {
		const normalized = query.trim().toLowerCase();
		this.filteredCandidates = normalized
			? this.candidates.filter(
					(candidate) =>
						candidate.name.toLowerCase().includes(normalized) ||
						candidate.source.toLowerCase().includes(normalized),
				)
			: [...this.candidates];
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredCandidates.length - 1));
	}
}
