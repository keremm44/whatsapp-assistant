"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import {
  buildCreateProductPayload,
  buildProductStatusPayload,
  buildRenameProductPayload,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_MIN_LENGTH,
  type Product,
} from "@/lib/seller/products";
import { createProduct, updateProduct } from "@/lib/seller/products-api";
import {
  classifyProductsMutationFailure,
  isProductDuplicateConflict,
  PRODUCT_CONFLICT_MESSAGE,
  PRODUCT_DEACTIVATE_EXPLANATION,
  PRODUCT_DUPLICATE_MESSAGE,
  PRODUCT_NAME_LABEL,
  PRODUCT_REACTIVATE_EXPLANATION,
  PRODUCTS_CREATE_LABEL,
  PRODUCTS_DEACTIVATE_LABEL,
  PRODUCTS_REACTIVATE_LABEL,
  PRODUCTS_RENAME_LABEL,
} from "@/lib/seller/products-format";
import { getBrowserAccessToken } from "@/lib/supabase/client";

const usePortalHost = () => {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  return { host, setHost };
};

const classifyCreateError = (error: unknown): string => {
  if (error instanceof ApiError) {
    const kind = classifyProductsMutationFailure(error.status);
    if (kind === "conflict") {
      return isProductDuplicateConflict(error.body)
        ? PRODUCT_DUPLICATE_MESSAGE
        : PRODUCT_CONFLICT_MESSAGE;
    }
    if (kind === "validation") {
      return "Ürün adı 2 ile 200 karakter arasında olmalıdır.";
    }
  }
  return "İşlem şu anda tamamlanamadı. Girdiğiniz ad korundu; lütfen tekrar deneyin.";
};

export function ProductCreateDialog({
  onCreated,
}: {
  onCreated: (productId: number) => void;
}) {
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const resetAndClose = () => {
    setOpen(false);
    setError(null);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || inflightRef.current) return;
    const trimmed = name.trim();
    if (
      trimmed.length < PRODUCT_NAME_MIN_LENGTH ||
      trimmed.length > PRODUCT_NAME_MAX_LENGTH
    ) {
      setError("Ürün adı 2 ile 200 karakter arasında olmalıdır.");
      return;
    }
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      const result = await createProduct(
        accessToken,
        buildCreateProductPayload(trimmed),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setName("");
      setOpen(false);
      onCreated(result.product.id);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(classifyCreateError(caught));
    } finally {
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button type="button" size="md" onClick={() => setOpen(true)}>
        {PRODUCTS_CREATE_LABEL}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && resetAndClose()}>
        <DialogContent className="max-w-md" portalContainer={host}>
          <DialogTitle>{PRODUCTS_CREATE_LABEL}</DialogTitle>
          <DialogDescription>
            Satışını yaptığınız ürünün adını yazın. Asistan sipariş sırasında
            bu adı kullanır.
          </DialogDescription>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-create-name">{PRODUCT_NAME_LABEL}</Label>
              <Input
                id="product-create-name"
                name="name"
                value={name}
                maxLength={PRODUCT_NAME_MAX_LENGTH}
                disabled={isSubmitting}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </div>
            {error ? (
              <p role="alert" className="text-[12.5px] leading-snug text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={14} label="Kaydediliyor" />
                    <span>Kaydediliyor…</span>
                  </span>
                ) : (
                  "Kaydet"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={resetAndClose}
              >
                Vazgeç
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProductRenameDialog({ product }: { product: Product }) {
  const router = useRouter();
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(product.name);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setName(product.name);
  }, [product.id, product.name, product.version]);

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || inflightRef.current) return;
    const trimmed = name.trim();
    if (
      trimmed.length < PRODUCT_NAME_MIN_LENGTH ||
      trimmed.length > PRODUCT_NAME_MAX_LENGTH
    ) {
      setError("Ürün adı 2 ile 200 karakter arasında olmalıdır.");
      return;
    }
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      await updateProduct(
        accessToken,
        product.id,
        buildRenameProductPayload({ version: product.version, name: trimmed }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setOpen(false);
      router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError) {
        const kind = classifyProductsMutationFailure(caught.status);
        if (kind === "conflict") {
          setError(
            isProductDuplicateConflict(caught.body)
              ? PRODUCT_DUPLICATE_MESSAGE
              : PRODUCT_CONFLICT_MESSAGE,
          );
          router.refresh();
          return;
        }
      }
      setError(classifyCreateError(caught));
    } finally {
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="min-h-11"
        onClick={() => setOpen(true)}
      >
        {PRODUCTS_RENAME_LABEL}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md" portalContainer={host}>
          <DialogTitle>{PRODUCTS_RENAME_LABEL}</DialogTitle>
          <DialogDescription>Ürünün görünen adını güncelleyin.</DialogDescription>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-rename-name">{PRODUCT_NAME_LABEL}</Label>
              <Input
                id="product-rename-name"
                name="name"
                value={name}
                maxLength={PRODUCT_NAME_MAX_LENGTH}
                disabled={isSubmitting}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </div>
            {error ? (
              <p role="alert" className="text-[12.5px] leading-snug text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting ? "Kaydediliyor…" : "Kaydet"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => setOpen(false)}
              >
                Vazgeç
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProductStatusDialog({ product }: { product: Product }) {
  const router = useRouter();
  const { host, setHost } = usePortalHost();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflightRef = React.useRef<AbortController | null>(null);
  const nextActive = !product.isActive;

  React.useEffect(() => () => inflightRef.current?.abort(), []);

  const onConfirm = async () => {
    if (isSubmitting || inflightRef.current) return;
    setError(null);
    const controller = new AbortController();
    inflightRef.current = controller;
    setIsSubmitting(true);
    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        setError("Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.");
        return;
      }
      await updateProduct(
        accessToken,
        product.id,
        buildProductStatusPayload({
          version: product.version,
          isActive: nextActive,
        }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setOpen(false);
      router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (
        caught instanceof ApiError &&
        classifyProductsMutationFailure(caught.status) === "conflict"
      ) {
        setError(PRODUCT_CONFLICT_MESSAGE);
        router.refresh();
        return;
      }
      setError("İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.");
    } finally {
      if (inflightRef.current === controller) inflightRef.current = null;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div ref={setHost} className="contents" />
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="min-h-11"
        onClick={() => setOpen(true)}
      >
        {product.isActive ? PRODUCTS_DEACTIVATE_LABEL : PRODUCTS_REACTIVATE_LABEL}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md" portalContainer={host}>
          <DialogTitle>
            {product.isActive ? PRODUCTS_DEACTIVATE_LABEL : PRODUCTS_REACTIVATE_LABEL}
          </DialogTitle>
          <DialogDescription>
            {product.isActive
              ? PRODUCT_DEACTIVATE_EXPLANATION
              : PRODUCT_REACTIVATE_EXPLANATION}
          </DialogDescription>
          {error ? (
            <p role="alert" className="text-[12.5px] leading-snug text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => {
                void onConfirm();
              }}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Kaydediliyor…" : "Onayla"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
            >
              Vazgeç
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


