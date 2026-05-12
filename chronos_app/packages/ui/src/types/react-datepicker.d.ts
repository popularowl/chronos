// Ambient declaration shim for `react-datepicker`. The upstream package
// ships no TypeScript types and the repo doesn't install
// `@types/react-datepicker`, so the IDE's TS language server otherwise
// raises TS7016 "implicit any" on every import (~6 callsites). This
// one-liner silences the warning without committing to a specific type
// shape — props remain effectively `any`. Replace with the upstream
// `@types/react-datepicker` package if richer typing becomes valuable.
declare module 'react-datepicker'
