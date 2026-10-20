"use client";

import React, { useState } from 'react';
import { Post, toggleLike } from '@/app/lib/api/post';
import { formatDate } from '@/app/lib/format';
import { useAuth } from '@/contexts/authContext';
import { useConfirm } from '@/contexts/confirmContext';
import Link from 'next/link';

interface PostCardProps {
  post: Post;
  onEdit?: (post: Post) => void;
  onDelete?: (postId: number) => void;
}

const privacyLabel: Record<string, string> = {
  public: 'Public',
  private: 'Private',
  almost_private: 'Followers',
  specific: 'Specific',
};

export const PostCard = ({ post, onEdit, onDelete }: PostCardProps) => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [isLiked, setIsLiked] = useState(post.isLiked ?? false);
  const [isLiking, setIsLiking] = useState(false);
  const isAuthor = user?.id === post.user_id;

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    // Optimistic update
    setIsLiked(prev => !prev);
    setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
    const result = await toggleLike(post.id);
    if (result.success) {
      setIsLiked(result.liked!);
      setLikeCount(result.count!);
    } else {
      // Revert on failure
      setIsLiked(prev => !prev);
      setLikeCount(prev => isLiked ? prev + 1 : prev - 1);
    }
    setIsLiking(false);
  };

  // Backend returns author.avatar as a path; resolve to full URL
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const avatarUrl = post.author?.avatarUrl
    || (post.author?.avatar ? `${API_BASE}${post.author.avatar}` : null);

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Delete post?',
      body: 'This cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setIsDeleting(true);
    await onDelete(post.id);
    setIsDeleting(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {avatarUrl ? (
            <Link href={`/profile/${post.author?.username}`}>
              <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover hover:opacity-80 transition-opacity" />
            </Link>
          ) : (
            <Link href={`/profile/${post.author?.username}`}>
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center hover:opacity-80 transition-opacity">
                <span className="text-indigo-600 font-semibold text-sm">
                  {post.author?.firstName?.[0] ?? '?'}
                </span>
              </div>
            </Link>
          )}
          <div>
            <Link href={`/profile/${post.author?.username}`} className="font-semibold text-gray-900 hover:text-indigo-600 text-sm">
              {post.author?.firstName} {post.author?.lastName}
            </Link>
            <p className="text-xs text-gray-500">
              {formatDate(post.created_at)}
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {privacyLabel[post.privacy] ?? post.privacy}
        </span>
      </div>

      {/* Content */}
      <Link href={`/posts/${post.id}`}>
        <h3 className="text-lg font-bold text-gray-900 mb-1 hover:text-indigo-600">{post.title}</h3>
        <p className="text-gray-700 text-sm whitespace-pre-wrap line-clamp-3">{post.content}</p>
      </Link>

      {post.image && (
        <img
          src={post.image.startsWith('http') ? post.image : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}${post.image}`}
          alt=""
          className="mt-3 w-full max-h-80 object-cover rounded-lg"
        />
      )}

      {/* Like + Comment buttons */}
      <div className="flex items-center mt-4 pt-3 border-t border-gray-100 space-x-4">
        {/* Like */}
        <button
          onClick={handleLike}
          disabled={isLiking}
          className={`flex items-center space-x-1.5 text-sm font-medium transition-colors ${
            isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill={isLiked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span>{likeCount}</span>
        </button>

        {/* Comment - navigates to post detail where comments live */}
        <Link
          href={`/posts/${post.id}`}
          className="flex items-center space-x-1.5 text-sm font-medium text-gray-500 hover:text-indigo-500 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>{post.commentCount ?? 0}</span>
        </Link>

        {/* Edit/Delete for author */}
        {isAuthor && (
          <div className="flex space-x-2 ml-auto">
            {onEdit && (
              <button onClick={() => onEdit(post)} className="text-sm text-indigo-600 hover:underline">
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-sm text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
