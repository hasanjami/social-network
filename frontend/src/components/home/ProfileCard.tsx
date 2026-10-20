"use client";

import { User } from "@/app/lib/api/auth";
import Link from "next/link";

interface ProfileCardProps {
  user: User;
}

export default function ProfileCard({ user }: ProfileCardProps) {
  return (
    <Link href="/profile" className="block mb-8">
      <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200 p-6">
        <div className="flex items-center space-x-4">
          {/* Avatar */}
          {user.avatarUrl ? (
            <img
              className="h-16 w-16 rounded-full object-cover border-2 border-gray-200"
              src={user.avatarUrl}
              alt={user.username}
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center border-2 border-gray-200">
              <span className="text-2xl font-bold text-white">
                {user.firstName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* User Info */}
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">
              @{user.username}
            </h2>
            <div className="flex space-x-6 mt-2 text-sm">
              <div>
                <span className="font-semibold text-gray-900">{user.followers || 0}</span>
                <span className="text-gray-500 ml-1">followers</span>
              </div>
              <div>
                <span className="font-semibold text-gray-900">{user.following || 0}</span>
                <span className="text-gray-500 ml-1">following</span>
              </div>
            </div>
          </div>

          {/* Arrow Icon */}
          <div>
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}
