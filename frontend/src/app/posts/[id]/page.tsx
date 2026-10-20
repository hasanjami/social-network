"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/authContext';
import { useConfirm } from '@/contexts/confirmContext';
import { useToast } from '@/contexts/toastContext';
import { Post, getPost, deletePost, toggleLike } from '@/app/lib/api/post';
import { CommentSection } from '@/components/posts/CommentSection';
import { EditPostModal } from '@/components/posts/EditPostModal';
import { formatDate } from '@/app/lib/format';
import Link from 'next/link';

const privacyLabel: Record<string, string> = {
  public: 'Public',
  private: 'Private',
  almost_private: 'Followers',
  specific: 'Specific',
};

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const confirm = useConfirm();
  const { showError } = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPost, setEditingPost] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  const postId = params?.id ? parseInt(params.id as string) : null;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (postId && isAuthenticated) {
      fetchPost();
    }
  }, [postId, isAuthenticated]);

  const fetchPost = async () => {
    if (!postId) return;
    setIsLoading(true);
    const result = await getPost(postId);
    if (result.success && result.post) {
      setPost(result.post);
      setLikeCount(result.post.likeCount ?? 0);
      setIsLiked(result.post.isLiked ?? false);
    } else {
      setError(result.error || 'Post not found');
    }
    setIsLoading(false);
  };

  const handleLike = async () => {
    if (!post || isLiking) return;
    setIsLiking(true);
    setIsLiked(prev => !prev);
    setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
    const result = await toggleLike(post.id);
    if (result.success) {
      setIsLiked(result.liked!);
      setLikeCount(result.count!);
    } else {
      setIsLiked(prev => !prev);
      setLikeCount(prev => isLiked ? prev + 1 : prev - 1);
    }
    setIsLiking(false);
  };

  const handleDelete = async () => {
    if (!post) return;
    const ok = await confirm({
      title: 'Delete post?',
      body: 'This cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const result = await deletePost(post.id);
    if (result.success) {
      router.push('/home');
    } else {
      showError('Could not delete', result.error || 'Failed to delete post');
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Post not found'}</p>
          <button onClick={() => router.push('/home')} className="bg-indigo-600 text-white px-4 py-2 rounded-md">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const isAuthor = user?.id === post.user_id;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={() => router.back()} className="text-indigo-600 hover:underline text-sm mb-6 block">
          back  Back
        </button>

        <div className="bg-white rounded-lg shadow-md p-8">
          {/* Author */}
          <div className="flex items-center justify-between mb-6">
            <Link href={`/profile/${post.author?.username}`} className="flex items-center space-x-3 group">
              {post.author?.avatar || post.author?.avatarUrl ? (
                <img
                  src={post.author.avatarUrl || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}${post.author.avatar}`}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover group-hover:opacity-80 transition-opacity"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center group-hover:opacity-80 transition-opacity">
                  <span className="text-indigo-600 font-semibold">{post.author?.firstName?.[0] ?? '?'}</span>
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900 group-hover:text-indigo-600">
                  {post.author?.firstName} {post.author?.lastName}
                </p>
                <p className="text-xs text-gray-500">{formatDate(post.created_at)}</p>
              </div>
            </Link>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {privacyLabel[post.privacy] ?? post.privacy}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">{post.title}</h1>
          <p className="text-gray-700 whitespace-pre-wrap mb-4">{post.content}</p>

          {post.image && (
            <img
              src={post.image.startsWith('http') ? post.image : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}${post.image}`}
              alt=""
              className="w-full rounded-lg mb-4"
            />
          )}

          {isAuthor && (
            <div className="flex space-x-3 pt-4 border-t border-gray-100">
              <button onClick={() => setEditingPost(true)} className="text-sm text-indigo-600 hover:underline">
                Edit
              </button>
              <button onClick={handleDelete} className="text-sm text-red-600 hover:underline">
                Delete
              </button>
            </div>
          )}

          {/* Like button */}
          <div className="flex items-center mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={`flex items-center space-x-2 text-sm font-medium transition-colors ${
                isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill={isLiked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
            </button>
          </div>

          <CommentSection postId={post.id} />
        </div>

        {editingPost && (
          <EditPostModal
            post={post}
            isOpen={true}
            onClose={() => setEditingPost(false)}
            onPostUpdated={fetchPost}
          />
        )}
      </div>
    </div>
  );
}
