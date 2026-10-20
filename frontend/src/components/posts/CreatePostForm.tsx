"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPost } from '@/app/lib/api/post';
import { getFollowers } from '@/app/lib/api/user';
import { User } from '@/app/lib/api/auth';
import { useToast } from '@/contexts/toastContext';

interface CreatePostFormProps {
  onPostCreated?: () => void;
}

const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp';

export const CreatePostForm = ({ onPostCreated }: CreatePostFormProps) => {
  const { showSuccess, showError } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState('public');
  const [followers, setFollowers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch followers when private is selected
  useEffect(() => {
    if (privacy === 'private' && followers.length === 0) {
      getFollowers().then(setFollowers);
    }
  }, [privacy]);

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

    const result = await createPost({
      title: title.trim(),
      content: content.trim(),
      privacy,
      ...(imageFile && { image: imageFile }),
      ...(privacy === 'private' && { allowedUsers: selectedUsers }),
    });

    if (result.success) {
      setTitle('');
      setContent('');
      setPrivacy('public');
      setSelectedUsers([]);
      removeImage();
      showSuccess('Posted', 'Your post is up.');
      onPostCreated?.();
    } else {
      const msg = result.error || 'Failed to create post';
      setError(msg);
      showError('Could not post', msg);
    }

    setIsSubmitting(false);
  };

  return (
    <div>
      {error && (
        <div className="mb-3 p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 text-base font-medium text-gray-900 border-0 border-b border-gray-200 focus:ring-0 focus:border-indigo-500 placeholder-gray-400 bg-transparent"
          placeholder="Title"
          disabled={isSubmitting}
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 text-sm text-gray-800 border-0 focus:ring-0 placeholder-gray-400 resize-none bg-transparent"
          placeholder="What's on your mind?"
          disabled={isSubmitting}
        />

        {imagePreview && (
          <div className="relative inline-block px-3">
            <img src={imagePreview} alt="" className="max-h-48 rounded-lg object-cover" />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-opacity-80"
            >
              x
            </button>
          </div>
        )}

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

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
            title="Add image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:inline">Image</span>
          </button>
          <input ref={fileInputRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="hidden" />

          <select
            value={privacy}
            onChange={(e) => { setPrivacy(e.target.value); setSelectedUsers([]); }}
            className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-md text-gray-700 hover:border-indigo-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            disabled={isSubmitting}
          >
            <option value="public">Public</option>
            <option value="almost_private">Followers</option>
            <option value="private">Private</option>
          </select>

          <button
            type="submit"
            disabled={isSubmitting}
            className="ml-auto bg-indigo-600 text-white py-1.5 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isSubmitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
};
