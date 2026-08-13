"use client";

import * as React from "react";

import { ApiError } from "@/lib/api/client";
import type {
  SellerSettings,
  SellerSettingsPatchPayload,
} from "@/lib/seller/assistant-settings";
import {
  fetchSellerSettings,
  patchSellerSettings,
} from "@/lib/seller/assistant-settings-api";
import {
  classifySettingsMutationFailure,
  readNestedErrorMessage,
  SETTINGS_CONFLICT_MESSAGE,
  SETTINGS_RETRYABLE_MESSAGE,
  SETTINGS_SESSION_MESSAGE,
  SETTINGS_VALIDATION_FALLBACK,
} from "@/lib/seller/assistant-settings-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";

import type { SettingsSectionStatus } from "./settings-section";

export type SettingsSaveFailure = {
  ok: false;
  kind: "conflict" | "validation" | "retryable" | "auth";
  message: string;
  settings: SellerSettings | null;
};

export type SettingsSaveResult =
  | { ok: true; settings: SellerSettings }
  | SettingsSaveFailure;

const classifyCaught = (error: unknown): SettingsSaveFailure => {
  if (error instanceof ApiError) {
    const kind = classifySettingsMutationFailure(error.status);
    if (kind === "conflict") {
      return {
        ok: false,
        kind: "conflict",
        message: SETTINGS_CONFLICT_MESSAGE,
        settings: null,
      };
    }
    if (kind === "validation") {
      return {
        ok: false,
        kind: "validation",
        message:
          readNestedErrorMessage(error.body) ??
          (error.message && !error.message.startsWith("İstek başarısız")
            ? error.message
            : SETTINGS_VALIDATION_FALLBACK),
        settings: null,
      };
    }
    if (kind === "auth") {
      return {
        ok: false,
        kind: "auth",
        message: SETTINGS_SESSION_MESSAGE,
        settings: null,
      };
    }
  }
  return {
    ok: false,
    kind: "retryable",
    message: SETTINGS_RETRYABLE_MESSAGE,
    settings: null,
  };
};

export function useSellerSettingsEditor(initialSettings: SellerSettings) {
  const [settings, setSettings] = React.useState(initialSettings);
  const [inFlight, setInFlight] = React.useState(false);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const save = React.useCallback(
    async (payload: SellerSettingsPatchPayload): Promise<SettingsSaveResult> => {
      if (inFlight || inflightRef.current) {
        return {
          ok: false,
          kind: "retryable",
          message: SETTINGS_RETRYABLE_MESSAGE,
          settings: null,
        };
      }
      const controller = new AbortController();
      inflightRef.current = controller;
      setInFlight(true);
      try {
        const accessToken = await getBrowserAccessToken();
        if (controller.signal.aborted) {
          return {
            ok: false,
            kind: "retryable",
            message: SETTINGS_RETRYABLE_MESSAGE,
            settings: null,
          };
        }
        if (!accessToken) {
          return {
            ok: false,
            kind: "auth",
            message: SETTINGS_SESSION_MESSAGE,
            settings: null,
          };
        }
        const next = await patchSellerSettings(accessToken, payload, {
          signal: controller.signal,
        });
        setSettings(next);
        return { ok: true, settings: next };
      } catch (error) {
        if (controller.signal.aborted) {
          return {
            ok: false,
            kind: "retryable",
            message: SETTINGS_RETRYABLE_MESSAGE,
            settings: null,
          };
        }
        const classified = classifyCaught(error);
        if (classified.kind === "conflict") {
          try {
            const accessToken = await getBrowserAccessToken();
            if (accessToken) {
              const fresh = await fetchSellerSettings(accessToken, {
                signal: controller.signal,
              });
              setSettings(fresh);
              return { ...classified, settings: fresh };
            }
          } catch {
            // Keep the local authoritative snapshot if the refresh fails.
          }
        }
        return classified;
      } finally {
        if (inflightRef.current === controller) inflightRef.current = null;
        setInFlight(false);
      }
    },
    [inFlight],
  );

  return { settings, inFlight, save };
}

export const statusFromSaveResult = (
  result: SettingsSaveResult,
): SettingsSectionStatus => {
  if (result.ok) return { kind: "saved" };
  if (result.kind === "conflict") {
    return { kind: "conflict", message: result.message };
  }
  return { kind: "error", message: result.message };
};
