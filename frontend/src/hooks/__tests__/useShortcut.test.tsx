import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useShortcut, useShortcutSequence } from '@/hooks/useShortcut';

function Probe({
  combo,
  onFire,
  allowInInput,
}: {
  combo: string;
  onFire: () => void;
  allowInInput?: boolean;
}) {
  useShortcut(combo, onFire, { allowInInput });
  return <input data-testid="probe-input" />;
}

function SequenceProbe({
  sequence,
  onFire,
}: {
  sequence: string;
  onFire: () => void;
}) {
  useShortcutSequence(sequence, onFire);
  return <div data-testid="probe-root" />;
}

function fireKey(key: string, opts: KeyboardEventInit & { target?: EventTarget } = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
  const target = opts.target ?? document.body;
  if (target instanceof HTMLElement) {
    target.dispatchEvent(event);
  } else {
    window.dispatchEvent(event);
  }
}

describe('useShortcut', () => {
  it('fires the handler on a single-key shortcut', () => {
    const fn = vi.fn();
    render(<Probe combo="?" onFire={fn} />);
    fireKey('?');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('skips when focus is in a text input by default', () => {
    const fn = vi.fn();
    const { getByTestId } = render(<Probe combo="?" onFire={fn} />);
    const input = getByTestId('probe-input') as HTMLInputElement;
    input.focus();
    fireKey('?', { target: input });
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it('runs in inputs when allowInInput=true', () => {
    const fn = vi.fn();
    const { getByTestId } = render(
      <Probe combo="Escape" onFire={fn} allowInInput />,
    );
    const input = getByTestId('probe-input');
    fireKey('Escape', { target: input });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('useShortcutSequence', () => {
  it('fires on a two-key chord pressed within the window', () => {
    const fn = vi.fn();
    render(<SequenceProbe sequence="g e" onFire={fn} />);
    fireKey('g');
    fireKey('e');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when an unrelated key breaks the chord', () => {
    const fn = vi.fn();
    render(<SequenceProbe sequence="g e" onFire={fn} />);
    fireKey('g');
    fireKey('x');
    fireKey('e');
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it('does NOT fire when modifier keys are involved', () => {
    const fn = vi.fn();
    render(<SequenceProbe sequence="g e" onFire={fn} />);
    fireKey('g', { metaKey: true });
    fireKey('e');
    expect(fn).toHaveBeenCalledTimes(0);
  });
});
