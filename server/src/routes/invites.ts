import { Router } from 'express';
import {
  INVITE_TOKEN_PATTERN,
  type InvitePreviewResponse,
  type InviteResponse,
  type MeResponse,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { acceptInvite, createInvite, previewInvite } from '../services/invites.js';
import { findUserById } from '../services/people.js';
import { toUserDto } from '../services/users.js';
import { idParam } from './params.js';

export function invitesRouter(db: Db) {
  const router = Router();

  /** Create (or replace) the link for a placeholder you're friends with. */
  router.post('/users/:id/invite', requireAuth, (req, res) => {
    const invite = createInvite(db, currentUser(req).id, idParam(req.params.id, 'Person'));
    res.status(201).json(invite satisfies InviteResponse);
  });

  /** Public preview — no login needed. Invalid links all look the same. */
  router.get('/invites/:token', (req, res) => {
    const token = req.params.token ?? '';
    const preview: InvitePreviewResponse = INVITE_TOKEN_PATTERN.test(token)
      ? previewInvite(db, token)
      : { valid: false };
    res.json(preview);
  });

  /** Logged in: merge the invited placeholder into your account (ADR-0015). */
  router.post('/invites/:token/accept', requireAuth, (req, res) => {
    const me = currentUser(req);
    acceptInvite(db, me.id, req.params.token ?? '');
    res.json({ user: toUserDto(findUserById(db, me.id)!) } satisfies MeResponse);
  });

  return router;
}
