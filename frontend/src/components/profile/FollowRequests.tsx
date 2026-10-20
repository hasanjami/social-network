"use client";

import { useState, useEffect } from "react";
import { getPendingFollowRequests, acceptFollowRequest, declineFollowRequest } from "@/app/lib/api/user";
import { User } from "@/app/lib/api/auth";
import { useAuth } from "@/contexts/authContext";
import Link from "next/link";

interface FollowRequestsProps {
  onRequestHandled?: () => void;
}

export default function FollowRequests({ onRequestHandled }: FollowRequestsProps) {
  const [requests, setRequests] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const { updateUser } = useAuth();

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setIsLoading(true);
    const data = await getPendingFollowRequests();
    setRequests(data);
    setIsLoading(false);
  };

  const handleAccept = async (userId: number) => {
    setProcessingIds(prev => new Set(prev).add(userId));
    const result = await acceptFollowRequest(userId);
    
    if (result.success) {
      
      // Update follower count immediately from backend response
      if (result.acceptorFollowerCount !== undefined) {
        updateUser({ followers: result.acceptorFollowerCount });
      }
      
      setRequests(prev => prev.filter(user => user.id !== userId));
      onRequestHandled?.();
    }
    
    setProcessingIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });
  };

  const handleDecline = async (userId: number) => {
    setProcessingIds(prev => new Set(prev).add(userId));
    const success = await declineFollowRequest(userId);
    
    if (success) {
      setRequests(prev => prev.filter(user => user.id !== userId));
      onRequestHandled?.();
    }
    
    setProcessingIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Follow Requests</h3>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Follow Requests ({requests.length})
      </h3>
      <div className="space-y-4">
        {requests.map((user) => (
          <div key={user.id} className="flex items-center justify-between">
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
            <div className="flex space-x-2">
              <button
                onClick={() => handleAccept(user.id)}
                disabled={processingIds.has(user.id)}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Accept
              </button>
              <button
                onClick={() => handleDecline(user.id)}
                disabled={processingIds.has(user.id)}
                className="px-4 py-2 bg-gray-200 text-gray-900 text-sm font-medium rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
