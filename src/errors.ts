/** Stable failures omit protocol response text, credentials and backend locations. */
import type {ForwardFailure} from './types.ts'
/** A declared failure is safe for an operator or an authenticated consumer. */
export class ForwardError extends Error{constructor(readonly code:ForwardFailure){super('Forward operation could not complete: '+code)}}
