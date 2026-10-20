import { API_BASE_URL } from './config';

export interface ChatUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

export interface Conversation {
  type: 'private' | 'group';
  user?: ChatUser;
  group?: {
    id: number;
    name: string;
    description?: string;
    image?: string;
  };
  unread: number;
  online?: boolean;
  lastMessage?: string;
  lastTime?: string;
}

export interface ChatMessage {
  id: number;
  senderId: number;
  receiverId?: number;
  groupId?: number;
  content: string;
  createdAt: string;
}

export const getConversations = async (): Promise<Conversation[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.conversations || [];
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
};

export const getMessages = async (
  userId?: number,
  groupId?: number,
  limit = 20,
  offset = 0
): Promise<ChatMessage[]> => {
  try {
    let url = `${API_BASE_URL}/api/chat/messages?limit=${limit}&offset=${offset}`;
    if (userId) url += `&user_id=${userId}`;
    if (groupId) url += `&group_id=${groupId}`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};

export const getEligibleUsers = async (): Promise<{ user: ChatUser; online: boolean }[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/eligible`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.users || [];
  } catch (error) {
    console.error('Error fetching eligible users:', error);
    return [];
  }
};
