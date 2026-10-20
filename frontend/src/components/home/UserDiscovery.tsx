"use client";

import { getAllUsers, searchUsers, unfollowUser } from "@/app/lib/api/user";
import { User } from "@/app/lib/api/auth";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useFollowNotifications } from "@/hooks/useFollowNotifications";
import { useAuth } from "@/contexts/authContext";
import { useToast } from "@/contexts/toastContext";

interface UserWithFollowState extends User {
  followState: 'none' | 'following' | 'pending';
  isProcessing?: boolean;
}

export default function UserDiscovery() {
  const { user: currentUser, updateUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState<UserWithFollowState[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithFollowState[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch all users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      const allUsers = await getAllUsers();
      // Backend now returns followState, map it to our state
      const usersWithState = allUsers.map(user => ({
        ...user,
        followState: user.followState === 'following' ? 'following' as const :
                     user.followState === 'pending' ? 'pending' as const :
                     'none' as const,
        isProcessing: false,
      }));
      setUsers(usersWithState);
      setFilteredUsers(usersWithState.slice(0, 8));
      setIsLoading(false);
    };

    fetchUsers();
  }, []);

  // Listen for real-time follow notifications
  useFollowNotifications({
    onFollowAccepted: (data) => {
      // Update the user's follow state from pending to following
      const updateUser = (user: UserWithFollowState) =>
        user.id === data.fromUserId ? { ...user, followState: 'following' as const } : user;
      
      setUsers(prev => prev.map(updateUser));
      setFilteredUsers(prev => prev.map(updateUser));
      
      // If this is about the current user's follow request being accepted, update following count
      if (currentUser && data.fromUserId) {
        // This depends on your WebSocket message structure
        // You might need to increment following count here
      }
    },
    onFollowDeclined: (data) => {
      // Update the user's follow state from pending to none
      const updateUser = (user: UserWithFollowState) =>
        user.id === data.fromUserId ? { ...user, followState: 'none' as const } : user;
      
      setUsers(prev => prev.map(updateUser));
      setFilteredUsers(prev => prev.map(updateUser));
    },
  });

  // Handle search
  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.trim() === "") {
        setFilteredUsers(users.slice(0, 8));
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      const results = await searchUsers(searchQuery);
      // Backend now returns followState
      const resultsWithState = results.map(user => ({
        ...user,
        followState: user.followState === 'following' ? 'following' as const :
                     user.followState === 'pending' ? 'pending' as const :
                     'none' as const,
        isProcessing: false,
      }));
      setFilteredUsers(resultsWithState);
      setIsSearching(false);
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, users]);

  const handleFollow = async (userId: number) => {
    const updateFollowState = (state: 'following' | 'pending' | 'none', processing: boolean) => {
      const updateUser = (user: UserWithFollowState) =>
        user.id === userId ? { ...user, followState: state, isProcessing: processing } : user;
      
      setUsers(prev => prev.map(updateUser));
      setFilteredUsers(prev => prev.map(updateUser));
    };

    // Set processing state but keep current follow state
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isProcessing: true } : u));
    setFilteredUsers(prev => prev.map(u => u.id === userId ? { ...u, isProcessing: true } : u));
    
    try {
      const response = await fetch(`http://localhost:8080/api/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ followedId: userId }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        const newState = data.status === 'pending' ? 'pending' : 'following';
        updateFollowState(newState, false);

        if (data.currentUserFollowingCount !== undefined) {
          updateUser({ following: data.currentUserFollowingCount });
        }

        if (newState === 'pending') {
          showSuccess('Request sent', 'Waiting for them to accept.');
        } else {
          showSuccess('Following', 'You will now see their public posts.');
        }
      } else {
        updateFollowState('none', false);
        showError('Could not follow', 'Please try again.');
      }
    } catch (error) {
      console.error('Follow error:', error);
      updateFollowState('none', false);
      showError('Network error', 'Could not reach the server.');
    }
  };

  const handleUnfollow = async (userId: number) => {
    const updateFollowState = (state: 'none' | 'following' | 'pending', processing: boolean) => {
      const updateUser = (user: UserWithFollowState) =>
        user.id === userId ? { ...user, followState: state, isProcessing: processing } : user;
      
      setUsers(prev => prev.map(updateUser));
      setFilteredUsers(prev => prev.map(updateUser));
    };

    updateFollowState('following', true);
    
    try {
      const response = await fetch(`http://localhost:8080/api/unfollow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ followedId: userId }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        updateFollowState('none', false);

        if (data.currentUserFollowingCount !== undefined) {
          updateUser({ following: data.currentUserFollowingCount });
        } else if (currentUser) {
          updateUser({ following: currentUser.following - 1 });
        }

        showSuccess('Unfollowed', 'You will no longer see their posts.');
      } else {
        updateFollowState('following', false);
        showError('Could not unfollow', 'Please try again.');
      }
    } catch (error) {
      console.error('Unfollow error:', error);
      updateFollowState('following', false);
      showError('Network error', 'Could not reach the server.');
    }
  };

  return (
    <div>
      {/* Section Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Discover People
        </h2>
        <p className="text-gray-600">
          Find and connect with other users on the platform
        </p>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search users by name or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm shadow-sm"
          />
          {isSearching && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <svg
                className="animate-spin h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Section Title */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          {searchQuery ? `Search Results for "${searchQuery}"` : 'Suggested Users'}
        </h3>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {/* Users Grid */}
      {!isLoading && (
        <>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No users found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery
                  ? "Try adjusting your search query"
                  : "No other users on the platform yet"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200 overflow-hidden"
                >
                  <Link href={`/profile/${user.username}`} className="block p-6">
                    <div className="flex flex-col items-center">
                      {/* Avatar */}
                      {user.avatarUrl ? (
                        <img
                          className="h-20 w-20 rounded-full object-cover border-2 border-gray-200"
                          src={user.avatarUrl}
                          alt={`${user.firstName} ${user.lastName}`}
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center border-2 border-gray-200">
                          <span className="text-2xl font-bold text-white">
                            {user.firstName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}

                      {/* User Info */}
                      <div className="mt-4 text-center">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {user.firstName} {user.lastName}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          @{user.username}
                        </p>
                        {user.aboutMe && (
                          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                            {user.aboutMe}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* Follow/Unfollow Button */}
                  <div className="px-6 pb-6">
                    {user.followState === 'none' ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleFollow(user.id);
                        }}
                        disabled={user.isProcessing}
                        className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {user.isProcessing ? 'Following...' : 'Follow'}
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleUnfollow(user.id);
                        }}
                        disabled={user.isProcessing}
                        className="w-full px-4 py-2 bg-gray-200 text-gray-900 text-sm font-medium rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {user.isProcessing ? 'Unfollowing...' : user.followState === 'pending' ? 'Pending' : 'Following'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results Count */}
          {filteredUsers.length > 0 && !searchQuery && users.length > 8 && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500 mb-3">
                Showing {filteredUsers.length} of {users.length} users
              </p>
              <button
                onClick={() => setFilteredUsers(users)}
                className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
              >
                Show all users
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}