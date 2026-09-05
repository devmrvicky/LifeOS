// Re-exports the shared type definitions so every existing `from '../types'`
// import in this codebase keeps working unchanged. The actual definitions
// live in shared/types/ — this file is intentionally just a pass-through,
// not a second copy (see shared/types/index.ts for why that duplication
// existed in Phase 1.1 and was removed in Phase 1.2).
export * from '@shared/types';
export * from '@shared/types/api';
