"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  BUSINESS_NAME_MAX_LENGTH,
  BUSINESS_STORE_LINK_MAX_LENGTH,
  BUSINESS_STORE_NAME_MAX_LENGTH,
  buildBusinessSectionPatch,
  sectionHasChanges,
  validateBusinessDraft,
  type BusinessSettings,
  type SellerSettings,
  type SettingsValidationIssue,
} from "@/lib/seller/assistant-settings";
import {
  BUSINESS_CLEAR_LABEL,
  BUSINESS_NAME_LABEL,
  BUSINESS_PHONE_CLEAR_HELP,
  BUSINESS_PHONE_LABEL,
  BUSINESS_SECTION_DESCRIPTION,
  BUSINESS_SECTION_TITLE,
  BUSINESS_STORE_LINK_CLEAR_HELP,
  BUSINESS_STORE_LINK_LABEL,
  BUSINESS_STORE_NAME_LABEL,
  parseRequiredTextInput,
  SETTINGS_AUTH_DESCRIPTION,
  SETTINGS_AUTH_TITLE,
  SETTINGS_RETRY_LABEL,
  SETTINGS_SAVE_CHANGES_LABEL,
  SETTINGS_UNAVAILABLE_DESCRIPTION,
  SETTINGS_UNAVAILABLE_TITLE,
  SETTINGS_UNSPECIFIED_LABEL,
  textInputFromValue,
} from "@/lib/seller/assistant-settings-format";
import type { SellerSettingsBootstrap } from "@/lib/seller/assistant-settings-server";

import {
  AuthoritativeReview,
  FieldMessage,
  LabeledTextField,
} from "./settings-form-controls";
import {
  SettingsSection,
  type SettingsSectionStatus,
} from "./settings-section";
import {
  statusFromSaveResult,
  useSellerSettingsEditor,
} from "./use-seller-settings";

const firstIssue = (
  issues: SettingsValidationIssue[],
  field: string,
): string | null => issues.find((issue) => issue.field === field)?.message ?? null;

const resolveTextDraft = (raw: string): string | null => {
  const parsed = parseRequiredTextInput(raw);
  return parsed.status === "empty" ? null : parsed.value;
};

export function BusinessSettingsWorkspace({
  bootstrap,
}: {
  bootstrap: SellerSettingsBootstrap;
}) {
  if (bootstrap.state === "auth_rejected") {
    return (
      <WorkspaceRetry
        title={SETTINGS_AUTH_TITLE}
        description={SETTINGS_AUTH_DESCRIPTION}
      />
    );
  }
  if (bootstrap.state !== "ready") {
    return (
      <WorkspaceRetry
        title={SETTINGS_UNAVAILABLE_TITLE}
        description={SETTINGS_UNAVAILABLE_DESCRIPTION}
      />
    );
  }
  return <BusinessEditor initialSettings={bootstrap.settings} />;
}

function BusinessEditor({
  initialSettings,
}: {
  initialSettings: SellerSettings;
}) {
  const editor = useSellerSettingsEditor(initialSettings);
  const [epoch, setEpoch] = React.useState(0);
  const [status, setStatus] = React.useState<SettingsSectionStatus>({
    kind: "idle",
  });

  const saveBusiness = async (draft: BusinessSettings) => {
    const payload = buildBusinessSectionPatch({
      expectedVersion: editor.settings.version,
      current: editor.settings.business,
      draft,
    });
    if (!payload) return;
    setStatus({ kind: "saving" });
    const result = await editor.save(payload);
    setStatus(statusFromSaveResult(result));
    if (result.ok) setEpoch((value) => value + 1);
  };

  return (
    <BusinessSection
      key={`business-${epoch}`}
      settings={editor.settings}
      disabled={editor.inFlight}
      status={status}
      onSave={saveBusiness}
    />
  );
}

function BusinessSection({
  settings,
  disabled,
  status,
  onSave,
}: {
  settings: SellerSettings;
  disabled: boolean;
  status: SettingsSectionStatus;
  onSave: (draft: BusinessSettings) => Promise<void>;
}) {
  const current = settings.business;
  const [name, setName] = React.useState(textInputFromValue(current.name));
  const [storeName, setStoreName] = React.useState(
    textInputFromValue(current.storeName),
  );
  const [phone, setPhone] = React.useState(textInputFromValue(current.phone));
  const [storeLink, setStoreLink] = React.useState(
    textInputFromValue(current.storeLink),
  );

  const draft: BusinessSettings = {
    name: resolveTextDraft(name),
    storeName: resolveTextDraft(storeName),
    phone: resolveTextDraft(phone),
    storeLink: resolveTextDraft(storeLink),
  };
  const issues = validateBusinessDraft(draft, current);
  const hasChanges = sectionHasChanges(current, draft);
  const canSave = hasChanges && issues.length === 0 && !disabled;

  return (
    <SettingsSection
      title={BUSINESS_SECTION_TITLE}
      description={BUSINESS_SECTION_DESCRIPTION}
      canSave={canSave}
      status={status}
      saveLabel={SETTINGS_SAVE_CHANGES_LABEL}
      onSave={() => {
        if (!canSave) return;
        void onSave(draft);
      }}
    >
      <LabeledTextField
        id="business-name"
        label={BUSINESS_NAME_LABEL}
        value={name}
        onChange={setName}
        disabled={disabled}
        placeholder={SETTINGS_UNSPECIFIED_LABEL}
        maxLength={BUSINESS_NAME_MAX_LENGTH}
        error={firstIssue(issues, "name")}
      />
      <LabeledTextField
        id="business-store-name"
        label={BUSINESS_STORE_NAME_LABEL}
        value={storeName}
        onChange={setStoreName}
        disabled={disabled}
        placeholder={SETTINGS_UNSPECIFIED_LABEL}
        maxLength={BUSINESS_STORE_NAME_MAX_LENGTH}
        error={firstIssue(issues, "store_name")}
      />
      <div className="space-y-2">
        <LabeledTextField
          id="business-phone"
          label={BUSINESS_PHONE_LABEL}
          value={phone}
          onChange={setPhone}
          disabled={disabled}
          placeholder={current.phone === null ? SETTINGS_UNSPECIFIED_LABEL : BUSINESS_CLEAR_LABEL}
          inputMode="tel"
          error={firstIssue(issues, "phone")}
        />
        <FieldMessage>{BUSINESS_PHONE_CLEAR_HELP}</FieldMessage>
      </div>
      <div className="space-y-2">
        <LabeledTextField
          id="business-store-link"
          label={BUSINESS_STORE_LINK_LABEL}
          value={storeLink}
          onChange={setStoreLink}
          disabled={disabled}
          placeholder={
            current.storeLink === null
              ? SETTINGS_UNSPECIFIED_LABEL
              : BUSINESS_CLEAR_LABEL
          }
          inputMode="url"
          maxLength={BUSINESS_STORE_LINK_MAX_LENGTH}
          error={firstIssue(issues, "store_link")}
        />
        <FieldMessage>{BUSINESS_STORE_LINK_CLEAR_HELP}</FieldMessage>
      </div>
      {status.kind === "conflict" ? (
        <AuthoritativeReview
          items={[
            { label: BUSINESS_NAME_LABEL, current: current.name, draft: draft.name },
            {
              label: BUSINESS_STORE_NAME_LABEL,
              current: current.storeName,
              draft: draft.storeName,
            },
            {
              label: BUSINESS_PHONE_LABEL,
              current: current.phone,
              draft: draft.phone,
            },
            {
              label: BUSINESS_STORE_LINK_LABEL,
              current: current.storeLink,
              draft: draft.storeLink,
            },
          ]}
        />
      ) : null}
    </SettingsSection>
  );
}

function WorkspaceRetry({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!isPending) setIsRetrying(false);
  }, [isPending]);

  const retryDisabled = isRetrying || isPending;

  return (
    <div className="space-y-3 py-6" role="status">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-11"
        disabled={retryDisabled}
        aria-busy={retryDisabled}
        onClick={() => {
          if (retryDisabled) return;
          setIsRetrying(true);
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        {SETTINGS_RETRY_LABEL}
      </Button>
    </div>
  );
}
