/**
 * WorkingMemoryDisplay - Externalizes executive function for ADHD users
 * Shows current cognitive load, energy budget, and temporal context
 */

import { todayKey, todayWeekday, hmToMin, nowHM } from '../utils/helpers';
import { T, MODES } from '../constants/tokens';

export function WorkingMemoryDisplay({ state, settings, onWinddownClick }) {
  const currentMode = MODES[state.capacity];
  const todayLog = state.energyLog.filter((e) => e.day === todayKey());
  const spent = todayLog.filter((e) => e.delta > 0).reduce((a, e) => a + e.delta, 0);
  const recharged = todayLog.filter((e) => e.delta < 0).reduce((a, e) => a + Math.abs(e.delta), 0);
  const energyRemaining = currentMode.budget - spent;
  const energyPercentage = Math.max(0, (energyRemaining / currentMode.budget) * 100);

  // Time calculations
  const currentTime = nowHM();
  const currentMinutes = hmToMin(currentTime);
  const winddownMinutes = hmToMin(settings.winddown);
  const minutesUntilWinddown = Math.max(0, winddownMinutes - currentMinutes);
  const hoursUntilWinddown = Math.floor(minutesUntilWinddown / 60);
  const minsUntilWinddown = minutesUntilWinddown % 60;

  const winddownSoon = minutesUntilWinddown < 60;

  // Current focus — only a lap that's actually running, never a guessed-at task.
  const activeFocus = state.activeFocus;

  const now = new Date();
  const dayNum = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', timeZone: 'Europe/Stockholm' }).format(now);
  const monthShort = new Intl.DateTimeFormat('sv-SE', { month: 'short', timeZone: 'Europe/Stockholm' }).format(now).replace('.', '');
  const weekdayFull = {
    mon: 'måndag', tue: 'tisdag', wed: 'onsdag', thu: 'torsdag', fri: 'fredag', sat: 'lördag', sun: 'söndag',
  }[todayWeekday()];

  return (
    <div style={{
      background: T.card,
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      border: `1px solid ${T.line}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      {/* Header: a tear-off-calendar date tile is the first thing the eye lands on
          (figure-ground via strong color contrast), placed right next to the
          greeting so "what day is it" and "hello" read as one unit (proximity). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: '14px' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 60,
          padding: '6px 8px',
          borderRadius: 12,
          background: T.petrol,
          color: 'white',
          lineHeight: 1,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85, fontFamily: 'Atkinson Hyperlegible' }}>
            {monthShort}
          </span>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: '2rem', fontWeight: 600, marginTop: 2 }}>
            {dayNum}
          </span>
        </div>
        <div>
          <h2 style={{
            fontFamily: 'Fraunces',
            fontSize: '1.5rem',
            fontWeight: '300',
            margin: '0 0 4px 0',
            color: T.ink,
          }}>
            Hej{settings.displayName ? ` ${settings.displayName}` : ''}! Idag är {weekdayFull}
          </h2>
          <p style={{
            fontFamily: 'Atkinson Hyperlegible',
            fontSize: '0.9rem',
            color: T.soft,
            margin: 0
          }}>
            {currentMode.label} · {currentMode.blurb}
          </p>
        </div>
      </div>

      {/* Energy is the only number that earns a box — it is the one thing the
          rest of the day is budgeted against. */}
      <div style={{
        background: T.paper,
        padding: '12px',
        borderRadius: '6px',
        border: `1px solid ${T.line}`,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${energyPercentage}%`,
          background: energyPercentage > 50 ? T.moss :
                    energyPercentage > 25 ? T.petrol : T.warn,
          opacity: 0.2,
          transition: 'all 0.3s ease'
        }} />

        <div style={{
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: T.soft,
          marginBottom: '4px',
          fontFamily: 'Atkinson Hyperlegible',
          position: 'relative',
          zIndex: 1
        }}>
          Energi idag
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '1.2rem',
          fontWeight: '500',
          color: T.ink,
          position: 'relative',
          zIndex: 1
        }}>
          {energyRemaining} <span style={{ fontSize: '0.9rem', color: T.soft }}>av {currentMode.budget} ⚡</span>
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: T.soft,
          marginTop: '2px',
          fontFamily: 'Atkinson Hyperlegible',
          position: 'relative',
          zIndex: 1
        }}>
          {spent} uttagen · {recharged} återhämtad
        </div>
      </div>

      {/* Focus is a line, not a panel — and only when a lap is actually running.
          An empty "Ingen aktivt fokus" box costs more attention than it repays. */}
      {activeFocus && (
        <div style={{
          marginTop: '10px',
          fontFamily: 'Atkinson Hyperlegible',
          fontSize: '0.9rem',
          color: T.ink
        }}>
          <span style={{ color: T.soft }}>Fokus just nu · </span>
          <b>{activeFocus.goal || 'fokuserar'}</b>
        </div>
      )}

      {/* Wind-down: one line, and only clickable (and coloured) when it is close
          enough to act on. Efter nedvarvningen säger toppbannern redan samma sak,
          så då är raden bara upprepning. */}
      {minutesUntilWinddown > 0 && (
      <div
        onClick={winddownSoon ? onWinddownClick : undefined}
        style={{
          marginTop: '10px',
          fontFamily: 'Atkinson Hyperlegible',
          fontSize: '0.9rem',
          color: winddownSoon ? T.warn : T.soft,
          cursor: winddownSoon ? 'pointer' : 'default'
        }}
      >
        Nedvarvning {settings.winddown} · om{' '}
        <b>
          {hoursUntilWinddown > 0 && `${hoursUntilWinddown}h `}
          {minsUntilWinddown}m
        </b>
        {winddownSoon && ' · klicka för sömnankare'}
      </div>
      )}

      {/* The only chip left: wins are the one counter that celebrates rather
          than nags. Task counts and the check-in nudge live elsewhere already. */}
      {state.wins.filter(w => w.day === todayKey()).length > 0 && (
        <div style={{
          marginTop: '12px',
          display: 'inline-block',
          background: T.paper,
          padding: '6px 10px',
          borderRadius: '4px',
          fontSize: '0.8rem',
          fontFamily: 'Atkinson Hyperlegible',
          color: T.ink,
          border: `1px solid ${T.line}`
        }}>
          🎉 {state.wins.filter(w => w.day === todayKey()).length} vinster idag
        </div>
      )}
    </div>
  );
}