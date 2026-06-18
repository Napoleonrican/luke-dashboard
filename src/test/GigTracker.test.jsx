import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import GigTracker from '../pages/GigTracker';

function renderApp() {
  return render(
    <MemoryRouter>
      <GigTracker />
    </MemoryRouter>
  );
}

// Start a shift whose start time is `minutesAgo` in the past, so elapsed time
// (and therefore EPH) is deterministic for the assertions below.
async function startShift(user, container, minutesAgo = 120) {
  const d = new Date(Date.now() - minutesAgo * 60000);
  const startStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const timeInput = container.querySelector('input[type="time"]');
  // Set the time input directly (date pickers don't type cleanly via userEvent).
  await user.clear(timeInput);
  await user.type(timeInput, startStr);
  await user.click(screen.getByRole('button', { name: 'Start Shift' }));
}

function strikeSlots(container) {
  return container.querySelectorAll('.w-5.h-5.rounded-full');
}
function filledStrikes(container) {
  return container.querySelectorAll('.w-5.h-5.rounded-full.bg-red-500');
}

async function openLogger(user) {
  await user.click(screen.getByRole('button', { name: 'Log Order' }));
}

describe('Order logging — full-screen quick-add', () => {
  it('opens the logger with platform buttons, amount field and ± chips', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);
    await openLogger(user);

    expect(screen.getByRole('heading', { name: 'Log Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'UberEats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DoorDash' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+5/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /OK — Log Order/ })).toBeInTheDocument();
  });

  it('accumulates value from the ± quick-add chips', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);
    await openLogger(user);

    await user.click(screen.getByRole('button', { name: /\+5/ }));
    await user.click(screen.getByRole('button', { name: /\+5/ }));
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(10);

    const minusOne = screen
      .getAllByRole('button')
      .find(b => b.textContent === '−1$1.00'); // "−1" + "$1.00"
    await user.click(minusOne);
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(9);
  });

  it('logs an order and reflects it in earnings and the order log', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);
    await openLogger(user);

    await user.type(screen.getByPlaceholderText('0.00'), '12.50');
    await user.click(screen.getByRole('button', { name: /OK — Log Order/ }));

    // Modal closed
    expect(screen.queryByRole('heading', { name: 'Log Order' })).not.toBeInTheDocument();
    // Total earnings reflects the logged amount
    expect(screen.getByText('$12.50')).toBeInTheDocument();

    // Expand the order log and confirm the entry + UberEats badge
    await user.click(screen.getByRole('button', { name: /Order Log/ }));
    expect(screen.getByText('UE')).toBeInTheDocument();
  });

  it('ignores an empty / zero amount', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);
    await openLogger(user);

    await user.click(screen.getByRole('button', { name: /OK — Log Order/ }));
    // Still on the logger because nothing was logged
    expect(screen.getByRole('heading', { name: 'Log Order' })).toBeInTheDocument();
  });
});

describe('Platform selection — two buttons', () => {
  it('defaults to UberEats', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);
    await openLogger(user);

    const ue = screen.getByRole('button', { name: 'UberEats' });
    expect(ue.className).toMatch(/bg-green-900/);
  });

  it('logs against DoorDash and persists last-used platform', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);
    await openLogger(user);

    await user.click(screen.getByRole('button', { name: 'DoorDash' }));
    await user.type(screen.getByPlaceholderText('0.00'), '8');
    await user.click(screen.getByRole('button', { name: /OK — Log Order/ }));

    expect(localStorage.getItem('gig_tracker_last_platform')).toBe('DoorDash');

    await user.click(screen.getByRole('button', { name: /Order Log/ }));
    expect(screen.getByText('DD')).toBeInTheDocument();

    // Reopen — DoorDash should be preselected
    await openLogger(user);
    expect(screen.getByRole('button', { name: 'DoorDash' }).className).toMatch(/bg-red-900/);
  });
});

describe('Strike tracking — modes & threshold', () => {
  it('shows threshold slots and manual buttons by default (hybrid)', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);

    expect(strikeSlots(container)).toHaveLength(3);
    expect(screen.getByRole('button', { name: '+ Strike' })).toBeInTheDocument();
  });

  it('adds a strike manually and respects threshold changes', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);

    await user.click(screen.getByRole('button', { name: '+ Strike' }));
    expect(filledStrikes(container)).toHaveLength(1);

    // Open settings, drop threshold to 1
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('button', { name: '1 Strike' }));
    expect(strikeSlots(container)).toHaveLength(1);
  });

  it('hides manual buttons in auto mode', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('button', { name: 'Auto' }));

    expect(screen.queryByRole('button', { name: '+ Strike' })).not.toBeInTheDocument();
  });

  it('hybrid mode auto-clears a strike when EPH passes the daily peak', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container); // default hybrid

    await user.click(screen.getByRole('button', { name: '+ Strike' }));
    expect(filledStrikes(container)).toHaveLength(1);

    // $60 over ~2h ⇒ EPH ~30, well above any day's peak ⇒ one strike cleared
    await openLogger(user);
    await user.type(screen.getByPlaceholderText('0.00'), '60');
    await user.click(screen.getByRole('button', { name: /OK — Log Order/ }));

    expect(filledStrikes(container)).toHaveLength(0);
  });

  it('auto mode auto-adds a strike when EPH is below the zone average', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await startShift(user, container);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('button', { name: 'Auto' }));

    // $2 over ~2h ⇒ EPH ~1, far below zone average ⇒ a strike is added
    await openLogger(user);
    await user.type(screen.getByPlaceholderText('0.00'), '2');
    await user.click(screen.getByRole('button', { name: /OK — Log Order/ }));

    expect(filledStrikes(container)).toHaveLength(1);
  });
});
