import { API_BASE_URL } from "./config";

export interface AppNotification {
  id: number;
  recipientId: number;
  senderId: number;
  objectId: number;
  type: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await fetch(`${API_BASE_URL}/api/notifications`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load notifications (${res.status})`);
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.notifications)) return [];
  return data.notifications as AppNotification[];
}

export async function markNotificationRead(id: number): Promise<void> {
  await fetch(`${API_BASE_URL}/api/notifications/read`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

export function labelForNotificationType(type: string): string {
  const map: Record<string, string> = {
    group_invitation: "Group invitation",
    group_join_request: "Join request",
    group_invitation_accepted: "Invitation accepted",
    group_invitation_declined: "Invitation declined",
    group_join_accepted: "Join request accepted",
    group_join_declined: "Join request declined",
    follow_request: "Follow request",
    follow: "New follower",
    event_creation: "Event",
    post: "Post",
    comment: "Comment",
    reaction: "Reaction",
    group: "Group",
  };
  return map[type] || type;
}
