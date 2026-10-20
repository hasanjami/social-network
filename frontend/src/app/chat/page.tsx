"use client";

import { useState, useCallback } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Navigation from '@/components/layout/Navigation';
import ConversationList from '@/components/chat/ConversationList';
import MessageArea from '@/components/chat/MessageArea';

interface ActiveChat {
  type: 'private' | 'group';
  id: number;
  name: string;
  avatar?: string;
  online?: boolean;
}

export default function ChatPage() {
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectChat = (type: 'private' | 'group', id: number, name: string, avatar?: string, online?: boolean) => {
    setActiveChat({ type, id, name, avatar, online });
  };

  const handleNewConversation = (userId: number, name: string, avatar?: string) => {
    setActiveChat({ type: 'private', id: userId, name, avatar, online: false });
  };

  // refresh conversation list when a message is sent/received
  const handleMessageSent = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <Navigation />

        <main className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
            <div className="flex h-full">
              {/* Sidebar */}
              <div className="w-80 border-r border-gray-200 flex-shrink-0 hidden md:block">
                <ConversationList
                  activeChat={activeChat ? { type: activeChat.type, id: activeChat.id } : null}
                  onSelectChat={handleSelectChat}
                  onNewConversation={handleNewConversation}
                  refreshKey={refreshKey}
                />
              </div>

              {/* Message area */}
              <div className="flex-1 flex flex-col">
                {activeChat ? (
                  <MessageArea
                    chatType={activeChat.type}
                    chatId={activeChat.id}
                    chatName={activeChat.name}
                    chatAvatar={activeChat.avatar}
                    isOnline={activeChat.online}
                    onMessageSent={handleMessageSent}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                      <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <h3 className="mt-4 text-lg font-medium text-gray-900">Your Messages</h3>
                      <p className="mt-2 text-sm text-gray-500">Select a conversation or start a new one</p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
