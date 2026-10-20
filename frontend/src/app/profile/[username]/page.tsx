"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Navigation from '@/components/layout/Navigation';
import UserProfile from '@/components/profile/UserProfile';
import { getUserProfile, followUser, unfollowUser, ProfileResponse } from '@/app/lib/api/user';
import { useAuth } from '@/contexts/authContext';

export default function DynamicProfilePage() {
  const params = useParams();
  const username = params?.username as string;
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingHovered, setPendingHovered] = useState(false);

  useEffect(() => {
    if (!username || authLoading || !isAuthenticated) return;
    setLoading(true);
    getUserProfile(username)
      .then((data) => setProfile(data))
      .catch(err => console.error('Failed to load profile', err))
      .finally(() => setLoading(false));
  }, [username, authLoading, isAuthenticated]);

  const getFollowState = (): 'none' | 'following' | 'pending' => {
    if (!profile) return 'none';
    if (profile.isPending) return 'pending';
    if (profile.isFollowing) return 'following';
    return 'none';
  };

  const handleFollow = async () => {
    if (!profile) return;
    const result = await followUser(profile.user.id);
    if (result.success) {
      const isPending = result.status === 'pending';
      setProfile({
        ...profile,
        isFollowing: !isPending,
        isPending: isPending,
        followers: isPending ? profile.followers : profile.followers + 1,
        user: {
          ...profile.user,
          followers: isPending ? profile.user.followers : profile.user.followers + 1,
        },
      });
    }
  };

  const handleUnfollow = async () => {
    if (!profile) return;
    const wasFollowing = profile.isFollowing;
    const ok = await unfollowUser(profile.user.id);
    if (ok) {
      setProfile({
        ...profile,
        user: {
          ...profile.user,
          followers: wasFollowing ? Math.max(0, profile.user.followers - 1) : profile.user.followers,
        },
        isFollowing: false,
        isPending: false,
        followers: wasFollowing ? Math.max(0, profile.followers - 1) : profile.followers,
      });
    }
  };

  const handleMessage = () => {
  };

  if (loading) {
    return (
      <ProtectedRoute requireAuth={true} redirectTo="/">
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <div className="p-8 text-center">Loading profile...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!profile) {
    return (
      <ProtectedRoute requireAuth={true} redirectTo="/">
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <div className="p-8 text-center">User not found.</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!profile.canView) {
    const state = getFollowState();
    return (
      <ProtectedRoute requireAuth={true} redirectTo="/">
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <main className="max-w-2xl mx-auto py-8 px-4">
            <div className="bg-white rounded-lg shadow p-8 text-center">
              {profile.user.avatarUrl ? (
                <img
                  src={profile.user.avatarUrl}
                  alt=""
                  className="h-24 w-24 rounded-full object-cover mx-auto border-2 border-gray-200"
                />
              ) : (
                <div className="h-24 w-24 rounded-full mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">
                    {profile.user.firstName?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <h1 className="mt-4 text-xl font-semibold text-gray-900">
                {profile.user.firstName} {profile.user.lastName}
              </h1>
              <p className="text-sm text-gray-500">@{profile.user.username}</p>
              <p className="mt-6 text-sm text-gray-600">
                This profile is private. Follow to see their posts and activity.
              </p>
              <button
                onClick={state === "none" ? handleFollow : state === "pending" ? handleUnfollow : undefined}
                onMouseEnter={() => setPendingHovered(true)}
                onMouseLeave={() => setPendingHovered(false)}
                disabled={state === "following"}
                title={state === "pending" ? "Click to cancel your follow request" : undefined}
                className="mt-4 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {state === "pending"
                  ? (pendingHovered ? "Cancel request" : "Pending")
                  : state === "following"
                    ? "Following"
                    : "Follow"}
              </button>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireAuth={true} redirectTo="/">
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-5xl mx-auto py-8 px-4">
          <UserProfile
            user={profile.user}
            isOwnProfile={profile.isOwnProfile}
            followState={getFollowState()}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onMessage={handleMessage}
          />
        </main>
      </div>
    </ProtectedRoute>
  );
}
