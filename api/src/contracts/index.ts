/**
 * Contracts Index
 *
 * Re-exports all contract definitions for the LLM-Analytics-Hub agents.
 *
 * @module contracts
 */

export * from './decision-event';
export * from './consensus-agent';

// Ecosystem Collaboration Agent - import directly to avoid naming conflicts
// Use: import { ... } from '../contracts/ecosystem-collaboration-agent';
export * as EcosystemCollaboration from './ecosystem-collaboration-agent';
