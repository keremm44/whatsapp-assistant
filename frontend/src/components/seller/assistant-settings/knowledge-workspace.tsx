"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  applyReturnsDisabledClear,
  buildProductSectionPatch,
  buildReturnPolicySectionPatch,
  buildShippingSectionPatch,
  buildUsageSectionPatch,
  CUSTOM_TEXT_MAX_REQUIRED_MESSAGE,
  PRODUCT_CUSTOM_TEXT_MAX_LENGTH_MAX,
  PRODUCT_MATERIAL_MAX_LENGTH,
  PRODUCT_PRINT_METHOD_MAX_LENGTH,
  SHIPPING_COMPANY_MAX_LENGTH,
  sectionHasChanges,
  validateProductDraft,
  validateReturnPolicyDraft,
  validateShippingDraft,
  type ProductSettings,
  type ReturnPolicySettings,
  type SellerSettings,
  type SettingsValidationIssue,
  type ShippingSettings,
  type UsageSettings,
} from "@/lib/seller/assistant-settings";
import {
  integerInputFromValue,
  KNOWLEDGE_ACCEPTS_RETURNS_LABEL,
  KNOWLEDGE_COMPANY_LABEL,
  KNOWLEDGE_CUSTOM_TEXT_MAX_LABEL,
  KNOWLEDGE_DAMAGE_REPLACEMENT_LABEL,
  KNOWLEDGE_DISHWASHER_LABEL,
  KNOWLEDGE_FOOD_SAFE_LABEL,
  KNOWLEDGE_HAND_WASH_LABEL,
  KNOWLEDGE_INTERNATIONAL_LABEL,
  KNOWLEDGE_MATERIAL_LABEL,
  KNOWLEDGE_MICROWAVE_LABEL,
  KNOWLEDGE_ORDER_COLLECTION_HREF,
  KNOWLEDGE_ORDER_COLLECTION_LINK_LABEL,
  KNOWLEDGE_PRINT_METHOD_LABEL,
  KNOWLEDGE_PROCESSING_GROUP_HELP,
  KNOWLEDGE_PROCESSING_GROUP_LABEL,
  KNOWLEDGE_PROCESSING_MAX_INPUT_LABEL,
  KNOWLEDGE_PROCESSING_MAX_LABEL,
  KNOWLEDGE_PROCESSING_MIN_INPUT_LABEL,
  KNOWLEDGE_PROCESSING_MIN_LABEL,
  KNOWLEDGE_PROCESSING_UNIT,
  KNOWLEDGE_PRODUCT_DESCRIPTION,
  KNOWLEDGE_PRODUCT_SHARED_NOTE,
  KNOWLEDGE_PRODUCT_TITLE,
  KNOWLEDGE_RETURN_PERIOD_LABEL,
  KNOWLEDGE_RETURN_PERIOD_UNIT,
  KNOWLEDGE_RETURNS_DESCRIPTION,
  KNOWLEDGE_RETURNS_DISABLED_NOTE,
  KNOWLEDGE_RETURNS_TITLE,
  KNOWLEDGE_SAME_DAY_LABEL,
  KNOWLEDGE_SHIPPING_DESCRIPTION,
  KNOWLEDGE_SHIPPING_TITLE,
  KNOWLEDGE_SIZE_ML_LABEL,
  KNOWLEDGE_SIZE_ML_UNIT,
  KNOWLEDGE_USAGE_DESCRIPTION,
  KNOWLEDGE_USAGE_TITLE,
  KNOWLEDGE_WRONG_PRINT_REPLACEMENT_LABEL,
  parseIntegerInput,
  parseRequiredTextInput,
  SETTINGS_AUTH_DESCRIPTION,
  SETTINGS_AUTH_TITLE,
  SETTINGS_CLEARABLE_UNSPECIFIED_LABEL,
  SETTINGS_RETRY_LABEL,
  SETTINGS_UNAVAILABLE_DESCRIPTION,
  SETTINGS_UNAVAILABLE_TITLE,
  SETTINGS_UNSPECIFIED_LABEL,
  textInputFromValue,
} from "@/lib/seller/assistant-settings-format";
import type { SellerSettingsBootstrap } from "@/lib/seller/assistant-settings-server";

import {
  AuthoritativeReview,
  BinaryChoiceControl,
  FieldMessage,
  LabeledTextField,
  TriStateControl,
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

const resolveTextDraft = (
  raw: string,
): string | null => {
  const parsed = parseRequiredTextInput(raw);
  return parsed.status === "empty" ? null : parsed.value;
};

const resolveIntegerDraft = (
  raw: string,
): { value: number | null; invalid: boolean } => {
  const parsed = parseIntegerInput(raw);
  if (parsed.status === "empty") return { value: null, invalid: false };
  if (parsed.status === "invalid") return { value: null, invalid: true };
  return { value: parsed.value, invalid: false };
};

export function KnowledgeWorkspace({
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
  return <KnowledgeEditor initialSettings={bootstrap.settings} />;
}

function KnowledgeEditor({
  initialSettings,
}: {
  initialSettings: SellerSettings;
}) {
  const editor = useSellerSettingsEditor(initialSettings);
  const [productEpoch, setProductEpoch] = React.useState(0);
  const [usageEpoch, setUsageEpoch] = React.useState(0);
  const [shippingEpoch, setShippingEpoch] = React.useState(0);
  const [returnsEpoch, setReturnsEpoch] = React.useState(0);
  const [productStatus, setProductStatus] = React.useState<SettingsSectionStatus>({
    kind: "idle",
  });
  const [usageStatus, setUsageStatus] = React.useState<SettingsSectionStatus>({
    kind: "idle",
  });
  const [shippingStatus, setShippingStatus] = React.useState<SettingsSectionStatus>({
    kind: "idle",
  });
  const [returnsStatus, setReturnsStatus] = React.useState<SettingsSectionStatus>({
    kind: "idle",
  });

  const saveProduct = async (draft: ProductSettings) => {
    const payload = buildProductSectionPatch({
      expectedVersion: editor.settings.version,
      current: editor.settings.product,
      draft,
    });
    if (!payload) return;
    setProductStatus({ kind: "saving" });
    const result = await editor.save(payload);
    setProductStatus(statusFromSaveResult(result));
    if (result.ok) setProductEpoch((value) => value + 1);
  };

  const saveUsage = async (draft: UsageSettings) => {
    const payload = buildUsageSectionPatch({
      expectedVersion: editor.settings.version,
      current: editor.settings.usage,
      draft,
    });
    if (!payload) return;
    setUsageStatus({ kind: "saving" });
    const result = await editor.save(payload);
    setUsageStatus(statusFromSaveResult(result));
    if (result.ok) setUsageEpoch((value) => value + 1);
  };

  const saveShipping = async (draft: ShippingSettings) => {
    const payload = buildShippingSectionPatch({
      expectedVersion: editor.settings.version,
      current: editor.settings.shipping,
      draft,
    });
    if (!payload) return;
    setShippingStatus({ kind: "saving" });
    const result = await editor.save(payload);
    setShippingStatus(statusFromSaveResult(result));
    if (result.ok) setShippingEpoch((value) => value + 1);
  };

  const saveReturns = async (draft: ReturnPolicySettings) => {
    const payload = buildReturnPolicySectionPatch({
      expectedVersion: editor.settings.version,
      current: editor.settings.returnPolicy,
      draft,
    });
    if (!payload) return;
    setReturnsStatus({ kind: "saving" });
    const result = await editor.save(payload);
    setReturnsStatus(statusFromSaveResult(result));
    if (result.ok) setReturnsEpoch((value) => value + 1);
  };

  return (
    <div className="space-y-4">
      <ProductSection
        key={`product-${productEpoch}`}
        settings={editor.settings}
        disabled={editor.inFlight}
        status={productStatus}
        onSave={saveProduct}
      />
      <UsageSection
        key={`usage-${usageEpoch}`}
        settings={editor.settings}
        disabled={editor.inFlight}
        status={usageStatus}
        onSave={saveUsage}
      />
      <ShippingSection
        key={`shipping-${shippingEpoch}`}
        settings={editor.settings}
        disabled={editor.inFlight}
        status={shippingStatus}
        onSave={saveShipping}
      />
      <ReturnPolicySection
        key={`returns-${returnsEpoch}`}
        settings={editor.settings}
        disabled={editor.inFlight}
        status={returnsStatus}
        onSave={saveReturns}
      />
    </div>
  );
}

function ProductSection({
  settings,
  disabled,
  status,
  onSave,
}: {
  settings: SellerSettings;
  disabled: boolean;
  status: SettingsSectionStatus;
  onSave: (draft: ProductSettings) => Promise<void>;
}) {
  const current = settings.product;
  const [material, setMaterial] = React.useState(textInputFromValue(current.material));
  const [sizeMl, setSizeMl] = React.useState(integerInputFromValue(current.sizeMl));
  const [printMethod, setPrintMethod] = React.useState(
    textInputFromValue(current.printMethod),
  );
  const [customTextMax, setCustomTextMax] = React.useState(
    integerInputFromValue(current.customTextMaxLength),
  );

  const sizeParsed = resolveIntegerDraft(sizeMl);
  const customParsed = resolveIntegerDraft(customTextMax);
  const draft: ProductSettings = {
    material: resolveTextDraft(material),
    sizeMl: sizeParsed.invalid ? current.sizeMl : sizeParsed.value,
    printMethod: resolveTextDraft(printMethod),
    customTextMaxLength: customParsed.invalid
      ? current.customTextMaxLength
      : customParsed.value,
  };
  const parseIssues: SettingsValidationIssue[] = [];
  if (sizeParsed.invalid) {
    parseIssues.push({
      field: "size_ml",
      message: "Hacim bir tam sayı olmalıdır.",
    });
  }
  if (customParsed.invalid) {
    parseIssues.push({
      field: "custom_text_max_length",
      message: "Maksimum karakter sayısı bir tam sayı olmalıdır.",
    });
  }
  const issues = [
    ...parseIssues,
    ...validateProductDraft(draft, current, settings.order),
  ];
  const hasChanges = sectionHasChanges(current, draft) || parseIssues.length > 0;
  const canSave = hasChanges && issues.length === 0 && !disabled;

  return (
    <SettingsSection
      title={KNOWLEDGE_PRODUCT_TITLE}
      description={KNOWLEDGE_PRODUCT_DESCRIPTION}
      note={
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {KNOWLEDGE_PRODUCT_SHARED_NOTE}
        </p>
      }
      canSave={canSave}
      status={status}
      onSave={() => {
        if (!canSave) return;
        void onSave(draft);
      }}
    >
      <LabeledTextField
        id="product-material"
        label={KNOWLEDGE_MATERIAL_LABEL}
        value={material}
        onChange={setMaterial}
        disabled={disabled}
        placeholder={SETTINGS_UNSPECIFIED_LABEL}
        maxLength={PRODUCT_MATERIAL_MAX_LENGTH}
        error={firstIssue(issues, "material")}
      />
      <LabeledTextField
        id="product-size-ml"
        label={KNOWLEDGE_SIZE_ML_LABEL}
        value={sizeMl}
        onChange={setSizeMl}
        disabled={disabled}
        placeholder={SETTINGS_UNSPECIFIED_LABEL}
        suffix={KNOWLEDGE_SIZE_ML_UNIT}
        inputMode="numeric"
        error={firstIssue(issues, "size_ml")}
      />
      <LabeledTextField
        id="product-print-method"
        label={KNOWLEDGE_PRINT_METHOD_LABEL}
        value={printMethod}
        onChange={setPrintMethod}
        disabled={disabled}
        placeholder={SETTINGS_UNSPECIFIED_LABEL}
        maxLength={PRODUCT_PRINT_METHOD_MAX_LENGTH}
        error={firstIssue(issues, "print_method")}
      />
      <div className="space-y-2">
        <LabeledTextField
          id="product-custom-text-max"
          label={KNOWLEDGE_CUSTOM_TEXT_MAX_LABEL}
          value={customTextMax}
          onChange={setCustomTextMax}
          disabled={disabled}
          placeholder={SETTINGS_CLEARABLE_UNSPECIFIED_LABEL}
          inputMode="numeric"
          maxLength={String(PRODUCT_CUSTOM_TEXT_MAX_LENGTH_MAX).length}
          error={firstIssue(issues, "custom_text_max_length")}
        />
        {firstIssue(issues, "custom_text_max_length") ===
        CUSTOM_TEXT_MAX_REQUIRED_MESSAGE ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <Link
              href={KNOWLEDGE_ORDER_COLLECTION_HREF as Route}
              className="font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {KNOWLEDGE_ORDER_COLLECTION_LINK_LABEL}
            </Link>
          </p>
        ) : (
          <FieldMessage>
            Boş bırakırsanız bu değer belirtilmedi olarak kaydedilir.
          </FieldMessage>
        )}
      </div>
      {status.kind === "conflict" ? (
        <AuthoritativeReview
          items={[
            { label: KNOWLEDGE_MATERIAL_LABEL, current: current.material, draft: draft.material },
            { label: KNOWLEDGE_SIZE_ML_LABEL, current: current.sizeMl, draft: draft.sizeMl },
            {
              label: KNOWLEDGE_PRINT_METHOD_LABEL,
              current: current.printMethod,
              draft: draft.printMethod,
            },
            {
              label: KNOWLEDGE_CUSTOM_TEXT_MAX_LABEL,
              current: current.customTextMaxLength,
              draft: draft.customTextMaxLength,
            },
          ]}
        />
      ) : null}
    </SettingsSection>
  );
}

function UsageSection({
  settings,
  disabled,
  status,
  onSave,
}: {
  settings: SellerSettings;
  disabled: boolean;
  status: SettingsSectionStatus;
  onSave: (draft: UsageSettings) => Promise<void>;
}) {
  const current = settings.usage;
  const [draft, setDraft] = React.useState(current);
  const hasChanges = sectionHasChanges(current, draft);

  return (
    <SettingsSection
      title={KNOWLEDGE_USAGE_TITLE}
      description={KNOWLEDGE_USAGE_DESCRIPTION}
      canSave={hasChanges && !disabled}
      status={status}
      onSave={() => {
        if (!hasChanges || disabled) return;
        void onSave(draft);
      }}
    >
      <TriStateControl
        legend={KNOWLEDGE_MICROWAVE_LABEL}
        name="usage-microwave"
        value={draft.microwaveSafe}
        disabled={disabled}
        onChange={(microwaveSafe) => setDraft((prev) => ({ ...prev, microwaveSafe }))}
      />
      <TriStateControl
        legend={KNOWLEDGE_DISHWASHER_LABEL}
        name="usage-dishwasher"
        value={draft.dishwasherSafe}
        disabled={disabled}
        onChange={(dishwasherSafe) =>
          setDraft((prev) => ({ ...prev, dishwasherSafe }))
        }
      />
      <TriStateControl
        legend={KNOWLEDGE_HAND_WASH_LABEL}
        name="usage-hand-wash"
        value={draft.handWashRecommended}
        disabled={disabled}
        onChange={(handWashRecommended) =>
          setDraft((prev) => ({ ...prev, handWashRecommended }))
        }
      />
      <TriStateControl
        legend={KNOWLEDGE_FOOD_SAFE_LABEL}
        name="usage-food-safe"
        value={draft.foodSafe}
        disabled={disabled}
        onChange={(foodSafe) => setDraft((prev) => ({ ...prev, foodSafe }))}
      />
      {status.kind === "conflict" ? (
        <AuthoritativeReview
          items={[
            {
              label: KNOWLEDGE_MICROWAVE_LABEL,
              current: current.microwaveSafe,
              draft: draft.microwaveSafe,
            },
            {
              label: KNOWLEDGE_DISHWASHER_LABEL,
              current: current.dishwasherSafe,
              draft: draft.dishwasherSafe,
            },
            {
              label: KNOWLEDGE_HAND_WASH_LABEL,
              current: current.handWashRecommended,
              draft: draft.handWashRecommended,
            },
            {
              label: KNOWLEDGE_FOOD_SAFE_LABEL,
              current: current.foodSafe,
              draft: draft.foodSafe,
            },
          ]}
        />
      ) : null}
    </SettingsSection>
  );
}

function ShippingSection({
  settings,
  disabled,
  status,
  onSave,
}: {
  settings: SellerSettings;
  disabled: boolean;
  status: SettingsSectionStatus;
  onSave: (draft: ShippingSettings) => Promise<void>;
}) {
  const current = settings.shipping;
  const [minDays, setMinDays] = React.useState(
    integerInputFromValue(current.processingDaysMin),
  );
  const [maxDays, setMaxDays] = React.useState(
    integerInputFromValue(current.processingDaysMax),
  );
  const [sameDay, setSameDay] = React.useState(current.sameDayAvailable);
  const [company, setCompany] = React.useState(textInputFromValue(current.company));
  const [international, setInternational] = React.useState(current.international);

  const minParsed = resolveIntegerDraft(minDays);
  const maxParsed = resolveIntegerDraft(maxDays);
  const draft: ShippingSettings = {
    processingDaysMin: minParsed.invalid ? current.processingDaysMin : minParsed.value,
    processingDaysMax: maxParsed.invalid ? current.processingDaysMax : maxParsed.value,
    sameDayAvailable: sameDay,
    company: resolveTextDraft(company),
    international,
  };
  const parseIssues: SettingsValidationIssue[] = [];
  if (minParsed.invalid) {
    parseIssues.push({
      field: "processing_days_min",
      message: "Hazırlık süresi (en az) bir tam sayı olmalıdır.",
    });
  }
  if (maxParsed.invalid) {
    parseIssues.push({
      field: "processing_days_max",
      message: "Hazırlık süresi (en çok) bir tam sayı olmalıdır.",
    });
  }
  const issues = [...parseIssues, ...validateShippingDraft(draft, current)];
  const hasChanges = sectionHasChanges(current, draft) || parseIssues.length > 0;
  const canSave = hasChanges && issues.length === 0 && !disabled;

  return (
    <SettingsSection
      title={KNOWLEDGE_SHIPPING_TITLE}
      description={KNOWLEDGE_SHIPPING_DESCRIPTION}
      canSave={canSave}
      status={status}
      onSave={() => {
        if (!canSave) return;
        void onSave(draft);
      }}
    >
      {/* Hazırlık süresi — ONE seller concept over the two backend
          fields (processing_days_min / processing_days_max). Grouping
          is purely visual; the payload shape is unchanged. */}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-foreground">
          {KNOWLEDGE_PROCESSING_GROUP_LABEL}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledTextField
            id="shipping-min"
            label={KNOWLEDGE_PROCESSING_MIN_INPUT_LABEL}
            value={minDays}
            onChange={setMinDays}
            disabled={disabled}
            placeholder={SETTINGS_UNSPECIFIED_LABEL}
            suffix={KNOWLEDGE_PROCESSING_UNIT}
            inputMode="numeric"
            error={firstIssue(issues, "processing_days_min")}
          />
          <LabeledTextField
            id="shipping-max"
            label={KNOWLEDGE_PROCESSING_MAX_INPUT_LABEL}
            value={maxDays}
            onChange={setMaxDays}
            disabled={disabled}
            placeholder={SETTINGS_UNSPECIFIED_LABEL}
            suffix={KNOWLEDGE_PROCESSING_UNIT}
            inputMode="numeric"
            error={firstIssue(issues, "processing_days_max")}
          />
        </div>
        <FieldMessage>{KNOWLEDGE_PROCESSING_GROUP_HELP}</FieldMessage>
      </fieldset>
      <div className="space-y-2">
        <BinaryChoiceControl
          legend={KNOWLEDGE_SAME_DAY_LABEL}
          name="shipping-same-day"
          value={sameDay}
          disabled={disabled}
          onChange={setSameDay}
        />
        {firstIssue(issues, "same_day_available") ? (
          <FieldMessage tone="error">
            {firstIssue(issues, "same_day_available")}
          </FieldMessage>
        ) : null}
      </div>
      <LabeledTextField
        id="shipping-company"
        label={KNOWLEDGE_COMPANY_LABEL}
        value={company}
        onChange={setCompany}
        disabled={disabled}
        placeholder={SETTINGS_UNSPECIFIED_LABEL}
        maxLength={SHIPPING_COMPANY_MAX_LENGTH}
        error={firstIssue(issues, "company")}
      />
      <div className="space-y-2">
        <BinaryChoiceControl
          legend={KNOWLEDGE_INTERNATIONAL_LABEL}
          name="shipping-international"
          value={international}
          disabled={disabled}
          onChange={setInternational}
        />
        {firstIssue(issues, "international") ? (
          <FieldMessage tone="error">
            {firstIssue(issues, "international")}
          </FieldMessage>
        ) : null}
      </div>
      {status.kind === "conflict" ? (
        <AuthoritativeReview
          items={[
            {
              label: KNOWLEDGE_PROCESSING_MIN_LABEL,
              current: current.processingDaysMin,
              draft: draft.processingDaysMin,
            },
            {
              label: KNOWLEDGE_PROCESSING_MAX_LABEL,
              current: current.processingDaysMax,
              draft: draft.processingDaysMax,
            },
            {
              label: KNOWLEDGE_SAME_DAY_LABEL,
              current: current.sameDayAvailable,
              draft: draft.sameDayAvailable,
            },
            {
              label: KNOWLEDGE_COMPANY_LABEL,
              current: current.company,
              draft: draft.company,
            },
            {
              label: KNOWLEDGE_INTERNATIONAL_LABEL,
              current: current.international,
              draft: draft.international,
            },
          ]}
        />
      ) : null}
    </SettingsSection>
  );
}

function ReturnPolicySection({
  settings,
  disabled,
  status,
  onSave,
}: {
  settings: SellerSettings;
  disabled: boolean;
  status: SettingsSectionStatus;
  onSave: (draft: ReturnPolicySettings) => Promise<void>;
}) {
  const current = settings.returnPolicy;
  const [acceptsReturns, setAcceptsReturns] = React.useState(current.acceptsReturns);
  const [period, setPeriod] = React.useState(
    integerInputFromValue(current.returnPeriodDays),
  );
  const [damageReplacement, setDamageReplacement] = React.useState(
    current.damageReplacement,
  );
  const [wrongPrintReplacement, setWrongPrintReplacement] = React.useState(
    current.wrongPrintReplacement,
  );

  const periodParsed = resolveIntegerDraft(period);
  const rawDraft: ReturnPolicySettings = {
    acceptsReturns,
    returnPeriodDays: periodParsed.invalid
      ? current.returnPeriodDays
      : periodParsed.value,
    damageReplacement,
    wrongPrintReplacement,
  };
  const draft = applyReturnsDisabledClear(rawDraft);
  const parseIssues: SettingsValidationIssue[] = [];
  if (periodParsed.invalid && acceptsReturns !== false) {
    parseIssues.push({
      field: "return_period_days",
      message: "İade süresi bir tam sayı olmalıdır.",
    });
  }
  const issues = [...parseIssues, ...validateReturnPolicyDraft(draft, current)];
  const hasChanges = sectionHasChanges(current, draft) || parseIssues.length > 0;
  const canSave = hasChanges && issues.length === 0 && !disabled;
  const returnsDisabled = draft.acceptsReturns === false;

  return (
    <SettingsSection
      title={KNOWLEDGE_RETURNS_TITLE}
      description={KNOWLEDGE_RETURNS_DESCRIPTION}
      canSave={canSave}
      status={status}
      onSave={() => {
        if (!canSave) return;
        void onSave(draft);
      }}
    >
      <div className="space-y-2">
        <BinaryChoiceControl
          legend={KNOWLEDGE_ACCEPTS_RETURNS_LABEL}
          name="returns-accepts"
          value={acceptsReturns}
          disabled={disabled}
          onChange={(next) => {
            setAcceptsReturns(next);
            if (!next) setPeriod("");
          }}
        />
        {firstIssue(issues, "accepts_returns") ? (
          <FieldMessage tone="error">
            {firstIssue(issues, "accepts_returns")}
          </FieldMessage>
        ) : null}
      </div>
      {returnsDisabled ? (
        <FieldMessage>{KNOWLEDGE_RETURNS_DISABLED_NOTE}</FieldMessage>
      ) : (
        <LabeledTextField
          id="returns-period"
          label={KNOWLEDGE_RETURN_PERIOD_LABEL}
          value={period}
          onChange={setPeriod}
          disabled={disabled}
          placeholder={SETTINGS_CLEARABLE_UNSPECIFIED_LABEL}
          suffix={KNOWLEDGE_RETURN_PERIOD_UNIT}
          inputMode="numeric"
          error={firstIssue(issues, "return_period_days")}
        />
      )}
      <div className="space-y-2">
        <BinaryChoiceControl
          legend={KNOWLEDGE_DAMAGE_REPLACEMENT_LABEL}
          name="returns-damage"
          value={damageReplacement}
          disabled={disabled}
          onChange={setDamageReplacement}
        />
        {firstIssue(issues, "damage_replacement") ? (
          <FieldMessage tone="error">
            {firstIssue(issues, "damage_replacement")}
          </FieldMessage>
        ) : null}
      </div>
      <div className="space-y-2">
        <BinaryChoiceControl
          legend={KNOWLEDGE_WRONG_PRINT_REPLACEMENT_LABEL}
          name="returns-wrong-print"
          value={wrongPrintReplacement}
          disabled={disabled}
          onChange={setWrongPrintReplacement}
        />
        {firstIssue(issues, "wrong_print_replacement") ? (
          <FieldMessage tone="error">
            {firstIssue(issues, "wrong_print_replacement")}
          </FieldMessage>
        ) : null}
      </div>
      {status.kind === "conflict" ? (
        <AuthoritativeReview
          items={[
            {
              label: KNOWLEDGE_ACCEPTS_RETURNS_LABEL,
              current: current.acceptsReturns,
              draft: draft.acceptsReturns,
            },
            {
              label: KNOWLEDGE_RETURN_PERIOD_LABEL,
              current: current.returnPeriodDays,
              draft: draft.returnPeriodDays,
            },
            {
              label: KNOWLEDGE_DAMAGE_REPLACEMENT_LABEL,
              current: current.damageReplacement,
              draft: draft.damageReplacement,
            },
            {
              label: KNOWLEDGE_WRONG_PRINT_REPLACEMENT_LABEL,
              current: current.wrongPrintReplacement,
              draft: draft.wrongPrintReplacement,
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
