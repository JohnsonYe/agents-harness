export const DEFAULT_CRITERIA = `## Default Evaluation Criteria

### Correctness
- All features specified in the contract are implemented and functional
- No placeholder, stubbed, or mocked implementations in production code
- Code runs without runtime errors

### Testing
- New features have corresponding tests
- All tests pass when the test suite is run
- Tests cover the primary success path and key edge cases

### Code Quality
- Code follows project conventions (from CLAUDE.md if present)
- No leftover TODO or FIXME comments
- No debug logging or commented-out code left in place
- Imports are clean — no unused imports

### Integration
- New code integrates with existing codebase without breaking existing functionality
- Existing tests still pass after changes
`;
