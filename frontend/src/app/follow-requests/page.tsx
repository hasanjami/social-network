"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/authContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Navigation from "@/components/layout/Navigation";
import { getPendingFollowRequests, acceptFollowRequest, declineFollowRequest } from "@/app/lib/api/user";
import { User } from "@/app/lib/api/auth";
import Link from "next/link";
import { useToast } from "@/contexts/toastContext";
import { useFollowNotifications } from "@/hooks/useFollowNotifications";

export default function FollowRequestsPage() {
  const { user, updateUser } = useAuth();
  const { showSuccess, showInfo } = useToast();
  const [requests, setRequests] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchRequests();
  }, []);

  // Listen for new follow requests via WebSocket
  useFollowNotifications({
    onFollowRequest: () => {
      // Refresh the list when a new request comes in
      fetchRequests();
    },
  });

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const data = await getPendingFollowRequests();
      setRequests(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async (userId: number, username: string) => {
    setProcessingIds(prev => new Set(prev).add(userId));
    const result = await acceptFollowRequest(userId);
    
    if (result.success) {
      
      // Update follower count immediately from backend response
      if (result.acceptorFollowerCount !== undefined) {
        updateUser({ followers: result.acceptorFollowerCount });
      }
      
      setRequests(prev => prev.filter(user => user.id !== userId));
      showSuccess('Request Accepted', `You accepted ${username}'s follow request`);
    }
    
    setProcessingIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });
  };

  const handleDecline = async (userId: number, username: string) => {
    setProcessingIds(prev => new Set(prev).add(userId));
    const success = await declineFollowRequest(userId);
    
    if (success) {
      setRequests(prev => prev.filter(user => user.id !== userId));
      showInfo('Request Declined', `You declined ${username}'s follow request`);
    }
    
    setProcessingIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });
  };

  if (!user) {
    return null;
  }

  return (
    <ProtectedRoute requireAuth={true} redirectTo="/">
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        
        <main className="max-w-4xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Follow Requests</h1>
            <p className="mt-2 text-gray-600">
              Manage who can follow you and see your posts
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && requests.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No Pending Requests
              </h3>
              <p className="text-gray-600 mb-6">
                You do not have any follow requests at the moment
              </p>
              <Link
                href="/home"
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                Go to Home
              </Link>
            </div>
          )}

          {/* Requests List */}
          {!isLoading && requests.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {requests.length} {requests.length === 1 ? 'Request' : 'Requests'}
                </h2>
              </div>
              
              <div className="divide-y divide-gray-200">
                {requests.map((request) => (
                  <div key={request.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      {/* User Info */}
                      <Link 
                        href={`/profile/${request.username}`}
                        className="flex items-center space-x-4 flex-1 min-w-0"
                      >
                        {/* Avatar */}
                        {request.avatarUrl ? (
                          <img
                            className="h-14 w-14 rounded-full object-cover flex-shrink-0"
                            src={request.avatarUrl}
                            alt={request.username}
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-xl font-bold text-white">
                              {request.firstName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}

                        {/* Name and Username */}
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-gray-900 truncate">
                            {request.firstName} {request.lastName}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            @{request.username}
                          </p>
                          {request.aboutMe && (
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                              {request.aboutMe}
                            </p>
                          )}
                        </div>
                      </Link>

                      {/* Action Buttons */}
                      <div className="flex space-x-3 ml-4 flex-shrink-0">
                        <button
                          onClick={() => handleAccept(request.id, request.username)}
                          disabled={processingIds.has(request.id)}
                          className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingIds.has(request.id) ? 'Accepting...' : 'Accept'}
                        </button>
                        <button
                          onClick={() => handleDecline(request.id, request.username)}
                          disabled={processingIds.has(request.id)}
                          className="px-6 py-2 bg-gray-200 text-gray-900 text-sm font-medium rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingIds.has(request.id) ? 'Declining...' : 'Decline'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
