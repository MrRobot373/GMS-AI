// @ts-check
/**
 * Aatmiq Code follows the browser's light or dark mode (Aatmiq Light / Aatmiq Dark): detection
 * (`window.autoDetectColorScheme`) is on in the defaults (apps/code/settings.json). While it's on,
 * choosing a theme sets the one for the current mode, never `workbench.colorTheme`, so a
 * `workbench.colorTheme` of the person's own was chosen before detection was the default: it
 * stays, by turning detection off for them.
 */

/**
 * @typedef {{
 *   inspect(key: string): { globalValue?: unknown } | undefined;
 *   update(key: string, value: unknown, global: boolean): PromiseLike<void>;
 * }} Settings the root configuration (vscode.workspace.getConfiguration())
 */

/**
 * Keep a theme the person chose themselves.
 * @param {Settings} settings
 * @returns {Promise<boolean>} whether detection was turned off for them
 */
async function keepChosenTheme(settings) {
  const detect = settings.inspect("window.autoDetectColorScheme")?.globalValue;
  const chosen = settings.inspect("workbench.colorTheme")?.globalValue;
  if (detect !== undefined || typeof chosen !== "string" || !chosen) return false;
  await settings.update("window.autoDetectColorScheme", false, true);
  return true;
}

module.exports = { keepChosenTheme };
