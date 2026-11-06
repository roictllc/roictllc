import 'server-only';
import { DEFAULT_DOMAIN_POLICY, type DomainPolicy } from '@roi/shared-utils';
import { getSetting } from './catalog';
export { accessibleWorkspaceIds } from './authz';
export const getDomainPolicy = () => getSetting<DomainPolicy>('domain.policy', DEFAULT_DOMAIN_POLICY);
