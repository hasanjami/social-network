import { API_BASE_URL } from "./config";
import type { User } from "./auth";

export interface Post {
  id: number;
  user_id: number;
  title: string;
  content: string;
  image?: string | null;
  privacy: string;
  group_id?: number | null;
  created_at: string;
}

export interface GroupPostItem {
  post: Post;
  author?: User | Record<string, unknown>;
}

export async function createPost(body: {
  title: string;
  content: string;
  privacy: "public" | "private" | "almost_private";
  group_id: number;
  image?: File | null;
}): Promise<{ success: boolean; post?: Post }> {
  const form = new FormData();
  form.append("title", body.title);
  form.append("content", body.content);
  form.append("privacy", body.privacy);
  form.append("group_id", String(body.group_id));
  if (body.image) form.append("image", body.image);

  const res = await fetch(`${API_BASE_URL}/api/posts`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const raw = await res.text();
  let data: { message?: string; success?: boolean; post?: Post } = {};
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {};
  } catch {
    /* */
  }
  if (!res.ok) {
    throw new Error(data.message || raw || `Failed (${res.status})`);
  }
  return { success: data.success ?? true, post: data.post };
}

export async function fetchGroupPosts(groupId: number): Promise<GroupPostItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/posts`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Failed (${res.status})`);
  }
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.posts)) return [];
  return data.posts as GroupPostItem[];
}

export async function deletePost(postId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/posts?id=${postId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Failed (${res.status})`);
  }
}
