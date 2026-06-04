import { ProcessTerminal, TUI } from "@earendil-works/pi-tui";
import type { SettingsManager } from "../core/settings-manager.ts";
import type { TrustCandidate } from "../core/trust-store.ts";
import { TrustSelectorComponent } from "../modes/interactive/components/trust-selector.ts";
import { initTheme, stopThemeWatcher } from "../modes/interactive/theme/theme.ts";

export interface TrustSelectorOptions {
	candidates: TrustCandidate[];
	settingsManager: SettingsManager;
	onSave: (candidates: TrustCandidate[]) => Promise<void>;
}

export async function selectTrustedPackages(options: TrustSelectorOptions): Promise<void> {
	initTheme(options.settingsManager.getTheme(), true);

	return new Promise((resolve, reject) => {
		const ui = new TUI(new ProcessTerminal());
		let done = false;

		const finish = () => {
			if (!done) {
				done = true;
				ui.stop();
				stopThemeWatcher();
				resolve();
			}
		};

		const fail = (error: unknown) => {
			if (!done) {
				done = true;
				ui.stop();
				stopThemeWatcher();
				reject(error);
			}
		};

		const selector = new TrustSelectorComponent(
			options.candidates,
			async (candidates) => {
				try {
					await options.onSave(candidates);
					finish();
				} catch (error) {
					fail(error);
				}
			},
			finish,
			() => ui.requestRender(),
			ui.terminal.rows,
		);

		ui.addChild(selector);
		ui.setFocus(selector);
		ui.start();
	});
}
