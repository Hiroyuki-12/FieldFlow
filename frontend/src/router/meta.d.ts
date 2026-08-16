import 'vue-router';

import type { UserRole } from '../api/auth';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    guestOnly?: boolean;
    allowBeforePasswordChange?: boolean;
    initialPasswordOnly?: boolean;
    roles?: UserRole[];
  }
}
