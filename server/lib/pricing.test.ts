import { describe, expect, it } from 'vitest';
import {
  FAMILY_MONTHLY_PRICE,
  FAMILY_SEATS,
  applyCouponDiscount,
  calculateCheckoutPricing,
  getSchoolPerSeatMonthlyRate,
} from './pricing';

describe('server pricing engine', () => {
  it('computes School tiered per-seat monthly rates across all volume brackets', () => {
    expect(getSchoolPerSeatMonthlyRate(5)).toBe(4.0);
    expect(getSchoolPerSeatMonthlyRate(20)).toBe(4.0);
    expect(getSchoolPerSeatMonthlyRate(21)).toBe(3.5);
    expect(getSchoolPerSeatMonthlyRate(50)).toBe(3.5);
    expect(getSchoolPerSeatMonthlyRate(51)).toBe(3.0);
    expect(getSchoolPerSeatMonthlyRate(100)).toBe(3.0);
    expect(getSchoolPerSeatMonthlyRate(101)).toBe(2.5);
    expect(getSchoolPerSeatMonthlyRate(250)).toBe(2.5);
    expect(getSchoolPerSeatMonthlyRate(251)).toBe(2.0);
    expect(getSchoolPerSeatMonthlyRate(500)).toBe(2.0);
  });

  it('applies yearly 20% discount and 365-day duration on Personal plans', () => {
    const monthly = calculateCheckoutPricing({
      tier: 'pro',
      planType: 'personal',
      billingPeriod: 'monthly',
      personalUnitMonthly: 10,
    });
    expect(monthly.totalDueNow).toBe(10);
    expect(monthly.monthlyEquivalent).toBe(10);
    expect(monthly.durationDays).toBe(30);
    expect(monthly.seats).toBe(1);

    const yearly = calculateCheckoutPricing({
      tier: 'pro',
      planType: 'personal',
      billingPeriod: 'yearly',
      personalUnitMonthly: 10,
    });
    expect(yearly.monthlyBeforeDiscount).toBe(10);
    expect(yearly.monthlyEquivalent).toBe(8);
    expect(yearly.totalDueNow).toBe(96);
    expect(yearly.durationDays).toBe(365);
  });

  it('uses fixed 5-seat Pro pricing for Family plans', () => {
    const familyMonthly = calculateCheckoutPricing({
      tier: 'premium', // Family always grants Pro tier
      planType: 'family',
      billingPeriod: 'monthly',
      seats: 2,
      personalUnitMonthly: 9.99,
      familyMonthly: FAMILY_MONTHLY_PRICE,
    });
    expect(familyMonthly.tier).toBe('pro');
    expect(familyMonthly.seats).toBe(FAMILY_SEATS);
    expect(familyMonthly.totalDueNow).toBe(FAMILY_MONTHLY_PRICE);

    const familyYearly = calculateCheckoutPricing({
      tier: 'pro',
      planType: 'family',
      billingPeriod: 'yearly',
      personalUnitMonthly: 9.99,
    });
    expect(familyYearly.seats).toBe(FAMILY_SEATS);
    expect(familyYearly.monthlyEquivalent).toBe(11.99);
    expect(familyYearly.totalDueNow).toBe(143.88);
  });

  it('clamps School seats to [5, 1000] and prices Premium at 60% of Pro rate', () => {
    const schoolMin = calculateCheckoutPricing({
      tier: 'pro',
      planType: 'school',
      billingPeriod: 'monthly',
      seats: 1,
      personalUnitMonthly: 10,
    });
    expect(schoolMin.seats).toBe(5);
    expect(schoolMin.perSeatMonthly).toBe(4.0);
    expect(schoolMin.totalDueNow).toBe(20);

    const schoolPremium = calculateCheckoutPricing({
      tier: 'premium',
      planType: 'school',
      billingPeriod: 'monthly',
      seats: 60,
      personalUnitMonthly: 10,
    });
    // >50 & <=100 seats -> $3.00 base * 0.6 = $1.80/seat -> $108 total
    expect(schoolPremium.perSeatMonthly).toBe(1.8);
    expect(schoolPremium.totalDueNow).toBe(108);
  });

  it('supports $0 coupons (100% off or fixed discount exceeding total) and partial discounts', () => {
    expect(applyCouponDiscount(14.99, 'percentage', 100)).toBe(0);
    expect(applyCouponDiscount(14.99, 'fixed', 25)).toBe(0);
    expect(applyCouponDiscount(20, 'percentage', 25)).toBe(15);
    expect(applyCouponDiscount(20, 'fixed', 5.5)).toBe(14.5);
  });
});

