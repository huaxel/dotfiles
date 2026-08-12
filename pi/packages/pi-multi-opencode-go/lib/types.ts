import type { OpenCodeGoWindow } from "@juanbenjumea/opencode-go-usage/lib/types.ts";

export type { OpenCodeGoWindow };

export interface OpenCodeGoAccount {
  key: string;
  label: string;
  /**
   * Legacy dashboard-scraping fields. The official usage API needs only
   * `key`; these remain for configs that predate it and are ignored now.
   */
  workspaceId?: string;
  authCookie?: string;
}

export interface AccountUsage {
  account: OpenCodeGoAccount;
  rolling: OpenCodeGoWindow | null;
  weekly: OpenCodeGoWindow | null;
  monthly: OpenCodeGoWindow | null;
  fetchedAt: number;
  error?: string;
  exhaustedUntil?: number;
}

export type ExhaustReason = "quota" | "auth";
