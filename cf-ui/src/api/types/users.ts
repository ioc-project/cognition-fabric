import {z} from 'zod';

export const UserListItemSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  domain: z.string(),
  role: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export type UserListItem = z.infer<typeof UserListItemSchema>;

export const ListUsersResponseSchema = z.object({
  users: z.array(UserListItemSchema),
  total: z.number().int().nonnegative()
});

export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;
