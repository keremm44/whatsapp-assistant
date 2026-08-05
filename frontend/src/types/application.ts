export type SellerApplicationInput = {
  fullName: string;
  whatsappPhone: string;
  storeName: string;
  storeUrl?: string;
  note?: string;
  contactConsent: true;
};

export type LoginInput = {
  email: string;
  password: string;
};
