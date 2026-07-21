# Varv Frontend Architecture

## Directory Structure

```
frontend/
├── src/
│   ├── components/       # React components (UI modules)
│   ├── constants/        # Design tokens and configuration
│   │   ├── tokens.js     # Design system (colors, modes, labels)
│   │   └── defaultState.js # Initial application state
│   ├── hooks/            # Custom React hooks
│   │   └── useSync.js   # Sync logic hook
│   ├── services/         # External service integrations
│   │   ├── api.js        # API client
│   │   └── sync.js       # Sync service (change tracking, push/pull)
│   ├── utils/            # Utility functions
│   │   ├── auth.js       # Authentication utilities
│   │   └── helpers.js    # Helper functions (uid, date formatting, etc.)
│   └── App.jsx           # Main application component
```

## Design System

### Color Tokens (`/constants/tokens.js`)
```javascript
const T = {
  paper: "#F2F1EC",    // Background
  ink: "#33393B",      // Text
  spruce: "#46564F",   // Secondary text
  petrol: "#4C6E75",   // Accent
  warn: "#A66A4F",     // Warning/high energy
  moss: "#8A977F",     // Low energy/success
  // ... more tokens
};
```

### Modes
Three capacity modes with different energy budgets:
- **Steady**: Normal capacity (20 energy budget)
- **Low**: Reduced capacity (12 energy budget)
- **Recovery**: Minimal requirements (6 energy budget)

### Component Architecture

#### Main Component (`App.jsx`)
The main `VarvApp` component manages:
- **State Management**: Uses React useState for application state
- **Data Persistence**: LocalStorage + Server sync via `/services/sync.js`
- **View Routing**: Toggles between 'today', 'lists', 'tools' views
- **Tool Selection**: Manages which tool is active (focus, move, checkin, etc.)

#### Key State Sections
```javascript
const state = {
  // Core data
  tasks: [],          // Active tasks
  ideas: [],          // Raw and refined ideas
  wins: [],           // Daily wins/achievements
  energyLog: [],      // Energy events for budget tracking
  
  // Settings
  settings: {},       // User preferences
  agents: {},         // Agent toggles
  
  // Sync state
  sync: {},           // Sync status and timestamps
  
  // UI state
  tool: null,         // Current active tool
  view: "today"       // Current view
};
```

## Service Layer

### API Client (`/services/api.js`)
Handles all HTTP communication with varv-server:
```javascript
class APIClient {
  async login(username, password)
  async getTasks(done = false)
  async patchTask(taskId, changes)
  // ... more methods
}
```

### Sync Service (`/services/sync.js`)
Implements client-side sync protocol:
```javascript
class SyncClient {
  // Track local changes
  track(kind, id, op, data)
  
  // Push changes to server
  async push()
  
  // Pull changes from server
  async pull()
  
  // Full sync
  async sync()
}
```

#### Change Tracking
The sync service tracks all local changes:
- **Kind**: 'task', 'task_step', 'idea', 'list_item', 'win', 'energy_event'
- **Operation**: 'upsert' or 'delete'
- **Data**: Complete object state for last-write-wins resolution
- **Timestamp**: ISO timestamp for conflict resolution

### Sync Hook (`/hooks/useSync.js`)
Custom React hook that integrates sync with React state:
```javascript
const sync = useSync(apiBase, getAuth, state, setState);

// Methods
sync.performSync()      // Full sync operation
sync.trackChange(...)   // Track a state change
sync.mergeServerData(...) // Merge server changes into state
```

## Authentication Flow

### Login Process
1. User enters credentials → `/utils/auth.js:login()`
2. POST to `/api/auth/login` → receives `{token, username}`
3. Store in localStorage → `/utils/auth.js:setAuth()`
4. All subsequent requests include `Authorization: Bearer {token}`

### Auth Utilities
```javascript
getAuth()    // Retrieve stored auth from localStorage
setAuth()    // Store auth in localStorage
clearAuth()  // Remove auth (logout)
login()      // Perform login API call
```

## Data Flow

### Local-First with Sync
1. **Immediate Update**: State updates happen immediately in React
2. **Change Tracking**: Updates are tracked for sync
3. **Background Sync**: Changes sync to server in background
4. **Conflict Resolution**: Last-write-wins based on timestamps

### Example: Adding a Task
```javascript
// 1. Local state update
const task = { ...DEFAULT_TASK, id: uid(), title: "New task" };
setState(st => ({ ...st, tasks: [...st.tasks, task] }));

// 2. Track for sync
sync.trackChange('task', task.id, 'upsert', task);

// 3. Background sync pushes to server
// (happens automatically in background)
```

## Multi-User Architecture

### User Isolation
- **Authentication**: Each user has unique bearer token
- **State Storage**: `varv-state:{username}` localStorage key
- **API Calls**: All API calls scoped to authenticated user
- **Sync Protocol**: Server returns only user's data

### Data Safety
1. **Server Authority**: Server is source of truth for multi-user sync
2. **Conflict Resolution**: Last-write-wins prevents data loss
3. **User Filtering**: Backend enforces user_id filtering
4. **Token Validation**: All API calls validate authentication

## Performance Optimizations

### Debounced Saves
State changes to localStorage are debounced (400ms) to avoid excessive writes.

### Batch Sync
Changes are batched and synced every 3 hours (configurable via `SYNC_INTERVAL`).

### Lazy Loading
- **Font Loading**: Google Fonts loaded asynchronously
- **Component Rendering**: Large lists use pagination/slicing
- **Agent Processing**: AI agent calls happen in background sweeps

## State Management Strategy

### React State
Primary state lives in React `useState` for reactivity:
```javascript
const [state, setState] = useState(DEFAULT_STATE);
```

### LocalStorage Persistence
State persisted to localStorage for offline access:
```javascript
localStorage.setItem(`varv-state:${username}`, JSON.stringify(state));
```

### Server Sync
Background sync keeps data across devices and users:
```javascript
// Every 3 hours or manual trigger
await sync.performSync();
```

## Component Lifecycle

### Mount
1. Load fonts
2. Load state from localStorage
3. Initialize sync client
4. Perform initial sync if enabled

### State Updates
1. Update React state (immediate UI feedback)
2. Track changes for sync
3. Debounced localStorage save
4. Background sync (periodic)

### Unmount
1. Clear timers
2. Final state save to localStorage

## Integration Points

### Backend API
- **Base URL**: Configured via `VITE_API_BASE_URL` environment variable
- **Authentication**: Bearer token in Authorization header
- **Endpoints**: See API client for full list

### AI Agents
Called via API proxy endpoints:
- `/api/agents/classify` - Sorteraren
- `/api/agents/refine` - Förfinaren  
- `/api/agents/breakdown` - Nedbrytaren

### External Services
- **Oura Ring**: Fitness/sleep data integration
- **Gmail**: Email processing
- **Google Calendar**: Task scheduling
- **Notion**: Idea archival

## Development Workflow

### Adding New Features
1. **Add to State**: Update `DEFAULT_STATE` if needed
2. **Create Actions**: Add state update functions
3. **Track Changes**: Add `sync.trackChange()` calls
4. **Update UI**: Add components for new feature
5. **Test Sync**: Verify multi-user sync works

### Debugging
1. **Check State**: React DevTools for state inspection
2. **Network Tab**: API calls and responses
3. **Console**: Sync service logs changes
4. **LocalStorage**: Check `varv-state:{username}` keys

## Browser Compatibility

- **Modern Browser**: Requires ES6+ support
- **LocalStorage**: Required for offline functionality
- **Fetch API**: Required for API communication
- **Web Speech API**: Optional for voice capture

## Security Considerations

1. **Token Storage**: Tokens in localStorage (convenient but less secure)
2. **HTTPS**: Required for production (token security)
3. **Input Validation**: Backend validation via Pydantic schemas
4. **XSS Protection**: React's built-in escaping
5. **CSRF**: Bearer token authentication provides CSRF protection

## Performance Metrics

### State Size
- **Tasks**: ~100 typical tasks
- **Ideas**: ~100 ideas max (sliced)
- **Wins**: ~200 wins max (sliced)
- **Energy Log**: ~14 days of data

### Sync Frequency
- **Auto Sync**: Every 3 hours
- **Manual Sync**: Via "Synka allt nu" button
- **Immediate Sync**: Critical updates (configurable)

### Storage Limits
- **LocalStorage**: 5-10MB typical browser limit
- **Sync Payload**: Batches of changes (not full state)
- **Network**: Optimized JSON payloads