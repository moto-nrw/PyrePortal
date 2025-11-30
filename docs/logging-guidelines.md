# PyrePortal Logging Guidelines

## Overview

This document provides guidelines for maintaining and extending PyrePortal's logging system. Following these practices will ensure consistent, maintainable, and performance-optimized logging throughout the application.

## Log Levels

Use appropriate log levels for different types of information:

| Level   | Usage                                                             |
| ------- | ----------------------------------------------------------------- |
| `DEBUG` | Detailed information useful during development and debugging      |
| `INFO`  | General operational information about normal application behavior |
| `WARN`  | Potentially harmful situations that don't disrupt functionality   |
| `ERROR` | Error events that might still allow the application to continue   |

## Logging Best Practices

### When to Log

- **Component Lifecycle**: Log mount/unmount of key components
- **User Interactions**: Log significant user actions (login, selections, form submissions)
- **State Changes**: Log important application state changes
- **Navigation Events**: Log route changes with relevant context
- **API Calls**: Log request/response details (excluding sensitive data)
- **Performance Metrics**: Use performance API to log timing for critical operations
- **Error Conditions**: Log detailed error information with context

### What to Include in Logs

1. **Context**: Include relevant identifiers (user, room, activity) for correlation
2. **Timestamps**: Use ISO format timestamps for precision
3. **Source**: Clearly identify the component/function generating the log
4. **Structured Data**: Use objects for additional data rather than string concatenation
5. **Error Details**: Include error message, stack trace, and relevant state

### What to Avoid

1. **Sensitive Information**: Never log passwords, tokens, PINs
2. **PII**: Avoid logging personally identifiable information
3. **Redundant Logging**: Don't log the same event in multiple places
4. **Excessive Logging**: Don't log routine or high-frequency events in production
5. **Large Objects**: Don't log entire large objects; extract relevant properties

## Shared Components

For shared UI components:

1. **Logger per Component**: Create a dedicated logger instance for each component
2. **Contextual Logging**: Pass parent component context to child components
3. **Event Propagation**: Log at the highest meaningful level; avoid duplicate logs
4. **Conditional Logging**: Consider component usage context for logging verbosity

## Performance Considerations

1. **Production Optimizations**:
   - Use `import.meta.env.PROD` to adjust log levels in production
   - Set higher thresholds for log persistence in production

2. **Log Size Management**:
   - Use the circular buffer strategy (already implemented)
   - Implement log rotation for persistent logs

3. **Asynchronous Logging**:
   - Use `async/await` for persistence operations
   - Avoid blocking the main thread with excessive logging

4. **Log Filter & Buffer**:
   - Group related logs during high-volume operations
   - Use debouncing for frequent events

## Maintenance Strategy

### Regular Audit

Schedule periodic reviews to:

1. Identify redundant or noisy logs
2. Check for sensitive information exposure
3. Verify log level appropriateness
4. Review log verbosity in different environments

### Log Sprawl Prevention

1. **Centralized Helper Functions**:
   - Use the existing helper functions: `logUserAction`, `logNavigation`, `logError`
   - Create additional domain-specific helpers as needed

2. **Remove Temporary Logs**:
   - Add `TODO: Remove debug log` comments for temporary debugging logs
   - Review logs during code reviews

3. **Template Standardization**:
   - Use consistent message formats
   - Follow established patterns for similar events

### Extending the System

When adding new logging capabilities:

1. **Update Logger Interface**: Extend the `LogEntry` interface
2. **Add Helper Functions**: Create new domain-specific helpers
3. **Document Changes**: Update this guide
4. **Backward Compatibility**: Ensure changes don't break existing logs

## Analyzing Logs

Guidelines for effective log analysis:

1. **Correlation IDs**: Use sessionId for correlating events across components
2. **User Journey Tracking**: Follow user actions through navigation events
3. **Error Investigation**: Combine error logs with preceding context logs
4. **Performance Analysis**: Review performance mark/measure logs for bottlenecks

## Example Log Scenarios

### Authentication Flow

```typescript
// Login attempt
logger.info('User attempting login', { username });

// PIN verification
logger.info('PIN verified successfully', { user });

// Authentication failure
logger.warn('PIN verification failed', { reason: 'incomplete_pin' });
```

### User Actions

```typescript
// Room selection
logger.info('Room selected successfully', { roomId, roomName });

// Form interaction
logger.debug('Activity form field changed', { field: name, value });

// Activity creation
logger.info('Activity created successfully', { activityName });
```

## Implementation Review Checklist

When reviewing logging implementation:

- [ ] Appropriate log levels used
- [ ] Consistent message formatting
- [ ] Relevant context included
- [ ] No sensitive data exposed
- [ ] Performance considerations addressed
- [ ] Error handling is robust
- [ ] User privacy respected

By following these guidelines, PyrePortal will maintain a clean, useful, and performance-optimized logging system that provides value for both development and production use cases.
