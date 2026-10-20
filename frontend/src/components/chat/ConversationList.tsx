"use client";

import { useState, useEffect } from 'react';
import { Conversation, ChatUser, getConversations, getEligibleUsers } from '@/app/lib/api/chat';
import { GroupListItem, fetchMyGroups } from '@/app/lib/api/groups';
import { API_BASE_URL } from '@/app/lib/api/config';

interface ConversationListProps {
  activeChat: { type: 'private' | 'group'; id: number } | null;
  onSelectChat: (type: 'private' | 'group', id: number, name: string, avatar?: string, online?: boolean) => void;
  onNewConversation: (userId: number, name: string, avatar?: string) => void;
  refreshKey: number;
}

export default function ConversationList({ activeChat, onSelectChat, onNewConversation, refreshKey }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<{ user: ChatUser; online: boolean }[]>([]);
  const [pickerGroups, setPickerGroups] = useState<GroupListItem[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoading(true);
      const convos = await getConversations();
      setConversations(convos);
      setIsLoading(false);
    };
    fetchConversations();
  }, [refreshKey]);

  const handleNewChat = async () => {
    if (showNewChat) {
      setShowNewChat(false);
      return;
    }
    const [users, groups] = await Promise.all([
      getEligibleUsers(),
      fetchMyGroups("accepted").catch(() => [] as GroupListItem[]),
    ]);
    const existingGroupIds = new Set(
      conversations.filter((c) => c.type === 'group').map((c) => c.group?.id),
    );
    setEligibleUsers(users);
    setPickerGroups(groups.filter((g) => !existingGroupIds.has(g.id)));
    setShowNewChat(true);
  };

  const getAvatarUrl = (avatar?: string) => {
    if (!avatar) return null;
    if (avatar.startsWith('http')) return avatar;
    return `${API_BASE_URL}${avatar}`;
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
        <button
          onClick={handleNewChat}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          title="New message"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>

      {/* New chat picker */}
      {showNewChat && (
        <div className="border-b border-gray-200 max-h-72 overflow-y-auto">
          {pickerGroups.length > 0 && (
            <>
              <div className="px-4 py-2 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 uppercase">Your groups</p>
              </div>
              {pickerGroups.map((g) => (
                <button
                  key={`g-${g.id}`}
                  onClick={() => {
                    onSelectChat('group', g.id, g.name, g.image ?? undefined);
                    setShowNewChat(false);
                  }}
                  className="w-full flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  {getAvatarUrl(g.image ?? undefined) ? (
                    <img
                      className="h-10 w-10 rounded-full object-cover border border-gray-200"
                      src={getAvatarUrl(g.image ?? undefined)!}
                      alt={g.name}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">
                        {g.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="ml-3 flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">{g.name}</p>
                    <p className="text-xs text-gray-500">Group chat</p>
                  </div>
                </button>
              ))}
            </>
          )}

          <div className="px-4 py-2 bg-gray-50">
            <p className="text-xs font-medium text-gray-500 uppercase">Start a conversation</p>
          </div>
          {eligibleUsers.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No users available to chat with
            </div>
          ) : (
            eligibleUsers.map((item) => (
              <button
                key={item.user.id}
                onClick={() => {
                  const name = `${item.user.firstName} ${item.user.lastName}`;
                  onNewConversation(item.user.id, name, item.user.avatar);
                  setShowNewChat(false);
                }}
                className="w-full flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                {getAvatarUrl(item.user.avatar) ? (
                  <img
                    className="h-10 w-10 rounded-full object-cover border border-gray-200"
                    src={getAvatarUrl(item.user.avatar)!}
                    alt={item.user.username}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <span className="text-sm font-bold text-white">
                      {item.user.firstName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="ml-3 flex-1 text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {item.user.firstName} {item.user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">@{item.user.username}</p>
                </div>
                {item.online && (
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No messages yet</h3>
            <p className="mt-1 text-sm text-gray-500">Start a conversation with someone</p>
          </div>
        ) : (
          conversations.map((convo, index) => {
            const isPrivate = convo.type === 'private';
            const chatId = isPrivate ? convo.user?.id : convo.group?.id;
            const isActive = activeChat?.type === convo.type && activeChat?.id === chatId;
            const name = isPrivate
              ? `${convo.user?.firstName || ''} ${convo.user?.lastName || ''}`
              : convo.group?.name || 'Group';
            const avatar = isPrivate ? convo.user?.avatar : convo.group?.image;

            return (
              <button
                key={`${convo.type}-${chatId}-${index}`}
                onClick={() => {
                  if (chatId) onSelectChat(convo.type, chatId, name, avatar, convo.online);
                }}
                className={`w-full flex items-center px-4 py-3 transition-colors ${
                  isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="relative">
                  {getAvatarUrl(avatar) ? (
                    <img
                      className="h-12 w-12 rounded-full object-cover border border-gray-200"
                      src={getAvatarUrl(avatar)!}
                      alt={name}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <span className="text-lg font-bold text-white">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {isPrivate && convo.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>

                <div className="ml-3 flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate ${convo.unread > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-900'}`}>
                      {name}
                    </p>
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                      {formatTime(convo.lastTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-sm truncate ${convo.unread > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                      {convo.lastMessage || 'No messages yet'}
                    </p>
                    {convo.unread > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-medium bg-indigo-600 text-white">
                        {convo.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
