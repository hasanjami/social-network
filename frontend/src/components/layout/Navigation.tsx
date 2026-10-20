"use client";

import { useAuth } from "@/contexts/authContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { getPendingFollowRequests } from "@/app/lib/api/user";
import { getConversations } from "@/app/lib/api/chat";
import { useFollowNotifications } from "@/hooks/useFollowNotifications";
import { useWebSocket } from "@/contexts/websocketContext";

export default function Navigation() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { lastMessage } = useWebSocket();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => {
    return pathname === path;
  };

  // Fetch pending requests count
  useEffect(() => {
    const fetchPendingCount = async () => {
      const requests = await getPendingFollowRequests();
      setPendingRequestsCount(requests.length);
    };
    
    if (user) {
      fetchPendingCount();
    }
  }, [user]);

  // Listen for new follow requests to update count
  useFollowNotifications({
    onFollowRequest: async () => {
      const requests = await getPendingFollowRequests();
      setPendingRequestsCount(requests.length);
    },
  });

  // Fetch unread chat count
  const refreshUnreadChat = async () => {
    const convos = await getConversations();
    const total = convos.reduce((sum, c) => sum + (c.unread || 0), 0);
    setUnreadChatCount(total);
  };

  useEffect(() => {
    if (user) refreshUnreadChat();
  }, [user]);

  useEffect(() => {
    if (!lastMessage || !user) return;
    if (lastMessage.type === 'chat') {
      refreshUnreadChat();
    }
  }, [lastMessage, user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    await logout();
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/home" className="text-2xl font-bold text-gray-900">
                Social Network
              </Link>
            </div>
            <div className="hidden md:ml-6 md:flex md:space-x-8">
              <Link 
                href="/home" 
                className={`${
                  isActive('/home')
                    ? 'border-indigo-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Home
              </Link>
              <Link
                href="/groups"
                className={`${
                  pathname === '/groups' || pathname?.startsWith('/groups/')
                    ? 'border-indigo-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Groups
              </Link>
              <Link 
                href="/profile" 
                className={`${
                  isActive('/profile') || pathname?.startsWith('/profile')
                    ? 'border-indigo-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Profile
              </Link>
              <Link
                href="/chat"
                className={`${
                  isActive('/chat')
                    ? 'border-indigo-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Chat
                {unreadChatCount > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {unreadChatCount}
                  </span>
                )}
              </Link>
              <Link
                href="/follow-requests"
                className={`${
                  isActive('/follow-requests')
                    ? 'border-indigo-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Requests
                {pendingRequestsCount > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    {pendingRequestsCount}
                  </span>
                )}
              </Link>
              <Link 
                href="/notifications" 
                className={`${
                  isActive('/notifications')
                    ? 'border-indigo-500 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                Notifications
                {(user?.notifications ?? 0) > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {user!.notifications}
                  </span>
                )}
              </Link>
            </div>
          </div>
          
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="relative" ref={dropdownRef}>
                <button 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center space-x-3 focus:outline-none hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
                >
                  <div className="flex items-center">
                    {user?.avatarUrl ? (
                      <img
                        className="h-8 w-8 rounded-full object-cover"
                        src={user.avatarUrl}
                        alt={user.username}
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-sm font-semibold text-indigo-600">
                          {user?.firstName?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="ml-3 hidden md:block">
                      <div className="text-sm font-medium text-gray-700">
                        {user?.firstName} {user?.lastName}
                      </div>
                      <div className="text-xs text-gray-500">@{user?.username}</div>
                    </div>
                    <svg 
                      className={`ml-2 h-5 w-5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                
                {/* Dropdown menu */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                    <Link
                      href="/profile"
                      onClick={() => setIsDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Your Profile
                    </Link>
                    <Link
                      href="/profile/edit"
                      onClick={() => setIsDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Settings
                    </Link>
                    <hr className="my-1 border-gray-200" />
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
