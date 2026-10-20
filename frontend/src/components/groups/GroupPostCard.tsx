"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GroupPostItem } from "@/app/lib/api/posts";
import {
  fetchComments,
  createComment,
  deleteComment,
  type CommentRow,
} from "@/app/lib/api/comments";
import { deletePost } from "@/app/lib/api/posts";
import { absoluteMediaUrl } from "@/app/lib/media";
import { formatDate } from "@/app/lib/format";
import { useConfirm } from "@/contexts/confirmContext";

type SafeAuthor = {
  id?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
};

export default function GroupPostCard({
  item,
  groupCreatorId,
  currentUserId,
  onPostDeleted,
}: {
  item: GroupPostItem;
  groupCreatorId: number;
  currentUserId: number;
  onPostDeleted: () => void;
}) {
  const { post } = item;
  const confirm = useConfirm();
  const author = item.author as SafeAuthor | undefined;
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const list = await fetchComments(post.id);
      setComments(list);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, [post.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleDeletePost = async () => {
    const ok = await confirm({
      title: "Delete post?",
      body: "This cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deletePost(post.id);
      onPostDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !imageFile) return;
    setSubmitting(true);
    try {
      await createComment(post.id, content.trim() || " ", imageFile);
      setContent("");
      removeImage();
      await loadComments();
    } finally {
      setSubmitting(false);
    }
  };

  const canDeleteComment = (c: CommentRow) => {
    return (
      c.userId === currentUserId ||
      post.user_id === currentUserId ||
      groupCreatorId === currentUserId
    );
  };

  const displayName = (
    a?: SafeAuthor | CommentRow["author"] | null,
    fallback?: string
  ) => {
    if (!a) return fallback || "User";
    if (a.username) return `@${a.username}`;
    const n = [a.firstName, a.lastName].filter(Boolean).join(" ");
    return n || fallback || "User";
  };

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{post.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {displayName(author)} -{" "}
            {post.created_at
              ? formatDate(post.created_at, 'full')
              : ""}
          </p>
        </div>
        {post.user_id === currentUserId && (
          <button
            type="button"
            disabled={deleting}
            onClick={handleDeletePost}
            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "..." : "Delete post"}
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">{post.content}</p>
      {post.image && (
        <img
          src={absoluteMediaUrl(post.image)}
          alt=""
          className="mt-3 max-h-80 rounded-md border border-gray-100 object-contain"
        />
      )}

      <div className="mt-4 border-t border-gray-100 pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Comments
        </h4>
        {loadingComments ? (
          <p className="text-sm text-gray-500 mt-2">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2">No comments yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-md bg-gray-50 px-3 py-2 text-sm flex justify-between gap-2"
              >
                <div>
                  <span className="font-medium text-gray-800">
                    {displayName(c.author, `#${c.userId}`)}
                  </span>
                  <p className="text-gray-700 mt-0.5">{c.content}</p>
                  {c.image && (
                    <img
                      src={absoluteMediaUrl(c.image)}
                      alt=""
                      className="mt-1 max-h-40 rounded border border-gray-200"
                    />
                  )}
                </div>
                {canDeleteComment(c) && (
                  <button
                    type="button"
                    className="text-xs text-red-600 shrink-0"
                    onClick={async () => {
                      await deleteComment(c.id);
                      await loadComments();
                    }}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddComment} className="mt-3 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a comment..."
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
          {imagePreview && (
            <div className="relative inline-block">
              <img src={imagePreview} alt="" className="max-h-32 rounded-md object-cover border border-gray-200" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-opacity-80"
              >
                x
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600"
              title="Attach image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {imageFile ? imageFile.name.slice(0, 20) : "Image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="submit"
              disabled={submitting || (!content.trim() && !imageFile)}
              className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Posting..." : "Comment"}
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}
