"use client";

import { useState, useEffect } from "react";
import { User } from "@/app/lib/api/auth";
import { getFollowers, getFollowing, followUser, unfollowUser } from "@/app/lib/api/user";
import Link from "next/link";

interface UserListProps {
  type: 'followers' | 'following';
  userId?: number;
  isOwnProfile?: boolean;
}

export default function UserList({ type, userId, isOwnProfile = false }: UserListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchUsers();
  }, [type, userId]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const data = type === 'followers' 
        ? await getFollowers(userId) 
        : await getFollowing(userId);
      setUsers(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollow = async (targetUserId: number) => {
    setProcessingIds(prev => new Set(prev).add(targetUserId));
    const success = await followUser(targetUserId);
    
    if (success) {
      setUsers(prev => prev.map(u => 
        u.id === targetUserId ? { ...u, isFollowed: true } : u
      ));
    }
    
    setProcessingIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(targetUserId);
      return newSet;
    });
  };

  const handleUnfollow = async (targetUserId: number) => {
    setProcessingIds(prev => new Set(prev).add(targetUserId));
    const success = await unfollowUser(targetUserId);
    
    if (success) {
      setUsers(prev => prev.map(u => 
        u.id === targetUserId ? { ...u, isFollowed: false } : u
      ));
    }
    
    setProcessingIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(targetUserId);
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
        </div>
        <h3 className="text-xl font-light text-gray-900 mb-2">
          {type === 'followers' ? 'No Followers Yet' : 'Not Following Anyone'}
        </h3>
        <p className="text-gray-500">
          {isOwnProfile 
            ? (type === 'followers' 
                ? "When people follow you, you'll see them here." 
                : "When you follow people, you'll see them here.")
            : (type === 'followers'
                ? "This user has no followers yet."
                : "This user isn't following anyone yet.")
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {users.map((user) => (
        <div key={user.id} className="flex items-center justify-between py-2">
          <Link href={`/profile/${user.username}`} className="flex items-center space-x-3 flex-1">
            {user.avatarUrl ? (
              <img
                className="h-12 w-12 rounded-full object-cover"
                src={user.avatarUrl}
                alt={user.username}
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-lg font-bold text-white">
                  {user.firstName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-sm text-gray-500">@{user.username}</p>
            </div>
          </Link>
          {!isOwnProfile && (
            <button
              onClick={() => user.isFollowed ? handleUnfollow(user.id) : handleFollow(user.id)}
              disabled={processingIds.has(user.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                user.isFollowed
                  ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {processingIds.has(user.id) 
                ? (user.isFollowed ? 'Unfollowing...' : 'Following...') 
                : (user.isFollowed ? 'Following' : 'Follow')
              }
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
