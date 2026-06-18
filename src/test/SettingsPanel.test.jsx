import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from '../components/SettingsPanel';

function setup(overrides = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    shiftStarted: true,
    breakMinutes: 0,
    breakRunning: false,
    breakStartMs: null,
    onUpdate: vi.fn(),
    strikeMode: 'hybrid',
    onStrikeModeChange: vi.fn(),
    strikeThreshold: 3,
    onStrikeThresholdChange: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  const utils = render(<SettingsPanel {...props} />);
  return { props, ...utils };
}

describe('SettingsPanel — strike tracking controls', () => {
  it('fires onStrikeModeChange when a mode is selected', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole('button', { name: 'Auto' }));
    expect(props.onStrikeModeChange).toHaveBeenCalledWith('auto');
    await user.click(screen.getByRole('button', { name: 'Manual' }));
    expect(props.onStrikeModeChange).toHaveBeenCalledWith('manual');
  });

  it('shows a description matching the active mode', () => {
    setup({ strikeMode: 'auto' });
    expect(screen.getByText(/Strikes increment when EPH drops below zone avg/i)).toBeInTheDocument();
  });

  it('fires onStrikeThresholdChange when a threshold is selected', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole('button', { name: '1 Strike' }));
    expect(props.onStrikeThresholdChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: '2 Strikes' }));
    expect(props.onStrikeThresholdChange).toHaveBeenCalledWith(2);
  });
});

describe('SettingsPanel — break timer', () => {
  it('starts a break via onUpdate', async () => {
    const user = userEvent.setup();
    const { props } = setup({ breakRunning: false });
    await user.click(screen.getByRole('button', { name: 'Take Break' }));
    expect(props.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ breakRunning: true })
    );
  });

  it('ends a break via onUpdate', async () => {
    const user = userEvent.setup();
    const { props } = setup({ breakRunning: true, breakStartMs: Date.now() - 60000 });
    await user.click(screen.getByRole('button', { name: 'End Break' }));
    expect(props.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ breakRunning: false, breakStartMs: null })
    );
  });

  it('prompts to start a shift when none is active', () => {
    setup({ shiftStarted: false });
    expect(screen.getByText(/Start a shift to use the break timer/i)).toBeInTheDocument();
  });

  it('fires onReset from the danger zone', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole('button', { name: 'Reset Shift' }));
    expect(props.onReset).toHaveBeenCalled();
  });
});
