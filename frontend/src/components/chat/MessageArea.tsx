"use client";

import { useState, useEffect, useRef } from 'react';
import { ChatMessage, getMessages } from '@/app/lib/api/chat';
import { API_BASE_URL } from '@/app/lib/api/config';
import { useAuth } from '@/contexts/authContext';
import { useWebSocket } from '@/contexts/websocketContext';

interface MessageAreaProps {
  chatType: 'private' | 'group';
  chatId: number;
  chatName: string;
  chatAvatar?: string;
  isOnline?: boolean;
  onMessageSent: () => void;
}

export default function MessageArea({ chatType, chatId, chatName, chatAvatar, isOnline, onMessageSent }: MessageAreaProps) {
  const { user } = useAuth();
  const { sendMessage, lastMessage } = useWebSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedRef = useRef<number>(-1);
  const messageCountRef = useRef<number>(0);

  // load messages when chat changes
  useEffect(() => {
    const loadMessages = async () => {
      setIsLoading(true);
      setMessages([]);

      const userId = chatType === 'private' ? chatId : undefined;
      const groupId = chatType === 'group' ? chatId : undefined;
      const msgs = await getMessages(userId, groupId, 50, 0);

      // messages come newest first, reverse for display
      setMessages(msgs.reverse());
      setIsLoading(false);
    };

    loadMessages();
    lastProcessedRef.current = -1;
  }, [chatType, chatId]);

  // scroll to bottom: instant on chat switch, smooth on new msg if user is near bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    const end = messagesEndRef.current;
    if (!container || !end) return;

    const isChatSwitch = messageCountRef.current === 0 && messages.length > 0;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const wasNearBottom = distanceFromBottom < 120;

    if (isChatSwitch) {
      end.scrollIntoView({ behavior: 'auto' });
    } else if (wasNearBottom) {
      end.scrollIntoView({ behavior: 'smooth' });
    }

    messageCountRef.current = messages.length;
  }, [messages]);

  // reset count when chat changes
  useEffect(() => {
    messageCountRef.current = 0;
  }, [chatType, chatId]);

  // listen for new websocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const msgId = (lastMessage as any)._messageId;
    if (msgId !== undefined && msgId <= lastProcessedRef.current) return;
    if (msgId !== undefined) lastProcessedRef.current = msgId;

    if (lastMessage.type === 'chat') {
      const msg = lastMessage as any;

      // check if this message belongs to the current chat
      const isForThisChat =
        (chatType === 'private' && (msg.senderId === chatId || msg.receiverId === chatId)) ||
        (chatType === 'group' && msg.groupId === chatId);

      if (isForThisChat) {
        const newMsg: ChatMessage = {
          id: msg.id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          groupId: msg.groupId,
          content: msg.content,
          createdAt: msg.createdAt,
        };

        // don't add duplicates
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      onMessageSent();
    }

    if (lastMessage.type === 'typing') {
      const msg = lastMessage as any;
      const isForThisChat =
        (chatType === 'private' && msg.senderId === chatId) ||
        (chatType === 'group' && msg.senderId !== user?.id);

      if (isForThisChat) {
        setIsTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
      }
    }
  }, [lastMessage, chatType, chatId, user?.id, onMessageSent]);

  const handleSend = () => {
    if (!newMessage.trim()) return;

    const payload: Record<string, unknown> = {
      type: 'chat',
      content: newMessage.trim(),
    };

    if (chatType === 'private') {
      payload.receiverId = chatId;
    } else {
      payload.groupId = chatId;
    }

    sendMessage(payload);
    setNewMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // send typing indicator
  const handleTyping = () => {
    const payload: Record<string, unknown> = { type: 'typing' };
    if (chatType === 'private') {
      payload.receiverId = chatId;
    } else {
      payload.groupId = chatId;
    }
    sendMessage(payload);
  };

  const getAvatarUrl = (avatar?: string) => {
    if (!avatar) return null;
    if (avatar.startsWith('http')) return avatar;
    return `${API_BASE_URL}${avatar}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // group messages by date
  const shouldShowDate = (index: number) => {
    if (index === 0) return true;
    const curr = new Date(messages[index].createdAt).toDateString();
    const prev = new Date(messages[index - 1].createdAt).toDateString();
    return curr !== prev;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center bg-white">
        <div className="relative">
          {getAvatarUrl(chatAvatar) ? (
            <img
              className="h-10 w-10 rounded-full object-cover border border-gray-200"
              src={getAvatarUrl(chatAvatar)!}
              alt={chatName}
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-sm font-bold text-white">
                {chatName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {chatType === 'private' && isOnline && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></div>
          )}
        </div>
        <div className="ml-3">
          <p className="text-sm font-semibold text-gray-900">{chatName}</p>
          <p className="text-xs text-gray-500">
            {isTyping ? 'typing...' : chatType === 'private' ? (isOnline ? 'Online' : 'Offline') : 'Group chat'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="mt-4 text-sm text-gray-500">No messages yet. Say hi!</p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isMine = msg.senderId === user?.id;

              return (
                <div key={msg.id}>
                  {/* Date separator */}
                  {shouldShowDate(index) && (
                    <div className="flex items-center justify-center my-4">
                      <div className="bg-gray-200 rounded-full px-3 py-1">
                        <span className="text-xs text-gray-600">{formatDateSeparator(msg.createdAt)}</span>
                      </div>
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                        isMine
                          ? 'bg-indigo-600 text-white rounded-br-md'
                          : 'bg-white text-gray-900 rounded-bl-md shadow-sm border border-gray-100'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className={`text-xs mt-1 ${isMine ? 'text-indigo-200' : 'text-gray-400'}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message input */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white">
        <div className="flex items-end space-x-3">
          <textarea
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 max-h-32"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
