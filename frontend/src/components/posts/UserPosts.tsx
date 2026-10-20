"use client";

import React, { useState, useEffect } from 'react';
import { Post, getUserPosts, deletePost } from '@/app/lib/api/post';
import { PostCard } from './PostCard';
import { EditPostModal } from './EditPostModal';

interface UserPostsProps {
  userId?: number;
}

export const UserPosts = ({ userId }: UserPostsProps) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  const fetchPosts = async () => {
    setIsLoading(true);
    setError('');
    
    const result = await getUserPosts(userId);
    
    if (result.success && result.posts) {
      setPosts(result.posts);
    } else {
      setError(result.error || 'Failed to load posts');
    }
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchPosts();
  }, [userId]);

  const handleEdit = (post: Post) => {
    setEditingPost(post);
  };

  const handleDelete = async (postId: number) => {
    const result = await deletePost(postId);
    
    if (result.success) {
      setPosts(posts.filter(p => p.id !== postId));
    } else {
      alert(result.error || 'Failed to delete post');
    }
  };

  const handlePostUpdated = () => {
    fetchPosts();
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="mt-4 text-gray-600">Loading posts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchPosts}
          className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      {posts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <p className="text-gray-600 text-lg">No posts yet.</p>
        </div>
      ) : (
        <div>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {editingPost && (
        <EditPostModal
          post={editingPost}
          isOpen={!!editingPost}
          onClose={() => setEditingPost(null)}
          onPostUpdated={handlePostUpdated}
        />
      )}
    </div>
  );
};
