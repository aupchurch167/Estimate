/**
 * Augments Express's Request with the authenticated principal that
 * `requireAuth` middleware attaches. Downstream handlers can read
 * `req.user`, `req.organization`, and `req.settings` with full typing.
 */

import type { OrgSettings, Organization, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      organization?: Organization;
      settings?: OrgSettings;
    }
  }
}

export {};
