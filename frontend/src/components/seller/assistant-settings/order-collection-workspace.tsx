"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  buildOrderSectionPatch,
  CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE,
  sectionHasChanges,
  validateOrderDraft,
  type OrderSettings,
  type SellerSettings,
  type SettingsValidationIssue,
} from "@/lib/seller/assistant-settings";
import {
  integerInputFromValue,
  ORDER_COLLECTION_QUANTITY_DESCRIPTION,
  ORDER_COLLECTION_QUANTITY_TITLE,
  ORDER_CUSTOM_TEXT_REQUIRED_HELP,
  ORDER_CUSTOM_TEXT_REQUIRED_LABEL,
  ORDER_IMAGE_REQUIRED_HELP,
  ORDER_IMAGE_REQUIRED_LABEL,
  ORDER_KNOWLEDGE_HREF,
  ORDER_KNOWLEDGE_LINK_LABEL,
  ORDER_MAX_QUANTITY_LABEL,
  ORDER_MIN_QUANTITY_LABEL,
  ORDER_PRODUCT_FIELDS_DESCRIPTION,
  ORDER_PRODUCT_FIELDS_TITLE,
  ORDER_PRODUCTS_HREF,
  ORDER_PRODUCTS_LINK_LABEL,
  parseIntegerInput,
  SETTINGS_AUTH_DESCRIPTION,
  SETTINGS_AUTH_TITLE,
  SETTINGS_CLEARABLE_UNSPECIFIED_LABEL,
  SETTINGS_RETRY_LABEL,
  SETTINGS_UNAVAILABLE_DESCRIPTION,
  SETTINGS_UNAVAILABLE_TITLE,
  SETTINGS_UNSPECIFIED_LABEL,
} from "@/lib/seller/assistant-settings-format";
import type { SellerSettingsBootstrap } from "@/lib/seller/assistant-settings-server";
import { cn } from "@/lib/utils/cn";

import {
  AuthoritativeReview,
  BooleanSettingControl,
  FieldMessage,
  LabeledTextField,
} from "./settings-form-controls";
import {
  SETTINGS_FIELD_MEASURE_WIDE,
  SETTINGS_SHEET_MEASURE,
} from "./settings-measure";
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

const resolveIntegerDraft = (
  raw: string,
): { value: number | null; invalid: boolean } => {
  const parsed = parseIntegerInput(raw);
  if (parsed.status === "empty") return { value: null, invalid: false };
  if (parsed.status === "invalid") return { value: null, invalid: true };
  return { value: parsed.value, invalid: false };
};

export function OrderCollectionWorkspace({
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
  return <OrderCollectionEditor initialSettings={bootstrap.settings} />;
}

function OrderCollectionEditor({
  initialSettings,
}: {
  initialSettings: SellerSettings;
}) {
  const editor = useSellerSettingsEditor(initialSettings);
  const [epoch, setEpoch] = React.useState(0);
  const [status, setStatus] = React.useState<SettingsSectionStatus>({
    kind: "idle",
  });

  const saveOrder = async (draft: OrderSettings) => {
    const payload = buildOrderSectionPatch({
      expectedVersion: editor.settings.version,
      current: editor.settings.order,
      draft,
    });
    if (!payload) return;
    setStatus({ kind: "saving" });
    const result = await editor.save(payload);
    setStatus(statusFromSaveResult(result));
    if (result.ok) setEpoch((value) => value + 1);
  };

  return (
    <div className="space-y-6">
      <OrderSection
        key={`order-${epoch}`}
        settings={editor.settings}
        disabled={editor.inFlight}
        status={status}
        onSave={saveOrder}
      />
      <ProductFieldsCrossLink />
    </div>
  );
}

function OrderSection({
  settings,
  disabled,
  status,
  onSave,
}: {
  settings: SellerSettings;
  disabled: boolean;
  status: SettingsSectionStatus;
  onSave: (draft: OrderSettings) => Promise<void>;
}) {
  const current = settings.order;
  const [minQuantity, setMinQuantity] = React.useState(
    integerInputFromValue(current.minQuantity),
  );
  const [maxQuantity, setMaxQuantity] = React.useState(
    integerInputFromValue(current.maxQuantity),
  );
  const [imageRequired, setImageRequired] = React.useState(current.imageRequired);
  const [customTextRequired, setCustomTextRequired] = React.useState(
    current.customTextRequired,
  );

  const minParsed = resolveIntegerDraft(minQuantity);
  const maxParsed = resolveIntegerDraft(maxQuantity);
  const draft: OrderSettings = {
    minQuantity: minParsed.invalid ? current.minQuantity : minParsed.value,
    maxQuantity: maxParsed.invalid ? current.maxQuantity : maxParsed.value,
    imageRequired,
    customTextRequired,
  };
  const parseIssues: SettingsValidationIssue[] = [];
  if (minParsed.invalid) {
    parseIssues.push({
      field: "min_quantity",
      message: "Minimum sipariş adedi bir tam sayı olmalıdır.",
    });
  }
  if (maxParsed.invalid) {
    parseIssues.push({
      field: "max_quantity",
      message: "Maksimum sipariş adedi bir tam sayı olmalıdır.",
    });
  }
  const issues = [
    ...parseIssues,
    ...validateOrderDraft(draft, current, settings.product),
  ];
  const hasChanges = sectionHasChanges(current, draft) || parseIssues.length > 0;
  const canSave = hasChanges && issues.length === 0 && !disabled;
  const customTextBlocked =
    firstIssue(issues, "custom_text_required") ===
    CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE;

  return (
    <SettingsSection
      title={ORDER_COLLECTION_QUANTITY_TITLE}
      description={ORDER_COLLECTION_QUANTITY_DESCRIPTION}
      measure="wide"
      canSave={canSave}
      status={status}
      onSave={() => {
        if (!canSave) return;
        void onSave(draft);
      }}
    >
      <LabeledTextField
        id="order-min-quantity"
        label={ORDER_MIN_QUANTITY_LABEL}
        value={minQuantity}
        onChange={setMinQuantity}
        disabled={disabled}
        placeholder={SETTINGS_UNSPECIFIED_LABEL}
        inputMode="numeric"
        error={firstIssue(issues, "min_quantity")}
      />
      <div className="space-y-2">
        <LabeledTextField
          id="order-max-quantity"
          label={ORDER_MAX_QUANTITY_LABEL}
          value={maxQuantity}
          onChange={setMaxQuantity}
          disabled={disabled}
          placeholder={SETTINGS_CLEARABLE_UNSPECIFIED_LABEL}
          inputMode="numeric"
          error={firstIssue(issues, "max_quantity")}
        />
        <FieldMessage>
          Boş bırakırsanız üst sınır belirtilmedi olarak kaydedilir.
        </FieldMessage>
      </div>
      <div className="space-y-2">
        <BooleanSettingControl
          legend={ORDER_IMAGE_REQUIRED_LABEL}
          name="order-image-required"
          value={imageRequired}
          help={ORDER_IMAGE_REQUIRED_HELP}
          disabled={disabled}
          onChange={setImageRequired}
        />
        {firstIssue(issues, "image_required") ? (
          <FieldMessage tone="error">
            {firstIssue(issues, "image_required")}
          </FieldMessage>
        ) : null}
      </div>
      <div className="space-y-2">
        <BooleanSettingControl
          legend={ORDER_CUSTOM_TEXT_REQUIRED_LABEL}
          name="order-custom-text-required"
          value={customTextRequired}
          help={ORDER_CUSTOM_TEXT_REQUIRED_HELP}
          disabled={disabled}
          onChange={setCustomTextRequired}
        />
        {customTextBlocked ? (
          <>
            <FieldMessage tone="error">
              {CUSTOM_TEXT_REQUIRED_NEEDS_MAX_MESSAGE}
            </FieldMessage>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <Link
                href={ORDER_KNOWLEDGE_HREF as Route}
                className="font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {ORDER_KNOWLEDGE_LINK_LABEL}
              </Link>
            </p>
          </>
        ) : firstIssue(issues, "custom_text_required") ? (
          <FieldMessage tone="error">
            {firstIssue(issues, "custom_text_required")}
          </FieldMessage>
        ) : null}
      </div>
      {status.kind === "conflict" ? (
        <AuthoritativeReview
          items={[
            {
              label: ORDER_MIN_QUANTITY_LABEL,
              current: current.minQuantity,
              draft: draft.minQuantity,
            },
            {
              label: ORDER_MAX_QUANTITY_LABEL,
              current: current.maxQuantity,
              draft: draft.maxQuantity,
            },
            {
              label: ORDER_IMAGE_REQUIRED_LABEL,
              current: current.imageRequired,
              draft: draft.imageRequired,
            },
            {
              label: ORDER_CUSTOM_TEXT_REQUIRED_LABEL,
              current: current.customTextRequired,
              draft: draft.customTextRequired,
            },
          ]}
        />
      ) : null}
    </SettingsSection>
  );
}

function ProductFieldsCrossLink() {
  return (
    <section aria-labelledby="product-fields-heading">
      {/* Same contained work sheet as the editable sections, so the
          page reads as one column of work areas. */}
      <div
        className={cn(
          "space-y-2 rounded-sheet bg-raised px-4 py-5 md:px-6 md:py-6",
          SETTINGS_SHEET_MEASURE,
        )}
      >
        <h2
          id="product-fields-heading"
          className="type-section text-foreground"
        >
          {ORDER_PRODUCT_FIELDS_TITLE}
        </h2>
        <p className={cn("type-body text-muted", SETTINGS_FIELD_MEASURE_WIDE)}>
          {ORDER_PRODUCT_FIELDS_DESCRIPTION}
        </p>
        <p>
          <Link
            href={ORDER_PRODUCTS_HREF as Route}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {ORDER_PRODUCTS_LINK_LABEL}
          </Link>
        </p>
      </div>
    </section>
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
