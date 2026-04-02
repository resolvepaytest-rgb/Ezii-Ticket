import { ACTION_KEYS, SCREEN_KEYS } from "./permissionKeys.js";

const SCREEN_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const ACTION_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function isValidScreenKey(key: string): boolean {
  return SCREEN_KEY_PATTERN.test(key);
}

function isValidActionKey(key: string): boolean {
  return ACTION_KEY_PATTERN.test(key);
}

/**
 * Phase 1 guardrail: fail fast during startup/tests if registry keys
 * violate naming convention.
 */
export function assertPermissionKeyNamingConventions(): void {
  const badScreens = SCREEN_KEYS.filter((k) => !isValidScreenKey(k));
  const badActions = ACTION_KEYS.filter((k) => !isValidActionKey(k));

  if (badScreens.length === 0 && badActions.length === 0) return;

  const parts: string[] = [];
  if (badScreens.length > 0) {
    parts.push(`invalid screen keys: ${badScreens.join(", ")}`);
  }
  if (badActions.length > 0) {
    parts.push(`invalid action keys: ${badActions.join(", ")}`);
  }
  throw new Error(`permission key naming validation failed (${parts.join(" | ")})`);
}

