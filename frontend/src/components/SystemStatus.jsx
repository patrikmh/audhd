/**
 * SystemStatus - Clear system status indicators to reduce anxiety
 * Shows sync status, agent status, and system health for ADHD users
 */

import { T } from '../constants/tokens';

export function SystemStatus({ sync, agents, lastSync, onSyncClick }) {
  const syncStatus = lastSync ? {
    text: `Synkade ${getTimeAgo(lastSync)}`,
    status: 'success',
    showAction: false
  } : sync.err ? {
    text: `Synk fel: ${sync.err}`,
    status: 'error',
    showAction: true
  } : sync.syncing ? {
    text: 'Synkroniserar...',
    status: 'working',
    showAction: false
  } : {
    text: 'Synk redo',
    status: 'idle',
    showAction: true
  };

  const agentStatus = Object.entries(agents).filter(([key, value]) =>
    key !== 'observer' && value === true
  );

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'flex-end'
    }}>
      {/* Agent Status */}
      {agentStatus.length > 0 && (
        <div style={{
          background: T.card,
          border: `1px solid ${T.line}`,
          borderRadius: '6px',
          padding: '8px 12px',
          maxWidth: '280px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            fontFamily: 'Atkinson Hyperlegible',
            color: T.ink
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: T.moss,
              animation: 'pulse 2s infinite'
            }} />
            <span>
              {agentStatus.length} agent{agentStatus.length > 1 ? 'er' : ''}: {agentStatus.map(([key]) => key).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Sync Status */}
      <div
        style={{
          background: T.card,
          border: `1px solid ${syncStatus.status === 'error' ? T.warn : T.line}`,
          borderRadius: '6px',
          padding: '10px 14px',
          maxWidth: '300px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          cursor: syncStatus.showAction ? 'pointer' : 'default'
        }}
        onClick={syncStatus.showAction ? onSyncClick : undefined}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {/* Status Icon */}
          <div style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: syncStatus.status === 'success' ? T.moss :
                       syncStatus.status === 'error' ? T.warn :
                       syncStatus.status === 'working' ? T.petrol :
                       T.soft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: 'white',
            fontFamily: 'Atkinson Hyperlegible'
          }}>
            {syncStatus.status === 'success' && '✓'}
            {syncStatus.status === 'error' && '!'}
            {syncStatus.status === 'working' && '→'}
            {syncStatus.status === 'idle' && '○'}
          </div>

          {/* Status Text */}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '0.85rem',
              fontFamily: 'Atkinson Hyperlegible',
              fontWeight: '500',
              color: T.ink,
              marginBottom: '2px'
            }}>
              {syncStatus.text}
            </div>

            {syncStatus.showAction && (
              <div style={{
                fontSize: '0.75rem',
                fontFamily: 'Atkinson Hyperlegible',
                color: T.petrol,
                marginTop: '2px'
              }}>
                Klicka för att synka nu
              </div>
            )}

            {syncStatus.status === 'working' && (
              <div style={{
                fontSize: '0.75rem',
                fontFamily: 'Atkinson Hyperlegible',
                color: T.soft,
                marginTop: '2px'
              }}>
                {sync.working && `${sync.working.changes || 0} ändringar`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data Safety Reassurance */}
      {!lastSync && syncStatus.status !== 'working' && (
        <div style={{
          background: T.paper,
          border: `1px solid ${T.moss}`,
          borderRadius: '6px',
          padding: '8px 12px',
          maxWidth: '280px',
          fontSize: '0.75rem',
          fontFamily: 'Atkinson Hyperlegible',
          color: T.ink,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontWeight: '500', marginBottom: '2px' }}>
            Dina data är säkra ✋
          </div>
          <div>
            Allt sparas lokalt. Synk sker automatiskt.
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function for time ago
function getTimeAgo(timestamp) {
  if (!timestamp) return 'aldrig';

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return 'just nu';
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 'er' : ''} sedan`;
  if (hours < 24) return `${hours} tim${hours > 1 : 'mar' } sedan`;
  return `${Math.floor(hours / 24)} dag${Math.floor(hours / 24) > 1 : 'ar'} sedan`;
}