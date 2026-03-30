import type { EvalDimension, ProjectType } from "../core/types.js";

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

const UNIVERSAL_DIMENSIONS: EvalDimension[] = [
  {
    id: "correctness",
    name: "Correctness",
    description: "Features work as specified, no placeholders, no runtime errors",
    weight: 2.0,
    threshold: 6,
    rubric: "3=major features missing or broken; 5=features work with gaps; 7=solid with minor issues; 9=exceeds requirements",
  },
  {
    id: "testing",
    name: "Testing",
    description: "Tests exist, pass, cover happy path and edge cases",
    weight: 1.5,
    threshold: 5,
    rubric: "3=no tests or most fail; 5=happy path covered; 7=good coverage with edge cases; 9=comprehensive with mocks and integration",
  },
  {
    id: "code-quality",
    name: "Code Quality",
    description: "Follows conventions, no TODOs/dead code, clean imports",
    weight: 1.0,
    threshold: 5,
    rubric: "3=inconsistent style, dead code; 5=acceptable, minor issues; 7=clean and consistent; 9=exemplary, idiomatic",
  },
  {
    id: "integration",
    name: "Integration",
    description: "Existing tests pass, follows existing patterns, no regressions",
    weight: 1.5,
    threshold: 6,
    rubric: "3=breaks existing tests; 5=works but diverges from patterns; 7=integrates cleanly; 9=enhances existing architecture",
  },
  {
    id: "design-principles",
    name: "Design Principles",
    description: "SOLID, DRY, separation of concerns, appropriate abstractions",
    weight: 1.0,
    threshold: 5,
    rubric: "3=tangled responsibilities, heavy duplication; 5=reasonable structure; 7=clean separation, minimal duplication; 9=elegant, well-abstracted",
  },
  {
    id: "error-handling",
    name: "Error Handling",
    description: "Proper error propagation, edge cases handled, input validation",
    weight: 1.0,
    threshold: 5,
    rubric: "3=errors swallowed or crash; 5=basic error handling; 7=graceful handling with informative messages; 9=comprehensive with recovery strategies",
  },
];

const BACKEND_DIMENSIONS: EvalDimension[] = [
  {
    id: "api-design",
    name: "API Design",
    description: "Consistent endpoints, status codes, input validation, error responses",
    weight: 1.5,
    threshold: 6,
    rubric: "3=inconsistent or broken endpoints; 5=functional but inconsistent; 7=clean REST/GraphQL with proper status codes; 9=well-documented, versioned, idiomatic",
  },
  {
    id: "data-integrity",
    name: "Data Integrity",
    description: "Transactions, data validation at boundaries, no data loss paths",
    weight: 1.5,
    threshold: 6,
    rubric: "3=data loss possible; 5=basic validation; 7=proper transactions and boundary checks; 9=bulletproof data handling",
  },
  {
    id: "concurrency-safety",
    name: "Concurrency Safety",
    description: "No race conditions, shared state protected, timeout handling",
    weight: 1.0,
    threshold: 5,
    rubric: "3=race conditions present; 5=basic locking; 7=proper concurrency patterns; 9=lock-free or formally verified",
  },
];

const FRONTEND_DIMENSIONS: EvalDimension[] = [
  {
    id: "ui-ux-quality",
    name: "UI/UX Quality",
    description: "Consistent visuals, responsive, loading/error states, intuitive flows",
    weight: 1.5,
    threshold: 5,
    rubric: "3=broken layout or missing states; 5=functional UI with gaps; 7=polished with loading/error states; 9=delightful, pixel-perfect",
  },
  {
    id: "component-architecture",
    name: "Component Architecture",
    description: "Clear responsibilities, proper state management, clean props",
    weight: 1.0,
    threshold: 5,
    rubric: "3=monolithic components, prop drilling; 5=reasonable split; 7=clean composition with proper state; 9=reusable, well-encapsulated",
  },
  {
    id: "accessibility",
    name: "Accessibility",
    description: "Semantic HTML, keyboard navigation, ARIA labels",
    weight: 1.0,
    threshold: 4,
    rubric: "3=no semantic HTML; 5=basic semantics; 7=keyboard nav and ARIA; 9=WCAG AA compliant",
  },
];

export function getDimensions(projectType: ProjectType): EvalDimension[] {
  switch (projectType) {
    case "frontend":
      return [...UNIVERSAL_DIMENSIONS, ...FRONTEND_DIMENSIONS];
    case "backend":
      return [...UNIVERSAL_DIMENSIONS, ...BACKEND_DIMENSIONS];
    case "fullstack":
      return [...UNIVERSAL_DIMENSIONS, ...BACKEND_DIMENSIONS, ...FRONTEND_DIMENSIONS];
    case "universal":
      return [...UNIVERSAL_DIMENSIONS];
  }
}

export function formatDimensionsBlock(dimensions: EvalDimension[]): string {
  const lines: string[] = [];
  for (const dim of dimensions) {
    lines.push(`### ${dim.name} (weight: ${dim.weight}, min: ${dim.threshold}/10)`);
    lines.push(dim.description);
    lines.push(`Rubric: ${dim.rubric}`);
    lines.push("");
  }
  return lines.join("\n");
}
