"use client";

import { useAuth } from "@/contexts/authContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Navigation from "@/components/layout/Navigation";
import UserProfile from "@/components/profile/UserProfile";
import FollowRequests from "@/components/profile/FollowRequests";
import { useState } from "react";
import { useFollowNotifications } from "@/hooks/useFollowNotifications";
import { getUserProfile } from "@/app/lib/api/user";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshFollowerCounts = async () => {
    if (!user) return;
    const profile = await getUserProfile(user.username);
    if (profile) {
      updateUser({ followers: profile.followers, following: profile.following });
    }
  };

  // Listen for real-time follow notifications and update counts immediately
  useFollowNotifications({
    onFollowRequest: () => {
      setRefreshTrigger(prev => prev + 1);
    },
    onNewFollower: (data) => {
      // Use count from WS message if available, otherwise re-fetch
      if (data.followerCount !== undefined) {
        updateUser({ followers: data.followerCount });
      } else {
        refreshFollowerCounts();
      }
      setRefreshTrigger(prev => prev + 1);
    },
    onFollowAccepted: (data) => {
      if (data.followingCount !== undefined) {
        updateUser({ following: data.followingCount });
      } else {
        refreshFollowerCounts();
      }
    },
    onUnfollowed: (data) => {
      if (data.followerCount !== undefined) {
        updateUser({ followers: data.followerCount });
      } else {
        refreshFollowerCounts();
      }
      setRefreshTrigger(prev => prev + 1);
    },
  });

  const handleRequestHandled = () => {
    refreshFollowerCounts();
    setRefreshTrigger(prev => prev + 1);
  };

  const handleMessage = () => {
  };

  if (!user) {
    return null;
  }

  return (
    <ProtectedRoute requireAuth={true} redirectTo="/">
      <div className="min-h-screen bg-gray-50">
        <Navigation key={refreshTrigger} />
        <main className="max-w-5xl mx-auto py-8 px-4">
          <FollowRequests onRequestHandled={handleRequestHandled} />
          <UserProfile
            user={user}
            isOwnProfile={true}
            followState="none"
            onMessage={handleMessage}
          />
        </main>
      </div>
    </ProtectedRoute>
  );
}