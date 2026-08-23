import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseOnboardingSchema,
  parseOnboardingStatus,
  type OnboardingSchema,
  type OnboardingStatus,
} from "@/lib/seller/onboarding";

export const fetchOnboardingSchema = async (
  accessToken: string,
  signal?: AbortSignal,
): Promise<OnboardingSchema> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/onboarding/schema",
    accessToken,
    { cache: "no-store", signal },
  );
  return parseOnboardingSchema(raw);
};

export const fetchOnboardingStatus = async (
  accessToken: string,
  signal?: AbortSignal,
): Promise<OnboardingStatus> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/onboarding",
    accessToken,
    { cache: "no-store", signal },
  );
  return parseOnboardingStatus(raw);
};

export const startOnboardingStep = async (
  accessToken: string,
  stepOrder: number,
  signal?: AbortSignal,
): Promise<unknown> =>
  apiFetchWithAccessToken<unknown>(
    `/seller/onboarding/${stepOrder}/start`,
    accessToken,
    { method: "POST", cache: "no-store", signal },
  );

export const completeOnboardingStep = async (
  accessToken: string,
  stepOrder: number,
  stepData: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<OnboardingStatus> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    `/seller/onboarding/${stepOrder}/complete`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ step_data: stepData }),
      cache: "no-store",
      signal,
    },
  );
  return parseOnboardingStatus(raw);
};
