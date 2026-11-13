export type BillingPeriod = 'monthly' | 'yearly';
export type PlanType = 'personal' | 'family' | 'school';
export type PaidTier = 'premium' | 'pro';

export const FAMILY_MONTHLY_PRICE = 14.99;
export const FAMILY_SEATS = 5;
export const YEARLY_DISCOUNT_MULTIPLIER = 0.8;

export function normalizeBillingPeriod(value: unknown): BillingPeriod {
  return String(value || '').toLowerCase() === 'yearly' ? 'yearly' : 'monthly';
}

export function normalizePlanType(value: unknown): PlanType {
  const v = String(value || 'personal').toLowerCase();
  if (v === 'family') return 'family';
  if (v === 'school') return 'school';
  return 'personal';
}

/**
 * Volume pricing per seat/month for School plans:
 *  <= 20 seats  -> $4.00/seat
 *  <= 50 seats  -> $3.50/seat
 *  <= 100 seats -> $3.00/seat
 *  <= 250 seats -> $2.50/seat
 *  > 250 seats  -> $2.00/seat
 */
export function getSchoolPerSeatMonthlyRate(seats: number): number {
  const n = Math.max(1, Math.round(Number(seats) || 1));
  if (n <= 20) return 4.0;
  if (n <= 50) return 3.5;
  if (n <= 100) return 3.0;
  if (n <= 250) return 2.5;
  return 2.0;
}

export interface CheckoutPricingInput {
  tier: PaidTier;
  planType: PlanType;
  billingPeriod: BillingPeriod;
  seats?: number;
  personalUnitMonthly: number;
  familyMonthly?: number;
}

export interface CheckoutPricingResult {
  tier: PaidTier;
  planType: PlanType;
  billingPeriod: BillingPeriod;
  seats: number;
  perSeatMonthly: number;
  monthlyBeforeDiscount: number;
  monthlyEquivalent: number;
  totalDueNow: number;
  durationDays: number;
}

export function calculateCheckoutPricing(input: CheckoutPricingInput): CheckoutPricingResult {
  const billingPeriod = normalizeBillingPeriod(input.billingPeriod);
  const planType = normalizePlanType(input.planType);
  const effectiveTier: PaidTier = planType === 'family' ? 'pro' : input.tier;

  let seats = 1;
  let perSeatMonthly = Math.max(0, Number(input.personalUnitMonthly) || 0);
  let monthlyBeforeDiscount = perSeatMonthly;

  if (planType === 'family') {
    seats = FAMILY_SEATS;
    monthlyBeforeDiscount = Math.max(0, Number(input.familyMonthly ?? FAMILY_MONTHLY_PRICE));
    perSeatMonthly = Math.round((monthlyBeforeDiscount / FAMILY_SEATS) * 100) / 100;
  } else if (planType === 'school') {
    seats = Math.max(5, Math.min(1000, Math.round(Number(input.seats) || 10)));
    const baseSeat = getSchoolPerSeatMonthlyRate(seats);
    perSeatMonthly = effectiveTier === 'premium' ? Math.round(baseSeat * 0.6 * 100) / 100 : baseSeat;
    monthlyBeforeDiscount = Math.round(perSeatMonthly * seats * 100) / 100;
  }

  const discount = billingPeriod === 'yearly' ? YEARLY_DISCOUNT_MULTIPLIER : 1;
  const monthlyEquivalent = Math.round(monthlyBeforeDiscount * discount * 100) / 100;
  const totalDueNow = billingPeriod === 'yearly'
    ? Math.round(monthlyEquivalent * 12 * 100) / 100
    : monthlyEquivalent;
  const durationDays = billingPeriod === 'yearly' ? 365 : 30;

  return {
    tier: effectiveTier,
    planType,
    billingPeriod,
    seats,
    perSeatMonthly: Math.round(perSeatMonthly * discount * 100) / 100,
    monthlyBeforeDiscount: Math.round(monthlyBeforeDiscount * 100) / 100,
    monthlyEquivalent,
    totalDueNow,
    durationDays,
  };
}

/**
 * Apply a percentage or fixed-amount coupon discount, clamped cleanly at $0.
 */
export function applyCouponDiscount(
  baseAmount: number,
  discountType: string,
  discountValue: number
): number {
  const safeBase = Math.max(0, Number(baseAmount) || 0);
  const val = Math.max(0, Number(discountValue) || 0);
  if (discountType === 'percentage') {
    return Math.max(0, Math.round(safeBase * (1 - val / 100) * 100) / 100);
  }
  return Math.max(0, Math.round((safeBase - val) * 100) / 100);
}
