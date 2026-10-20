"use client";

import React, { useState, useRef } from 'react';
import { createComment } from '@/app/lib/api/comment';
import { useToast } from '@/contexts/toastContext';

interface CommentFormProps {
  postId: number;
  onCommentCreated?: () => void;
}

const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp';

export const CommentForm = ({ postId, onCommentCreated }: CommentFormProps) => {
  const { showError } = useToast();
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!content.trim()) {
      setError('Comment cannot be empty');
      return;
    }

    setIsSubmitting(true);

    const result = await createComment({
      postId,
      content: content.trim(),
      ...(imageFile && { image: imageFile }),
    });

    if (result.success) {
      setContent('');
      removeImage();
      onCommentCreated?.();
    } else {
      const msg = result.error || 'Failed to post comment';
      setError(msg);
      showError('Could not comment', msg);
    }

    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
        placeholder="Write a comment..."
        disabled={isSubmitting}
      />

      {/* Image preview */}
      {imagePreview && (
        <div className="relative inline-block">
          <img src={imagePreview} alt="Preview" className="max-h-32 rounded-lg object-cover" />
          <button
            type="button"
            onClick={removeImage}
            className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-opacity-80"
          >
            x
          </button>
        </div>
      )}

      <div className="flex items-center space-x-2">
        {/* Image upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSubmitting}
          className="flex items-center space-x-1 text-gray-400 hover:text-indigo-500 transition-colors"
          title="Attach image or GIF"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="ml-auto bg-indigo-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-indigo-700 disabled:bg-gray-400"
        >
          {isSubmitting ? 'Posting...' : 'Comment'}
        </button>
      </div>
    </form>
  );
};
