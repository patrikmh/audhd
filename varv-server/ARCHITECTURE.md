# Varv Backend Architecture

## Directory Structure

```
varv-server/
├── varv/
│   ├── api/              # API routes and endpoints
│   │   ├── auth.py       # Authentication middleware
│   │   └── routes.py     # Main API routes
│   ├── agents/           # AI agent implementations
│   │   └── core.py       # Agent core logic
│   ├── db/               # Database layer
│   │   ├── engine.py     # Database connection and engine
│   │   └── models.py     # SQLModel database models
│   ├── services/         # Business logic services
│   │   ├── capture.py    # Capture processing service
│   │   ├── stats.py      # Statistics service
│   │   ├── sync.py       # Sync protocol service
│   │   ├── topics.py     # Topics service
│   │   └── transcribe.py # Transcription service
│   ├── schemas.py        # Pydantic validation schemas
│   ├── config.py         # Configuration management
│   ├── utils.py          # Utility functions
│   └── main.py           # FastAPI application entry point
├── tests/                # Test suite
└── migrations/           # Database migrations
```

## Key Design Principles

### Multi-User Architecture
- **User Isolation**: All data is scoped by `user_id` foreign key relationships
- **Authentication**: Bearer token per user, enforced via `current_user` dependency
- **CASCADE Deletes**: When a user is deleted, all their data is automatically removed
- **Sync Protocol**: Server-authoritative sync with last-write-wins conflict resolution

### Database Design
- **UUIDv7 Primary Keys**: Client-generated IDs for offline-first sync
- **Soft Deletes**: `deleted_at` instead of hard deletes for syncable tables
- **Append-only Tables**: Wins and energy events never delete, only insert
- **Day-based Partitioning**: `day` columns for efficient per-day queries

### API Design
- **Thin Routes**: API routes are thin - validation + delegation to services
- **Service Layer**: All business logic lives in `/services/`
- **Agent Proxy**: Frontend can call AI agents via `/api/agents/` endpoints
- **Sync Protocol**: Bidirectional sync via `/api/sync/push` and `/api/sync/pull`

## Multi-User Safety Guarantees

### Database Level
1. **Foreign Key Constraints**: All user data has `user_id` foreign key
2. **CASCADE Deletes**: User deletion removes all associated data
3. **Index on user_id**: Fast user-scoped queries
4. **Check Constraints**: Data integrity at database level

### API Level
1. **Authentication Middleware**: `current_user` dependency on all routes
2. **User Filtering**: All queries filter by `user_id == user.id`
3. **Ownership Checks**: Routes verify `resource.user_id == user.id`
4. **Authorization Headers**: Required Bearer token for all operations

### Sync Protocol
1. **User-Scoped Changes**: Sync only returns data for authenticated user
2. **Last-Write-Wins**: Conflict resolution via `updated_at` timestamps
3. **Tombstone Records**: Soft deletes sync as `deleted_at` changes
4. **Append-only Safety**: Wins/energy events use idempotent insert logic

## Service Layer Organization

### `/services/capture.py`
Processes incoming thoughts and routes them to appropriate destinations:
- Calls AI agents (Sorteraren) for classification
- Routes to Task/Idea/Shopping based on classification
- Handles voice transcription pipeline

### `/services/sync.py`
Implements the sync protocol:
- `apply_changes()`: Handles push from clients
- `pull_changes()`: Returns changes since cursor
- Last-write-wins conflict resolution
- Protects server-only fields (id, user_id, timestamps)

### `/services/stats.py`
Business logic for statistics and capacity:
- Energy calculations and capacity management
- Week statistics aggregation
- Top tags analysis

### `/services/transcribe.py`
Audio transcription service:
- KB-Whisper integration for voice capture
- CPU-intensive operation offloaded to executor
- Language detection and transcription

## AI Agent Architecture

### Agent Types
1. **Sorteraren**: Classifies captures into Task/Idea/Shopping
2. **Förfinaren**: Refines raw ideas into structured thoughts
3. **Nedbrytaren**: Breaks down tasks into micro-steps

### Agent Invocation
- **Server-side**: Agents run on server via OpenRouter API
- **Frontend Proxy**: `/api/agents/` endpoints for direct agent calls
- **Batch Processing**: Background sweeps for pending items

## Configuration Management

### `/config.py`
- Environment variable handling
- Azure Key Vault integration
- Runtime configuration loading

### Database Configuration
- SQLite with WAL mode for performance
- Foreign key enforcement enabled
- Connection pooling via get_session()

## Testing Strategy

### Unit Tests
- `/tests/test_sync.py`: Sync protocol tests
- `/tests/test_capture.py`: Capture processing tests

### Integration Tests
- Multi-user isolation tests
- End-to-end sync tests
- Agent integration tests

## Security Considerations

1. **Bearer Token Authentication**: Simple but effective for single-user-per-device
2. **User Data Isolation**: Database + API level enforcement
3. **Input Validation**: Pydantic schemas on all API endpoints
4. **SQL Injection Prevention**: SQLModel parameterized queries
5. **Rate Limiting**: Consider adding for production deployment

## Deployment Notes

### Development
- Run on Raspberry Pi via `uvicorn varv.main:app --reload`
- Tunnelto service for external access
- Local SQLite database

### Production Considerations
- Replace SQLite with PostgreSQL for multi-user scaling
- Add Redis for session management
- Implement proper rate limiting
- Add monitoring and logging
- Consider containerization (Docker)

## Future Improvements

1. **Background Jobs**: Implement proper job queue for AI processing
2. **Caching**: Add Redis caching for frequently accessed data
3. **WebSockets**: Real-time sync notifications
4. **API Versioning**: Add versioning for breaking changes
5. **Metrics**: Add Prometheus metrics for monitoring
6. **Rate Limiting**: Implement proper rate limiting per user