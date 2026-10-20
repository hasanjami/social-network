"use client";

import React, { useState, useEffect } from 'react';
import { Comment, getComments, deleteComment } from '@/app/lib/api/comment';
import { CommentForm } from './CommentForm';
import { useAuth } from '@/contexts/authContext';
import { useConfirm } from '@/contexts/confirmContext';
import { formatDate } from '@/app/lib/format';
import Link from 'next/link';

interface CommentSectionProps {
  postId: number;
}

export const CommentSection = ({ postId }: CommentSectionProps) => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchComments = async () => {
    setIsLoading(true);
    const result = await getComments(postId);
    if (result.success && result.comments) {
      setComments(result.comments);
    } else {
      setError(result.error || 'Failed to load comments');
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchComments(); }, [postId]);

  const handleDelete = async (commentId: number) => {
    const ok = await confirm({
      title: 'Delete comment?',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteComment(commentId);
    if (result.success) {
      setComments(prev => prev.filter(c => c.id !== commentId));
    }
  };

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Comments ({comments.length})</h3>

      <CommentForm postId={postId} onCommentCreated={fetchComments} />

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading comments...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2 flex-1">
                  <Link href={`/profile/${comment.author?.username}`} className="flex-shrink-0">
                    {comment.author?.avatarUrl ? (
                      <img src={comment.author.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover hover:opacity-80 transition-opacity" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center hover:opacity-80 transition-opacity">
                        <span className="text-indigo-600 text-xs font-semibold">
                          {comment.author?.firstName?.[0] ?? '?'}
                        </span>
                      </div>
                    )}
                  </Link>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <Link href={`/profile/${comment.author?.username}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600">
                        {comment.author?.firstName} {comment.author?.lastName}
                      </Link>
                      <span className="text-xs text-gray-400">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">{comment.content}</p>
                    {comment.image && (
                      <img
                        src={comment.image.startsWith('http') ? comment.image : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}${comment.image}`}
                        alt=""
                        className="mt-2 max-w-xs rounded-lg"
                      />
                    )}
                  </div>
                </div>
                {user?.id === comment.userId && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-xs text-red-500 hover:text-red-700 ml-2"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
