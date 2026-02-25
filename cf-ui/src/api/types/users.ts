export interface UserListItem {
  id: string;
  username: string;
  email?: string;
  name?: string;
  role?: string;
  created_at?: string;
}

export interface ListUsersResponse {
  users: UserListItem[];
  total?: number;
}
