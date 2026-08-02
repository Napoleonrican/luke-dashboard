import { describe, it, expect } from 'vitest';
import {
  fuelStats, milesPerDay, estimatedOdometer, serviceDue, costPerYear, lastServiceFromLog,
  DEFAULT_MILES_PER_DAY,
} from '../pages/vehicles/vehicleCalc';

// Real early CX-5 fill-ups from Mazda-Fuel Tracking (cols F:I), Jan 2024.
const CX5_FILLS = [
  { fill_date: '2024-01-05', odometer: 64049, gallons: 12.145, total_cost: 41.28 },
  { fill_date: '2024-01-08', odometer: 64394, gallons: 13.588, total_cost: 45.78 },
  { fill_date: '2024-01-12', odometer: 64745, gallons: 13.497, total_cost: 44.53 },
  { fill_date: '2024-01-15', odometer: 65106, gallons: 12.95,  total_cost: 42.72 },
];

describe('fuelStats', () => {
  it('computes odometer deltas and MPG from real CX-5 fill-ups', () => {
    const stats = fuelStats(CX5_FILLS);
    expect(stats).toHaveLength(4);

    // First fill has no prior odometer reading to diff against.
    expect(stats[0].miles).toBeNull();
    expect(stats[0].mpg).toBeNull();
    expect(stats[0].pricePerGallon).toBeCloseTo(3.39893, 4);

    expect(stats[1].miles).toBe(345);
    expect(stats[1].mpg).toBeCloseTo(25.39005, 4);
    expect(stats[1].pricePerGallon).toBeCloseTo(3.36915, 4);

    expect(stats[2].miles).toBe(351);
    expect(stats[2].mpg).toBeCloseTo(26.00578, 4);

    expect(stats[3].miles).toBe(361);
    expect(stats[3].mpg).toBeCloseTo(27.87645, 4);
  });

  it('sorts unordered logs chronologically', () => {
    const shuffled = [CX5_FILLS[2], CX5_FILLS[0], CX5_FILLS[3], CX5_FILLS[1]];
    const stats = fuelStats(shuffled);
    expect(stats.map((s) => s.fill_date)).toEqual(CX5_FILLS.map((f) => f.fill_date));
  });

  it('skips MPG for a partial fill but still reports the odometer delta', () => {
    const withPartial = [
      CX5_FILLS[0],
      { ...CX5_FILLS[1], partial_fill: true },
      CX5_FILLS[2],
    ];
    const stats = fuelStats(withPartial);
    expect(stats[1].miles).toBe(345);       // odometer delta still computed
    expect(stats[1].mpg).toBeNull();        // but MPG is suppressed
    expect(stats[2].miles).toBe(351);       // downstream deltas unaffected
  });

  it('nulls out an implausible odometer delta instead of poisoning MPG', () => {
    // A same-day entry logged out of order can make the "next" delta negative
    // or absurd — e.g. a typo'd odometer far below the running total.
    const badEntry = [
      CX5_FILLS[0],
      { fill_date: '2024-01-06', odometer: 6439, gallons: 10, total_cost: 35 }, // typo: missing a digit
      CX5_FILLS[2],
    ];
    const stats = fuelStats(badEntry);
    expect(stats[1].miles).toBeNull();
    expect(stats[1].mpg).toBeNull();
    // The next real fill's delta is against the bad row's odometer, which is
    // also implausible (58306mi) — also nulled rather than reported as real.
    expect(stats[2].miles).toBeNull();
  });

  it('suppresses $/gallon for a near-zero gallons reading', () => {
    const tinyGallons = [{ ...CX5_FILLS[0], gallons: 0.05, total_cost: 40 }];
    const stats = fuelStats(tinyGallons);
    expect(stats[0].pricePerGallon).toBeNull();
  });
});

describe('milesPerDay', () => {
  it('computes odometer span ÷ day span over the fill history', () => {
    // 2024-01-05 → 2024-01-15: 10 days, 65106 - 64049 = 1057 miles.
    expect(milesPerDay(CX5_FILLS)).toBeCloseTo(105.7, 5);
  });

  it('narrows to the trailing window when history is long enough', () => {
    const longHistory = [
      { fill_date: '2023-01-01', odometer: 50000, gallons: 12, total_cost: 40 },
      ...CX5_FILLS,
    ];
    // The window(30) cut narrows to just the Jan 2024 fills (10 days apart),
    // ignoring the far-older 2023 reading — same 105.7 mi/day result.
    expect(milesPerDay(longHistory, { window: 30 })).toBeCloseTo(105.7, 5);
  });

  it('falls back to the override, then the module default, with too little history', () => {
    expect(milesPerDay([], { override: 75 })).toBe(75);
    expect(milesPerDay([CX5_FILLS[0]])).toBe(DEFAULT_MILES_PER_DAY);
    expect(milesPerDay([])).toBe(DEFAULT_MILES_PER_DAY);
  });
});

describe('estimatedOdometer', () => {
  it('projects forward from the latest fill using the computed miles/day', () => {
    // 5 days after the last fill (2024-01-15) at 105.7 mi/day.
    const est = estimatedOdometer(CX5_FILLS, new Date(2024, 0, 20));
    expect(est).toBeCloseTo(65634.5, 1);
  });

  it('returns null with no fuel history at all', () => {
    expect(estimatedOdometer([], new Date(2024, 0, 20))).toBeNull();
  });
});

describe('serviceDue', () => {
  const plan = {
    last_odometer: 64049,
    interval_miles: 3000,
    last_completed_date: '2024-01-05',
    interval_months: 3,
  };

  it('flags "soon" when the mileage threshold is the binding constraint', () => {
    // estOdo/mpd from the estimatedOdometer test above: 65634.5 @ 105.7 mi/day.
    const result = serviceDue(plan, { estOdo: 65634.5, milesPerDay: 105.7, today: new Date(2024, 0, 20) });
    expect(result.milesDue).toBe(67049);
    expect(result.timeDue).toBe('2024-04-05');
    expect(result.milesRemaining).toBeCloseTo(1414.5, 1);
    expect(result.daysRemaining).toBeCloseTo(13.38, 1);   // miles constraint binds (13d < 76d)
    expect(result.status).toBe('soon');
    expect(result.eta).toBe('2024-02-02');                 // today + round(13.38) days
  });

  it('flags "overdue" once the estimated odometer has crossed milesDue', () => {
    const result = serviceDue(plan, { estOdo: 68000, milesPerDay: 105.7, today: new Date(2024, 3, 1) });
    expect(result.milesRemaining).toBeLessThan(0);
    expect(result.status).toBe('overdue');
  });

  it('flags "ok" when both constraints are comfortably in the future', () => {
    const farPlan = { ...plan, interval_miles: 30000, interval_months: 36 };
    const result = serviceDue(farPlan, { estOdo: 65634.5, milesPerDay: 105.7, today: new Date(2024, 0, 20) });
    expect(result.status).toBe('ok');
  });

  it('falls back to the time constraint alone when there is no mileage interval', () => {
    const timeOnly = { last_completed_date: '2024-01-05', interval_months: 1 };
    const result = serviceDue(timeOnly, { estOdo: 65634.5, milesPerDay: 105.7, today: new Date(2024, 1, 3) });
    expect(result.milesDue).toBeNull();
    expect(result.timeDue).toBe('2024-02-05');
    expect(result.eta).toBe('2024-02-05');
    expect(result.status).toBe('soon');   // 2 days out — inside the 30-day "soon" window
  });
});

describe('costPerYear', () => {
  it('annualizes a months-based interval directly', () => {
    // Oil change every 12 months at $52.95 → $52.95/yr.
    expect(costPerYear({ avg_cost: 52.95, interval_months: 12 })).toBeCloseTo(52.95, 2);
    // Every 6 months → happens twice a year.
    expect(costPerYear({ avg_cost: 30, interval_months: 6 })).toBeCloseTo(60, 2);
  });

  it('annualizes a miles-only interval using miles/day', () => {
    // Every 5000mi at 105.7 mi/day → 365*105.7/5000 ≈ 7.716 times/yr.
    const result = costPerYear({ avg_cost: 10, interval_miles: 5000 }, 105.7);
    expect(result).toBeCloseTo(10 * (105.7 * 365 / 5000), 4);
  });

  it('returns null with no cost or no usable interval', () => {
    expect(costPerYear({ avg_cost: null, interval_months: 12 })).toBeNull();
    expect(costPerYear({ avg_cost: 50 })).toBeNull();
  });
});

describe('lastServiceFromLog', () => {
  const visits = [
    { id: 'v1', service_date: '2024-06-10', odometer: 79325 },
    { id: 'v2', service_date: '2025-03-28', odometer: 105024 },
    { id: 'v3', service_date: '2025-12-13', odometer: 131294 },
  ];
  const itemsByVisitId = {
    v1: [{ service_type: 'Replace Brake Pads' }, { service_type: 'Labor' }],
    v2: [{ service_type: 'Wheel Alignment' }, { service_type: 'Oil Change/Oil Filter' }],
    v3: [{ service_type: 'Oil Change/Oil Filter' }],
  };

  it('finds the most recent visit whose items include the service, case-insensitively', () => {
    const result = lastServiceFromLog('oil change/oil filter', visits, itemsByVisitId);
    expect(result).toEqual({ date: '2025-12-13', odometer: 131294 });
  });

  it('returns null when the service has never been logged', () => {
    expect(lastServiceFromLog('State Inspection', visits, itemsByVisitId)).toBeNull();
  });
});
