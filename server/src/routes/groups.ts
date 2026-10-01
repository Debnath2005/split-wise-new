import { Router } from 'express';
import {
  AddGroupMemberRequestSchema,
  CreateGroupRequestSchema,
  UpdateGroupRequestSchema,
  type AddGroupMemberRequest,
  type CreateGroupRequest,
  type ExpensePage,
  type GroupBalancesResponse,
  type GroupDetailResponse,
  type GroupsResponse,
  type UpdateGroupRequest,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  addGroupMember,
  createGroup,
  leaveGroup,
  requireGroupForMember,
  getGroup,
  listGroups,
  updateGroup,
} from '../services/groups.js';
import { groupBalances } from '../services/balances.js';
import { listGroupExpenses } from '../services/expenses.js';
import { idParam, pageQuery } from './params.js';

export function groupsRouter(db: Db) {
  const router = Router();
  router.use('/groups', requireAuth);

  router.get('/groups', (req, res) => {
    res.json({ groups: listGroups(db, currentUser(req).id) } satisfies GroupsResponse);
  });

  router.post('/groups', validateBody(CreateGroupRequestSchema), (req, res) => {
    const group = createGroup(db, currentUser(req).id, req.body as CreateGroupRequest);
    res.status(201).json({ group } satisfies GroupDetailResponse);
  });

  router.get('/groups/:id', (req, res) => {
    const group = getGroup(db, idParam(req.params.id, 'Group'), currentUser(req).id);
    res.json({ group } satisfies GroupDetailResponse);
  });

  router.patch('/groups/:id', validateBody(UpdateGroupRequestSchema), (req, res) => {
    const group = updateGroup(
      db,
      idParam(req.params.id, 'Group'),
      currentUser(req).id,
      req.body as UpdateGroupRequest,
    );
    res.json({ group } satisfies GroupDetailResponse);
  });

  router.get('/groups/:id/expenses', (req, res) => {
    const page = listGroupExpenses(
      db,
      idParam(req.params.id, 'Group'),
      currentUser(req).id,
      pageQuery(req.query),
    );
    res.json(page satisfies ExpensePage);
  });

  router.get('/groups/:id/balances', (req, res) => {
    const groupId = idParam(req.params.id, 'Group');
    requireGroupForMember(db, groupId, currentUser(req).id);
    res.json(groupBalances(db, groupId) satisfies GroupBalancesResponse);
  });

  /** Leave: 409 unless all your balances inside the group are 0 (SPEC §10). */
  router.delete('/groups/:id/members/me', (req, res) => {
    leaveGroup(db, idParam(req.params.id, 'Group'), currentUser(req).id);
    res.status(204).end();
  });

  router.post('/groups/:id/members', validateBody(AddGroupMemberRequestSchema), (req, res) => {
    const group = addGroupMember(
      db,
      idParam(req.params.id, 'Group'),
      currentUser(req).id,
      req.body as AddGroupMemberRequest,
    );
    res.status(201).json({ group } satisfies GroupDetailResponse);
  });

  return router;
}
