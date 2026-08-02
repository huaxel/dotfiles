import type { OpenCodeGoWindow } from "@juanbenjumea/opencode-go-usage/lib/types.ts";

export type { OpenCodeGoWindow };

export interface OpenCodeGoAccount {
  key: string;
  workspaceId: string;
  authCookie: string;
  label: string;
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
