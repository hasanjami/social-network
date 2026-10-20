"use client";

import React, { useState, useEffect } from 'react';
import { User } from '@/app/lib/api/auth';
import { API_BASE_URL } from '@/app/lib/api/config';
import Link from 'next/link';
import UserList from './UserList';
import { UserPosts } from '@/components/posts/UserPosts';

interface UserProfileProps {
  user: User;
  isOwnProfile?: boolean;
  followState?: 'none' | 'following' | 'pending';
  onFollow?: () => Promise<void>;
  onUnfollow?: () => Promise<void>;
  onMessage?: () => void;
}

const UserProfile = ({ 
  user, 
  isOwnProfile = false,
  followState = 'none',
  onFollow, 
  onUnfollow, 
  onMessage 
}: UserProfileProps) => {
  const [activeTab, setActiveTab] = useState<'posts' | 'followers' | 'following'>('posts');
  const [isProcessing, setIsProcessing] = useState(false);
  const [postCount, setPostCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/user/id?id=${user.id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const n = typeof d.postCount === 'number'
          ? d.postCount
          : d?.stats?.postCount;
        if (typeof n === 'number') setPostCount(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user.id]);

  const handleFollowClick = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      if (followState === 'none') {
        await onFollow?.();
      } else {
        await onUnfollow?.();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const [pendingHovered, setPendingHovered] = useState(false);

  const getFollowButtonText = () => {
    if (isProcessing) {
      return followState === 'none' ? 'Following...' : 'Unfollowing...';
    }
    if (followState === 'pending') return pendingHovered ? 'Cancel request' : 'Pending';
    if (followState === 'following') return 'Following';
    return 'Follow';
  };

  const getFollowButtonStyle = () => {
    if (followState === 'none') {
      return 'bg-indigo-600 text-white hover:bg-indigo-700';
    }
    return 'bg-gray-200 text-gray-900 hover:bg-gray-300';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="max-w-4xl mx-auto bg-white">
      {/* Profile Header */}
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-start md:items-center space-y-6 md:space-y-0 md:space-x-8">
          {/* Profile Picture */}
          <div className="flex-shrink-0">
            <div className="relative">
              {user.avatarUrl ? (
                <img
                  className="h-32 w-32 md:h-40 md:w-40 rounded-full object-cover border-4 border-gray-200"
                  src={user.avatarUrl}
                  alt={`${user.firstName} ${user.lastName}`}
                />
              ) : (
                <div className="h-32 w-32 md:h-40 md:w-40 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center border-4 border-gray-200">
                  <span className="text-4xl md:text-5xl font-bold text-white">
                    {user.firstName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-4">
                  <h1 className="text-2xl font-light text-gray-900">
                    {user.username}
                  </h1>
                  
                  {!isOwnProfile && (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleFollowClick}
                        onMouseEnter={() => setPendingHovered(true)}
                        onMouseLeave={() => setPendingHovered(false)}
                        disabled={isProcessing}
                        title={followState === 'pending' ? 'Click to cancel your follow request' : undefined}
                        className={`px-6 py-1.5 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${getFollowButtonStyle()}`}
                      >
                        {getFollowButtonText()}
                      </button>
                      {followState === 'following' && (
                        <button
                          onClick={onMessage}
                          className="px-6 py-1.5 text-sm font-semibold bg-gray-200 text-gray-900 rounded-md hover:bg-gray-300 transition-colors"
                        >
                          Message
                        </button>
                      )}
                    </div>
                  )}

                  {isOwnProfile && (
                    <Link
                      href="/profile/edit"
                      className="px-6 py-1.5 text-sm font-semibold bg-gray-200 text-gray-900 rounded-md hover:bg-gray-300 transition-colors"
                    >
                      Edit Profile
                    </Link>
                  )}
                </div>

                {/* Stats */}
                <div className="flex space-x-8 mb-4">
                  <div className="text-center">
                    <span className="block text-lg font-semibold text-gray-900">{postCount}</span>
                    <span className="block text-sm text-gray-500">posts</span>
                  </div>
                  <button 
                    onClick={() => setActiveTab('followers')}
                    className="text-center hover:text-gray-700 transition-colors"
                  >
                    <span className="block text-lg font-semibold text-gray-900">
                      {user.followers || 0}
                    </span>
                    <span className="block text-sm text-gray-500">followers</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('following')}
                    className="text-center hover:text-gray-700 transition-colors"
                  >
                    <span className="block text-lg font-semibold text-gray-900">
                      {user.following || 0}
                    </span>
                    <span className="block text-sm text-gray-500">following</span>
                  </button>
                </div>

                {/* Bio */}
                <div className="space-y-1">
                  <h2 className="font-semibold text-gray-900">
                    {user.firstName} {user.lastName}
                  </h2>
                  {user.nickname && (
                    <p className="text-gray-600">"{user.nickname}"</p>
                  )}
                  {user.aboutMe && (
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {user.aboutMe}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    Joined {formatDate(user.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-t border-gray-200">
        <nav className="flex justify-center space-x-8">
          <button
            onClick={() => setActiveTab('posts')}
            className={`py-4 px-1 border-t-2 font-medium text-sm transition-colors ${
              activeTab === 'posts'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
              </svg>
              <span>POSTS</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab('followers')}
            className={`py-4 px-1 border-t-2 font-medium text-sm transition-colors ${
              activeTab === 'followers'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              <span>FOLLOWERS</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab('following')}
            className={`py-4 px-1 border-t-2 font-medium text-sm transition-colors ${
              activeTab === 'following'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
              </svg>
              <span>FOLLOWING</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Content Area */}
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        {activeTab === 'posts' && (
          <UserPosts userId={user.id} />
        )}

        {activeTab === 'followers' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Followers</h3>
            <UserList type="followers" userId={user.id} isOwnProfile={isOwnProfile} />
          </div>
        )}

        {activeTab === 'following' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Following</h3>
            <UserList type="following" userId={user.id} isOwnProfile={isOwnProfile} />
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;