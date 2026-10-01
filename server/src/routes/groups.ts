import { Router } from 'express';
import {
  AddGroupMemberRequestSchema,
  CreateGroupRequestSchema,
  UpdateGroupRequestSchema,
  type AddGroupMemberRequest,
  type CreateGroupRequest,
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
  getGroup,
  listGroups,
  renameGroup,
} from '../services/groups.js';
import { idParam } from './params.js';

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
    const { name } = req.body as UpdateGroupRequest;
    const group = renameGroup(db, idParam(req.params.id, 'Group'), currentUser(req).id, name);
    res.json({ group } satisfies GroupDetailResponse);
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
