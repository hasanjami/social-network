"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Post, updatePost, UpdatePostData, getAllowedViewers } from '@/app/lib/api/post';
import { getFollowers } from '@/app/lib/api/user';
import { User } from '@/app/lib/api/auth';

interface EditPostModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
  onPostUpdated?: () => void;
}

const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp';

export const EditPostModal = ({ post, isOpen, onClose, onPostUpdated }: EditPostModalProps) => {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(post.image || null);
  const [privacy, setPrivacy] = useState(post.privacy);
  const [followers, setFollowers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch followers and allowed viewers when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle(post.title);
      setContent(post.content);
      setImagePreview(post.image || null);
      setImageFile(null);
      setPrivacy(post.privacy);
      setError('');
      
      // Fetch followers
      getFollowers().then(setFollowers);
      
      // Fetch allowed viewers if post is private
      if (post.privacy === 'private') {
        getAllowedViewers(post.id).then(result => {
          if (result.success && result.allowedUsers) {
            setSelectedUsers(result.allowedUsers);
          }
        });
      } else {
        setSelectedUsers([]);
      }
    }
  }, [isOpen, post]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Only image files (JPEG, PNG, GIF, WebP) are allowed');
      return;
    }
    setError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleUser = (id: number) => {
    setSelectedUsers(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }

    if (privacy === 'private' && selectedUsers.length === 0) {
      setError('Select at least one follower who can see this post');
      return;
    }

    setIsSubmitting(true);

    const updateData: UpdatePostData = {
      title: title.trim(),
      content: content.trim(),
      privacy,
      ...(imageFile && { imageFile }),
      ...(privacy === 'private' && { allowedUsers: selectedUsers }),
    };

    const result = await updatePost(post.id, updateData);

    if (result.success) {
      if (onPostUpdated) {
        onPostUpdated();
      }
      onClose();
    } else {
      setError(result.error || 'Failed to update post');
    }

    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Edit Post</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
              disabled={isSubmitting}
            >
              x
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title Input */}
            <div>
              <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Post title"
                disabled={isSubmitting}
              />
            </div>

            {/* Content Textarea */}
            <div>
              <label htmlFor="edit-content" className="block text-sm font-medium text-gray-700 mb-1">
                Content
              </label>
              <textarea
                id="edit-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                placeholder="What's on your mind?"
                disabled={isSubmitting}
              />
            </div>

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image (optional)</label>
              {imagePreview ? (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-opacity-80"
                  >
                    x
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="flex items-center space-x-2 px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Upload image or GIF</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="hidden" />
            </div>

            {/* Privacy Selector */}
            <div>
              <label htmlFor="edit-privacy" className="block text-sm font-medium text-gray-700 mb-1">
                Privacy
              </label>
              <select
                id="edit-privacy"
                value={privacy}
                onChange={(e) => { setPrivacy(e.target.value as any); setSelectedUsers([]); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={isSubmitting}
              >
                <option value="public"> Public - visible to everyone</option>
                <option value="almost_private"> Followers Only - visible to your followers</option>
                <option value="private"> Private - choose specific followers</option>
              </select>
            </div>

            {/* Follower picker - only shown when private */}
            {privacy === 'private' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Choose who can see this post
                  {selectedUsers.length > 0 && (
                    <span className="ml-2 text-indigo-600">({selectedUsers.length} selected)</span>
                  )}
                </label>
                {followers.length === 0 ? (
                  <p className="text-sm text-gray-500">You have no followers yet.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                    {followers.map(follower => {
                      const selected = selectedUsers.includes(follower.id);
                      return (
                        <button
                          key={follower.id}
                          type="button"
                          onClick={() => toggleUser(follower.id)}
                          className={`w-full flex items-center space-x-3 px-3 py-2 text-left transition-colors ${
                            selected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          {follower.avatarUrl ? (
                            <img src={follower.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-indigo-600 text-sm font-semibold">
                                {follower.firstName?.[0]}
                              </span>
                            </div>
                          )}
                          <span className="text-sm text-gray-900 flex-1">
                            {follower.firstName} {follower.lastName}
                            <span className="text-gray-400 ml-1">@{follower.username}</span>
                          </span>
                          {selected && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {isSubmitting ? 'Updating...' : 'Update Post'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
