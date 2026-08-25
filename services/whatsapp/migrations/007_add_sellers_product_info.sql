-- 007_add_sellers_product_info.sql
-- Satıcıya ait güvenilir ürün bilgilerini standart JSON yapısında saklar.

BEGIN;

ALTER TABLE public.sellers
ADD COLUMN IF NOT EXISTS product_info JSONB NOT NULL DEFAULT
'{
  "shipping": {
    "processing_days_min": null,
    "processing_days_max": null,
    "same_day_available": null,
    "company": null,
    "international": null
  },
  "usage": {
    "microwave_safe": null,
    "dishwasher_safe": null,
    "hand_wash_recommended": null,
    "food_safe": null
  },
  "product": {
    "material": null,
    "size_ml": null,
    "print_method": null,
    "custom_text_max_length": null
  },
  "order": {
    "min_quantity": null,
    "max_quantity": null,
    "image_required": null,
    "custom_text_required": null
  },
  "return": {
    "accepts_returns": null,
    "return_period_days": null,
    "damage_replacement": null,
    "wrong_print_replacement": null
  }
}'::jsonb;

ALTER TABLE public.sellers
ADD CONSTRAINT sellers_product_info_object_check
CHECK (jsonb_typeof(product_info) = 'object');

INSERT INTO public.schema_migrations (
    version,
    name,
    checksum,
    applied_by
)
VALUES (
    '007',
    'add_sellers_product_info',
    'v1',
    CURRENT_USER
)
ON CONFLICT (version) DO NOTHING;

COMMIT;