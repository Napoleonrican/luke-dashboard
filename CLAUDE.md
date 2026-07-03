# Project conventions

## Cashflow module — table entry-field style (preferred going forward)

For numeric/amount fields in the Cashflow tables (Bills, Debts, Subscriptions,
Waterfall, Runway, etc.), use the **mixed entry style**, not a uniform one:

- **Amounts** (dollar figures — balances, payments, amounts): always-editable
  `AmountEdit` (`src/pages/cashflow/ModalField.jsx`). No click-to-start, no
  confirm/checkmark — just focus and type, commit on blur/Enter. Text input
  under the hood (no native number spinner), right-justified, and collapses to
  a rounded whole-dollar display once you click away (cents only show while
  actively editing).
- **Names / labels / non-amount text**: click-to-edit `EditCell`
  (`src/pages/cashflow/EditCell.jsx`) — click to start, Enter/checkmark to
  commit, Escape to cancel. These don't need quick-entry treatment.
- **Dates, selects, checkboxes**: keep using `EditCell` (table cells) or
  `ModalEdit` (row-editor modals) as already established — this convention is
  specifically about amount vs. non-amount text fields.

This was rolled out on the Waterfall tab first (paycheck, side-gig, account
balances use `AmountEdit`; account name uses `EditCell`). Apply the same split
when touching Bills, Debts, Subscriptions, or any other Cashflow table.
