import { useEffect, useRef } from 'react';

/**
 * App-wide keyboard shortcut hook (Phase 8.3).
 *
 * Two flavors:
 *
 *   1. `useShortcut('?', () => ...)` — single key + optional modifiers.
 *      Modifiers can be combined as a string like 'mod+k' (mod = Cmd on
 *      macOS, Ctrl elsewhere). Examples:
 *        useShortcut('?', open)
 *        useShortcut('Escape', close)
 *        useShortcut('mod+k', openPalette)
 *
 *   2. `useShortcutSequence('g e', () => ...)` — chord sequences. Both
 *      keys must be pressed within `windowMs` (default 1200ms). Chords
 *      ignore modifier keys.
 *
 * Both hooks skip the handler when focus is in a text input, textarea,
 * select, or contentEditable so typing in a form doesn't fire global
 * shortcuts. Pass `allowInInput: true` to opt in (used for shortcuts
 * that should work even while typing — e.g. Escape to close a modal).
 */

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

interface ShortcutOptions {
  /** When true, the handler runs even when the focused element is a
   *  text input. Default false. */
  allowInInput?: boolean;
  /** When true, the shortcut is skipped. Useful for conditional binds. */
  disabled?: boolean;
  /** Stop the browser's default behavior. Default true. */
  preventDefault?: boolean;
}

function parseCombo(combo: string): {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
} {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim());
  let mod = false;
  let shift = false;
  let alt = false;
  let key = '';
  for (const part of parts) {
    if (part === 'mod' || part === 'cmd' || part === 'ctrl') mod = true;
    else if (part === 'shift') shift = true;
    else if (part === 'alt' || part === 'option') alt = true;
    else key = part;
  }
  return { key, mod, shift, alt };
}

function isInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function eventMatches(e: KeyboardEvent, target: ReturnType<typeof parseCombo>): boolean {
  const expectedMod = target.mod;
  const actualMod = isMac ? e.metaKey : e.ctrlKey;
  if (expectedMod && !actualMod) return false;
  if (!expectedMod && actualMod) return false;
  if (target.shift !== e.shiftKey) return false;
  if (target.alt !== e.altKey) return false;
  // Special-case: '?' on a US keyboard fires as shift+/ → e.key is '?'.
  // Keep matching by e.key directly to handle both '?' and 'Escape' etc.
  return e.key.toLowerCase() === target.key;
}

export function useShortcut(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  opts: ShortcutOptions = {},
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (opts.disabled) return undefined;
    const target = parseCombo(combo);
    const onKey = (e: KeyboardEvent) => {
      if (!opts.allowInInput && isInputTarget(e.target)) return;
      if (!eventMatches(e, target)) return;
      if (opts.preventDefault !== false) e.preventDefault();
      handlerRef.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, opts.allowInInput, opts.disabled, opts.preventDefault]);
}

interface SequenceOptions extends ShortcutOptions {
  /** Max ms between key presses for the chord to register. Default 1200. */
  windowMs?: number;
}

/**
 * Chord shortcut: e.g. 'g e' fires when the user presses 'g' then 'e'
 * within `windowMs`. Modifiers reset the chord. Single-character keys
 * only.
 */
export function useShortcutSequence(
  sequence: string,
  handler: (e: KeyboardEvent) => void,
  opts: SequenceOptions = {},
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const stateRef = useRef<{ index: number; lastAt: number }>({ index: 0, lastAt: 0 });

  useEffect(() => {
    if (opts.disabled) return undefined;
    const keys = sequence.toLowerCase().split(/\s+/).filter((k) => k.length === 1);
    if (keys.length < 2) return undefined;
    const windowMs = opts.windowMs ?? 1200;

    const onKey = (e: KeyboardEvent) => {
      if (!opts.allowInInput && isInputTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        stateRef.current = { index: 0, lastAt: 0 };
        return;
      }
      const k = e.key.toLowerCase();
      const now = Date.now();
      const state = stateRef.current;
      if (state.index > 0 && now - state.lastAt > windowMs) {
        state.index = 0;
      }
      const expected = keys[state.index];
      if (k === expected) {
        if (state.index === keys.length - 1) {
          if (opts.preventDefault !== false) e.preventDefault();
          handlerRef.current(e);
          state.index = 0;
          state.lastAt = 0;
        } else {
          state.index += 1;
          state.lastAt = now;
        }
      } else {
        // Non-matching key resets the chord. If the key we just pressed
        // happens to be the first key of the sequence, prime to step 1.
        if (k === keys[0]) {
          state.index = 1;
          state.lastAt = now;
        } else {
          state.index = 0;
          state.lastAt = 0;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sequence, opts.allowInInput, opts.disabled, opts.preventDefault, opts.windowMs]);
}
