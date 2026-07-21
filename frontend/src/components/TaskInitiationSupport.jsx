/**
 * TaskInitiationSupport - Reduces task initiation friction for ADHD users
 * Shows micro-steps, implementation intentions, and first-step focus
 */

import React from 'react';
import { T } from '../constants/tokens';

export function TaskInitiationSupport({ task, onStartStep, onSetTrigger }) {
  if (!task) return null;

  const firstStep = task.steps?.[0];
  const energyCost = task.energy || 2;
  const timeEstimate = task.minutes || 30;

  return (
    <div style={{
      background: T.card,
      border: `2px solid ${T.petrol}`,
      borderRadius: '8px',
      padding: '16px',
      marginTop: '12px',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '12px'
      }}>
        <div>
          <h3 style={{
            fontFamily: 'Fraunces',
            fontSize: '1.1rem',
            fontWeight: '400',
            margin: '0 0 4px 0',
            color: T.ink
          }}>
            {task.title}
          </h3>
          <div style={{
            display: 'flex',
            gap: '8px',
            fontSize: '0.8rem',
            fontFamily: 'Atkinson Hyperlegible',
            color: T.soft
          }}>
            <span>⚡ {energyCost}</span>
            <span>·</span>
            <span>🕐 {timeEstimate} min</span>
            {task.priority && (
              <>
                <span>·</span>
                <span style={{
                  color: task.priority === 'A' ? T.warn :
                        task.priority === 'B' ? T.petrol : T.moss
                }}>
                  Prioritet {task.priority}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick Start Button */}
        <button
          style={{
            background: T.petrol,
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '0.9rem',
            fontFamily: 'Atkinson Hyperlegible',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={() => onStartStep && onStartStep(task)}
        >
          Starta ▶
        </button>
      </div>

      {/* First Step Focus */}
      {firstStep && (
        <div style={{
          background: T.paper,
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '12px',
          border: `1px solid ${T.line}`
        }}>
          <div style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: T.soft,
            marginBottom: '6px',
            fontFamily: 'Atkinson Hyperlegible'
          }}>
            Första steget
          </div>
          <div style={{
            fontFamily: 'Atkinson Hyperlegible',
            fontSize: '1rem',
            color: T.ink,
            marginBottom: '8px'
          }}>
            {firstStep.title}
          </div>
          <button
            style={{
              background: T.moss,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.85rem',
              fontFamily: 'Atkinson Hyperlegible',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => onStartStep && onStartStep(task, firstStep)}
          >
            Börja med detta →
          </button>
        </div>
      )}

      {/* Implementation Intention */}
      {!task.trigger && (
        <div style={{
          background: T.paper,
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '12px',
          border: `1px solid ${T.line}`
        }}>
          <div style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: T.soft,
            marginBottom: '6px',
            fontFamily: 'Atkinson Hyperlegible'
          }}>
            När-så trigger (valfritt)
          </div>
          <div style={{
            fontSize: '0.85rem',
            fontFamily: 'Atkinson Hyperlegible',
            color: T.ink,
            marginBottom: '8px',
            fontStyle: 'italic'
          }}>
            "När {triggerSuggestion(task.title)} då {task.title}"
          </div>
          <button
            style={{
              background: 'transparent',
              color: T.petrol,
              border: `1px solid ${T.petrol}`,
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.85rem',
              fontFamily: 'Atkinson Hyperlegible',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => onSetTrigger && onSetTrigger(task)}
          >
            Sätt trigger
          </button>
        </div>
      )}

      {/* Energy Check for heavy tasks */}
      {energyCost >= 4 && (
        <div style={{
          background: `${T.warn}10`,
          border: `1px solid ${T.warn}`,
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <span style={{ fontSize: '1.2rem }}>⚠</span>
            <div>
              <div style={{
                fontFamily: 'Atkinson Hyperlegible',
                fontSize: '0.9rem',
                fontWeight: '600',
                color: T.warn,
                marginBottom: '4px'
              }}>
                Detta är en tung uppgift
              </div>
              <div style={{
                fontSize: '0.85rem',
                fontFamily: 'Atkinson Hyperlegible',
                color: T.ink,
                marginBottom: '8px'
              }}>
                ÄR du i rätt skjust just nu? Kolla:
              </div>
              <ul style={{
                margin: 0,
                paddingLeft: '20px',
                fontSize: '0.85rem',
                fontFamily: 'Atkinson Hyperlegible',
                color: T.ink
              }}>
                <li>Mentalt fokus? (inte trött)</li>
                <li>Tillräckligt med tid? ({timeEstimate}+ min)</li>
                <li>Ok miljö? (inte för många distraktioner)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Body Doubling Option */}
      <div style={{
        background: T.paper,
        padding: '10px',
        borderRadius: '6px',
        border: `1px solid ${T.line}`,
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '0.8rem',
          fontFamily: 'Atkinson Hyperlegible',
          color: T.soft,
          marginBottom: '4px'
        }}>
          Vill du ha sällskap under uppgiften?
        </div>
        <button
          style={{
            background: 'transparent',
            color: T.petrol,
            border: `1px dashed ${T.petrol}`,
            borderRadius: '4px',
            padding: '4px 10px',
            fontSize: '0.8rem',
            fontFamily: 'Atkinson Hyperlegible',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          Aktivera fokus-buddy 
        </button>
      </div>
    </div>
  );
}

// Helper function for trigger suggestions
function triggerSuggestion(taskTitle) {
  const lowerTitle = taskTitle.toLowerCase();

  if (lowerTitle.includes('kaffe') || lowerTitle.includes('frukost')) return 'jag har ätit';
  if (lowerTitle.includes('jobb') || lowerTitle.includes('arbet')) return 'jag sitter vid skrivbordet';
  if (lowerTitle.includes('motion') || lowerTitle.includes('träning')) return 'jag har träningskläder på mig';
  if (lowerTitle.includes('läsa') || lowerTitle.includes('bok')) return 'jag har boken framför mig';

  return 'jag är redo att börja';
}

export function TaskInitiationButton({ task, onClick, disabled = false }) {
  return (
    <button
      style={{
        background: disabled ? T.track : T.petrol,
        color: disabled ? T.soft : 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '8px 16px',
        fontSize: '0.9rem',
        fontFamily: 'Atkinson Hyperlegible',
        fontWeight: '600',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        opacity: disabled ? 0.6 : 1
      }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {disabled ? '... Väntar...' : '> Starta'}
    </button>
  );
}