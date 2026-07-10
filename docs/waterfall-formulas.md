# Cash Waterfall — workbook formula map

Extracted from `0 - Cashflow Plan (AI_Assisted).xlsx`, **Waterfall** sheet
(v4.2), on 2026-07-07. This is the source of truth for wiring the dashboard's
allocation engine (`src/pages/cashflow/waterfallCalc.js`) to fully-live needs.
The current engine reproduces the workbook's *example numbers* with editable
needs; this doc records the *formulas* so each need can be derived instead.

## Pool (money being distributed)

- **Total Available (D5)** = Doordash earnings (D3) + Paycheck (D4). Income
  only — cash on hand is NOT poured. ✓ engine matches (`pool = paycheck + sideGig`).
- **Starting pool (F23)** = `D5 + MAX(0, (UberProCard − UberProBackupOwed) − OperatingBufferStage1)`
  — adds any Uber Pro Card surplus above what's owed/buffered. Minor; engine skips it today.

## Current balances (accounts, by name)

| Cell | Account |
|------|---------|
| D8 | Bill Pay Checking |
| D9 | Operating Checking |
| D10 | Debt/Loan Checking |
| D11 | Uber Pro Card |
| D12 | Uber Pro Backup Owed |
| D13 | Vehicle Maintenance Savings |
| D14 | Primary Savings (Emergency Fund) |

## Right-side helper values (the "J" column)

| Name | Value/formula | Notes |
|------|---------------|-------|
| `Earnin_Debit` (J3) | **manual input** 1173.96 | total currently owed to Earnin |
| `Bills Next 7 Days` (J4) | SUMIFS combined bills due ≤7d, type≠Debt, not on-deck | |
| `Debt Mins next 7 days` (J5) | SUMIFS combined bills due ≤7d, type=Debt/Loan, not on-deck | |
| `BillPay_Subscriptions_Floor` (J9) | `= J18` = (digital+consumable subs total) / 2 | half of monthly subs |
| `Debt Payment Acct Buffer` (J10) | blank → 0 | |
| `Operating_Buffer_Stage1` (J11) | `Inputs!B16` = 250 | |

`On_Deck[Amount]` sums (by Bill Type) come from the Runway "On Deck" list —
i.e. our `fin_runway_deck` rows resolved to amounts.

## Step needs (Need column, D24–D42)

| # | Step | Need formula (workbook) | Wire to |
|---|------|-------------------------|---------|
| 0a | Uber Pro backup | `MAX(0, UberProBackupOwed − UberProCard)` | accounts D12,D11 |
| 0b | Earnin coverage | `MAX(0, (Earnin_Debit + onDeckBills) − BillPay)` | Earnin input + on-deck(Bill) + acct D8 |
| 1 | Weekly Essentials | `MAX(0, EssentialsTotal − (Operating + UberProCard))` | essentials + accts D9,D11 |
| 2 | Immediate Bills 7d | `IF(BillPay<Earnin_Debit, Bills7d+SubsFloor, Earnin_Debit+Bills7d+SubsFloor − BillPay)` | J3,J4,J9,D8 |
| 3 | Debt/Loan Radar 7d | `MAX(0, (DebtMins7d + onDeckDebts + DebtBuffer) − DebtLoanChecking)` | J5, on-deck(Debt), J10, D10 |
| 4 | Floor Build | `MROUND(MAX(0, TotalFixedBills − (BillPay + ImmediateBillsAlloc)), 10)` | Inputs!B2=1573, D8, E27 |
| 5a | BNPL cleanup | `15% × surplus(F29)` | ✓ engine (pct) |
| 5b | House Savings | `IF(PrimarySavings < EmergencyGoal, 0, 25% × surplus)` | gated on emergency full |
| 5c | Avalanche | `20% × surplus` | ✓ engine (pct) |
| 6 | Operating Buffer | `MAX(0, OpBufStage1 − Operating − MIN(MAX(0,UberProCard−UberBackup), OpBufStage1))` | Inputs!B16, D9, D11, D12 |
| 7 | Credit Union | flat `25` | ✓ engine |
| 8a | CX-5 catch-up | `MAX(0, OutstandingCX5 − VehicleMaintSavings)` | Inputs!B25=1613, D13 |
| 8b | Ongoing vehicle | `MAX(0, VehicleMaintTarget)` | Inputs!B24=109 |
| 8c | Versa revival | `IF(OutstandingCX5−savings>0, 0, OutstandingVersa − savings)` | gated on CX-5 done; Inputs!B26=2678 |
| 9 | Emergency Fund | `MAX(0, EmergencyGoal − PrimarySavings)` | Inputs!B27=3000, D14 |

**Allocate (E)** = `MIN(remaining, Need)` in order — ✓ engine matches.
**Surplus base** = F29 (remainder after the last hard gate, step 4) — ✓ engine matches.

## Essentials proration (dynamic, D18/D19)

- **Fuel Weekly (D18)** = `MROUND(IF(weekday(Mon=1)=1, FuelWeeklyNeed, FuelWeeklyNeed × (1 − weekday/7)), base)`.
  `Inputs!B19 = 70`. Full on Monday, tapers through the week.
- **Groceries Weekly (D19)** = `IF(Saturday, GrocWeeklyNeed×0.5, (GrocWeeklyNeed×0.5)/6)`.
  `Inputs!B20 = Groceries_monthly / (52/12) ≈ 200`. Half-week need, spread across days.

Engine today uses flat editable fuel/groc fields (defaults 40/17) — good enough,
but doesn't replicate the day-of-week taper.

## Account rollup mapping (right side, J23–J34)

| Destination account | Fed by steps |
|---------------------|--------------|
| Bill Pay Checking | 0b Earnin + 2 Immediate + 4 Floor |
| Debt Pay Checking | 3 Radar + 5a BNPL + 5c Avalanche |
| Uber Pro Card | 0a |
| **Op Check or Uber Pro Card** | 6 Operating Buffer + **1 Essentials** |
| Credit Union Checking | 7 |
| (Vehicle Maintenance Savings) | 8a + 8b + 8c |
| (Primary Savings) | 5b + 9 |

⚠ Engine currently maps step 1 (essentials) → Bill Pay Checking and step 6 →
Operating Checking. Per the workbook both belong to "Op Check or Uber Pro Card".
Fix the `account` field on those two steps when wiring live.

## Inputs sheet values (fin_inputs candidates)

| Slug | Value |
|------|-------|
| Total Fixed [Bills] (B2) | 1573 |
| SideGig_Monthly (B3) | 1176 |
| BillPay_Floor (B14) | 1200 *(note: floor build uses B2, not this)* |
| Operating_Buffer_Stage1 (B16) | 250 |
| Operating_Buffer_Stage2 (B17) | 500 |
| Fuel_Weekly_Need (B19) | 70 |
| Groceries_Weekly_Need (B20) | ≈200 (= Groceries_monthly ÷ 52/12) |
| Vehicle_Maint_Target_Total (B24) | 109 |
| Outstanding CX-5 (B25) | 1613 |
| Outstanding Versa (B26) | 2678 |
| Emergency Fund Goal (B27) | 3000 |

## Notable for planned features

- **Earnin tracking:** today it's a single manual `Earnin_Debit` value (J3 =
  1173.96) driving step 0b. A dedicated Earnin tab/field + history (imported
  from Monarch) would replace that hard-coded figure and let usage be tracked
  down over time. Earnin is repaid same-day as the paycheck → highest gate priority.
- **Transfer-out visual:** the workbook already nets against current balances
  (e.g. Earnin/floor needs subtract the Bill Pay balance you're keeping). A
  "move OUT of this account" cue would compare each account's current balance
  to what the plan says should *stay*, flagging the excess to sweep elsewhere.
