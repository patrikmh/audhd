/**
 * TimeBlindnessSupport - Helps ADHD users with time perception
 * Shows relative time, countdowns, and temporal anchors throughout the UI
 */

import React from 'react';
import { T } from '../constants/tokens';
import { nowHM, hmToMin, todayKey } from '../utils/helpers';

export function TimeAnchor({ currentTime, settings, large = false }) {
  const currentHM = currentTime || nowHM();
  const currentMinutes = hmToMin(currentHM);

  // Calculate time to key events
  const wakeMinutes = hmToMin(settings.wake);
  const winddownMinutes = hmToMin(settings.winddown);
  const lunchMinutes = 12 * 60; // 12:00 PM

  // Find next key event
  const nextEvent = findNextEvent(currentMinutes, {
    wake: wakeMinutes,
    lunch: lunchMinutes,
    winddown: winddownMinutes
  });

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.line}`,
      borderRadius: large ? '8px' : '6px',
      padding: large ? '16px' : '12px',
      textAlign: 'center'
    }}>
      {/* Current Time */}
      <div style={{
        fontFamily: large ? 'Fraunces' : 'IBM Plex Mono',
        fontSize: large ? '2.5rem' : '1.8rem',
        fontWeight: large ? '300' : '500',
        color: T.ink,
        marginBottom: large ? '8px' : '4px',
        lineHeight: 1
      }}>
        {currentHM}
      </div>

      {/* Relative Time to Next Event */}
      {nextEvent && (
        <div style={{
          fontFamily: 'Atkinson Hyperlegible',
          fontSize: large ? '1rem' : '0.85rem',
          color: T.soft,
          marginBottom: large ? '8px' : '4px'
        }}>
          {nextEvent.label}: {formatTimeUntil(nextEvent.minutesUntil)}
        </div>
      )}

      {/* Day Progress */}
      <DayProgress
        current={currentMinutes}
        start={wakeMinutes}
        end={winddownMinutes}
        compact={!large}
      />
    </div>
  );
}

export function RelativeTime({ targetTime, baseTime = null, showLabel = true }) {
  const currentMinutes = hmToMin(baseTime || nowHM());
  const targetMinutes = hmToMin(targetTime);
  const diff = targetMinutes - currentMinutes;

  if (diff < 0) {
    return (
      <span style={{ fontFamily: 'Atkinson Hyperlegible', color: T.soft }}>
        {showLabel && 'för '} {Math.abs(Math.floor(diff / 60))}h {Math.abs(diff % 60)}m sedan
      </span>
    );
  }

  const hours = Math.floor(diff / 60);
  const mins = diff % 60;

  if (hours === 0 && mins === 0) {
    return (
      <span style={{ fontFamily: 'Atkinson Hyperlegible', color: T.moss, fontWeight: '500' }}>
        nu
      </span>
    );
  }

  return (
    <span style={{ fontFamily: 'Atkinson Hyperlegible', color: T.ink }}>
      {showLabel && 'om '}
      {hours > 0 && <span>{hours}h </span>}
      {mins}m
      {showLabel && <span></span>}
    </span>
  );
}

export function CountdownTimer({ targetTime, onComplete, size = 'medium' }) {
  const [timeRemaining, setTimeRemaining] = React.useState(null);

  React.useEffect(() => {
    const calculateRemaining = () => {
      const current = hmToMin(nowHM());
      const target = hmToMin(targetTime);
      const remaining = target - current;
      setTimeRemaining(Math.max(0, remaining));

      if (remaining <= 0 && onComplete) {
        onComplete();
      }
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [targetTime, onComplete]);

  if (timeRemaining === null) return null;

  const hours = Math.floor(timeRemaining / 60);
  const mins = timeRemaining % 60;

  const sizeStyles = {
    small: { fontSize: '0.9rem' },
    medium: { fontSize: '1.2rem' },
    large: { fontSize: '1.8rem' }
  };

  const urgent = timeRemaining < 30 && timeRemaining > 0;

  return (
    <div style={{
      fontFamily: 'IBM Plex Mono',
      fontWeight: '500',
      color: urgent ? T.warn : T.ink,
      ...sizeStyles[size || 'medium']
    }}>
      {hours > 0 && <span>{hours}h </span>}
      {mins}m
      {urgent && <span> kvar!</span>}
    </div>
  );
}

export function DayProgress({ current, start, end, compact = false }) {
  const totalDayMinutes = end - start;
  const progress = Math.max(0, Math.min(100, ((current - start) / totalDayMinutes) * 100));

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          flex: 1,
          height: '4px',
          background: T.track,
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            background: progress > 80 ? T.warn : progress > 50 ? T.petrol : T.moss,
            height: '100%',
            width: `${progress}%`,
            borderRadius: '2px',
            transition: 'width 0.5s ease'
          }} />
        </div>
        <span style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '0.8rem',
          color: T.soft,
          minWidth: '35px'
        }}>
          {Math.round(progress)}%
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '4px',
        fontSize: '0.75rem',
        fontFamily: 'Atkinson Hyperlegible',
        color: T.soft
      }}>
        <span>Dagens progression</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div style={{
        height: '6px',
        background: T.track,
        borderRadius: '3px',
        overflow: 'hidden'
      }}>
        <div style={{
          background: progress > 80 ? T.warn : progress > 50 ? T.petrol : T.moss,
          height: '100%',
          width: `${progress}%`,
          borderRadius: '3px',
          transition: 'width 0.5s ease'
        }} />
      </div>
    </div>
  );
}

// Helper functions
function findNextEvent(currentMinutes, events) {
  const eventEntries = Object.entries(events)
    .map(([key, minutes]) => ({
      key,
      minutes,
      minutesUntil: minutes - currentMinutes,
      label: getEventLabel(key)
    }))
    .filter(event => event.minutesUntil > 0)
    .sort((a, b) => a.minutesUntil - b.minutesUntil);

  return eventEntries[0] || null;
}

function getEventLabel(key) {
  const labels = {
    wake: 'Vaknar',
    lunch: 'Lunch',
    winddown: 'Nedvarvning'
  };
  return labels[key] || key;
}

function formatTimeUntil(minutes) {
  if (minutes < 60) {
    return `${minutes} minuter`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}tim ${mins > 0 ? `${mins}min` : ''}`;
}

