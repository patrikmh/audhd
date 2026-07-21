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

  // Day progress
  const dayStartMinutes = hmToMin(settings.wake);
  const dayEndMinutes = hmToMin(settings.winddown);
  const totalDayMinutes = dayEndMinutes - dayStartMinutes;
  const dayProgress = Math.min(100, Math.max(0, ((currentMinutes - dayStartMinutes) / totalDayMinutes) * 100));

  // Current focus — only a lap that's actually running, never a guessed-at task.
  const activeFocus = state.activeFocus;

  return (
    <div style={{
      background: T.card,
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      border: `1px solid ${T.line}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      {/* Header with greeting */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{
          fontFamily: 'Fraunces',
          fontSize: '1.5rem',
          fontWeight: '300',
          margin: '0 0 4px 0',
          color: T.ink
        }}>
          Hej! Idag är {todayWeekday() === 'mon' ? 'måndag' :
                      todayWeekday() === 'tue' ? 'tisdag' :
                      todayWeekday() === 'wed' ? 'onsdag' :
                      todayWeekday() === 'thu' ? 'torsdag' :
                      todayWeekday() === 'fri' ? 'fredag' :
                      todayWeekday() === 'sat' ? 'lördag' : 'söndag'}
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

      {/* Main grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        {/* Current Focus */}
        <div style={{
          background: T.paper,
          padding: '12px',
          borderRadius: '6px',
          border: activeFocus ? `2px solid ${T.petrol}` : `1px solid ${T.line}`
        }}>
          <div style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: T.soft,
            marginBottom: '4px',
            fontFamily: 'Atkinson Hyperlegible'
          }}>
            Fokus just nu
          </div>
          {activeFocus ? (
            <div style={{
              fontFamily: 'Atkinson Hyperlegible',
              fontSize: '1rem',
              color: T.ink,
              fontWeight: '500'
            }}>
              {activeFocus.goal || "fokuserar"}
            </div>
          ) : (
            <div style={{
              fontFamily: 'Atkinson Hyperlegible',
              fontSize: '0.9rem',
              color: T.soft,
              fontStyle: 'italic'
            }}>
              Ingen aktivt fokus
            </div>
          )}
        </div>

        {/* Energy Budget */}
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

        {/* Time Until Winddown */}
        <div style={{
          background: T.paper,
          padding: '12px',
          borderRadius: '6px',
          border: minutesUntilWinddown < 60 ? `2px solid ${T.warn}` : `1px solid ${T.line}`,
          cursor: minutesUntilWinddown < 60 ? 'pointer' : 'default',
          transition: 'all 0.2s ease'
        }}
        onClick={minutesUntilWinddown < 60 ? onWinddownClick : undefined}
        >
          <div style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: T.soft,
            marginBottom: '4px',
            fontFamily: 'Atkinson Hyperlegible'
          }}>
            Till nedvarvning
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '1.2rem',
            fontWeight: '500',
            color: minutesUntilWinddown < 60 ? T.warn : T.ink
          }}>
            {hoursUntilWinddown > 0 && `${hoursUntilWinddown}h `}
            {minsUntilWinddown}m
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: T.soft,
            marginTop: '2px',
            fontFamily: 'Atkinson Hyperlegible'
          }}>
            klockan {settings.winddown}
            {minutesUntilWinddown < 60 && ' · klicka för sömnankare'}
          </div>
        </div>

        {/* Day Progress */}
        <div style={{
          background: T.paper,
          padding: '12px',
          borderRadius: '6px',
          border: `1px solid ${T.line}`,
          position: 'relative'
        }}>
          <div style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: T.soft,
            marginBottom: '4px',
            fontFamily: 'Atkinson Hyperlegible'
          }}>
            Dagens progression
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '1.2rem',
            fontWeight: '500',
            color: T.ink
          }}>
            {Math.round(dayProgress)}%
          </div>
          <div style={{
            background: T.track,
            height: '4px',
            borderRadius: '2px',
            marginTop: '6px',
            overflow: 'hidden'
          }}>
            <div style={{
              background: T.petrol,
              height: '100%',
              width: `${dayProgress}%`,
              borderRadius: '2px',
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>
      </div>

      {/* Quick status indicators */}
      <div style={{
        marginTop: '12px',
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap'
      }}>
        {state.tasks.filter(t => !t.done).length > 0 && (
          <div style={{
            background: T.paper,
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontFamily: 'Atkinson Hyperlegible',
            color: T.ink,
            border: `1px solid ${T.line}`
          }}>
            📋 {state.tasks.filter(t => !t.done).length} uppgifter kvar
          </div>
        )}
        {state.wins.filter(w => w.day === todayKey()).length > 0 && (
          <div style={{
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
        {state.checkins.filter(c => c.day === todayKey()).length === 0 && (
          <div style={{
            background: T.paper,
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontFamily: 'Atkinson Hyperlegible',
            color: T.petrol,
            border: `1px solid ${T.petrol}`,
            cursor: 'pointer'
          }}>
            🔔 Kolla in saknas idag
          </div>
        )}
      </div>
    </div>
  );
}