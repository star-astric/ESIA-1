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
