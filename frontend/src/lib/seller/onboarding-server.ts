import { ApiError } from "@/lib/api/client";
import {
  fetchOnboardingSchema,
  fetchOnboardingStatus,
} from "@/lib/seller/onboarding-api";
import {
  ONBOARDING_CONTRACT_ERROR_PREFIX,
  type OnboardingSchema,
  type OnboardingStatus,
} from "@/lib/seller/onboarding";
import { resolveSession } from "@/lib/supabase/session";

export type OnboardingBootstrap =
  | { state: "ready"; schema: OnboardingSchema; status: OnboardingStatus }
  | { state: "unavailable" }
  | { state: "auth_rejected" };

const classifyFailure = (error: unknown): "unavailable" | "auth_rejected" => {
  if (error instanceof ApiError && error.status === 401) return "auth_rejected";
  if (
    error instanceof Error &&
    error.message.startsWith(ONBOARDING_CONTRACT_ERROR_PREFIX)
  ) {
    return "unavailable";
  }
  return "unavailable";
};

export const resolveOnboarding = async (
  accessToken: string,
): Promise<OnboardingBootstrap> => {
  try {
    const [schema, status] = await Promise.all([
      fetchOnboardingSchema(accessToken),
      fetchOnboardingStatus(accessToken),
    ]);
    return { state: "ready", schema, status };
  } catch (error) {
    return { state: classifyFailure(error) };
  }
};

export const resolveOnboardingFromSession = async (): Promise<OnboardingBootstrap> => {
  try {
    const session = await resolveSession();
    if (!session) return { state: "unavailable" };
    return resolveOnboarding(session.accessToken);
  } catch {
    return { state: "unavailable" };
  }
};
