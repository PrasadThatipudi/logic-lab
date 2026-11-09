import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';

const expr = () => screen.getByLabelText(/Boolean expressions/) as HTMLTextAreaElement;
const gates = (type: string) => document.querySelectorAll(`.enode[data-type="${type}"]`);
const palette = (type: string) => document.querySelector(`#palette [data-type="${type}"]`) as HTMLElement;
const canvas = () => document.getElementById('canvas')!;

function type(value: string) {
  fireEvent.change(expr(), { target: { value } });
}

describe('LogicLab app', () => {
  it('draws the default expression as a circuit', async () => {
    render(<App />);
    expect(expr().value).toBe('Y = AB + BC + AC');
    await waitFor(() => expect(gates('AND').length).toBe(3));
    expect(gates('OR').length).toBe(2);
    expect(screen.getByRole('switch', { name: 'Input A' })).toBeInTheDocument();
  });

  it('rebuilds the canvas when the expression changes', async () => {
    render(<App />);
    type('S = A ^ B\nC = AB');
    await waitFor(() => expect(gates('XOR').length).toBe(1));
    expect(gates('AND').length).toBe(1);
    expect(document.querySelectorAll('.enode[data-type="OUTPUT"]').length).toBe(2);
  });

  it('shows a parse error and keeps the old circuit', async () => {
    render(<App />);
    await waitFor(() => expect(gates('AND').length).toBe(3));
    type('Y = A +');
    expect(await screen.findByRole('alert')).toHaveTextContent(/operand/i);
    expect(gates('AND').length).toBe(3);
  });

  it('toggles an input and lights the output', async () => {
    render(<App />);
    type('Y = AB');
    await waitFor(() => expect(gates('AND').length).toBe(1));
    const a = screen.getByRole('switch', { name: 'Input A' });
    const b = screen.getByRole('switch', { name: 'Input B' });
    for (const sw of [a, b]) {
      fireEvent.pointerDown(sw, { button: 0 });
      fireEvent.pointerUp(sw, { button: 0 });
    }
    expect(a).toHaveAttribute('aria-checked', 'true');
    expect(b).toHaveAttribute('aria-checked', 'true');
    expect(document.querySelector('.outlamp.hi')).not.toBeNull();
  });

  it('switches notation and shows the other style on the button', async () => {
    const user = userEvent.setup();
    render(<App />);
    const btn = screen.getByRole('button', { name: /Switch to AND \/ OR notation/ });
    expect(btn).toHaveTextContent('AND / OR');
    await user.click(btn);
    expect(expr().value).toBe('Y = A AND B OR B AND C OR A AND C');
    expect(screen.getByRole('button', { name: /Switch to AB \+ C notation/ })).toHaveTextContent('AB + C');
  });

  it('toggles light/dark mode', async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = document.documentElement.dataset.theme;
    await user.click(screen.getByRole('button', { name: /Toggle light\/dark/ }));
    expect(document.documentElement.dataset.theme).not.toBe(before);
  });

  it('arms a palette gate, places it on click and rewrites the expression', async () => {
    const user = userEvent.setup();
    render(<App />);
    type('');
    await waitFor(() => expect(screen.getByText(/pick a gate/)).toBeInTheDocument());
    await user.click(palette('INPUT'));
    expect(palette('INPUT')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerDown(canvas(), { button: 0, clientX: 100, clientY: 100 });
    expect(gates('INPUT').length).toBe(1);
    expect(palette('INPUT')).toHaveAttribute('aria-pressed', 'false');
  });

  it('cancels placement with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette('NOR'));
    expect(palette('NOR')).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(palette('NOR')).toHaveAttribute('aria-pressed', 'false');
  });

  it('builds an SR latch from equations and holds its state', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /Switch to AND \/ OR notation/ }));
    type('Q = (R NOR (S NOR Q))');
    await waitFor(() => expect(gates('NOR').length).toBe(2));
    const sw = (n: string) => screen.getByRole('switch', { name: `Input ${n}` });
    const click = (el: Element) => {
      fireEvent.pointerDown(el, { button: 0 });
      fireEvent.pointerUp(el, { button: 0 });
    };
    const lampValue = () => document.querySelector('.outlamp text:not(.label)')!.textContent;
    click(sw('S'));
    expect(lampValue()).toBe('1');
    click(sw('S'));
    expect(lampValue()).toBe('1'); // held
    click(sw('R'));
    expect(lampValue()).toBe('0');
    click(sw('R'));
    expect(lampValue()).toBe('0'); // held
  });

  it('connects an output dot to an input pin by dragging from the input pin', async () => {
    render(<App />);
    type('');
    await waitFor(() => expect(screen.getByText(/pick a gate/)).toBeInTheDocument());
    const user = userEvent.setup();
    const place = async (name: string, x: number, y: number) => {
      await user.click(palette(name));
      fireEvent.pointerDown(canvas(), { button: 0, clientX: x, clientY: y });
    };
    await place('NOT', 100, 100);
    await place('NOT', 400, 100);
    const [first, second] = Array.from(gates('NOT'));
    const pin = second.querySelector('.pin-in')!;
    const out = first.querySelector('.pout')!;
    fireEvent.pointerDown(pin, { button: 0 });
    fireEvent.pointerUp(out, { button: 0 });
    expect(document.querySelectorAll('.wirehit').length).toBe(1);
  });

  it('runs tests and lists only failures', async () => {
    const user = userEvent.setup();
    render(<App />);
    type('Y = AB');
    await waitFor(() => expect(gates('AND').length).toBe(1));
    const run = screen.getByRole('button', { name: 'Test' });
    expect(run).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Test cases' }), 'A=1,B=1->Y=1{Enter}A=0,B=1->Y=1');
    await act(async () => { await user.click(run); });
    expect(screen.getByText('Failed (1)')).toBeInTheDocument();
    expect(screen.queryByText('All tests passed')).toBeNull();
    // a passing set shows the status above the results with no emoji
    const box = screen.getByRole('textbox', { name: 'Test cases' });
    await user.clear(box);
    await user.type(box, 'A=1,B=1->Y=1');
    await user.click(run);
    expect(screen.getByRole('status')).toHaveTextContent(/^All tests passed$/);
  });
});
