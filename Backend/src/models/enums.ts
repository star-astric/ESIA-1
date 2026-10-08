export enum ProductTag {
  NONE = "none",
  NEW = "new",
  BEST_SELLER = "best_seller",
}

export enum DefaultShape {
  PUFF_SLEEVES = "puff_sleeves",
  LAYERS = "layers",
  BOW = "bow",
  LONG = "long",
  ABAYA = "abaya",
  CIRCULAR = "circular",
}

export enum ProductSize {
  XS = "XS",
  S = "S",
  M = "M",
  L = "L",
  XL = "XL",
  XXL = "2X",
  XXXL = "3X",
  KIDS_6_7 = "6-7",
  KIDS_7_8 = "7-8",
  KIDS_8_9 = "8-9",
  KIDS_9_10 = "9-10",
  KIDS_10_11 = "10-11",
  KIDS_11_12 = "11-12",
}

export enum OrderStatus {
  PENDING = "pending",
  PENDING_PAYMENT = "pending_payment",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
}
export enum UserRole {
  USER = "user",
  ADMIN = "admin",
}

export enum UserTokenType {
  EMAIL_VERIFICATION = "email_verification",
  PASSWORD_RESET = "password_reset",
}

export enum PaymentMethod {
  VODAFONE_CASH = "vodafone_cash",
  ETISALAT_CASH = "etisalat_cash",
  ORANGE_MONEY = "orange_money",
  BANK_TRANSFER = "bank_transfer",
  INSTAPAY = "instapay",
  FAWRY = "fawry",
  OTHER = "other",
}

export enum PaymentStatus {
  NOT_SUBMITTED = "not_submitted",
  SUBMITTED = "submitted",
  VERIFIED = "verified",
  REJECTED = "rejected",
}
