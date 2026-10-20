import { API_BASE_URL } from "./config";
import type { User } from "./auth";

export type GroupPrivacy = "public" | "private";

export interface GroupListItem {
  id: number;
  name: string;
  description?: string | null;
  creatorId: number;
  image?: string | null;
  privacy: GroupPrivacy;
  createdAt: string;
  isMember: boolean;
  memberStatus?: string | null;
}

export interface GroupWithDetails extends Omit<GroupListItem, "isMember" | "memberStatus"> {
  memberCount: number;
  creator?: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
  } | null;
  isMember?: boolean;
  isCreator?: boolean;
  memberStatus?: string | null;
}

export interface GroupMemberRow {
  id: number;
  groupId: number;
  userId: number;
  inviterId: number;
  status: string;
  requestType: "invitation" | "join_request";
  createdAt: string;
}

async function readError(res: Response): Promise<string> {
  const t = await res.text();
  if (!t) return res.statusText;
  try {
    const j = JSON.parse(t) as { error?: string; message?: string };
    return j.error || j.message || t;
  } catch {
    return t;
  }
}

export async function fetchGroups(params?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<GroupListItem[]> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  const url = `${API_BASE_URL}/api/groups${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.groups)) return [];
  return data.groups as GroupListItem[];
}

export async function fetchGroup(id: number): Promise<GroupWithDetails | null> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${id}`, {
    method: "GET",
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  if (!data?.success || !data.group) return null;
  return data.group as GroupWithDetails;
}

export async function createGroup(body: {
  name: string;
  description?: string;
  privacy?: GroupPrivacy;
}): Promise<{ success: boolean; group?: { id: number } }> {
  const res = await fetch(`${API_BASE_URL}/api/groups`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data: { success?: boolean; group?: { id: number }; message?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {};
  } catch {
    /* plain text */
  }
  if (!res.ok) throw new Error(data.message || raw || `Failed (${res.status})`);
  return data as { success: boolean; group?: { id: number } };
}

export async function updateGroup(
  id: number,
  body: { name?: string; description?: string; privacy?: GroupPrivacy }
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteGroup(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function leaveGroup(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${id}/leave`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function joinGroup(groupId: number): Promise<{
  success: boolean;
  alreadyMember?: boolean;
  status?: string;
}> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/join`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    /* plain-text error */
  }
  if (!res.ok) {
    const msg =
      res.status === 403
        ? "This group does not allow open join (private - ask for an invitation)."
        : (data.message as string) || raw || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as { success: boolean; alreadyMember?: boolean; status?: string };
}

export async function inviteToGroup(groupId: number, userId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/invite`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const raw = await res.text();
  let data: { message?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as { message?: string }) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.message || raw || `Failed (${res.status})`);
}

export async function acceptGroupAction(
  groupId: number,
  body?: { userId?: number }
): Promise<{ success: boolean; status?: string; userId?: number; requestType?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/accept`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body && body.userId != null ? { userId: body.userId } : {}),
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error((data.message as string) || raw || `Failed (${res.status})`);
  return data as { success: boolean; status?: string; userId?: number; requestType?: string };
}

export async function declineGroupAction(
  groupId: number,
  body?: { userId?: number }
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/decline`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body && body.userId != null ? { userId: body.userId } : {}),
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error((data.message as string) || raw || `Failed (${res.status})`);
  return data as { success: boolean };
}

export async function fetchGroupMembers(
  groupId: number,
  status?: "pending" | "accepted"
): Promise<GroupMemberRow[]> {
  const sp = new URLSearchParams();
  if (status) sp.set("status", status);
  const qs = sp.toString();
  const res = await fetch(
    `${API_BASE_URL}/api/groups/${groupId}/members${qs ? `?${qs}` : ""}`,
    { method: "GET", credentials: "include" }
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.members)) return [];
  return data.members as GroupMemberRow[];
}

export async function fetchMyGroups(
  status?: "pending" | "accepted"
): Promise<GroupListItem[]> {
  const sp = new URLSearchParams();
  if (status) sp.set("status", status);
  const qs = sp.toString();
  const res = await fetch(`${API_BASE_URL}/api/user/groups${qs ? `?${qs}` : ""}`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.groups)) return [];
  return data.groups as GroupListItem[];
}

/** Resolve minimal user info for displaying member rows */
export async function fetchUserMini(id: number): Promise<Pick<User, "id" | "username" | "firstName" | "lastName"> | null> {
  const res = await fetch(`${API_BASE_URL}/api/user/id?id=${id}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const u = data?.user;
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
  };
}

export interface GroupEvent {
  id: number;
  groupId: number;
  creatorId: number;
  title: string;
  description?: string | null;
  eventDate: string;
  createdAt: string;
  going: number;
  notGoing: number;
  myResponse?: string;
  creator?: { id: number; username: string; firstName: string; lastName: string; avatar?: string | null };
}

export async function fetchGroupEvents(groupId: number): Promise<GroupEvent[]> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/events`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.events)) return [];
  return data.events as GroupEvent[];
}

export async function createGroupEvent(
  groupId: number,
  title: string,
  description: string,
  eventDate: string,
): Promise<GroupEvent | null> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ title, description: description || null, eventDate }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.event ?? null;
}

export async function respondToEvent(
  eventId: number,
  response: "going" | "not_going",
): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ response }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data?.success;
}
