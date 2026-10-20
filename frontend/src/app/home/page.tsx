"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/authContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Navigation from "@/components/layout/Navigation";
import ProfileCard from "@/components/home/ProfileCard";
import UserDiscovery from "@/components/home/UserDiscovery";
import { CreatePostForm, PostFeed } from "@/components/posts";

export default function HomePage() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);

  const handlePostCreated = () => {
    setShowForm(false);
    window.location.reload();
  };

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <Navigation />

        <main className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {user && <ProfileCard user={user} />}

          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center space-x-2 bg-white rounded-xl shadow-sm px-4 py-3 mb-6 text-gray-500 hover:shadow-md hover:text-indigo-600 transition-all text-sm font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Create a post</span>
            </button>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-gray-900">New post</h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  x
                </button>
              </div>
              <CreatePostForm onPostCreated={handlePostCreated} />
            </div>
          )}

          <div className="mb-12">
            <PostFeed />
          </div>

          <UserDiscovery />
        </main>
      </div>
    </ProtectedRoute>
  );
}
