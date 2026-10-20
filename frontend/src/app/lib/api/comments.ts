import { API_BASE_URL } from "./config";

export interface CommentRow {
  id: number;
  postId: number;
  userId: number;
  content: string;
  image?: string | null;
  createdAt: string;
  author?: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
  };
}

export async function fetchComments(postId: number): Promise<CommentRow[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/comments?post_id=${postId}`,
    { method: "GET", credentials: "include" }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Failed (${res.status})`);
  }
  const data = await res.json();
  const raw = data?.comments;
  if (!Array.isArray(raw)) return [];
  return raw.map((c: Record<string, unknown>) => ({
    id: c.id as number,
    postId: (c.postId as number) ?? (c.post_id as number),
    userId: (c.userId as number) ?? (c.user_id as number),
    content: c.content as string,
    image: (c.image as string) || null,
    createdAt: (c.createdAt as string) || (c.created_at as string),
    author: c.author as CommentRow["author"],
  }));
}

export async function createComment(
  postId: number,
  content: string,
  imageFile?: File | null
): Promise<void> {
  const fd = new FormData();
  fd.set("postId", String(postId));
  fd.set("content", content);
  if (imageFile) fd.set("image", imageFile);

  const res = await fetch(`${API_BASE_URL}/api/comments`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Failed (${res.status})`);
  }
}

export async function deleteComment(commentId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/comments?id=${commentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Failed (${res.status})`);
  }
}
