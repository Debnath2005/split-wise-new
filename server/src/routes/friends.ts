import { Router } from 'express';
import {
  PersonInputSchema,
  type AddFriendResponse,
  type FriendDetailResponse,
  type FriendsResponse,
  type PersonInput,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { addFriend, getFriendDetail, listFriends } from '../services/friends.js';
import { idParam } from './params.js';

export function friendsRouter(db: Db) {
  const router = Router();
  router.use('/friends', requireAuth);

  router.get('/friends', (req, res) => {
    res.json({ friends: listFriends(db, currentUser(req).id) } satisfies FriendsResponse);
  });

  /** 201 when the friendship is new, 200 when they were already friends. */
  router.post('/friends', validateBody(PersonInputSchema), (req, res) => {
    const { friend, created } = addFriend(db, currentUser(req).id, req.body as PersonInput);
    res.status(created ? 201 : 200).json({ friend } satisfies AddFriendResponse);
  });

  router.get('/friends/:userId', (req, res) => {
    const friendId = idParam(req.params.userId, 'Friend');
    res.json(getFriendDetail(db, currentUser(req).id, friendId) satisfies FriendDetailResponse);
  });

  return router;
}
